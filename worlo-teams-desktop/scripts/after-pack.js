const fs = require('fs');
const path = require('path');

/** Strip Gatekeeper quarantine before Electron starts (unsigned zip downloads). */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const productName = context.packager.appInfo.productFilename;
  const macOsDir = path.join(context.appOutDir, 'Contents', 'MacOS');
  const realExe = path.join(macOsDir, productName);
  const binExe = path.join(macOsDir, `${productName}.bin`);

  if (!fs.existsSync(realExe)) return;
  fs.renameSync(realExe, binExe);

  const wrapper = `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
xattr -dr com.apple.quarantine "$DIR/.." 2>/dev/null || true
exec "$DIR/${productName}.bin" "$@"
`;
  fs.writeFileSync(realExe, wrapper, { mode: 0o755 });
};
