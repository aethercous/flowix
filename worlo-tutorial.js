/**
 * First-visit dashboard tutorial — offer once, optional spotlight tour.
 */
(function (global) {
  const STORAGE_PREFIX = 'worlo_tutorial_v1_';

  let root = null;
  let spotlight = null;
  let tooltip = null;
  let stepIndex = 0;
  let steps = [];
  let hooks = {};
  let userId = null;
  let resizeHandler = null;
  let scrollWaitTimer = null;
  let tooltipClickBound = false;

  function storageKey(id) {
    return STORAGE_PREFIX + id;
  }

  function getStatus(id) {
    return localStorage.getItem(storageKey(id));
  }

  function setStatus(id, value) {
    localStorage.setItem(storageKey(id), value);
  }

  function buildSteps() {
    return [
      {
        target: () => document.querySelector('[data-section="agents"]'),
        title: 'Agents',
        body: 'Your home base. Every agent you build shows up here — create, edit, and deploy from this tab.',
        before: () => hooks.showSection('agents'),
      },
      {
        target: () => {
          const empty = document.getElementById('empty-agents');
          if (empty && empty.offsetParent !== null) {
            return document.getElementById('btn-new-agent-alt');
          }
          return document.getElementById('btn-new-agent');
        },
        title: 'Create an agent',
        body: 'Start here to add a new agent. You will configure its name, model, prompts, and permissions on the next screen.',
        before: () => hooks.showSection('agents'),
      },
      {
        target: () => document.getElementById('agent-name'),
        title: 'Agent name',
        body: 'A short label your team will recognize — e.g. "Support bot" or "Research assistant". This is shown in the dashboard and Teams app.',
        before: async () => { await hooks.openCreateAgent(); },
      },
      {
        target: () => document.getElementById('agent-model'),
        title: 'Model',
        body: 'Pick which LLM powers this agent (Claude, GPT-4, or your own OpenAI key). OpenAI agents can use worlo\'s backend prompt or only your system prompt.',
      },
      {
        target: () => document.getElementById('agent-prompt'),
        title: 'System prompt (backend)',
        body: 'The core instructions sent to the model on every run — personality, rules, tone, and what the agent should or should not do. Think of it as the agent\'s job description.',
      },
      {
        target: () => document.getElementById('agent-allowed-urls'),
        title: 'Allowed websites',
        body: 'List sites the agent may open in Browserbase (one per line). It cannot browse outside this list — good for security and focus.',
      },
      {
        target: () => document.querySelector('#section-create .fx-perm-list'),
        title: 'Agent permissions',
        body: 'Read & navigate: view pages and chats without posting. Send & edit: also post messages, click, and fill forms on allowed sites.',
      },
      {
        target: () => document.getElementById('agent-connections-picker'),
        title: 'Connected apps',
        body: 'After you connect Slack, Google, GitHub, etc. in Connections, choose which accounts this agent is allowed to use.',
      },
      {
        target: () => document.querySelector('[data-section="teams"]'),
        title: 'worlo Teams',
        body: 'Generate invite codes so teammates can chat with an agent in the worlo Teams desktop app (not Microsoft Teams).',
        before: () => hooks.showSection('teams'),
      },
      {
        target: () => document.getElementById('btn-gen-team-code'),
        title: 'Invite codes',
        body: 'Pick an agent, set expiry and max uses, then share the one-time code with your org. Codes are hashed and stored securely.',
      },
      {
        target: () => document.querySelector('[data-section="api"]'),
        title: 'API keys',
        body: 'Developers can call your agents over HTTP with an API key — useful for custom apps and automations.',
        before: () => hooks.showSection('api'),
      },
      {
        target: () => document.getElementById('btn-gen-api-key'),
        title: 'Generate API key',
        body: 'Creates a key tied to an agent token. Keep it secret; use the X-Agent-Key header when calling agent-invoke.',
      },
      {
        target: () => document.querySelector('[data-section="connections"]'),
        title: 'Connections',
        body: 'Link OAuth accounts (Slack, Google Calendar, GitHub, etc.) once, then assign them per agent when editing.',
        before: () => hooks.showSection('connections'),
      },
      {
        target: () => document.getElementById('oauth-conn-grid') || document.querySelector('#section-connections .form-card'),
        title: 'Your accounts',
        body: 'Click Connect on each provider to link your Slack, Google, GitHub, and other accounts. Then assign them to agents when editing.',
      },
      {
        target: () => document.querySelector('[data-section="billing"]'),
        title: 'Billing',
        body: 'Pay-as-you-go credits for platform usage. Top up your balance before heavy agent or browser workloads.',
        before: () => hooks.showSection('billing'),
      },
      {
        target: () => document.getElementById('balance-display'),
        title: 'Balance',
        body: 'Your current credit balance always appears here in the header so you know when to add funds.',
      },
      {
        target: () => document.getElementById('btn-open-settings'),
        title: 'Settings',
        body: 'Open settings to set a fixed time of day or enable the 10-minute day cycle.',
        before: () => hooks.showSection('agents'),
      },
      {
        centerOnly: true,
        title: 'You\'re all set',
        body: 'Create your first agent, connect apps, and share a Teams code when you\'re ready. Replay this tour anytime from Settings.',
      },
    ];
  }

  function ensureDom() {
    if (root) return;
    root = document.createElement('div');
    root.id = 'fx-tutorial-root';
    root.className = 'fx-tutorial-root';
    root.innerHTML = `
      <div class="fx-tutorial-edge-glow" aria-hidden="true"></div>
      <div class="fx-tutorial-spotlight" aria-hidden="true"></div>
      <div class="fx-tutorial-tooltip" role="dialog" aria-live="polite"></div>
    `;
    document.body.appendChild(root);
    spotlight = root.querySelector('.fx-tutorial-spotlight');
    tooltip = root.querySelector('.fx-tutorial-tooltip');
    bindTooltipActions();
  }

  function bindTooltipActions() {
    if (!tooltip || tooltipClickBound) return;
    tooltipClickBound = true;
    tooltip.addEventListener('click', (e) => {
      const skip = e.target.closest('[data-tutorial-skip]');
      const back = e.target.closest('[data-tutorial-back]');
      const next = e.target.closest('[data-tutorial-next]');
      if (skip) {
        e.preventDefault();
        endTour(false);
        return;
      }
      if (back && !back.disabled) {
        e.preventDefault();
        if (stepIndex > 0) {
          stepIndex -= 1;
          runBeforeAndShow();
        }
        return;
      }
      if (next) {
        e.preventDefault();
        if (stepIndex >= steps.length - 1) {
          endTour(true);
        } else {
          stepIndex += 1;
          runBeforeAndShow();
        }
      }
    });
  }

  function showPrompt() {
    const overlay = document.createElement('div');
    overlay.className = 'fx-tutorial-prompt';
    overlay.innerHTML = `
      <div class="fx-tutorial-prompt-card" role="dialog" aria-labelledby="fx-tutorial-prompt-title">
        <h2 id="fx-tutorial-prompt-title">Welcome to worlo</h2>
        <p>Would you like a quick tour of the dashboard? We will highlight each area and explain what it does.</p>
        <div class="fx-tutorial-prompt-actions">
          <button type="button" class="btn btn-primary" id="fx-tutorial-yes">Yes, show me around</button>
          <button type="button" class="btn btn-secondary" id="fx-tutorial-no">No thanks</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#fx-tutorial-yes').addEventListener('click', () => {
      overlay.remove();
      startTour();
    });
    overlay.querySelector('#fx-tutorial-no').addEventListener('click', () => {
      overlay.remove();
      setStatus(userId, 'declined');
    });
  }

  function getTargetEl(step) {
    if (step.centerOnly) return null;
    const t = typeof step.target === 'function' ? step.target() : document.querySelector(step.target);
    if (!t) return null;
    const rect = t.getBoundingClientRect();
    if (rect.width < 2 && rect.height < 2) return null;
    return t;
  }

  function waitForLayout(ms) {
    return new Promise((resolve) => {
      clearTimeout(scrollWaitTimer);
      scrollWaitTimer = setTimeout(resolve, ms);
    });
  }

  function positionSpotlight(rect, pad) {
    spotlight.style.display = 'block';
    spotlight.style.top = (rect.top - pad) + 'px';
    spotlight.style.left = (rect.left - pad) + 'px';
    spotlight.style.width = (rect.width + pad * 2) + 'px';
    spotlight.style.height = (rect.height + pad * 2) + 'px';
    spotlight.style.opacity = '1';
  }

  function positionTooltipSmart(rect, step) {
    tooltip.classList.remove('fx-tutorial-tooltip--center');
    tooltip.style.transform = '';

    if (step.centerOnly) {
      tooltip.classList.add('fx-tutorial-tooltip--center');
      tooltip.style.top = '50%';
      tooltip.style.left = '50%';
      tooltip.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const margin = 18;
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    tooltip.style.visibility = 'hidden';
    tooltip.style.top = '0';
    tooltip.style.left = '0';
    const tipW = tooltip.offsetWidth;
    const tipH = tooltip.offsetHeight;
    tooltip.style.visibility = '';

    let left = rect.left + rect.width / 2 - tipW / 2;
    let top;

    const spaceBelow = vh - rect.bottom;
    const spaceAbove = rect.top;
    const preferBelow = spaceBelow >= tipH + margin + pad || spaceBelow >= spaceAbove;

    if (preferBelow) {
      top = rect.bottom + margin;
    } else {
      top = rect.top - tipH - margin;
    }

    if (rect.height < 48 && rect.top < 120) {
      top = rect.bottom + margin;
    }

    left = Math.max(16, Math.min(left, vw - tipW - 16));
    top = Math.max(16, Math.min(top, vh - tipH - 16));

    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  }

  function renderTooltipContent() {
    const step = steps[stepIndex];
    const total = steps.length;
    const isLast = stepIndex >= total - 1;
    tooltip.innerHTML = `
      <div class="fx-tutorial-tooltip-step">Step ${stepIndex + 1} of ${total}</div>
      <h3>${step.title}</h3>
      <p>${step.body}</p>
      <div class="fx-tutorial-tooltip-actions">
        <button type="button" class="fx-tutorial-skip" data-tutorial-skip>Skip tour</button>
        <div class="fx-tutorial-tooltip-nav">
          <button type="button" class="btn btn-secondary" data-tutorial-back ${stepIndex === 0 ? 'disabled' : ''} style="padding:8px 14px;font-size:13px">Back</button>
          <button type="button" class="btn btn-primary" data-tutorial-next style="padding:8px 14px;font-size:13px">${isLast ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    `;
  }

  async function positionStep() {
    const step = steps[stepIndex];
    if (!step) {
      endTour(true);
      return;
    }

    renderTooltipContent();

    if (step.centerOnly) {
      document.querySelectorAll('.fx-tutorial-target-pulse').forEach((n) => n.classList.remove('fx-tutorial-target-pulse'));
      spotlight.style.display = 'none';
      spotlight.style.opacity = '0';
      positionTooltipSmart({ top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0 }, step);
      return;
    }

    const el = getTargetEl(step);
    if (!el) {
      stepIndex += 1;
      if (stepIndex < steps.length) return runBeforeAndShow();
      endTour(true);
      return;
    }

    document.querySelectorAll('.fx-tutorial-target-pulse').forEach((n) => n.classList.remove('fx-tutorial-target-pulse'));
    el.classList.add('fx-tutorial-target-pulse');

    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    await waitForLayout(480);

    const pad = 12;
    const rect = el.getBoundingClientRect();
    positionSpotlight(rect, pad);
    positionTooltipSmart(rect, step);
  }

  async function runBeforeAndShow() {
    const step = steps[stepIndex];
    if (step.before) {
      try {
        await step.before();
      } catch (e) {
        console.warn('tutorial before:', e);
      }
    }
    await waitForLayout(380);
    await positionStep();
  }

  function showStep() {
    runBeforeAndShow();
  }

  function startTour() {
    ensureDom();
    steps = buildSteps();
    stepIndex = 0;
    root.classList.add('is-active');
    root.setAttribute('aria-hidden', 'false');
    document.body.classList.add('fx-tutorial-active');
    resizeHandler = () => {
      if (root.classList.contains('is-active')) positionStep();
    };
    window.addEventListener('resize', resizeHandler);
    runBeforeAndShow();
  }

  function endTour(completed) {
    clearTimeout(scrollWaitTimer);
    document.querySelectorAll('.fx-tutorial-target-pulse').forEach((n) => n.classList.remove('fx-tutorial-target-pulse'));

    if (root) {
      root.classList.remove('is-active');
      root.setAttribute('aria-hidden', 'true');
    }
    document.body.classList.remove('fx-tutorial-active');

    if (tooltip) {
      tooltip.innerHTML = '';
      tooltip.classList.remove('fx-tutorial-tooltip--center');
      tooltip.style.top = '';
      tooltip.style.left = '';
      tooltip.style.transform = '';
      tooltip.style.visibility = '';
    }
    if (spotlight) {
      spotlight.style.display = 'none';
      spotlight.style.opacity = '0';
      spotlight.style.width = '0';
      spotlight.style.height = '0';
    }

    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
    if (userId) setStatus(userId, completed ? 'completed' : 'declined');
  }

  function offerIfNeeded(id, options) {
    if (!id) return;
    userId = id;
    hooks = options || {};
    const status = getStatus(id);
    if (status === 'declined' || status === 'completed') return;
    setTimeout(() => showPrompt(), 400);
  }

  function restart(options) {
    userId = options?.userId || userId;
    hooks = options || hooks;
    if (userId) localStorage.removeItem(storageKey(userId));
    startTour();
  }

  global.WorloTutorial = {
    offerIfNeeded,
    startTour,
    endTour,
    restart,
    getStatus,
  };
})(window);
