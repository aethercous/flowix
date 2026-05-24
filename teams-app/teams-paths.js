/** Asset paths for hosted (/teams-app/) and portable file:// zips. */
(function (global) {
  var isFile = typeof location !== 'undefined' && location.protocol === 'file:';
  var root = isFile ? '..' : '';
  var teams = isFile ? '.' : '/teams-app';

  global.FLOWIX_TEAMS_PATHS = {
    isFile: isFile,
    css: {
      tines: root + (isFile ? '/flowix-tines.css' : '/flowix-tines.css'),
      landing: root + (isFile ? '/flowix-landing.css' : '/flowix-landing.css'),
      app: teams + '/styles.css',
    },
    js: {
      config: root + (isFile ? '/flowix-config.js' : '/flowix-config.js'),
      app: teams + '/app.js',
    },
    nav: {
      home: root + (isFile ? '/neura_ui.html' : '/neura_ui.html'),
      dashboard: root + (isFile ? '/dashboard.html' : '/dashboard.html'),
      teamsApp: teams + '/index.html',
      download: teams + '/download.html',
    },
  };

  if (isFile) {
    FLOWIX_TEAMS_PATHS.css.tines = '../flowix-tines.css';
    FLOWIX_TEAMS_PATHS.css.landing = '../flowix-landing.css';
    FLOWIX_TEAMS_PATHS.css.app = 'styles.css';
    FLOWIX_TEAMS_PATHS.js.config = '../flowix-config.js';
    FLOWIX_TEAMS_PATHS.js.app = 'app.js';
    FLOWIX_TEAMS_PATHS.nav.home = '../neura_ui.html';
    FLOWIX_TEAMS_PATHS.nav.dashboard = '../dashboard.html';
    FLOWIX_TEAMS_PATHS.nav.teamsApp = 'index.html';
    FLOWIX_TEAMS_PATHS.nav.download = 'download.html';
  }
})(typeof window !== 'undefined' ? window : globalThis);
