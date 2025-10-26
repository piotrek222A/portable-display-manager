const fs = require('fs');
const path = require('path');

function parseEnvFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const out = {};
    for (const l of lines) {
      const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m) {
        let val = m[2];
        // usuń cudzysłowy jeśli są
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        out[m[1]] = val;
      }
    }
    return out;
  } catch (e) {
    return null;
  }
}

(function main(){
  const projectRoot = path.resolve(__dirname, '..');
  const candidates = [
    path.join(projectRoot, 'dist', '.env'),
    path.join(projectRoot, '.env')
  ];
  let env = null;
  let used = null;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      env = parseEnvFile(c);
      used = c;
      break;
    }
  }

  const cfg = {};
  if (env && env.ELECTRON_URL) cfg.ELECTRON_URL = env.ELECTRON_URL;

  // utwórz folder electron jeśli nie istnieje
  const outDir = path.join(projectRoot, 'electron');
  try { if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true }); } catch (e) {}

  const outFile = path.join(outDir, 'build-config.json');
  try {
    fs.writeFileSync(outFile, JSON.stringify(cfg, null, 2), 'utf8');
    console.log('generate-config: wrote', outFile, 'from', used || 'none');
  } catch (e) {
    console.error('generate-config: failed to write', outFile, e && e.message);
    process.exitCode = 2;
  }
})();
