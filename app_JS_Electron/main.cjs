const { app, BrowserWindow, ipcMain, Menu, nativeImage, protocol, screen, session, Tray } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { containBounds, loadPreferences, minimum, normalizeServer, savePreferences,
  layouts, edges, inRange, placeBounds, appearanceStyle, validAppearance } = require('./preferences.cjs');

const appUrl = 'countdown://overlay/display.html';
const webRoot = app.isPackaged ? path.join(__dirname, 'web') : path.join(__dirname, '..', 'web');
const assets = new Map([
  ...['style.css', 'overlay.css', 'overlay-names.js', 'common.js', 'offline.js', 'projection.js', 'display.js'].map(name => [name, path.join(webRoot, name)]),
  ...['desktop.css', 'desktop.js'].map(name => [name, path.join(__dirname, name)]),
]);
const contentSecurity = "default-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const trayPng = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAsUlEQVR4nOWV0Q2AIAxEmcEZHMEJndBJXEHjr0Huem1BI0n/LO/1IFjKl9e6b8dV3YGohoHDRWqbTvPSrDARKxiJyHAruCUSCrckZJJQz5r9Pix6z+V0T68IwBTUzdQe1/SqQDOFfwt4NkJF3YPhAsoRsBJpd+AVAkpBgUwJ+Bz3EqjCs1OgfkaZKVDwrBTo6TMkzPCahCJy7zfBnyQYkVqPBEciTLnBqkg4GAl1A2asE0SKdwhpyrxoAAAAAElFTkSuQmCC';

let window;
let tray;
let settings;
let settingsFile;
let editing = false;
let mouseResponsive = false;
let connected = false;
let drag;
let saveTimer;
const requests = new Set();
let streamRequest;
let lastRemoteAppearance;
let reportClient;
let reportKey;
let reportTime;
let reporting = false;
let reportPending = false;

protocol.registerSchemesAsPrivileged([{ scheme: 'countdown', privileges: {
  standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true,
} }]);

function store() {
  if (window && !window.isDestroyed()) settings.bounds = window.getBounds();
  savePreferences(settingsFile, settings);
}

function storeBoundsSoon() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { store(); } catch (error) { console.error(error.message); }
    publishOverlay();
  }, 350);
}

async function publishOverlay() {
  if (!reportClient || !connected || !window || window.isDestroyed()) return;
  if (reporting) { reportPending = true; return; }
  const client = reportClient;
  const { x, y, width, height } = window.getBounds();
  const area = screen.getDisplayMatching({ x, y, width, height }).workArea;
  const { layout, edge, textOnly, windowOpacity, backgroundOpacity } = settings;
  const appearance = { layout, edge, textOnly, windowOpacity, backgroundOpacity, position: 'custom',
    width, height, offsetX: Math.max(0, x - area.x), offsetY: Math.max(0, y - area.y) };
  const body = JSON.stringify({ appearance, screen: { width: area.width, height: area.height } });
  const key = `${client}:${body}`;
  if (reportKey === key && Date.now() - reportTime < 12000) return;
  reporting = true;
  try {
    const response = await fetch(new URL('api/overlay/report', settings.server), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(3000), body,
      headers: { Authorization: `Bearer ${client}`, 'Content-Type': 'application/json' },
    });
    await response.text();
    if (response.ok) { reportKey = key; reportTime = Date.now(); }
  } catch { /* The next state sync or window change retries reporting. */ }
  finally {
    reporting = false;
    if (reportPending) { reportPending = false; publishOverlay(); }
  }
}

function windowState() {
  const bounds = window.getBounds();
  const activeDisplay = screen.getDisplayMatching(bounds).id;
  return {
    source: settings.source, server: settings.server, editing, mouseResponsive, bounds, activeDisplay,
    backgroundOpacity: settings.backgroundOpacity, windowOpacity: settings.windowOpacity, layout: settings.layout,
    textOnly: settings.textOnly, edge: settings.edge, muted: settings.muted,
    displays: screen.getAllDisplays().map(({ id, label, size }) => ({ id, label, ...size })),
  };
}

function sendState() {
  if (window && !window.isDestroyed()) window.webContents.send('overlay:change', windowState());
}

const label = (en, zh) => settings.language === 'zh' ? zh : en;

function sourceLabel() {
  if (settings.source === 'standalone') return label('Offline (standalone)', '离线（独立计时）');
  return connected ? label('Online (connected)', '在线（已连接）') : label('Online (disconnected)', '在线（未连接）');
}

function overlayMenu() {
  const presets = { card: label('Standard card', '标准卡片'), compact: label('Compact · side queue', '紧凑 · 队列在侧'),
    'compact-top': label('Compact · queue above', '紧凑 · 队列在上') };
  const edgeNames = { solid: label('Defined border', '清晰边框'), fade: label('Soft fade', '柔和渐隐') };
  return Menu.buildFromTemplate([
    { label: sourceLabel(), enabled: false },
    { id: 'topmost', label: label('Always on top', '始终置顶'), type: 'checkbox', checked: window.isAlwaysOnTop(),
      click: item => { window.setAlwaysOnTop(item.checked); updateTray(); } },
    { id: 'mouse', label: label('Respond to mouse', '响应鼠标'), type: 'checkbox', checked: editing || mouseResponsive,
      click: item => { if (editing) setEditing(false); else setMouseResponsive(item.checked); } },
    { label: label('Bring to front', '移到最前'), click: () => { window.setAlwaysOnTop(true); window.showInactive(); window.moveTop(); } },
    { type: 'separator' },
    { id: 'settings', label: editing ? label('Lock for presentation', '锁定用于放映') : label('Adjust overlay', '调整悬浮窗'), click: () => setEditing(!editing) },
    { label: label('Layout', '布局'), submenu: layouts.map(layout => ({
      label: presets[layout], type: 'radio', checked: settings.layout === layout,
      click: () => { settings.layout = layout; storeBoundsSoon(); sendState(); updateTray(); },
    })) },
    { id: 'text-only', label: label('Text only', '仅文字'), type: 'checkbox', checked: settings.textOnly,
      click: item => { settings.textOnly = item.checked; storeBoundsSoon(); sendState(); updateTray(); } },
    { label: label('Background edge', '背景边缘'), enabled: !settings.textOnly, submenu: edges.map(edge => ({
      label: edgeNames[edge], type: 'radio', checked: settings.edge === edge,
      click: () => { settings.edge = edge; storeBoundsSoon(); sendState(); updateTray(); },
    })) },
    { label: label('Switch light/dark theme', '切换浅色／深色主题'), click: () => window.webContents.send('overlay:theme') },
    { label: label('Mute this overlay', '将此悬浮窗静音'), type: 'checkbox', checked: settings.muted,
      click: item => { setMuted(item.checked); storeBoundsSoon(); sendState(); updateTray(); } },
    { type: 'separator' },
    { label: label('Quit', '退出'), click: () => app.quit() },
  ]);
}

function updateTray() {
  if (!tray) return;
  tray.setToolTip(`${label('Countdown Overlay', '倒计时悬浮窗')} · ${sourceLabel()}`);
  tray.setContextMenu(overlayMenu());
}

function setMuted(muted) {
  settings.muted = muted;
  window.webContents.setAudioMuted(muted);
}

function setMouseResponsive(value) {
  mouseResponsive = value;
  drag = null;
  window.setIgnoreMouseEvents(!value);
  updateTray();
  sendState();
}

function setEditing(value) {
  editing = value;
  mouseResponsive = false;
  drag = null;
  if (editing) {
    window.setIgnoreMouseEvents(false);
    window.setFocusable(true);
    window.show();
    window.focus();
  } else {
    window.setIgnoreMouseEvents(true);
    window.setFocusable(false);
    window.blur();
    window.showInactive();
  }
  if (window.isAlwaysOnTop()) window.moveTop();
  updateTray();
  sendState();
}

function restoreVisibleBounds() {
  const bounds = window.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const visible = containBounds(bounds, display.workArea);
  if (Object.keys(bounds).some(key => bounds[key] !== visible[key])) window.setBounds(visible);
  sendState();
}

async function forward(request, route) {
  if (settings.source !== 'follow') return new Response(null, { status: 503 });
  const type = route === '/api/events' ? 'text/event-stream' : 'application/json';
  const isStream = route === '/api/events';
  const controller = new AbortController();
  requests.add(controller);
  if (isStream) {
    streamRequest?.abort();
    streamRequest = controller;
  }
  const signal = AbortSignal.any([controller.signal, request.signal]);
  const deadline = setTimeout(() => controller.abort(), 5500);
  const cleanup = () => {
    clearTimeout(deadline);
    requests.delete(controller);
    if (streamRequest === controller) streamRequest = null;
  };
  try {
    const target = new URL(isStream ? 'api/events?view=projection' : 'api/state', settings.server);
    const headersIn = isStream ? { Accept: type, 'X-Countdown-Overlay': '1' } : { Accept: type };
    const upstream = await fetch(target, { signal, redirect: 'error', headers: headersIn });
    if (!upstream.ok || !upstream.headers.get('content-type')?.startsWith(type) || !upstream.body) {
      controller.abort();
      cleanup();
      return new Response(null, { status: 502 });
    }
    const headers = { 'Content-Type': type + '; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    if (!isStream) {
      const state = await upstream.text();
      cleanup();
      return new Response(state, { headers });
    }
    clearTimeout(deadline);
    const reader = upstream.body.getReader();
    const body = new ReadableStream({
      async pull(sink) {
        try {
          const { done, value } = await reader.read();
          if (done) { cleanup(); sink.close(); }
          else sink.enqueue(value);
        } catch (error) { cleanup(); sink.error(error); }
      },
      cancel() { controller.abort(); cleanup(); },
    });
    return new Response(body, { headers });
  } catch {
    cleanup();
    return new Response(null, { status: 502 });
  }
}

function registerContent() {
  const projection = fs.readFileSync(path.join(webRoot, 'display.html'), 'utf8');
  const panel = fs.readFileSync(path.join(__dirname, 'settings.html'), 'utf8');
  protocol.handle('countdown', async request => {
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.hostname !== 'overlay' || url.port) return new Response(null, { status: 404 });
    const route = url.pathname;
    if (route === '/api/state' || route === '/api/events') return forward(request, route);
    if (route === '/display.html') {
      const html = projection.replace('<html lang="en">', '<html lang="en" class="desktop-shell">')
        .replace('<script defer src="./display.js">', '<script defer src="./overlay-names.js"></script><script defer src="./display.js">')
        .replace('</head>', '<link rel="stylesheet" href="./overlay.css"><link rel="stylesheet" href="./desktop.css"><script defer src="./desktop.js"></script></head>')
        .replace('<body class="projection display-page">', `<body class="projection display-page desktop-overlay" data-desktop-mode="${settings.source}">${panel}`);
      return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': contentSecurity, 'Cache-Control': 'no-store' } });
    }
    const file = assets.get(route.slice(1));
    if (!file) return new Response(null, { status: 404 });
    const mime = route.endsWith('.css') ? 'text/css' : 'text/javascript';
    return new Response(await fs.promises.readFile(file), { headers: { 'Content-Type': mime + '; charset=utf-8', 'X-Content-Type-Options': 'nosniff' } });
  });
}

function guarded(channel, callback) {
  ipcMain.handle(channel, (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame?.url !== appUrl) throw new Error('Untrusted overlay window');
    return callback(...args);
  });
}

function registerControls() {
  guarded('overlay:get', windowState);
  guarded('overlay:lock', () => { setEditing(false); store(); return windowState(); });
  guarded('overlay:source', (source, value) => {
    if (!editing || !['standalone', 'follow'].includes(source)) throw new Error('Invalid source');
    const server = value.trim() ? normalizeServer(value) : '';
    if (source === 'follow' && !server) throw new Error('A server address is required');
    if (source === settings.source && server === settings.server) return false;
    const previous = settings;
    settings = { ...settings, source, server };
    try { store(); } catch (error) { settings = previous; throw error; }
    lastRemoteAppearance = null;
    reportClient = null;
    connected = false;
    updateTray();
    for (const controller of requests) controller.abort();
    return true;
  });
  guarded('overlay:window', patch => {
    if (patch.language === 'en' || patch.language === 'zh') {
      if (settings.language !== patch.language) {
        settings.language = patch.language;
        updateTray();
        storeBoundsSoon();
      }
    }
    if (!editing) return windowState();
    if (inRange(patch.backgroundOpacity, 0, 100)) settings.backgroundOpacity = patch.backgroundOpacity;
    if (inRange(patch.windowOpacity, 10, 100)) settings.windowOpacity = patch.windowOpacity;
    if (layouts.includes(patch.layout) && settings.layout !== patch.layout) { settings.layout = patch.layout; updateTray(); }
    if (edges.includes(patch.edge) && settings.edge !== patch.edge) { settings.edge = patch.edge; updateTray(); }
    if (typeof patch.textOnly === 'boolean' && settings.textOnly !== patch.textOnly) { settings.textOnly = patch.textOnly; updateTray(); }
    if (typeof patch.muted === 'boolean') { setMuted(patch.muted); updateTray(); }
    if (Number.isSafeInteger(patch.width) && Number.isSafeInteger(patch.height)) {
      const bounds = window.getBounds();
      window.setBounds(containBounds({ ...bounds, width: patch.width, height: patch.height }, screen.getDisplayMatching(bounds).workArea));
    }
    if (Number.isInteger(patch.display)) {
      const target = screen.getAllDisplays().find(item => item.id === patch.display);
      if (target) {
        const { width, height } = window.getBounds();
        window.setBounds(containBounds({ width, height }, target.workArea));
      }
    }
    storeBoundsSoon();
    return windowState();
  });
  guarded('overlay:follow-state', (server, instance, isConnected, client, appearance) => {
    if (settings.source !== 'follow' || server !== settings.server) return;
    if (typeof isConnected === 'boolean' && connected !== isConnected) {
      connected = isConnected;
      updateTray();
    }
    reportClient = connected && typeof client === 'string' && /^[A-Za-z0-9_-]{32}$/.test(client) ? client : null;
    if (!connected || typeof instance !== 'string' || !validAppearance(appearance)) { publishOverlay(); return; }
    const signature = `${instance}:${appearance.revision}`;
    if (signature === lastRemoteAppearance) { publishOverlay(); return; }
    lastRemoteAppearance = signature;
    const bounds = window.getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    const { windowOpacity, backgroundOpacity } = appearance;
    Object.assign(settings, appearanceStyle(appearance), { windowOpacity, backgroundOpacity });
    window.setBounds(placeBounds(bounds, area, appearance));
    storeBoundsSoon();
    updateTray();
    sendState();
    publishOverlay();
  });
  guarded('overlay:drag', (phase, x, y) => {
    if (!mouseResponsive || editing) return;
    if (phase === 'end') {
      if (drag?.moved) restoreVisibleBounds();
      drag = null;
      return;
    }
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || Math.abs(x) > 65536 || Math.abs(y) > 65536) return;
    if (phase === 'start') drag = { x, y, origin: window.getBounds(), moved: false };
    if (phase === 'move' && drag && (drag.moved || Math.hypot(x - drag.x, y - drag.y) >= 3)) {
      drag.moved = true;
      window.setPosition(drag.origin.x + x - drag.x, drag.origin.y + y - drag.y);
    }
  });
}

function launch() {
  settingsFile = path.join(app.getPath('userData'), 'overlay.json');
  fs.mkdirSync(path.dirname(settingsFile), { recursive: true });
  settings = loadPreferences(settingsFile);
  registerContent();
  registerControls();
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, respond) => respond(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  Menu.setApplicationMenu(null);
  const display = settings.bounds ? screen.getDisplayMatching(settings.bounds) : screen.getPrimaryDisplay();
  window = new BrowserWindow({
    ...containBounds(settings.bounds, display.workArea), minWidth: minimum.width, minHeight: minimum.height,
    show: false, frame: false, transparent: true, hasShadow: false, roundedCorners: false,
    resizable: true, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
    alwaysOnTop: true, focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false,
      devTools: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required',
    },
  });
  window.setIgnoreMouseEvents(true);
  window.webContents.setAudioMuted(settings.muted);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => { if (url !== appUrl) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  window.webContents.on('context-menu', () => {
    if (mouseResponsive && !editing) overlayMenu().popup({ window });
  });
  window.on('move', storeBoundsSoon);
  window.on('resize', storeBoundsSoon);
  window.on('always-on-top-changed', updateTray);
  window.once('ready-to-show', () => { if (!editing) window.showInactive(); });
  screen.on('display-removed', restoreVisibleBounds);
  screen.on('display-added', restoreVisibleBounds);
  screen.on('display-metrics-changed', restoreVisibleBounds);
  tray = new Tray(nativeImage.createFromDataURL('data:image/png;base64,' + trayPng));
  tray.on('click', () => setEditing(!editing));
  updateTray();
  return window.loadURL(appUrl);
}

app.setName('Countdown Overlay');
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (window) setEditing(true); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => {
    clearTimeout(saveTimer);
    if (settings && window && !window.isDestroyed()) {
      try { store(); } catch (error) { console.error(error.message); }
    }
    for (const controller of requests) controller.abort();
  });
  app.whenReady().then(launch).catch(error => { console.error(error); app.quit(); });
}
