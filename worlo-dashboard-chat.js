/**
 * Dashboard chat — pick an agent, saved threads in Supabase.
 */
(function (global) {
  let sb = null;
  let deps = null;
  let activeChatId = null;
  let activeAgentId = null;
  let threads = [];
  let messages = [];
  let sending = false;

  function escapeHtml(str) {
    return deps?.escapeHtml ? deps.escapeHtml(str) : String(str);
  }

  function toast(msg, type) {
    deps?.toast?.(msg, type);
  }

  function agents() {
    return deps?.state?.agents || [];
  }

  async function ensureToken(agent) {
    return deps.ensureAgentToken(agent);
  }

  function el(id) {
    return document.getElementById(id);
  }

  function renderAgentSelect() {
    const select = el('chat-agent-select');
    if (!select) return;
    const list = agents();
    if (!list.length) {
      select.innerHTML = '<option value="">Create an agent first</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;
    select.innerHTML = list
      .map(
        (a) =>
          `<option value="${a.id}"${a.id === activeAgentId ? ' selected' : ''}>${escapeHtml(a.name)}</option>`
      )
      .join('');
    if (!activeAgentId && list[0]) activeAgentId = list[0].id;
    if (activeAgentId) select.value = activeAgentId;
  }

  function renderThreadList() {
    const list = el('chat-thread-list');
    if (!list) return;
    if (!threads.length) {
      list.innerHTML =
        '<li class="fx-chat-empty" style="padding:8px 0">No saved chats yet. Start a new conversation.</li>';
      return;
    }
    list.innerHTML = threads
      .map(
        (t) => `
      <li>
        <button type="button" class="fx-chat-thread-btn${t.id === activeChatId ? ' is-active' : ''}" data-chat-id="${t.id}">
          ${escapeHtml(t.title || 'Chat')}
          <small>${new Date(t.updated_at || t.created_at).toLocaleString()}</small>
        </button>
      </li>`
      )
      .join('');

    list.querySelectorAll('[data-chat-id]').forEach((btn) => {
      btn.addEventListener('click', () => openChat(btn.getAttribute('data-chat-id')));
    });
  }

  function renderMessages() {
    const box = el('chat-messages');
    if (!box) return;
    if (!activeChatId) {
      box.innerHTML =
        '<p class="fx-chat-empty">Select an agent and start a chat. Every message is saved to your account.</p>';
      return;
    }
    if (!messages.length) {
      box.innerHTML = '<p class="fx-chat-empty">Send a message to begin this conversation.</p>';
      return;
    }
    box.innerHTML = messages
      .map(
        (m) =>
          `<div class="fx-chat-bubble fx-chat-bubble--${m.role === 'user' ? 'user' : 'assistant'}">${escapeHtml(m.content)}</div>`
      )
      .join('');
    box.scrollTop = box.scrollHeight;
  }

  async function loadThreads() {
    if (!activeAgentId || !sb) {
      threads = [];
      renderThreadList();
      return;
    }
    const { data, error } = await sb
      .from('dashboard_chats')
      .select('id, agent_id, title, created_at, updated_at')
      .eq('agent_id', activeAgentId)
      .order('updated_at', { ascending: false });
    if (error) {
      console.warn('loadThreads', error);
      threads = [];
    } else {
      threads = data || [];
    }
    renderThreadList();
  }

  async function loadMessages(chatId) {
    if (!chatId || !sb) {
      messages = [];
      renderMessages();
      return;
    }
    const { data, error } = await sb
      .from('dashboard_chat_messages')
      .select('id, role, content, created_at')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    if (error) {
      toast('Could not load messages: ' + error.message, 'error');
      messages = [];
    } else {
      messages = data || [];
    }
    renderMessages();
  }

  async function openChat(chatId) {
    activeChatId = chatId;
    renderThreadList();
    await loadMessages(chatId);
  }

  async function createChat() {
    const agent = agents().find((a) => a.id === activeAgentId);
    if (!agent) {
      toast('Create an agent first', 'error');
      return null;
    }
    const { data, error } = await sb
      .from('dashboard_chats')
      .insert({
        user_id: deps.currentUser.id,
        agent_id: agent.id,
        title: 'New chat',
      })
      .select()
      .single();
    if (error) {
      toast('Could not create chat: ' + error.message, 'error');
      return null;
    }
    threads.unshift(data);
    await openChat(data.id);
    return data.id;
  }

  async function touchChat(chatId, titleSnippet) {
    const patch = { updated_at: new Date().toISOString() };
    if (titleSnippet) patch.title = titleSnippet.slice(0, 80);
    await sb.from('dashboard_chats').update(patch).eq('id', chatId);
    const t = threads.find((x) => x.id === chatId);
    if (t) {
      Object.assign(t, patch);
      renderThreadList();
    }
  }

  async function saveMessage(chatId, role, content) {
    const { error } = await sb.from('dashboard_chat_messages').insert({
      chat_id: chatId,
      role,
      content,
    });
    if (error) throw error;
  }

  async function sendMessage() {
    if (sending) return;
    const input = el('chat-message-input');
    const text = input?.value?.trim();
    if (!text) return;

    const agent = agents().find((a) => a.id === activeAgentId);
    if (!agent) {
      toast('Select an agent', 'error');
      return;
    }

    let chatId = activeChatId;
    if (!chatId) {
      chatId = await createChat();
      if (!chatId) return;
    }

    sending = true;
    const sendBtn = el('btn-chat-send');
    if (sendBtn) sendBtn.disabled = true;
    input.value = '';

    messages.push({ role: 'user', content: text });
    renderMessages();

    try {
      await saveMessage(chatId, 'user', text);
      if (messages.filter((m) => m.role === 'user').length === 1) {
        await touchChat(chatId, text);
      }

      const tokenRow = await ensureToken(agent);
      const apiKey = tokenRow?.api_key || deps.state?.agentTokens?.[agent.id]?.api_key;
      if (!apiKey) throw new Error('Agent API key not ready — save the agent again');

      // History for the API: prior turns only (current user message sent as `message`)
      const history = messages
        .slice(0, -1)
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content,
        }))
        .slice(-20);

      const res = await fetch(`${deps.supabaseUrl}/functions/v1/agent-invoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: deps.supabaseKey,
          'X-Agent-Key': apiKey,
        },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      if (!res.ok) {
        const detail = data.detail ? `: ${data.detail}` : '';
        throw new Error((data.error || `Request failed (${res.status})`) + detail);
      }

      const reply = data.reply || 'No response.';
      await saveMessage(chatId, 'assistant', reply);
      messages.push({ role: 'assistant', content: reply });
      renderMessages();
      await touchChat(chatId);
      await loadThreads();
    } catch (e) {
      toast(e.message || 'Send failed', 'error');
      messages.pop();
      renderMessages();
      if (input) input.value = text;
    } finally {
      sending = false;
      if (sendBtn) sendBtn.disabled = false;
      input?.focus();
    }
  }

  function bindEvents() {
    el('chat-agent-select')?.addEventListener('change', async (e) => {
      activeAgentId = e.target.value || null;
      activeChatId = null;
      messages = [];
      renderMessages();
      await loadThreads();
    });

    el('btn-new-chat')?.addEventListener('click', async () => {
      activeChatId = null;
      messages = [];
      renderMessages();
      renderThreadList();
      el('chat-message-input')?.focus();
    });

    el('btn-chat-send')?.addEventListener('click', sendMessage);
    el('chat-message-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
  }

  async function refresh() {
    renderAgentSelect();
    await loadThreads();
    if (activeChatId && !threads.find((t) => t.id === activeChatId)) {
      activeChatId = null;
      messages = [];
    }
    renderMessages();
  }

  function init(options) {
    deps = options;
    sb = options.sb;
    bindEvents();
    refresh();
  }

  global.WorloDashboardChat = { init, refresh };
})(window);
