/**
 * flowix sky — time-of-day sky (no sun/moon sprites).
 * Settings: { mode: 'day'|'night'|'journey', timeOfDay: 0..1 }
 */
(function (global) {
  const STORAGE_KEY = 'flowix_sky_settings';
  const DEFAULT_MODE = 'journey';
  const VALID_MODES = ['day', 'night', 'journey', 'cycle'];
  const MODE_TIME = { day: 0.14, night: 0.86, journey: 0.14, cycle: 0.14 };
  const CYCLE_MS = 10 * 60 * 1000;
  const LERP_SPEED = 0.12;
  const STAR_COUNT = 48;

  const PHASES = [
    { id: 'day', t: 0, top: '#4da6e8', mid: '#87ceeb', bottom: '#e8f4fc', cloud: 'rgba(255,255,255,0.92)', cloudShadow: 'rgba(255,255,255,0.45)', stars: 0, vignette: 'rgba(45,90,135,0)' },
    { id: 'afternoon', t: 0.28, top: '#5a9fd4', mid: '#9ecae8', bottom: '#d4e8f4', cloud: 'rgba(255,255,255,0.88)', cloudShadow: 'rgba(255,248,240,0.35)', stars: 0, vignette: 'rgba(180,120,80,0.06)' },
    { id: 'evening', t: 0.48, top: '#6b8fb8', mid: '#c4a882', bottom: '#e8d4b8', cloud: 'rgba(255,248,242,0.82)', cloudShadow: 'rgba(220,180,140,0.3)', stars: 0.06, vignette: 'rgba(120,80,60,0.12)' },
    { id: 'sunset', t: 0.68, top: '#4a5a8a', mid: '#c87858', bottom: '#8b4a62', cloud: 'rgba(255,220,210,0.55)', cloudShadow: 'rgba(80,40,60,0.25)', stars: 0.28, vignette: 'rgba(60,30,50,0.2)' },
    { id: 'night', t: 1, top: '#0a1628', mid: '#152238', bottom: '#1a2a42', cloud: 'rgba(72,88,118,0.75)', cloudShadow: 'rgba(20,30,55,0.5)', stars: 1, vignette: 'rgba(5,10,25,0.35)' },
  ];

  const PHASE_CLASS_PREFIX = 'fx-sky-phase-';
  let starsBuilt = false;
  let scrollBound = false;
  let displayT = 0;
  let targetT = 0;
  let animRaf = null;
  let currentMode = DEFAULT_MODE;
  let lastPhaseId = null;
  let scrollEndTimer = null;
  let lastScrollApply = 0;
  let cycleRaf = null;

  function normalizeMode(mode) {
    return VALID_MODES.includes(mode) ? mode : DEFAULT_MODE;
  }

  function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0 || 1)));
    return t * t * (3 - 2 * t);
  }

  function easeInOutQuart(x) {
    return x < 0.5 ? 8 * x * x * x * x : 1 - Math.pow(-2 * x + 2, 4) / 2;
  }

  function getSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return {
          mode: DEFAULT_MODE,
          timeOfDay: MODE_TIME[DEFAULT_MODE],
          cycleStartedAt: Date.now(),
        };
      }
      const parsed = JSON.parse(raw);
      const mode = normalizeMode(parsed.mode);
      let timeOfDay = typeof parsed.timeOfDay === 'number' ? parsed.timeOfDay : MODE_TIME[mode];
      timeOfDay = Math.max(0, Math.min(1, timeOfDay));
      const cycleStartedAt =
        typeof parsed.cycleStartedAt === 'number'
          ? parsed.cycleStartedAt
          : Date.now() - timeOfDay * CYCLE_MS;
      return { mode, timeOfDay, cycleStartedAt };
    } catch (_) {
      return {
        mode: DEFAULT_MODE,
        timeOfDay: MODE_TIME[DEFAULT_MODE],
        cycleStartedAt: Date.now(),
      };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpColor(c1, c2, t) {
    const parse = (hex) => {
      const h = hex.replace('#', '');
      return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    };
    const a = parse(c1);
    const b = parse(c2);
    const mix = a.map((v, i) => Math.round(lerp(v, b[i], t)));
    return '#' + mix.map((n) => n.toString(16).padStart(2, '0')).join('');
  }

  function blendRgba(rgba, rgba2, t) {
    const pull = (s) => {
      const m = s.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 1];
      const p = m[1].split(',').map((x) => parseFloat(x.trim()));
      return p.length === 4 ? p : [p[0], p[1], p[2], 1];
    };
    const A = pull(rgba);
    const B = pull(rgba2);
    const o = A.map((v, i) => lerp(v, B[i], t));
    return `rgba(${Math.round(o[0])},${Math.round(o[1])},${Math.round(o[2])},${o[3].toFixed(2)})`;
  }

  function samplePhase(t) {
    const clamped = Math.max(0, Math.min(1, t));
    let i = 0;
    while (i < PHASES.length - 1 && PHASES[i + 1].t < clamped) i++;
    const a = PHASES[i];
    const b = PHASES[Math.min(i + 1, PHASES.length - 1)];
    const span = b.t - a.t || 1;
    const local = smoothstep(0, 1, (clamped - a.t) / span);
    return {
      id: local < 0.5 ? a.id : b.id,
      top: lerpColor(a.top, b.top, local),
      mid: lerpColor(a.mid, b.mid, local),
      bottom: lerpColor(a.bottom, b.bottom, local),
      cloud: blendRgba(a.cloud, b.cloud, local),
      cloudShadow: blendRgba(a.cloudShadow, b.cloudShadow, local),
      stars: lerp(a.stars, b.stars, local),
      vignette: blendRgba(a.vignette, b.vignette, local),
    };
  }

  function formatTimeOfDay(t) {
    const totalMins = Math.round((6 * 60) + t * (14.5 * 60));
    let h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
  }

  function phaseName(t) {
    if (t < 0.2) return 'Daytime';
    if (t < 0.4) return 'Afternoon';
    if (t < 0.55) return 'Evening';
    if (t < 0.78) return 'Sunset';
    return 'Night';
  }

  function getScene() {
    return document.querySelector('.fx-sky-scene');
  }

  function removeSunMoon(scene) {
    if (!scene) return;
    scene.querySelectorAll('.fx-sky-sun, .fx-sky-moon').forEach((el) => el.remove());
  }

  function ensureLayers(scene) {
    if (!scene) return;
    removeSunMoon(scene);
    if (!scene.querySelector('.fx-sky-gradient')) {
      const gradient = document.createElement('div');
      gradient.className = 'fx-sky-gradient';
      scene.insertBefore(gradient, scene.firstChild);
    }
    let stars = scene.querySelector('.fx-sky-stars');
    if (!stars) {
      stars = document.createElement('div');
      stars.className = 'fx-sky-stars';
      stars.setAttribute('aria-hidden', 'true');
      const grad = scene.querySelector('.fx-sky-gradient');
      scene.insertBefore(stars, grad ? grad.nextSibling : scene.firstChild);
    }
    scene.dataset.layersReady = '1';
    buildStars(stars);
  }

  function buildStars(container) {
    if (!container || starsBuilt) return;
    starsBuilt = true;
    let seed = 42;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let i = 0; i < STAR_COUNT; i++) {
      const el = document.createElement('span');
      el.className = 'fx-sky-star';
      const size = rnd() > 0.92 ? 2.5 : rnd() > 0.7 ? 1.8 : 1.2;
      el.style.width = size + 'px';
      el.style.height = size + 'px';
      el.style.left = (rnd() * 100).toFixed(2) + '%';
      el.style.top = (rnd() * 72).toFixed(2) + '%';
      el.style.animationDuration = (2.5 + rnd() * 4).toFixed(1) + 's';
      el.style.animationDelay = (rnd() * 5).toFixed(1) + 's';
      container.appendChild(el);
    }
  }

  function applySample(scene, sample) {
    if (!scene) return;
    const body = document.body;
    const phaseDriven =
      body.classList.contains('fx-sky-journey') || body.classList.contains('fx-sky-cycle');
    if (phaseDriven && sample.id !== lastPhaseId) {
      PHASES.forEach((p) => body.classList.remove(PHASE_CLASS_PREFIX + p.id));
      body.classList.add(PHASE_CLASS_PREFIX + sample.id);
      lastPhaseId = sample.id;
    }
    scene.style.setProperty('--fx-sky-top', sample.top);
    scene.style.setProperty('--fx-sky-mid', sample.mid);
    scene.style.setProperty('--fx-sky-bottom', sample.bottom);
    scene.style.setProperty('--fx-cloud-fill', sample.cloud);
    scene.style.setProperty('--fx-cloud-shadow', sample.cloudShadow);
    scene.style.setProperty('--fx-stars-opacity', String(sample.stars));
    scene.style.setProperty('--fx-sky-vignette', sample.vignette);
    scene.dataset.phase = sample.id;
  }

  function renderAt(t) {
    const scene = getScene();
    if (!scene) return;
    applySample(scene, samplePhase(t));
  }

  function setTarget(t, immediate) {
    targetT = Math.max(0, Math.min(1, t));
    if (immediate || usesLandingScroll()) {
      displayT = targetT;
      renderAt(displayT);
      stopAnimLoop();
      return;
    }
    startAnimLoop();
  }

  function startAnimLoop() {
    if (animRaf) return;
    const tick = () => {
      const diff = targetT - displayT;
      if (Math.abs(diff) < 0.002) {
        displayT = targetT;
        renderAt(displayT);
        animRaf = null;
        syncTimeSliderUi(displayT);
        return;
      }
      displayT += diff * LERP_SPEED;
      renderAt(displayT);
      animRaf = requestAnimationFrame(tick);
    };
    animRaf = requestAnimationFrame(tick);
  }

  function stopAnimLoop() {
    if (animRaf) {
      cancelAnimationFrame(animRaf);
      animRaf = null;
    }
  }

  function usesLandingScroll() {
    return currentMode === 'journey' && document.body.classList.contains('fx-landing');
  }

  function usesCycleAnimation() {
    return currentMode === 'cycle';
  }

  function getCycleTimeOfDay(settings) {
    const s = settings || getSettings();
    const anchor = s.cycleStartedAt || Date.now();
    return ((Date.now() - anchor) % CYCLE_MS) / CYCLE_MS;
  }

  function landingScrollProgress() {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const raw = Math.max(0, Math.min(1, window.scrollY / max));
    return easeInOutQuart(raw);
  }

  function resolveTargetFromMode(settings) {
    if (usesLandingScroll()) return landingScrollProgress();
    if (usesCycleAnimation()) return getCycleTimeOfDay(settings);
    return settings.timeOfDay;
  }

  function updateSkyTarget(immediate) {
    const settings = getSettings();
    setTarget(resolveTargetFromMode(settings), immediate);
  }

  function stopCycleLoop() {
    if (cycleRaf) {
      cancelAnimationFrame(cycleRaf);
      cycleRaf = null;
    }
  }

  function startCycleLoop() {
    stopCycleLoop();
    const tick = () => {
      if (!usesCycleAnimation()) {
        cycleRaf = null;
        return;
      }
      const settings = getSettings();
      const t = getCycleTimeOfDay(settings);
      settings.timeOfDay = t;
      setTarget(t, true);
      syncTimeSliderUi(t, true);
      cycleRaf = requestAnimationFrame(tick);
    };
    cycleRaf = requestAnimationFrame(tick);
  }

  function applyMode(mode) {
    const body = document.body;
    const scene = getScene();
    mode = normalizeMode(mode);

    currentMode = mode;
    if (scene) ensureLayers(scene);
    body.classList.remove('fx-sky-day', 'fx-sky-night', 'fx-sky-journey', 'fx-sky-cycle');
    PHASES.forEach((p) => body.classList.remove(PHASE_CLASS_PREFIX + p.id));

    const reduced = global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isLanding = body.classList.contains('fx-landing');
    let effective = mode;
    if (reduced && (mode === 'journey' || mode === 'cycle')) effective = 'day';

    lastPhaseId = null;
    stopCycleLoop();

    if (effective === 'journey' && isLanding) {
      body.classList.add('fx-sky-journey');
      bindLandingScroll();
      updateSkyTarget(true);
      updateTimeSliderState();
      return;
    }

    unbindLandingScroll();
    body.classList.remove('fx-sky-scrolling');

    const settings = getSettings();

    if (effective === 'cycle') {
      body.classList.add('fx-sky-cycle', 'fx-sky-journey');
      if (reduced) {
        body.classList.add('fx-sky-day');
        setTarget(settings.timeOfDay, true);
      } else {
        startCycleLoop();
      }
      updateTimeSliderState();
      return;
    }

    if (effective === 'night') {
      body.classList.add('fx-sky-night');
    } else {
      body.classList.add('fx-sky-day');
    }

    const sample = samplePhase(settings.timeOfDay);
    body.classList.add(PHASE_CLASS_PREFIX + sample.id);
    lastPhaseId = sample.id;
    updateSkyTarget(true);
    updateTimeSliderState();
  }

  function updateLandingScroll() {
    if (!usesLandingScroll()) return;
    const now = performance.now();
    if (now - lastScrollApply < 32) return;
    lastScrollApply = now;
    setTarget(landingScrollProgress(), true);
  }

  function bindLandingScroll() {
    if (scrollBound) return;
    scrollBound = true;
    let ticking = false;
    const onScroll = () => {
      document.body.classList.add('fx-sky-scrolling');
      clearTimeout(scrollEndTimer);
      scrollEndTimer = setTimeout(() => {
        document.body.classList.remove('fx-sky-scrolling');
      }, 150);
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        updateLandingScroll();
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    global.__fxSkyScrollHandler = onScroll;
  }

  function unbindLandingScroll() {
    if (!scrollBound || !global.__fxSkyScrollHandler) return;
    window.removeEventListener('scroll', global.__fxSkyScrollHandler);
    window.removeEventListener('resize', global.__fxSkyScrollHandler);
    scrollBound = false;
  }

  function setMode(mode) {
    mode = normalizeMode(mode);
    const prev = getSettings();
    let timeOfDay = prev.timeOfDay;
    if (mode === 'day') timeOfDay = MODE_TIME.day;
    else if (mode === 'night') timeOfDay = MODE_TIME.night;

    const settings = {
      mode,
      timeOfDay,
      cycleStartedAt: prev.cycleStartedAt,
    };
    if (mode === 'cycle') {
      settings.cycleStartedAt = Date.now() - timeOfDay * CYCLE_MS;
    }
    saveSettings(settings);
    applyMode(mode);
    syncTimeSliderUi(timeOfDay);
    updateTimeSliderState();
    return settings;
  }

  function setTimeOfDay(t, save) {
    const settings = getSettings();
    settings.timeOfDay = Math.max(0, Math.min(1, t));
    if (settings.mode === 'cycle') {
      settings.cycleStartedAt = Date.now() - settings.timeOfDay * CYCLE_MS;
    }
    if (save !== false) saveSettings(settings);
    if (usesLandingScroll()) {
      syncTimeSliderUi(settings.timeOfDay);
      return settings;
    }
    if (settings.mode === 'cycle') {
      setTarget(settings.timeOfDay, true);
      syncTimeSliderUi(settings.timeOfDay, true);
      return settings;
    }
    setTarget(settings.timeOfDay, false);
    syncTimeSliderUi(settings.timeOfDay);
    return settings;
  }

  function setCycleEnabled(enabled) {
    const settings = getSettings();
    let t = settings.timeOfDay;
    if (settings.mode === 'cycle') {
      t = getCycleTimeOfDay(settings);
    }
    settings.timeOfDay = Math.max(0, Math.min(1, t));
    if (enabled) {
      settings.mode = 'cycle';
      settings.cycleStartedAt = Date.now() - settings.timeOfDay * CYCLE_MS;
    } else {
      settings.mode = 'day';
    }
    saveSettings(settings);
    applyMode(settings.mode);
    syncTimeSliderUi(settings.timeOfDay);
    updateTimeSliderState();
    return settings;
  }

  function bindCycleToggle() {
    const toggle = document.getElementById('sky-cycle-enabled');
    if (!toggle || toggle.dataset.skyBound) return;
    toggle.dataset.skyBound = '1';
    const settings = getSettings();
    toggle.checked = settings.mode === 'cycle';
    toggle.addEventListener('change', () => {
      setCycleEnabled(toggle.checked);
      toastSaved();
    });
  }

  function syncTimeSliderUi(t, skipInput) {
    const slider = document.getElementById('sky-time-slider');
    const label = document.getElementById('sky-time-label');
    const phase = document.getElementById('sky-time-phase');
    if (slider && !skipInput) {
      slider.value = String(Math.round(t * 1000));
    }
    if (label) label.textContent = formatTimeOfDay(t);
    if (phase) phase.textContent = phaseName(t);
    const preview = document.getElementById('sky-time-preview');
    if (preview) {
      const s = samplePhase(t);
      preview.style.background = `linear-gradient(180deg, ${s.top} 0%, ${s.mid} 50%, ${s.bottom} 100%)`;
    }
  }

  function updateTimeSliderState() {
    const slider = document.getElementById('sky-time-slider');
    const hint = document.getElementById('sky-time-hint');
    const settings = getSettings();
    const journey = settings.mode === 'journey';
    const cycle = settings.mode === 'cycle';
    const onLanding = document.body.classList.contains('fx-landing');
    if (slider) {
      const scrollLocked = journey && onLanding;
      slider.disabled = scrollLocked;
      slider.classList.toggle('is-locked', scrollLocked);
    }
    const cycleToggle = document.getElementById('sky-cycle-enabled');
    if (cycleToggle) cycleToggle.checked = cycle;

    if (hint) {
      if (cycle) {
        hint.textContent =
          'Day cycle is on — the sky loops every 10 minutes. Drag the slider to jump to a time in the cycle, or turn off day cycle for a fixed sky.';
      } else if (settings.mode === 'day') {
        hint.textContent =
          'Fixed time of day — drag the slider to set the sky on the landing page and dashboard.';
      } else if (journey && onLanding) {
        hint.textContent =
          'Scroll journey is active on the homepage. Choose Day, Night, or Day cycle to lock the sky to your time slider instead.';
      } else if (journey) {
        hint.textContent =
          'Drag to preview a time of day. The homepage still shifts with scroll when you visit it.';
      } else {
        hint.textContent =
          'Drag to set the sky time on the landing page and dashboard.';
      }
    }
  }

  function bindSettingsUI(rootId) {
    const root = document.getElementById(rootId);
    if (!root || root.dataset.skyBound) return;
    root.dataset.skyBound = '1';
    const current = getSettings().mode;
    root.querySelectorAll('[data-sky-mode]').forEach((el) => {
      const mode = el.getAttribute('data-sky-mode');
      const input = el.querySelector('input[type="radio"]');
      const isSelected = mode === current;
      el.classList.toggle('is-selected', isSelected);
      if (input) input.checked = isSelected;
    });
    root.addEventListener('change', (e) => {
      const input = e.target;
      if (input.type !== 'radio' || !input.checked) return;
      const mode = input.value;
      root.querySelectorAll('[data-sky-mode]').forEach((o) => {
        o.classList.toggle('is-selected', o.getAttribute('data-sky-mode') === mode);
      });
      setMode(mode);
      toastSaved();
    });
  }

  function bindTimeSlider() {
    const slider = document.getElementById('sky-time-slider');
    if (!slider || slider.dataset.skyBound) return;
    slider.dataset.skyBound = '1';
    const settings = getSettings();
    slider.value = String(Math.round(settings.timeOfDay * 1000));
    syncTimeSliderUi(settings.timeOfDay);

    slider.addEventListener('input', () => {
      const t = parseInt(slider.value, 10) / 1000;
      setTimeOfDay(t, true);
    });
    slider.addEventListener('change', () => toastSaved());
  }

  function bindSettingsGear() {
    const btn = document.getElementById('btn-open-settings');
    if (!btn || btn.dataset.skyBound) return;
    btn.dataset.skyBound = '1';
    btn.addEventListener('click', () => {
      if (typeof global.__fxShowSection === 'function') {
        global.__fxShowSection('settings');
      } else {
        window.location.href = 'dashboard.html#settings';
      }
    });
  }

  function toastSaved() {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = 'toast success';
    el.textContent = 'Appearance saved';
    container.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function init(options) {
    const settings = getSettings();
    const mode = normalizeMode((options && options.mode) || settings.mode);
    const initialT = resolveTargetFromMode(settings);
    displayT = initialT;
    targetT = initialT;
    applyMode(mode);
    bindTimeSlider();
    bindCycleToggle();
    bindSettingsGear();
    updateTimeSliderState();
    syncTimeSliderUi(initialT);

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => applyMode(mode), { once: true });
    }
    window.addEventListener('load', () => {
      if (usesLandingScroll()) updateLandingScroll();
      else updateSkyTarget(true);
    }, { once: true });
    window.addEventListener('pageshow', () => {
      applyMode(getSettings().mode);
    });
    return settings;
  }

  global.__fxShowSection = null;

  global.FlowixSky = {
    getSettings,
    saveSettings,
    setMode,
    setTimeOfDay,
    init,
    applyMode,
    bindSettingsUI,
    bindTimeSlider,
    bindCycleToggle,
    setCycleEnabled,
    bindSettingsGear,
    updateTimeSliderState,
    formatTimeOfDay,
    samplePhase,
    PHASES,
    DEFAULT_MODE,
    VALID_MODES,
    CYCLE_MS,
    getCycleTimeOfDay,
  };
})(window);
