(function () {
  const cfg = window.FLOWIX_CONFIG || {};
  const SUPABASE_URL = cfg.SUPABASE_URL || 'https://utofnywijqsozjqmkhcn.supabase.co';
  const SUPABASE_KEY = cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_KEY || '';
  const SESSION_KEY = 'flowix_teams_session';

  if (!SUPABASE_KEY) {
    console.error('flowix Teams: missing Supabase anon key in flowix-config.js');
  }

  const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  const viewAuth = document.getElementById('view-auth');
  const viewChat = document.getElementById('view-chat');
  const chatLog = document.getElementById('chat-log');
  const chatInput = document.getElementById('chat-input');
  const agentLabel = document.getElementById('agent-label');

  let session = null;
  let history = [];

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

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !session?.agentKey) return;

    chatInput.value = '';
    appendMessage('user', text);
    history.push({ role: 'user', content: text });

    const sendBtn = document.getElementById('btn-send');
    sendBtn.disabled = true;

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
      });

      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail ? ': ' + data.detail : '';
        throw new Error((data.error || 'Request failed (' + res.status + ')') + detail);
      }

      const reply = data.reply || 'No response.';
      history.push({ role: 'assistant', content: reply });
      appendMessage('bot', reply);
    } catch (e) {
      appendMessage('err', 'Error: ' + e.message);
    } finally {
      sendBtn.disabled = false;
      chatInput.focus();
    }
  }

  document.getElementById('btn-join').addEventListener('click', joinWorkspace);
  document.getElementById('btn-send').addEventListener('click', sendMessage);
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
