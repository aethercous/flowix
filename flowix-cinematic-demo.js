/**
 * Cinematic demos on real flowix dashboard UI (dashboard-demo.html embed).
 */
(function (global) {
  const CURSOR_SVG = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <path d="M5 3L19 12L11 13.5L9 20L5 3Z" fill="#12121a" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>
  </svg>`;

  const reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function getScene() {
    return new URLSearchParams(location.search).get('scene') || 'create';
  }

  const CURSOR_PAD = 18;
  const CURSOR_SIZE = 24;

  function createDemoPrompt() {
    return 'You search connected Slack, email, and Teams. Answer what the user sent to someone and when, with quotes and links to the original message.';
  }

  function clampCursorPos(x, y) {
    const maxX = window.innerWidth - CURSOR_SIZE - CURSOR_PAD;
    const maxY = window.innerHeight - CURSOR_SIZE - CURSOR_PAD;
    return {
      x: Math.max(CURSOR_PAD, Math.min(x, maxX)),
      y: Math.max(CURSOR_PAD, Math.min(y, maxY)),
    };
  }

  class EmbedDemo {
    constructor() {
      this.cursor = document.getElementById('fx-embed-cursor');
      this.flash = document.getElementById('fx-embed-flash');
      this.toast = document.getElementById('fx-embed-toast');
      if (this.cursor) this.cursor.innerHTML = CURSOR_SVG;
    }

    async moveToElement(el, duration) {
      if (!this.cursor || !el) return;
      this.cursor.classList.remove('is-hidden');
      const rect = el.getBoundingClientRect();
      const targetX = rect.left + Math.min(rect.width * 0.72, Math.max(12, rect.width - 12));
      const targetY = rect.top + Math.min(rect.height * 0.5, Math.max(12, rect.height - 12));
      const { x, y } = clampCursorPos(targetX, targetY);
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

    clearFocus() {
      document.querySelectorAll('.fx-embed-field-focus').forEach((n) => {
        n.classList.remove('fx-embed-field-focus');
      });
      document.querySelectorAll('.fx-embed-conn-focus').forEach((n) => {
        n.classList.remove('fx-embed-conn-focus');
      });
    }

    focusField(el) {
      this.clearFocus();
      const wrap = el?.closest('.form-group');
      if (wrap) wrap.classList.add('fx-embed-field-focus');
    }

    focusConn(card) {
      this.clearFocus();
      if (card) card.classList.add('fx-embed-conn-focus');
    }

    async typeInto(el, text, speed) {
      if (!el) return;
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
      for (let i = 0; i < text.length; i++) {
        el.value += text[i];
        el.dispatchEvent(new Event('input', { bubbles: true }));
        if (el.scrollHeight > el.clientHeight) {
          el.scrollTop = el.scrollHeight;
        }
        await wait(speed || 36);
      }
      el.scrollTop = el.scrollHeight;
    }

    hideCursor() {
      if (this.cursor) this.cursor.classList.add('is-hidden');
    }
  }

  async function runCreateDemo(demo) {
    const nameEl = document.getElementById('agent-name');
    const modelEl = document.getElementById('agent-model');
    const promptEl = document.getElementById('agent-prompt');
    const saveBtn = document.getElementById('btn-save');
    const promptText = createDemoPrompt();

    while (document.body.classList.contains('fx-embed-demo')) {
      if (nameEl) nameEl.value = '';
      if (promptEl) promptEl.value = '';
      if (modelEl) modelEl.selectedIndex = 0;
      saveBtn?.classList.remove('fx-embed-save-pulse');
      demo.toast?.classList.remove('is-visible');
      demo.clearFocus();

      await wait(300);
      fitEmbedScene();
      await wait(80);

      demo.focusField(nameEl);
      await demo.moveToElement(nameEl, 750);
      await demo.click();
      await demo.typeInto(nameEl, 'Ops Assistant', 40);

      demo.focusField(modelEl);
      await demo.moveToElement(modelEl, 750);
      await demo.click();
      if (modelEl) {
        modelEl.selectedIndex = 0;
        modelEl.dispatchEvent(new Event('change', { bubbles: true }));
      }
      await wait(300);

      await wait(280);
      demo.focusField(promptEl);
      await demo.moveToElement(promptEl, 750);
      await demo.click();
      await demo.typeInto(promptEl, promptText, 20);

      await wait(400);
      demo.clearFocus();
      fitEmbedScene();
      await wait(80);
      await demo.moveToElement(saveBtn, 700);
      await demo.click();
      saveBtn?.classList.add('fx-embed-save-pulse');
      demo.toast?.classList.add('is-visible');

      await wait(2400);
      demo.toast?.classList.remove('is-visible');
      saveBtn?.classList.remove('fx-embed-save-pulse');
      await demo.hideCursor();
      await wait(900);
    }
  }

  function demoConnectCard(card, btn) {
    if (!card || !btn) return;
    card.classList.add('fx-conn-connected');
    const badge = card.querySelector('.card-badge');
    if (badge) {
      badge.classList.add('fx-conn-status-connected');
      badge.textContent = 'Connected';
    }
    btn.className = 'btn btn-secondary';
    btn.textContent = 'Disconnect';
  }

  async function runChatDemo(demo) {
    const agentSelect = document.getElementById('chat-agent-select');
    const input = document.getElementById('chat-message-input');
    const sendBtn = document.getElementById('btn-chat-send');
    const messages = document.getElementById('chat-messages');
    const userMsg =
      'What did I send to John three weeks ago about the production problem?';

    while (document.body.classList.contains('fx-embed-demo')) {
      if (input) input.value = '';
      if (messages) {
        messages.innerHTML =
          '<div class="fx-chat-bubble fx-chat-bubble--assistant">Hi — I\'m Ops Assistant. Ask me to find a past message, DM, or thread from your connected apps.</div>';
      }

      await wait(500);
      fitEmbedScene();
      await wait(80);

      if (agentSelect) {
        await demo.moveToElement(agentSelect, 650);
        await demo.click();
      }

      await wait(350);
      if (input) {
        await demo.moveToElement(input, 700);
        await demo.click();
        await demo.typeInto(input, userMsg, 28);
        ensureDemoContentVisible();
      }

      await wait(400);
      ensureDemoContentVisible();
      await wait(60);

      if (sendBtn) {
        await demo.moveToElement(sendBtn, 650);
        await demo.click();
      }

      if (messages) {
        messages.innerHTML =
          messages.innerHTML +
          '<div class="fx-chat-bubble fx-chat-bubble--user">' +
          userMsg +
          '</div>' +
          '<div class="fx-chat-bubble fx-chat-bubble--assistant">On Mar 28 you DM\'d John in Slack: &ldquo;Prod is still red on checkout&mdash;can you check the Stripe webhook logs tonight?&rdquo; (#eng-alerts)</div>';
        ensureDemoContentVisible();
      }

      await wait(400);
      ensureDemoContentVisible();
      await wait(2400);
      await demo.hideCursor();
      await wait(900);
    }
  }

  async function runConnectionsDemo(demo) {
    const providers = ['slack', 'google', 'github'];

    while (document.body.classList.contains('fx-embed-demo')) {
      providers.forEach((id) => {
        const btn = document.querySelector(`[data-oauth-btn="${id}"]`);
        const card = btn?.closest('.fx-conn-card');
        if (!card || !btn) return;
        card.classList.remove('fx-conn-connected', 'fx-embed-conn-focus');
        const badge = card.querySelector('.card-badge');
        if (badge) {
          badge.classList.remove('fx-conn-status-connected');
          badge.textContent = 'Not connected';
        }
        btn.className = 'btn btn-primary';
        const label = btn.getAttribute('data-oauth-label') || id;
        btn.textContent = 'Connect ' + label;
      });

      await wait(500);

      fitEmbedScene();
      await wait(80);

      for (const id of providers) {
        const btn = document.querySelector(`[data-oauth-btn="${id}"]`);
        const card = btn?.closest('.fx-conn-card');
        if (!btn || !card) continue;

        await wait(350);

        demo.focusConn(card);
        fitEmbedScene();
        await wait(40);
        await demo.moveToElement(btn, 720);
        await demo.click();
        demoConnectCard(card, btn);
        demo.clearFocus();
        await wait(500);
      }

      await wait(2000);
      await demo.hideCursor();
      await wait(800);
    }
  }

  function buildConnectionsMarkup() {
    const apps = [
      { id: 'slack', label: 'Slack', icon: 'S', color: '#4A154B', desc: 'Search DMs and channels so agents can recall what you sent to someone and when.' },
      { id: 'google', label: 'Gmail', icon: 'G', color: '#4285F4', desc: 'Find past email threads and replies your agent can quote in chat answers.' },
      { id: 'github', label: 'GitHub', icon: 'G', color: '#181717', desc: 'Pull issue comments and review threads into chat lookups about past discussions.' },
    ];
    return apps.map((app) => `
      <div class="card fx-conn-card">
        <div class="card-header">
          <div class="card-title" style="display:flex;align-items:center;gap:10px">
            <span style="font-size:22px;font-weight:800;color:${app.color}">${app.icon}</span>
            ${app.label}
          </div>
          <div class="card-badge">Not connected</div>
        </div>
        <div class="card-description">${app.desc}</div>
        <div class="card-footer">
          <button type="button" class="btn btn-primary" data-oauth-btn="${app.id}" data-oauth-label="${app.label}">
            Connect ${app.label}
          </button>
        </div>
      </div>`).join('');
  }

  function mountEmbedStage() {
    let stage = document.getElementById('fx-embed-stage');
    if (stage) return stage;

    stage = document.createElement('div');
    stage.id = 'fx-embed-stage';
    const overlay = document.querySelector('.fx-embed-demo-overlay');
    const main = document.querySelector('main');
    if (main) stage.appendChild(main);
    document.body.insertBefore(stage, overlay || null);
    document.body.classList.add('fx-embed-has-stage');
    return stage;
  }

  function getFitTargets(scene) {
    if (scene === 'connections') {
      return [
        document.querySelector('#section-connections .page-header'),
        document.querySelector('.fx-embed-conn-panel'),
      ].filter(Boolean);
    }
    if (scene === 'chat') {
      return [
        document.querySelector('#section-chat .page-header'),
        document.querySelector('.fx-embed-chat-layout'),
      ].filter(Boolean);
    }
    return [
      document.getElementById('section-create'),
    ].filter(Boolean);
  }

  function unionRect(elements) {
    let top = Infinity;
    let left = Infinity;
    let bottom = 0;
    let right = 0;
    elements.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) return;
      top = Math.min(top, r.top);
      left = Math.min(left, r.left);
      bottom = Math.max(bottom, r.bottom);
      right = Math.max(right, r.right);
    });
    if (top === Infinity) return null;
    return { top, left, bottom, right, width: right - left, height: bottom - top };
  }

  function fitEmbedScene() {
    const scene = getScene();
    const stage = mountEmbedStage();
    if (!stage) return false;

    stage.style.transform = 'none';

    const promptEl = document.getElementById('agent-prompt');
    let savedPrompt = null;
    if (scene === 'create' && promptEl) {
      savedPrompt = promptEl.value;
      promptEl.value = createDemoPrompt();
    }

    const bounds = unionRect(getFitTargets(scene));
    if (savedPrompt !== null) promptEl.value = savedPrompt;
    if (!bounds) return false;

    const navH = parseInt(
      getComputedStyle(document.documentElement).getPropertyValue('--fx-nav-h'),
      10
    ) || 72;
    const pad =
      scene === 'create'
        ? { top: 6, right: 10, bottom: 10, left: 10 }
        : scene === 'connections'
          ? { top: 10, right: 16, bottom: 16, left: 16 }
          : { top: 12, right: 20, bottom: 20, left: 20 };
    const availW = window.innerWidth - pad.left - pad.right;
    const availH = window.innerHeight - navH - pad.top - pad.bottom;
    const scale = Math.min(1, availW / bounds.width, availH / bounds.height);

    const scaledW = bounds.width * scale;
    const scaledH = bounds.height * scale;
    const tx = pad.left + (availW - scaledW) / 2 - bounds.left * scale;
    const ty = navH + pad.top + (availH - scaledH) / 2 - bounds.top * scale;

    stage.style.transform = 'translate(' + tx + 'px,' + ty + 'px) scale(' + scale + ')';
    global.__fxEmbedFit = { scale, tx, ty };
    return true;
  }

  function scrollMessagesContainer(container) {
    if (!container) return;
    container.scrollTop = container.scrollHeight;
    const last = container.lastElementChild;
    if (last && typeof last.scrollIntoView === 'function') {
      last.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }

  function ensureDemoContentVisible() {
    scrollMessagesContainer(document.getElementById('chat-messages'));
    const input = document.getElementById('chat-message-input');
    if (input) {
      input.scrollTop = input.scrollHeight;
      if (typeof input.scrollIntoView === 'function') {
        input.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
    fitEmbedScene();
    requestAnimationFrame(() => {
      scrollMessagesContainer(document.getElementById('chat-messages'));
      fitEmbedScene();
    });
  }

  function notifyEmbedReady() {
    try {
      if (window.parent !== window) {
        window.parent.postMessage({ type: 'fx-embed-ready', scene: getScene() }, '*');
      }
    } catch (_) {
      /* cross-origin guard */
    }
  }

  async function settleEmbedFrame() {
    fitEmbedScene();
    await wait(50);
    fitEmbedScene();
    await wait(50);
    fitEmbedScene();
    notifyEmbedReady();
  }

  function initEmbed() {
    if (!document.body.classList.contains('fx-embed-demo')) return;

    mountEmbedStage();

    const scene = getScene();
    document.body.classList.add('fx-embed-scene-' + scene);

    const grid = document.getElementById('oauth-conn-grid');
    if (grid && scene === 'connections') {
      grid.innerHTML = buildConnectionsMarkup();
    }

    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));
    if (scene === 'create') {
      document.getElementById('section-create')?.classList.add('active');
      document.querySelector('[data-section="agents"]')?.classList.add('active');
    }
    if (scene === 'connections') {
      document.getElementById('section-connections')?.classList.add('active');
      document.querySelector('[data-section="connections"]')?.classList.add('active');
    }
    if (scene === 'chat') {
      document.getElementById('section-chat')?.classList.add('active');
      document.querySelector('[data-section="chat"]')?.classList.add('active');
    }

    document.body.classList.add('ready');

    const scheduleFit = () => {
      requestAnimationFrame(() => {
        fitEmbedScene();
        requestAnimationFrame(fitEmbedScene);
      });
    };
    scheduleFit();
    window.addEventListener('resize', scheduleFit, { passive: true });
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(scheduleFit);
    }

    if (reduced) {
      settleEmbedFrame();
      return;
    }

    const demo = new EmbedDemo();
    (async () => {
      await settleEmbedFrame();
      await wait(320);
      if (scene === 'connections') runConnectionsDemo(demo);
      else if (scene === 'chat') runChatDemo(demo);
      else runCreateDemo(demo);
    })();
  }

  function initLanding() {
    const iframes = Array.from(document.querySelectorAll('.fx-cinematic-iframe, .fx-teams-demo-iframe'));
    const ready = new Set();

    function markLoaded(iframe) {
      if (!iframe || ready.has(iframe)) return;
      ready.add(iframe);
      iframe.classList.add('is-loaded');
    }

    iframes.forEach((iframe) => {
      iframe.setAttribute('tabindex', '-1');
      iframe.addEventListener('load', () => {
        if (iframe.classList.contains('fx-teams-demo-iframe')) {
          window.setTimeout(() => markLoaded(iframe), 400);
          return;
        }
        window.setTimeout(() => markLoaded(iframe), 2200);
      });
    });

    window.addEventListener('message', (event) => {
      if (!event.data || event.data.type !== 'fx-embed-ready') return;
      const match = iframes.find((iframe) => {
        try {
          return iframe.contentWindow === event.source;
        } catch (_) {
          return false;
        }
      });
      if (match) markLoaded(match);
    });
  }

  function init() {
    if (document.body.classList.contains('fx-embed-demo')) {
      initEmbed();
    } else {
      initLanding();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  global.FlowixCinematicDemo = { init, initEmbed, fitEmbedScene };
})(window);
