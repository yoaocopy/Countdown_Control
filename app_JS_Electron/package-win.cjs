const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { version } = require('./package.json');

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Build the Windows x64 ZIP with x64 Node.js on Windows.');
}

const electron = require('electron');
const dist = path.join(__dirname, 'dist');
fs.mkdirSync(dist, { recursive: true });
const stage = fs.mkdtempSync(path.join(dist, 'build-'));
const portable = path.join(stage, 'CountdownOverlay');
const finalZip = path.join(dist, `CountdownOverlay-${version}-win-x64.zip`);
const stagedZip = path.join(stage, 'release.zip');

try {
  fs.cpSync(path.dirname(electron), portable, { recursive: true });
  fs.renameSync(path.join(portable, path.basename(electron)), path.join(portable, 'CountdownOverlay.exe'));
  const target = path.join(portable, 'resources', 'app');
  fs.mkdirSync(path.join(target, 'web'), { recursive: true });
  fs.rmSync(path.join(portable, 'resources', 'default_app.asar'), { force: true });
  const entry = { name: 'countdown-overlay', productName: 'Countdown Overlay', version, main: 'main.cjs' };
  fs.writeFileSync(path.join(target, 'package.json'), JSON.stringify(entry));
  for (const name of ['main.cjs', 'preferences.cjs', 'preload.cjs', 'desktop.js', 'desktop.css', 'settings.html']) {
    fs.copyFileSync(path.join(__dirname, name), path.join(target, name));
  }
  for (const name of ['display.html', 'display.js', 'common.js', 'projection.js', 'offline.js', 'style.css', 'overlay.css', 'overlay-names.js']) {
    fs.copyFileSync(path.join(__dirname, '..', 'web', name), path.join(target, 'web', name));
  }
  fs.copyFileSync(path.join(__dirname, 'README.md'), path.join(portable, 'README.md'));

  const tar = spawnSync('tar.exe', ['-a', '-cf', stagedZip, '-C', stage, 'CountdownOverlay'], { stdio: 'inherit', windowsHide: true });
  if (tar.error || tar.status !== 0) throw tar.error || new Error(`tar.exe failed (${tar.status})`);
  fs.renameSync(stagedZip, finalZip);
  console.log(finalZip);
} finally {
  if (path.dirname(fs.realpathSync(stage)) === fs.realpathSync(dist)) fs.rmSync(stage, { recursive: true, force: true });
}
