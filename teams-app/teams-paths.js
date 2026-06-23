/** Asset paths for hosted (/teams-app/) and portable file:// zips. */
(function (global) {
  var isFile = typeof location !== 'undefined' && location.protocol === 'file:';

  if (isFile) {
    global.WORLO_TEAMS_PATHS = {
      isFile: true,
      css: {
        tines: '../worlo-tines.css',
        landing: '../worlo-landing.css',
        sky: '../worlo-sky.css',
        app: 'styles.css',
      },
      js: {
        config: '../worlo-config.js',
        app: 'app.js',
      },
      nav: {
        home: '../index.html',
        dashboard: '../dashboard.html',
        teamsApp: 'index.html',
        download: 'download.html',
      },
    };
    return;
  }

  global.WORLO_TEAMS_PATHS = {
    isFile: false,
    css: {
      tines: '/worlo-tines.css',
      landing: '/worlo-landing.css',
      sky: '/worlo-sky.css',
      app: '/teams-app/styles.css',
    },
    js: {
      config: '/worlo-config.js',
      app: '/teams-app/app.js',
    },
    nav: {
      home: '/',
      dashboard: '/dashboard.html#teams',
      teamsApp: '/teams-app/index.html',
      download: '/teams-app/download.html',
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
