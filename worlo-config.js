/**
 * Shared Worlo / Supabase client config (browser).
 * SUPABASE_ANON_KEY — legacy anon JWT; required for Edge Functions from unauthenticated clients (Teams app).
 * SUPABASE_KEY — publishable key for auth flows where supported.
 */
(function (global) {
  global.WORLO_CONFIG = {
    SUPABASE_URL: 'https://utofnywijqsozjqmkhcn.supabase.co',
    SUPABASE_ANON_KEY:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV0b2ZueXdpanFzb3pqcW1raGNuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2Njk1MzUsImV4cCI6MjA5MzI0NTUzNX0.dQG0qZhO32q83LyrChAh6hBrWiqYYzPcWJGyCFfmpWw',
    SUPABASE_KEY: 'sb_publishable_NFpInIt2anAJxn2slHZIuQ_BsEw4g1n',
    TEAMS_APP_PATH: '/teams-app/index.html',
    TEAMS_DOWNLOAD_PATH: '/teams-app/download.html',
    DASHBOARD_PATH: 'dashboard.html',
    LANDING_PATH: '/',
  };
})(typeof window !== 'undefined' ? window : globalThis);
