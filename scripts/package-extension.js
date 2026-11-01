// Builds dist/study-arcade-extension.zip for the Chrome Web Store.
// The store assigns its own extension ID, so the local "key" is left out.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const stage = path.join(root, 'dist', 'extension');
const zip = path.join(root, 'dist', 'study-arcade-extension.zip');

fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
fs.cpSync(path.join(root, 'app'), stage, { recursive: true });

const manifestPath = path.join(stage, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
delete manifest.key;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

execFileSync('zip', ['-qr', zip, '.', '-x', '.DS_Store'], { cwd: stage });
console.log(`Created ${path.relative(root, zip)} (version ${manifest.version})`);
