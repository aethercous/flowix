/** Inject CSS from WORLO_TEAMS_PATHS (load teams-paths.js first). */
(function () {
  var p = window.WORLO_TEAMS_PATHS;
  if (!p) return;
  ['tines', 'landing', 'sky', 'app'].forEach(function (k) {
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = p.css[k];
    document.head.appendChild(link);
  });
})();
