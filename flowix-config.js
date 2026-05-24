/**
 * Shared Flowix / Supabase client config (browser).
 */
(function (global) {
  global.FLOWIX_CONFIG = {
    SUPABASE_URL: 'https://utofnywijqsozjqmkhcn.supabase.co',
    SUPABASE_KEY: 'sb_publishable_NFpInIt2anAJxn2slHZIuQ_BsEw4g1n',
    TEAMS_APP_PATH: '/teams-app/index.html',
    TEAMS_DOWNLOAD_PATH: '/teams-app/download.html',
    DASHBOARD_PATH: 'dashboard.html',
    LANDING_PATH: 'neura_ui.html',
  };
})(typeof window !== 'undefined' ? window : globalThis);
