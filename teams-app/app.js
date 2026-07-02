(function () {
  const cfg = window.WORLO_CONFIG || {};
  const SUPABASE_URL = cfg.SUPABASE_URL || 'https://utofnywijqsozjqmkhcn.supabase.co';
  const SUPABASE_KEY = cfg.SUPABASE_KEY || cfg.SUPABASE_ANON_KEY || '';
  const SESSION_KEY = 'worlo_teams_session';

  if (!SUPABASE_KEY) {
    console.error('worlo Teams: missing Supabase key in worlo-config.js');
  }

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const viewAuth = document.getElementById('view-auth');
  const viewChat = document.getElementById('view-chat');
  const teamChatLog = document.getElementById('team-chat-log');
  const aiChatLog = document.getElementById('ai-chat-log');
  const teamChatInput = document.getElementById('team-chat-input');
  const aiChatInput = document.getElementById('ai-chat-input');
  const agentLabel = document.getElementById('agent-label');
  const userLabel = document.getElementById('user-label');
  const memberList = document.getElementById('member-list');
  const authMessage = document.getElementById('auth-message');
  const inviteCodeInput = document.getElementById('invite-code');

  function showAuthMessage(text, type) {
    if (!authMessage) return;
    if (!text) {
      authMessage.textContent = '';
      authMessage.className = 'teams-auth-message hidden';
      return;
    }
    authMessage.textContent = text;
    authMessage.className = 'teams-auth-message' + (type === 'error' ? ' is-error' : type === 'success' ? ' is-success' : '');
  }

  function formatInviteCodeInput() {
    if (!inviteCodeInput) return;
    let v = inviteCodeInput.value.toUpperCase().replace(/\s+/g, '');
    v = v.replace(/^FLOWIX-/i, 'WORLO-');
    inviteCodeInput.value = v;
  }

  if (inviteCodeInput) {
    inviteCodeInput.addEventListener('input', formatInviteCodeInput);
    inviteCodeInput.addEventListener('blur', formatInviteCodeInput);
  }

  function appendTeamSystemMessage(body, isError) {
    const el = document.createElement('div');
    el.className = 'msg team-msg ' + (isError ? 'system-err' : 'system');
    const name = document.createElement('div');
    name.className = 'msg-sender';
    name.textContent = isError ? 'Error' : 'System';
    const text = document.createElement('div');
    text.className = 'msg-body';
    text.textContent = isError ? String(body).replace(/^Error:\s*/, '') : body;
    el.appendChild(name);
    el.appendChild(text);
    teamChatLog.appendChild(el);
    teamChatLog.scrollTop = teamChatLog.scrollHeight;
    return el;
  }

  const authCancelBtn = document.getElementById('btn-auth-cancel');
  const teamSwitcherList = document.getElementById('team-switcher-list');
  const teamSwitcherMobile = document.getElementById('team-switcher-mobile');
  const joinAnotherMobile = document.getElementById('btn-join-another-mobile');
  const authTitle = document.querySelector('.teams-auth-card .teams-logo');

  let session = null;
  let store = null;
  let joiningAnother = false;
  let aiHistory = [];
  let aiSending = false;
  let teamSending = false;
  let abortController = null;
  let realtimeChannel = null;
  let presenceTimer = null;
  let membersTimer = null;
  let pollTimer = null;
  let activeTab = 'team';
  const renderedMsgIds = new Set();
  let lastMsgTs = null;

  function fnHeaders(extra) {
    return Object.assign({
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
    }, extra || {});
  }

  function memberHeaders() {
    return fnHeaders({ 'X-Member-Token': session.memberToken });
  }

  function displayName(s) {
    if (s.nickname) return s.nickname;
    if (s.displayName) return s.displayName;
    return ((s.firstName || '') + ' ' + (s.lastName || '')).trim();
  }

  function teamSessionFromAuth(data) {
    return {
      firstName: data.firstName,
      lastName: data.lastName,
      nickname: data.nickname || null,
      displayName: data.displayName,
      agentName: data.agentName,
      agentKey: data.agentKey,
      agentId: data.agentId,
      memberId: data.memberId,
      memberToken: data.memberToken,
      accessCodeId: data.accessCodeId,
      expiresAt: data.expiresAt,
      aiHistory: [],
    };
  }

  function migrateLegacySession(raw) {
    if (raw && raw.version === 2 && raw.teams) return raw;
    if (raw && raw.memberToken && raw.accessCodeId) {
      const team = Object.assign({}, raw);
      delete team.version;
      if (!team.aiHistory) team.aiHistory = [];
      return {
        version: 2,
        activeTeamId: raw.accessCodeId,
        teams: { [raw.accessCodeId]: team },
      };
    }
    return null;
  }

  function pruneExpiredTeams(s) {
    if (!s || !s.teams) return s;
    const now = new Date();
    Object.keys(s.teams).forEach(function (id) {
      const t = s.teams[id];
      if (t.expiresAt && new Date(t.expiresAt) < now) delete s.teams[id];
    });
    if (s.activeTeamId && !s.teams[s.activeTeamId]) {
      const ids = Object.keys(s.teams);
      s.activeTeamId = ids.length ? ids[0] : null;
    }
    return s;
  }

  function loadStore() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const parsed = migrateLegacySession(JSON.parse(raw));
      if (!parsed || !parsed.teams || !Object.keys(parsed.teams).length) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return pruneExpiredTeams(parsed);
    } catch {
      return null;
    }
  }

  function saveStore(s) {
    if (!s || !s.teams || !Object.keys(s.teams).length) {
      localStorage.removeItem(SESSION_KEY);
      return;
    }
    s.version = 2;
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
  }

  function getActiveSession(s) {
    if (!s?.activeTeamId || !s.teams[s.activeTeamId]) return null;
    return s.teams[s.activeTeamId];
  }

  function persistActiveTeamState() {
    if (!session?.accessCodeId || !store?.teams) return;
    store.teams[session.accessCodeId] = Object.assign({}, session, {
      aiHistory: aiHistory.slice(-40),
    });
    saveStore(store);
  }

  function renderTeamSwitcher() {
    if (!store) return;
    const ids = Object.keys(store.teams);
    if (teamSwitcherList) {
      teamSwitcherList.innerHTML = '';
      teamSwitcherList.style.display = ids.length ? 'flex' : 'none';
      ids.forEach(function (id) {
        const team = store.teams[id];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'teams-switch-btn' + (id === store.activeTeamId ? ' active' : '');
        btn.textContent = team.agentName || 'Team';
        btn.title = team.agentName || 'Switch team';
        btn.setAttribute('role', 'option');
        btn.setAttribute('aria-selected', id === store.activeTeamId ? 'true' : 'false');
        btn.addEventListener('click', function () { switchTeam(id); });
        teamSwitcherList.appendChild(btn);
      });
    }
    if (teamSwitcherMobile) {
      teamSwitcherMobile.innerHTML = '';
      teamSwitcherMobile.hidden = ids.length < 2;
      ids.forEach(function (id) {
        const team = store.teams[id];
        const opt = document.createElement('option');
        opt.value = id;
        opt.textContent = team.agentName || 'Team';
        if (id === store.activeTeamId) opt.selected = true;
        teamSwitcherMobile.appendChild(opt);
      });
    }
    if (joinAnotherMobile) joinAnotherMobile.hidden = false;
  }

  function switchTeam(accessCodeId) {
    if (!store?.teams?.[accessCodeId] || session?.accessCodeId === accessCodeId) return;
    persistActiveTeamState();
    teardownChat();
    store.activeTeamId = accessCodeId;
    session = store.teams[accessCodeId];
    saveStore(store);
    showChat();
  }

  function removeTeamFromStore(accessCodeId) {
    if (!store?.teams?.[accessCodeId]) return;
    delete store.teams[accessCodeId];
    const ids = Object.keys(store.teams);
    store.activeTeamId = ids.length ? ids[0] : null;
    if (!ids.length) {
      store = null;
      session = null;
      saveStore(null);
      return;
    }
    saveStore(store);
    session = store.teams[store.activeTeamId];
  }

  function loadSession() {
    store = loadStore();
    return getActiveSession(store);
  }

  function saveSession(team) {
    if (!team?.accessCodeId) return;
    if (!store) store = { version: 2, activeTeamId: null, teams: {} };
    store.teams[team.accessCodeId] = team;
    store.activeTeamId = team.accessCodeId;
    saveStore(store);
  }

  function setActiveTab(tab) {
    activeTab = tab;
    document.querySelectorAll('.teams-tab').forEach(function (btn) {
      const on = btn.dataset.tab === tab;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    document.getElementById('panel-team').classList.toggle('active', tab === 'team');
    document.getElementById('panel-team').hidden = tab !== 'team';
    document.getElementById('panel-ai').classList.toggle('active', tab === 'ai');
    document.getElementById('panel-ai').hidden = tab !== 'ai';
    if (tab === 'team') teamChatInput.focus();
    else aiChatInput.focus();
  }

  const AI_MENTION = /^\s*(?:@(?:ai|worlo|assistant|agent)|\/ai)\b[:,]?\s*/i;

  function appendTeamMessage(msg, isSelf) {
    if (msg.id) {
      if (renderedMsgIds.has(msg.id)) return null;
      renderedMsgIds.add(msg.id);
      if (!lastMsgTs || (msg.created_at && msg.created_at > lastMsgTs)) {
        lastMsgTs = msg.created_at || lastMsgTs;
      }
    }
    if (msg.is_ai) removeTeamThinking();
    if (!msg.is_ai && !isSelf && msg.sender_name && !seenSenders.has(msg.sender_name)) {
      seenSenders.add(msg.sender_name);
      paintMembers();
    }
    const el = document.createElement('div');
    el.className = 'msg team-msg ' + (msg.is_ai ? 'ai-msg' : isSelf ? 'user' : 'peer');
    const name = document.createElement('div');
    name.className = 'msg-sender';
    name.textContent = msg.is_ai ? (msg.sender_name || 'Assistant') : (isSelf ? 'You' : msg.sender_name);
    const body = document.createElement('div');
    body.className = 'msg-body';
    body.textContent = msg.body;
    el.appendChild(name);
    el.appendChild(body);
    teamChatLog.appendChild(el);
    teamChatLog.scrollTop = teamChatLog.scrollHeight;
    return el;
  }

  let teamThinkingTimer = null;
  function showTeamThinking() {
    removeTeamThinking();
    const el = document.createElement('div');
    el.className = 'msg team-msg ai-msg msg-typing';
    el.id = 'team-ai-thinking';
    el.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    teamChatLog.appendChild(el);
    teamChatLog.scrollTop = teamChatLog.scrollHeight;
    // Safety: clear if no reply arrives.
    teamThinkingTimer = setTimeout(removeTeamThinking, 45000);
  }

  function removeTeamThinking() {
    if (teamThinkingTimer) { clearTimeout(teamThinkingTimer); teamThinkingTimer = null; }
    document.getElementById('team-ai-thinking')?.remove();
  }

  function autoGrow(el) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }

  function showTeamHint() {
    const el = document.createElement('div');
    el.className = 'msg team-msg ai-msg';
    el.innerHTML =
      '<div class="msg-sender">Assistant</div>' +
      '<div class="msg-body">This is your team chat. Say hi to your teammates — and type ' +
      '<b>@ai</b> followed by a question to ask the AI right here, where everyone can see the answer.</div>';
    teamChatLog.appendChild(el);
  }

  function appendAiMessage(role, text) {
    const el = document.createElement('div');
    el.className = 'msg ' + (role === 'user' ? 'user' : role === 'err' ? 'err bot' : 'bot');
    el.textContent = text;
    aiChatLog.appendChild(el);
    aiChatLog.scrollTop = aiChatLog.scrollHeight;
    return el;
  }

  function showTypingIndicator() {
    removeTypingIndicator();
    const el = document.createElement('div');
    el.className = 'msg bot msg-typing';
    el.id = 'teams-typing-indicator';
    el.setAttribute('aria-label', 'Agent is typing');
    el.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    aiChatLog.appendChild(el);
    aiChatLog.scrollTop = aiChatLog.scrollHeight;
  }

  function removeTypingIndicator() {
    document.getElementById('teams-typing-indicator')?.remove();
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function revealBotMessage(text) {
    removeTypingIndicator();
    const el = appendAiMessage('bot', '');
    el.classList.add('msg-revealing');
    const chunk = text.length > 800 ? 4 : text.length > 300 ? 2 : 1;
    const delay = text.length > 800 ? 6 : 12;
    for (let i = 0; i < text.length; i += chunk) {
      el.textContent = text.slice(0, Math.min(i + chunk, text.length));
      aiChatLog.scrollTop = aiChatLog.scrollHeight;
      await wait(delay);
    }
    el.classList.remove('msg-revealing');
    el.textContent = text;
  }

  let lastRoster = [];
  const seenSenders = new Set();

  function addMemberRow(label, online) {
    const li = document.createElement('li');
    li.className = 'teams-member' + (online ? ' online' : '');
    const dot = document.createElement('span');
    dot.className = 'member-dot';
    dot.setAttribute('aria-hidden', 'true');
    const name = document.createElement('span');
    name.className = 'member-name';
    name.textContent = label;
    li.appendChild(dot);
    li.appendChild(name);
    memberList.appendChild(li);
  }

  // Render the roster from the server, merged with anyone who has spoken in the
  // chat (robust fallback so every participant is always visible in the sidebar).
  function paintMembers() {
    if (!memberList) return;
    memberList.innerHTML = '';
    const seen = new Set();
    const selfName = session ? displayName(session) : '';

    // Always show yourself first, even before the roster loads.
    addMemberRow((selfName || 'You') + ' (you)', true);
    if (selfName) seen.add(selfName.toLowerCase());

    lastRoster.forEach(function (m) {
      if (m.isYou) return;
      const key = (m.displayName || '').toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      addMemberRow(m.displayName, m.online);
    });

    seenSenders.forEach(function (nm) {
      const key = nm.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      addMemberRow(nm, true);
    });
  }

  function renderMembers(members) {
    lastRoster = members || [];
    paintMembers();
  }

  async function loadMembers() {
    if (!session?.memberToken) return;
    try {
      const res = await fetch(SUPABASE_URL + '/functions/v1/team-members', {
        method: 'POST',
        headers: memberHeaders(),
        body: JSON.stringify({ action: 'list' }),
      });
      const data = await res.json();
      if (res.ok && data.members) renderMembers(data.members);
    } catch (e) {
      console.warn('loadMembers:', e);
    }
  }

  async function sendPresence() {
    if (!session?.memberToken) return;
    try {
      await fetch(SUPABASE_URL + '/functions/v1/team-chat', {
        method: 'POST',
        headers: memberHeaders(),
        body: JSON.stringify({ action: 'presence' }),
      });
    } catch (_) { /* ignore */ }
  }

  async function loadTeamHistory() {
    if (!session?.memberToken) return;
    try {
      const res = await fetch(SUPABASE_URL + '/functions/v1/team-chat', {
        method: 'POST',
        headers: memberHeaders(),
        body: JSON.stringify({ action: 'history', limit: 80 }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) handleKicked(data.error);
        return;
      }
      teamChatLog.innerHTML = '';
      renderedMsgIds.clear();
      lastMsgTs = null;
      const msgs = data.messages || [];
      msgs.forEach(function (msg) {
        appendTeamMessage(msg, msg.member_id === session.memberId);
      });
      if (!msgs.length) showTeamHint();
      // Seed a baseline so polling works even when the chat starts empty.
      if (!lastMsgTs) lastMsgTs = new Date(Date.now() - 60000).toISOString();
    } catch (e) {
      console.warn('loadTeamHistory:', e);
    }
  }

  async function pollTeamChat() {
    if (!session?.memberToken || !lastMsgTs) return;
    // Skip while a send is in flight so we don't double-render our own message
    // before its id is registered for dedupe.
    if (teamSending) return;
    try {
      const res = await fetch(SUPABASE_URL + '/functions/v1/team-chat', {
        method: 'POST',
        headers: memberHeaders(),
        body: JSON.stringify({ action: 'history', after: lastMsgTs, limit: 100 }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) handleKicked(data.error);
        return;
      }
      (data.messages || []).forEach(function (msg) {
        appendTeamMessage(msg, msg.member_id === session.memberId);
      });
    } catch (e) {
      console.warn('pollTeamChat:', e);
    }
  }

  function subscribeRealtime() {
    if (!session?.accessCodeId || realtimeChannel) return;
    realtimeChannel = sb.channel('team:' + session.accessCodeId);
    realtimeChannel.on('broadcast', { event: 'message' }, function (payload) {
      const msg = payload.payload;
      if (!msg || msg.member_id === session.memberId) return;
      appendTeamMessage(msg, false);
    });
    realtimeChannel.subscribe();
  }

  function unsubscribeRealtime() {
    if (realtimeChannel) {
      sb.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  function startTimers() {
    stopTimers();
    sendPresence();
    loadMembers();
    presenceTimer = setInterval(sendPresence, 60000);
    membersTimer = setInterval(loadMembers, 15000);
    pollTimer = setInterval(pollTeamChat, 4000);
  }

  function stopTimers() {
    if (presenceTimer) clearInterval(presenceTimer);
    if (membersTimer) clearInterval(membersTimer);
    if (pollTimer) clearInterval(pollTimer);
    presenceTimer = null;
    membersTimer = null;
    pollTimer = null;
  }

  function handleKicked(message) {
    const removedId = session?.accessCodeId;
    teardownChat();
    if (removedId) removeTeamFromStore(removedId);
    if (store && store.activeTeamId && store.teams[store.activeTeamId]) {
      session = store.teams[store.activeTeamId];
      showAuthMessage(message || 'You have been removed from that team.', 'error');
      showChat();
      return;
    }
    session = null;
    store = null;
    showAuth(false);
    showAuthMessage(message || 'You have been removed from this team.', 'error');
  }

  function showChat() {
    viewAuth.classList.add('hidden');
    viewChat.classList.remove('hidden');
    joiningAnother = false;
    if (authCancelBtn) authCancelBtn.style.display = 'none';
    userLabel.textContent = displayName(session);
    agentLabel.textContent = session.agentName || 'Your AI assistant';
    renderTeamSwitcher();
    aiHistory = (session.aiHistory || []).slice();
    paintMembers();
    setActiveTab('team');
    loadTeamHistory();
    subscribeRealtime();
    startTimers();
    aiChatLog.innerHTML = '';
    if (aiHistory.length) {
      aiHistory.forEach(function (turn) {
        if (turn.role === 'user') appendAiMessage('user', turn.content);
        else if (turn.role === 'assistant') appendAiMessage('bot', turn.content);
      });
    } else {
      appendAiMessage(
        'bot',
        "You're connected to " + session.agentName +
          '. Ask anything here — this is your private chat with the AI.'
      );
    }
  }

  function teardownChat() {
    stopTimers();
    unsubscribeRealtime();
    teamChatLog.innerHTML = '';
    aiChatLog.innerHTML = '';
    lastRoster = [];
    seenSenders.clear();
    renderedMsgIds.clear();
    lastMsgTs = null;
    if (memberList) memberList.innerHTML = '';
  }

  function showAuth(isJoinAnother) {
    joiningAnother = !!isJoinAnother;
    persistActiveTeamState();
    teardownChat();
    viewChat.classList.add('hidden');
    viewAuth.classList.remove('hidden');
    if (authCancelBtn) {
      authCancelBtn.style.display = joiningAnother ? 'block' : 'none';
    }
    if (authTitle) {
      authTitle.textContent = joiningAnother ? 'Join another team' : 'worlo Teams';
    }
    const lead = document.querySelector('.teams-auth-lead');
    if (lead) {
      if (joiningAnother) {
        lead.textContent = 'Enter a new invite code to join another team. You can switch between teams anytime from the sidebar.';
      } else {
        lead.innerHTML = 'Enter your invite code from the worlo dashboard. Use in browser or <a href="/teams-app/download.html" id="link-download">download the Windows app</a>.';
      }
    }
    if (joiningAnother && session) {
      const fn = document.getElementById('first-name');
      const ln = document.getElementById('last-name');
      const nn = document.getElementById('nickname');
      if (fn && !fn.value.trim()) fn.value = session.firstName || '';
      if (ln && !ln.value.trim()) ln.value = session.lastName || '';
      if (nn && !nn.value.trim() && session.nickname) nn.value = session.nickname;
    }
    if (inviteCodeInput) inviteCodeInput.value = '';
    showAuthMessage('');
  }

  async function joinWorkspace() {
    const firstName = document.getElementById('first-name').value.trim();
    const lastName = document.getElementById('last-name').value.trim();
    const nickname = document.getElementById('nickname').value.trim();
    const code = document.getElementById('invite-code').value.trim();

    if (!firstName || !lastName || !code) {
      showAuthMessage('Please enter your first name, last name, and invite code.', 'error');
      return;
    }

    showAuthMessage('');
    const btn = document.getElementById('btn-join');
    btn.disabled = true;
    btn.textContent = 'Connecting…';

    const body = { code, firstName, lastName };
    if (nickname) body.nickname = nickname;

    try {
      const res = await fetch(SUPABASE_URL + '/functions/v1/teams-auth', {
        method: 'POST',
        headers: fnHeaders(),
        body: JSON.stringify(body),
      });

      let data = null;
      try { data = await res.json(); } catch { data = null; }

      if (!res.ok) {
        throw new Error((data && data.error) || 'Could not verify invite code (' + res.status + ')');
      }
      if (!data?.success || !data.agentKey) {
        throw new Error(data?.error || 'Invalid invite code');
      }

      const team = teamSessionFromAuth(data);
      if (store?.teams?.[team.accessCodeId]?.aiHistory?.length) {
        team.aiHistory = store.teams[team.accessCodeId].aiHistory;
      }
      session = team;
      saveSession(team);
      store = loadStore();
      document.getElementById('invite-code').value = '';
      showAuthMessage('');
      showChat();
    } catch (e) {
      showAuthMessage(e.message || 'Could not join team', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Join team';
    }
  }

  function setAiSendWorking(working) {
    const btn = document.getElementById('btn-ai-send');
    if (!btn) return;
    if (working) {
      btn.classList.add('btn-send--working');
      btn.setAttribute('aria-label', 'Stop generating');
      btn.title = 'Stop';
      btn.innerHTML = '<span class="send-spinner" aria-hidden="true"></span>';
    } else {
      btn.classList.remove('btn-send--working');
      btn.removeAttribute('aria-label');
      btn.title = '';
      btn.textContent = 'Send';
    }
  }

  async function sendTeamMessage() {
    if (teamSending) return;
    const text = teamChatInput.value.trim();
    if (!text || !session?.memberToken) return;

    teamChatInput.value = '';
    autoGrow(teamChatInput);
    const optimistic = {
      member_id: session.memberId,
      sender_name: displayName(session),
      body: text,
    };
    appendTeamMessage(optimistic, true);
    if (AI_MENTION.test(text)) showTeamThinking();
    teamSending = true;
    document.getElementById('btn-team-send').disabled = true;

    try {
      const res = await fetch(SUPABASE_URL + '/functions/v1/team-chat', {
        method: 'POST',
        headers: memberHeaders(),
        body: JSON.stringify({ action: 'send', message: text }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403) handleKicked(data.error);
        else throw new Error(data.error || 'Failed to send');
      }
      if (data?.message?.id) {
        renderedMsgIds.add(data.message.id);
        if (!lastMsgTs || data.message.created_at > lastMsgTs) {
          lastMsgTs = data.message.created_at;
        }
      }
    } catch (e) {
      removeTeamThinking();
      appendTeamSystemMessage(e.message || 'Failed to send message', true);
    } finally {
      teamSending = false;
      document.getElementById('btn-team-send').disabled = false;
      teamChatInput.focus();
    }
  }

  async function sendAiMessage() {
    if (aiSending) return;
    const text = aiChatInput.value.trim();
    if (!text || !session?.agentKey) return;

    aiChatInput.value = '';
    autoGrow(aiChatInput);
    appendAiMessage('user', text);
    aiHistory.push({ role: 'user', content: text });
    session.aiHistory = aiHistory.slice(-40);
    persistActiveTeamState();

    aiSending = true;
    abortController = new AbortController();
    setAiSendWorking(true);
    showTypingIndicator();

    try {
      const res = await fetch(SUPABASE_URL + '/functions/v1/agent-invoke', {
        method: 'POST',
        headers: Object.assign(fnHeaders(), { 'X-Agent-Key': session.agentKey }),
        body: JSON.stringify({
          message: text,
          history: aiHistory.slice(0, -1).slice(-20),
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        }),
        signal: abortController.signal,
      });

      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail ? ': ' + data.detail : '';
        throw new Error((data.error || 'Request failed (' + res.status + ')') + detail);
      }

      const reply = data.reply || 'No response.';
      aiHistory.push({ role: 'assistant', content: reply });
      session.aiHistory = aiHistory.slice(-40);
      persistActiveTeamState();
      await revealBotMessage(reply);
    } catch (e) {
      removeTypingIndicator();
      if (!(e && e.name === 'AbortError')) {
        appendAiMessage('err', e.message || 'Something went wrong');
      }
    } finally {
      aiSending = false;
      abortController = null;
      setAiSendWorking(false);
      aiChatInput.focus();
    }
  }

  function onAiSendClick() {
    if (aiSending && abortController) abortController.abort();
    else sendAiMessage();
  }

  document.getElementById('btn-join').addEventListener('click', joinWorkspace);
  document.getElementById('btn-join-another')?.addEventListener('click', function () {
    showAuth(true);
  });
  document.getElementById('btn-join-another-mobile')?.addEventListener('click', function () {
    showAuth(true);
  });
  teamSwitcherMobile?.addEventListener('change', function () {
    if (teamSwitcherMobile.value) switchTeam(teamSwitcherMobile.value);
  });
  document.getElementById('btn-auth-cancel')?.addEventListener('click', function () {
    if (store?.activeTeamId && store.teams[store.activeTeamId]) {
      session = store.teams[store.activeTeamId];
      showChat();
    }
  });
  document.getElementById('btn-team-send').addEventListener('click', sendTeamMessage);
  document.getElementById('btn-ai-send').addEventListener('click', onAiSendClick);
  document.getElementById('btn-leave').addEventListener('click', function () {
    if (!session?.accessCodeId) return;
    const name = session.agentName || 'this team';
    if (!window.confirm('Leave ' + name + '? You can rejoin later with your invite code.')) return;
    persistActiveTeamState();
    const leftId = session.accessCodeId;
    teardownChat();
    removeTeamFromStore(leftId);
    if (store && store.activeTeamId) {
      session = store.teams[store.activeTeamId];
      showChat();
      return;
    }
    session = null;
    showAuth(false);
  });

  document.getElementById('btn-team-ai').addEventListener('click', function () {
    const v = teamChatInput.value.trim();
    if (!AI_MENTION.test(v)) {
      teamChatInput.value = '@ai ' + (v ? v + ' ' : '');
    }
    autoGrow(teamChatInput);
    teamChatInput.focus();
    teamChatInput.setSelectionRange(teamChatInput.value.length, teamChatInput.value.length);
  });

  teamChatInput.addEventListener('input', function () { autoGrow(teamChatInput); });
  aiChatInput.addEventListener('input', function () { autoGrow(aiChatInput); });

  document.querySelectorAll('.teams-tab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setActiveTab(btn.dataset.tab);
    });
  });

  teamChatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendTeamMessage();
    }
  });

  aiChatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!aiSending) sendAiMessage();
    }
  });

  session = loadSession();
  if (session?.agentKey && session?.memberToken) {
    showChat();
  } else {
    showAuth(false);
  }
})();
