const fs = require('node:fs');

const minimum = { width: 330, height: 200 };
const layouts = ['card', 'compact', 'compact-top'];
const edges = ['solid', 'fade'];
const positions = ['keep', 'custom', ...['left', 'center', 'right'].flatMap(x => ['top', 'middle', 'bottom'].map(y => `${x}-${y}`))];
const defaults = { source: 'standalone', server: '', backgroundOpacity: 88, windowOpacity: 100, layout: 'card', textOnly: false, edge: 'solid', muted: false, language: 'en', bounds: null };
const inRange = (value, low, high) => Number.isInteger(value) && value >= low && value <= high;

function normalizeServer(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('Invalid server address');
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Use an HTTP or HTTPS base address');
  }
  url.pathname = url.pathname.replace(/\/+$/, '') + '/';
  return url.href;
}

function containBounds(bounds, area) {
  const width = Math.min(area.width, Math.max(minimum.width, bounds?.width ?? 500));
  const height = Math.min(area.height, Math.max(minimum.height, bounds?.height ?? 295));
  const x = Math.max(area.x, Math.min(bounds?.x ?? area.x + area.width - width - 24, area.x + area.width - width));
  const y = Math.max(area.y, Math.min(bounds?.y ?? area.y + 24, area.y + area.height - height));
  return { x, y, width, height };
}

function placeBounds(bounds, area, appearance) {
  const { width, height } = containBounds(appearance, area);
  const { position, offsetX, offsetY } = appearance;
  if (position === 'keep') return containBounds({ ...bounds, width, height }, area);
  if (position === 'custom') return containBounds({ x: area.x + offsetX, y: area.y + offsetY, width, height }, area);
  const [horizontal, vertical] = position.split('-');
  const gapX = area.width - width;
  const gapY = area.height - height;
  const insetX = Math.min(20, Math.floor(gapX / 2));
  const insetY = Math.min(20, Math.floor(gapY / 2));
  const x = { left: insetX, center: Math.round(gapX / 2), right: gapX - insetX }[horizontal];
  const y = { top: insetY, middle: Math.round(gapY / 2), bottom: gapY - insetY }[vertical];
  return { x: area.x + x, y: area.y + y, width, height };
}

function appearanceStyle(value) {
  return { layout: layouts.includes(value.layout) ? value.layout : 'card', textOnly: value.layout === 'text' || value.textOnly === true,
    edge: edges.includes(value.edge) ? value.edge : 'solid' };
}

function validAppearance(value) {
  return value && (layouts.includes(value.layout) || value.layout === 'text') && positions.includes(value.position) &&
    (value.textOnly === undefined || typeof value.textOnly === 'boolean') &&
    (value.edge === undefined || edges.includes(value.edge)) &&
    inRange(value.width, minimum.width, 8192) && inRange(value.height, minimum.height, 8192) &&
    inRange(value.offsetX, 0, 8192) && inRange(value.offsetY, 0, 8192) &&
    inRange(value.windowOpacity, 10, 100) && inRange(value.backgroundOpacity, 0, 100) &&
    Number.isSafeInteger(value.revision) && value.revision > 0;
}

function loadPreferences(file) {
  const settings = { ...defaults };
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (typeof saved.server === 'string' && saved.server) settings.server = normalizeServer(saved.server);
    if (saved.source === 'follow' && settings.server) settings.source = 'follow';
    const backgroundOpacity = saved.backgroundOpacity ?? saved.opacity;
    if (inRange(backgroundOpacity, 0, 100)) settings.backgroundOpacity = backgroundOpacity;
    if (inRange(saved.windowOpacity, 10, 100)) settings.windowOpacity = saved.windowOpacity;
    Object.assign(settings, appearanceStyle(saved));
    settings.muted = saved.muted === true;
    settings.language = saved.language === 'zh' ? 'zh' : 'en';
    if (saved.bounds && ['x', 'y', 'width', 'height'].every(key => Number.isSafeInteger(saved.bounds[key]))) {
      const { x, y, width, height } = saved.bounds;
      settings.bounds = { x, y, width, height };
    }
  } catch (error) {
    if (error.code !== 'ENOENT') console.warn('Could not load overlay preferences:', error.message);
  }
  return settings;
}

function savePreferences(file, settings) {
  const temp = file + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(settings, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

module.exports = { minimum, layouts, edges, inRange, normalizeServer, containBounds, placeBounds, appearanceStyle, validAppearance, loadPreferences, savePreferences };
