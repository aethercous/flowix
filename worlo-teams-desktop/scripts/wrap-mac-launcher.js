const fs = require('fs');
const path = require('path');

function findApps(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === 'worlo Teams.app' && fs.statSync(p).isDirectory()) out.push(p);
    else if (fs.statSync(p).isDirectory()) findApps(p, out);
  }
  return out;
}

const dist = path.join(__dirname, '..', 'dist');
const productName = 'worlo Teams';

for (const appOutDir of findApps(dist)) {
  const macOsDir = path.join(appOutDir, 'Contents', 'MacOS');
  const realExe = path.join(macOsDir, productName);
  const binExe = path.join(macOsDir, `${productName}.bin`);

  if (!fs.existsSync(realExe) || fs.existsSync(binExe)) continue;

  const head = Buffer.alloc(4);
  const fd = fs.openSync(realExe, 'r');
  fs.readSync(fd, head, 0, 4, 0);
  fs.closeSync(fd);
  if (head[0] === 0x23 && head[1] === 0x21) continue;

  fs.renameSync(realExe, binExe);
  const wrapper = `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
xattr -dr com.apple.quarantine "$DIR/.." 2>/dev/null || true
exec "$DIR/${productName}.bin" "$@"
`;
  fs.writeFileSync(realExe, wrapper, { mode: 0o755 });
  console.log('Wrapped launcher:', realExe);
}
