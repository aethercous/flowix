/**
 * Animated flowix Teams demo — landing page inline + teams-demo.html iframe.
 */
(function (global) {
  const CURSOR_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M5 3L19 12L11 13.5L9 20L5 3Z" fill="#12121a" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
  </svg>`;

  const reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CURSOR_PAD = 18;
  const CURSOR_SIZE = 24;
  const DEMO_CODE = 'FLOWIX-DEMO-TEAM-CODE';

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function clampCursorPos(clientX, clientY, bounds) {
    const pad = 10;
    const minX = bounds.left + pad;
    const maxX = bounds.right - CURSOR_SIZE - pad;
    const minY = bounds.top + pad;
    const maxY = bounds.bottom - CURSOR_SIZE - pad;
    return {
      x: Math.max(minX, Math.min(clientX, maxX)) - bounds.left,
      y: Math.max(minY, Math.min(clientY, maxY)) - bounds.top,
    };
  }

  function createDemo(root) {
    const q = (sel) => root.querySelector(sel);
    const boundsEl =
      root.querySelector('.fx-teams-embed-overlay') ||
      (root.classList?.contains('fx-teams-inline-demo') ? root : null) ||
      root.querySelector('.fx-teams-inline-demo') ||
      root;

    class TeamsEmbedDemo {
      constructor() {
        this.root = boundsEl;
        this.cursor = q('#fx-teams-embed-cursor');
        this.flash = q('#fx-teams-embed-flash');
        if (this.cursor) this.cursor.innerHTML = CURSOR_SVG;
      }

      async moveToElement(el, duration) {
        if (!this.cursor || !el) return;
        this.cursor.classList.remove('is-hidden');
        const rect = el.getBoundingClientRect();
        const bounds = this.root.getBoundingClientRect();
        const targetX = rect.left + Math.min(rect.width * 0.72, Math.max(12, rect.width - 12));
        const targetY = rect.top + Math.min(rect.height * 0.5, Math.max(12, rect.height - 12));
        const { x, y } = clampCursorPos(targetX, targetY, bounds);
        this.cursor.style.transitionDuration = (duration || 700) + 'ms';
        this.cursor.style.left = x + 'px';
        this.cursor.style.top = y + 'px';
        await wait(duration || 700);
      }

      async click() {
        if (!this.cursor) return;
        this.cursor.classList.add('is-clicking');
        if (this.flash) {
          this.flash.classList.remove('is-on');
          void this.flash.offsetWidth;
          this.flash.classList.add('is-on');
        }
        await wait(140);
        this.cursor.classList.remove('is-clicking');
        await wait(200);
      }

      focusField(el) {
        root.querySelectorAll('.fx-embed-field-focus').forEach((n) => {
          n.classList.remove('fx-embed-field-focus');
        });
        if (!el) return;
        const wrap = el.closest('.form-group');
        if (wrap) wrap.classList.add('fx-embed-field-focus');
      }

      async typeInto(el, text, speed) {
        if (!el) return;
        el.classList.add('fx-teams-typing');
        el.value = '';
        for (let i = 0; i < text.length; i++) {
          el.value += text[i];
          el.dispatchEvent(new Event('input', { bubbles: true }));
          if (el.scrollHeight > el.clientHeight) {
            el.scrollTop = el.scrollHeight;
          }
          await wait(speed || 36);
        }
        el.scrollTop = el.scrollHeight;
        el.classList.remove('fx-teams-typing');
      }

      hideCursor() {
        if (this.cursor) this.cursor.classList.add('is-hidden');
      }
    }

    function addMessage(log, text, kind) {
      if (!log) return;
      const div = document.createElement('div');
      div.className = 'msg ' + kind;
      div.textContent = text;
      log.appendChild(div);
      log.scrollTop = log.scrollHeight;
      if (typeof div.scrollIntoView === 'function') {
        div.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
      requestAnimationFrame(() => {
        log.scrollTop = log.scrollHeight;
        div.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      });
    }

    function ensureTeamsMessagesVisible() {
      const log = q('#chat-log');
      const input = q('#chat-input');
      if (log) {
        log.scrollTop = log.scrollHeight;
        const last = log.lastElementChild;
        if (last && typeof last.scrollIntoView === 'function') {
          last.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
      if (input) {
        input.scrollTop = input.scrollHeight;
        if (typeof input.scrollIntoView === 'function') {
          input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
      }
    }

    function resetDemo() {
      const auth = q('#view-auth');
      const chat = q('#view-chat');
      const log = q('#chat-log');
      if (auth) auth.classList.remove('hidden');
      if (chat) chat.classList.add('hidden');
      if (log) log.innerHTML = '';
      ['first-name', 'last-name', 'invite-code', 'chat-input'].forEach((id) => {
        const el = q('#' + id);
        if (el) el.value = '';
      });
      root.querySelectorAll('.fx-embed-field-focus').forEach((n) => {
        n.classList.remove('fx-embed-field-focus');
      });
    }

    async function runTeamsDemo(demo) {
      const firstEl = q('#first-name');
      const lastEl = q('#last-name');
      const codeEl = q('#invite-code');
      const joinBtn = q('#btn-join');
      const authView = q('#view-auth');
      const chatView = q('#view-chat');
      const log = q('#chat-log');
      const input = q('#chat-input');
      const sendBtn = q('#btn-send');
      const userMsg =
        'What did I tell Sarah in Slack last month about the API migration?';

      while (root.isConnected) {
        resetDemo();
        await wait(500);

        demo.focusField(firstEl);
        await demo.moveToElement(firstEl, 650);
        await demo.click();
        await demo.typeInto(firstEl, 'Alex', 45);

        demo.focusField(lastEl);
        await demo.moveToElement(lastEl, 650);
        await demo.click();
        await demo.typeInto(lastEl, 'Chen', 45);

        demo.focusField(codeEl);
        await demo.moveToElement(codeEl, 700);
        await demo.click();
        await demo.typeInto(codeEl, DEMO_CODE, 28);

        await wait(300);
        demo.focusField(null);
        root.querySelectorAll('.fx-embed-field-focus').forEach((n) => {
          n.classList.remove('fx-embed-field-focus');
        });
        await demo.moveToElement(joinBtn, 650);
        await demo.click();

        authView?.classList.add('hidden');
        chatView?.classList.remove('hidden');
        addMessage(
          log,
          'Connected to Ops Assistant. Ask me to find a message you sent in Slack, Teams, or email.',
          'bot'
        );
        await wait(600);

        await demo.moveToElement(input, 700);
        await demo.click();
        await demo.typeInto(input, userMsg, 26);
        ensureTeamsMessagesVisible();
        await wait(350);

        await demo.moveToElement(sendBtn, 650);
        await demo.click();

        addMessage(log, userMsg, 'user');
        ensureTeamsMessagesVisible();
        addMessage(
          log,
          'On Feb 12 in #platform you wrote to Sarah: "Let\'s freeze the v2 migration until load tests pass—I\'ll share numbers Friday."',
          'bot'
        );
        ensureTeamsMessagesVisible();
        if (input) input.value = '';

        await wait(400);
        ensureTeamsMessagesVisible();
        await wait(2400);
        await demo.hideCursor();
        await wait(900);
      }
    }

    return { TeamsEmbedDemo, runTeamsDemo, resetDemo };
  }

  function startRoot(root) {
    if (!root || root.dataset.teamsDemoStarted === '1') return;
    root.dataset.teamsDemoStarted = '1';

    const { TeamsEmbedDemo, runTeamsDemo } = createDemo(root);

    if (reduced) {
      createDemo(root).resetDemo();
      return;
    }

    const demo = new TeamsEmbedDemo();
    (async () => {
      await wait(400);
      runTeamsDemo(demo);
    })();
  }

  function init() {
    const inline = document.getElementById('teams-inline-demo');
    if (inline) {
      startRoot(inline);
      return;
    }
    if (document.body.classList.contains('fx-teams-embed-demo')) {
      startRoot(document.body);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  global.FlowixTeamsDemo = { init, startRoot };
})(window);
