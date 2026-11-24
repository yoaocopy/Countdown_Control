const assert = require('node:assert/strict');
const { test } = require('node:test');
const { appearanceStyle, containBounds, normalizeServer, placeBounds } = require('../preferences.cjs');

test('text-only mode combines with compact and preserves the old text preset', () => {
  assert.deepEqual(appearanceStyle({ layout: 'compact', textOnly: true }), { layout: 'compact', textOnly: true, edge: 'solid' });
  assert.deepEqual(appearanceStyle({ layout: 'text' }), { layout: 'card', textOnly: true, edge: 'solid' });
  assert.deepEqual(appearanceStyle({ layout: 'compact-top', edge: 'fade' }), { layout: 'compact-top', textOnly: false, edge: 'fade' });
});

test('only accepts HTTP(S) base URLs and preserves reverse proxy subdirectories', () => {
  assert.equal(normalizeServer(' https://example.edu/timer '), 'https://example.edu/timer/');
  assert.equal(normalizeServer('http://192.168.1.40:8000'), 'http://192.168.1.40:8000/');
  for (const bad of ['file:///C:/timer', 'javascript:alert(1)', 'https://u:p@example.edu', 'https://example.edu/?mode=1', 'https://example.edu/#link', '']) {
    assert.throws(() => normalizeServer(bad));
  }
});

test('window position and dimensions stay within the chosen work area', () => {
  const area = { x: -1280, y: 0, width: 1280, height: 720 };
  assert.deepEqual(containBounds(null, area), { x: -524, y: 24, width: 500, height: 295 });
  assert.deepEqual(containBounds({ x: 1900, y: -180, width: 100, height: 2000 }, area),
    { x: -330, y: 0, width: 330, height: 720 });
});

test('remote positions align to the local display work area after resizing', () => {
  const area = { x: -1280, y: 40, width: 1280, height: 720 };
  const bounds = { x: -1250, y: 60, width: 500, height: 295 };
  const size = { width: 440, height: 220 };
  assert.deepEqual(placeBounds(bounds, area, { ...size, position: 'right-top' }), { ...size, x: -460, y: 60 });
  assert.deepEqual(placeBounds(bounds, area, { ...size, position: 'right-middle' }), { ...size, x: -460, y: 290 });
  assert.deepEqual(placeBounds(bounds, area, { ...size, position: 'right-bottom' }), { ...size, x: -460, y: 520 });
  assert.deepEqual(placeBounds(bounds, area, { ...size, position: 'keep' }), { ...size, x: -1250, y: 60 });
  assert.deepEqual(placeBounds(bounds, area, { ...size, position: 'custom', offsetX: 18, offsetY: 900 }), { ...size, x: -1262, y: 540 });
});
