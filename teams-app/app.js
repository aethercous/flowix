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

  let session = null;
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

  function loadSession() {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      if (s.expiresAt && new Date(s.expiresAt) < new Date()) {
        localStorage.removeItem(SESSION_KEY);
        return null;
      }
      return s;
    } catch {
      return null;
    }
  }

  function saveSession(s) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(s));
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

  function appendTeamMessage(msg, isSelf) {
    if (msg.id) {
      if (renderedMsgIds.has(msg.id)) return null;
      renderedMsgIds.add(msg.id);
      if (!lastMsgTs || (msg.created_at && msg.created_at > lastMsgTs)) {
        lastMsgTs = msg.created_at || lastMsgTs;
      }
    }
    const el = document.createElement('div');
    el.className = 'msg team-msg' + (isSelf ? ' user' : ' peer');
    const name = document.createElement('div');
    name.className = 'msg-sender';
    name.textContent = isSelf ? 'You' : msg.sender_name;
    const body = document.createElement('div');
    body.className = 'msg-body';
    body.textContent = msg.body;
    el.appendChild(name);
    el.appendChild(body);
    teamChatLog.appendChild(el);
    teamChatLog.scrollTop = teamChatLog.scrollHeight;
    return el;
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

  function renderMembers(members) {
    if (!memberList) return;
    memberList.innerHTML = '';
    (members || []).forEach(function (m) {
      const li = document.createElement('li');
      li.className = 'teams-member' + (m.online ? ' online' : '');
      const dot = document.createElement('span');
      dot.className = 'member-dot';
      dot.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.className = 'member-name';
      name.textContent = m.displayName + (m.isYou ? ' (you)' : '');
      li.appendChild(dot);
      li.appendChild(name);
      memberList.appendChild(li);
    });
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
      (data.messages || []).forEach(function (msg) {
        appendTeamMessage(msg, msg.member_id === session.memberId);
      });
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
    membersTimer = setInterval(loadMembers, 30000);
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
    alert(message || 'You have been removed from this team.');
    teardownChat();
    localStorage.removeItem(SESSION_KEY);
    session = null;
    showAuth();
  }

  function showChat() {
    viewAuth.classList.add('hidden');
    viewChat.classList.remove('hidden');
    userLabel.textContent = displayName(session);
    agentLabel.textContent = session.agentName || 'Your AI assistant';
    setActiveTab('team');
    loadTeamHistory();
    subscribeRealtime();
    startTimers();
    if (!aiChatLog.children.length) {
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
    aiHistory = [];
    if (memberList) memberList.innerHTML = '';
  }

  function showAuth() {
    teardownChat();
    viewChat.classList.add('hidden');
    viewAuth.classList.remove('hidden');
  }

  async function joinWorkspace() {
    const firstName = document.getElementById('first-name').value.trim();
    const lastName = document.getElementById('last-name').value.trim();
    const nickname = document.getElementById('nickname').value.trim();
    const code = document.getElementById('invite-code').value.trim();

    if (!firstName || !lastName || !code) {
      alert('Please enter your name and invite code.');
      return;
    }

    const btn = document.getElementById('btn-join');
    btn.disabled = true;
    btn.textContent = 'Connecting…';

    const existing = loadSession();
    const body = { code, firstName, lastName };
    if (nickname) body.nickname = nickname;
    if (existing?.memberToken) body.memberToken = existing.memberToken;

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

      session = {
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
      };
      saveSession(session);
      showChat();
    } catch (e) {
      alert(e.message || 'Could not join team');
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
    const optimistic = {
      member_id: session.memberId,
      sender_name: displayName(session),
      body: text,
    };
    appendTeamMessage(optimistic, true);
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
      appendTeamMessage({ sender_name: 'System', body: 'Error: ' + e.message }, false);
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
    appendAiMessage('user', text);
    aiHistory.push({ role: 'user', content: text });

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
      await revealBotMessage(reply);
    } catch (e) {
      removeTypingIndicator();
      if (!(e && e.name === 'AbortError')) {
        appendAiMessage('err', 'Error: ' + e.message);
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
  document.getElementById('btn-team-send').addEventListener('click', sendTeamMessage);
  document.getElementById('btn-ai-send').addEventListener('click', onAiSendClick);
  document.getElementById('btn-leave').addEventListener('click', function () {
    localStorage.removeItem(SESSION_KEY);
    session = null;
    showAuth();
  });

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
    showAuth();
  }
})();
