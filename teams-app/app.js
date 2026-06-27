(function () {
  const cfg = window.WORLO_CONFIG || {};
  const SUPABASE_URL = cfg.SUPABASE_URL || 'https://utofnywijqsozjqmkhcn.supabase.co';
  // Prefer the publishable key. The legacy anon JWT is disabled on this
  // project (returns 401 Invalid API key).
  const SUPABASE_KEY = cfg.SUPABASE_KEY || cfg.SUPABASE_ANON_KEY || '';
  const SESSION_KEY = 'worlo_teams_session';

  if (!SUPABASE_KEY) {
    console.error('worlo Teams: missing Supabase key in worlo-config.js');
  }

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const viewAuth = document.getElementById('view-auth');
  const viewChat = document.getElementById('view-chat');
  const chatLog = document.getElementById('chat-log');
  const chatInput = document.getElementById('chat-input');
  const agentLabel = document.getElementById('agent-label');

  let session = null;
  let history = [];
  let sending = false;
  let abortController = null;

  function fnHeaders() {
    return {
      'Content-Type': 'application/json',
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
    };
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

  function showChat() {
    viewAuth.classList.add('hidden');
    viewChat.classList.remove('hidden');
    agentLabel.textContent = session.agentName || 'Your agent';
    appendMessage(
      'bot',
      "You're connected to " +
        session.agentName +
        '. Ask anything—this agent can use Browserbase to browse the web when needed.'
    );
  }

  function showAuth() {
    viewChat.classList.add('hidden');
    viewAuth.classList.remove('hidden');
    chatLog.innerHTML = '';
    history = [];
  }

  function appendMessage(role, text) {
    const el = document.createElement('div');
    el.className = 'msg ' + (role === 'user' ? 'user' : role === 'err' ? 'err bot' : 'bot');
    el.textContent = text;
    chatLog.appendChild(el);
    chatLog.scrollTop = chatLog.scrollHeight;
    return el;
  }

  function showTypingIndicator() {
    removeTypingIndicator();
    const el = document.createElement('div');
    el.className = 'msg bot msg-typing';
    el.id = 'teams-typing-indicator';
    el.setAttribute('aria-label', 'Agent is typing');
    el.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    chatLog.appendChild(el);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function removeTypingIndicator() {
    document.getElementById('teams-typing-indicator')?.remove();
  }

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function revealBotMessage(text) {
    removeTypingIndicator();
    const el = appendMessage('bot', '');
    el.classList.add('msg-revealing');
    const chunk = text.length > 800 ? 4 : text.length > 300 ? 2 : 1;
    const delay = text.length > 800 ? 6 : 12;
    for (let i = 0; i < text.length; i += chunk) {
      el.textContent = text.slice(0, Math.min(i + chunk, text.length));
      chatLog.scrollTop = chatLog.scrollHeight;
      await wait(delay);
    }
    el.classList.remove('msg-revealing');
    el.textContent = text;
  }

  async function joinWorkspace() {
    const firstName = document.getElementById('first-name').value.trim();
    const lastName = document.getElementById('last-name').value.trim();
    const code = document.getElementById('invite-code').value.trim();

    if (!firstName || !lastName || !code) {
      alert('Please enter your name and invite code.');
      return;
    }

    const btn = document.getElementById('btn-join');
    btn.disabled = true;
    btn.textContent = 'Connecting…';

    try {
      const res = await fetch(SUPABASE_URL + '/functions/v1/teams-auth', {
        method: 'POST',
        headers: fnHeaders(),
        body: JSON.stringify({ code, firstName, lastName }),
      });

      let data = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        throw new Error((data && data.error) || 'Could not verify invite code (' + res.status + ')');
      }
      if (!data?.success || !data.agentKey) {
        throw new Error(data?.error || 'Invalid invite code');
      }

      session = {
        firstName: data.firstName,
        lastName: data.lastName,
        agentName: data.agentName,
        agentKey: data.agentKey,
        agentId: data.agentId,
        expiresAt: data.expiresAt,
      };
      saveSession(session);
      showChat();
    } catch (e) {
      alert(e.message || 'Could not join workspace');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Join workspace';
    }
  }

  function setSendWorking(working) {
    const btn = document.getElementById('btn-send');
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

  function stopGenerating() {
    if (abortController) abortController.abort();
  }

  function onSendClick() {
    if (sending) {
      stopGenerating();
    } else {
      sendMessage();
    }
  }

  async function sendMessage() {
    if (sending) return;
    const text = chatInput.value.trim();
    if (!text || !session?.agentKey) return;

    chatInput.value = '';
    appendMessage('user', text);
    history.push({ role: 'user', content: text });

    sending = true;
    abortController = new AbortController();
    setSendWorking(true);
    showTypingIndicator();

    try {
      const res = await fetch(SUPABASE_URL + '/functions/v1/agent-invoke', {
        method: 'POST',
        headers: {
          ...fnHeaders(),
          'X-Agent-Key': session.agentKey,
        },
        body: JSON.stringify({
          message: text,
          history: history.slice(0, -1).slice(-20),
        }),
        signal: abortController.signal,
      });

      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail ? ': ' + data.detail : '';
        throw new Error((data.error || 'Request failed (' + res.status + ')') + detail);
      }

      const reply = data.reply || 'No response.';
      history.push({ role: 'assistant', content: reply });
      await revealBotMessage(reply);
    } catch (e) {
      removeTypingIndicator();
      if (!(e && e.name === 'AbortError')) {
        appendMessage('err', 'Error: ' + e.message);
      }
    } finally {
      sending = false;
      abortController = null;
      setSendWorking(false);
      chatInput.focus();
    }
  }

  document.getElementById('btn-join').addEventListener('click', joinWorkspace);
  document.getElementById('btn-send').addEventListener('click', onSendClick);
  document.getElementById('btn-leave').addEventListener('click', function () {
    localStorage.removeItem(SESSION_KEY);
    session = null;
    showAuth();
  });

  chatInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  session = loadSession();
  if (session?.agentKey) {
    showChat();
  } else {
    showAuth();
  }
})();
