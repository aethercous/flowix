const fs = require('fs');
const path = require('path');

const dist = path.join(__dirname, '..', 'dist');
const downloads = path.join(__dirname, '..', '..', 'downloads');

if (!fs.existsSync(downloads)) fs.mkdirSync(downloads, { recursive: true });

function copyMatch(pattern, destName) {
  if (!fs.existsSync(dist)) return false;
  const files = fs.readdirSync(dist).filter((f) => pattern.test(f));
  if (!files[0]) return false;
  fs.copyFileSync(path.join(dist, files[0]), path.join(downloads, destName));
  console.log('Copied', destName);
  return true;
}

copyMatch(/^worlo-teams-setup.*\.exe$/i, 'worlo-teams-setup.exe');
copyMatch(/^worlo-teams-portable.*\.exe$/i, 'worlo-teams-portable.exe');
// Mac Electron zip stays in dist/ for GitHub Releases — site gets a small .app via build-teams-mac-app.sh
