/**
 * Shared Worlo / Supabase client config (browser).
 * SUPABASE_ANON_KEY — legacy anon JWT; required for Edge Functions from unauthenticated clients (Teams app).
 * SUPABASE_KEY — publishable key for auth flows where supported.
 */
(function (global) {
  const SUPABASE_URL = 'https://utofnywijqsozjqmkhcn.supabase.co';
  const GOOGLE_CALLBACK_PATH = '/auth/google-callback.html';

  function googleCallbackUri(origin) {
    const base = origin || (typeof window !== 'undefined' ? window.location.origin : 'https://flowix.space');
    return base.replace(/\/$/, '') + GOOGLE_CALLBACK_PATH;
  }

  async function startBrandedGoogleAuth(options) {
    options = options || {};
    const sb = options.supabaseClient;
    const mode = options.mode === 'connect' ? 'connect' : 'signin';
    const returnUrl = options.returnUrl || (mode === 'connect' ? 'dashboard.html#connections' : '/');
    const headers = { 'Content-Type': 'application/json' };

    if (mode === 'connect') {
      if (!sb) throw new Error('Please sign in again');
      const sessionRes = await sb.auth.getSession();
      const session = sessionRes?.data?.session;
      if (!session) throw new Error('Please sign in again');
      headers.Authorization = 'Bearer ' + session.access_token;
    }

    const res = await fetch(SUPABASE_URL + '/functions/v1/google-auth-start', {
      method: 'POST',
      headers: headers,
      body: JSON.stringify({
        mode: mode,
        redirectUri: googleCallbackUri(),
        returnUrl: returnUrl,
      }),
    });

    let data = {};
    try {
      data = await res.json();
    } catch (_e) {
      /* ignore */
    }

    if (!res.ok || data.error || data.ok === false) {
      throw new Error(data.error || 'Failed to start Google authorization');
    }
    if (!data.url) throw new Error('No Google authorization URL returned');
    return { url: data.url, mode: mode };
  }

  global.WORLO_CONFIG = {
    APP_NAME: 'Flowix',
    SUPABASE_URL: SUPABASE_URL,
    GOOGLE_CALLBACK_PATH: GOOGLE_CALLBACK_PATH,
    googleCallbackUri: googleCallbackUri,
    startBrandedGoogleAuth: startBrandedGoogleAuth,
    SUPABASE_ANON_KEY:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0b2ZueXdpanFzb3pqcW1raGNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2Njk1MzUsImV4cCI6MjA5MzI0NTUzNX0.dQG0qZhO32q83LyrChAh6hBrWiqYYzPcWJGyCFfmpWw',
    SUPABASE_KEY: 'sb_publishable_NFpInIt2anAJxn2slHZIuQ_BsEw4g1n',
    TEAMS_APP_PATH: '/teams-app/index.html',
    TEAMS_DOWNLOAD_PATH: '/teams-app/download.html',
    DASHBOARD_PATH: 'dashboard.html',
    LANDING_PATH: '/',
  };
})(typeof window !== 'undefined' ? window : globalThis);
