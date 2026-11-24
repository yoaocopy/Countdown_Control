(() => {
  const { $ } = CountdownUI;
  const api = window.countdownDesktop;
  const settings = $('desktop-settings');
  const mode = $('desktop-mode');
  const server = $('desktop-server');
  const opacity = $('desktop-opacity');
  const overallOpacity = $('desktop-window-opacity');
  const layout = $('desktop-layout');
  const edge = $('desktop-edge');
  const textOnly = $('desktop-text-only');
  const monitor = $('desktop-monitor');
  const error = $('desktop-error');
  const width = $('desktop-width');
  const height = $('desktop-height');
  const labels = {
    adjust: ['Adjust overlay', '调整悬浮窗'], lock: ['Lock', '锁定'], source: ['Timer source', '计时来源'],
    address: ['Server base address', '服务器基地址'], applySource: ['Apply source', '应用来源'], screen: ['Screen', '屏幕'],
    width: ['Width', '宽度'], height: ['Height', '高度'], resize: ['Resize', '调整尺寸'],
    mute: ['Mute this overlay', '将此悬浮窗静音'],
    invalidAddress: ['Enter an HTTP or HTTPS server base address (including its folder, if any).', '请输入 HTTP 或 HTTPS 服务器基地址，包含部署子目录。'],
    settingsError: ['Could not apply the setting.', '无法应用设置。'],
  };
  const language = () => document.documentElement.lang.startsWith('zh') ? 'zh' : 'en';
  const text = key => labels[key][language() === 'zh' ? 1 : 0];
  let active;
  let problem;
  let remote;
  let pointer;

  $('desktop-quick').append(...['display-theme', 'language', 'standalone-stages', 'enable-sound', 'clear-temporary'].map($));
  $('desktop-local').append($('display-notice'), $('standalone-controls'));
  const view = document.createElement('div');
  view.className = 'desktop-view';
  const projection = document.querySelector('.projection-layout');
  const current = projection.querySelector('.stage-current');
  const queue = document.createElement('div');
  queue.className = 'overlay-queue';
  current.before(queue);
  queue.append(current, projection.querySelector('.upcoming'));
  const mouseHint = document.createElement('span');
  mouseHint.className = 'desktop-mouse-hint';
  mouseHint.hidden = true;
  view.append(mouseHint, $('connection'), projection);
  document.body.prepend(view);

  function showError(key) {
    problem = key;
    error.textContent = key ? text(key) : '';
    error.hidden = !key;
  }

  function applyLanguage() {
    settings.setAttribute('aria-label', text('adjust'));
    settings.querySelectorAll('[data-desktop-label]').forEach(node => { node.textContent = text(node.dataset.desktopLabel); });
    mouseHint.textContent = language() === 'zh' ? '左键拖动 · 右键菜单' : 'Drag · Right-click menu';
    showError(problem);
  }

  function paintOpacity(value) {
    document.body.style.setProperty('--desktop-opacity', value / 100);
    document.body.toggleAttribute('data-no-backdrop', textOnly.checked || value === 0);
    $('desktop-opacity-value').value = value + '%';
  }

  function paintOverallOpacity(value) {
    document.body.style.setProperty('--desktop-window-opacity', value / 100);
    $('desktop-window-opacity-value').value = value + '%';
  }

  function reportFollow() {
    if (!remote || active?.source !== 'follow') return;
    const { instance, connected, client, overlay } = remote;
    remote = null;
    api.reportFollow(active.server, instance, connected, client, overlay).catch(() => showError('settingsError'));
  }

  function paint(state) {
    const restored = !active || (state.editing && !active.editing);
    active = state;
    settings.hidden = !state.editing;
    document.body.toggleAttribute('data-editing', state.editing);
    mouseHint.hidden = !state.mouseResponsive;
    document.body.toggleAttribute('data-mouse-responsive', state.mouseResponsive);
    if (!state.mouseResponsive && pointer !== undefined) stopDrag();
    if (restored) {
      mode.value = state.source;
      server.value = state.server;
    }
    layout.value = state.layout;
    edge.value = state.edge;
    textOnly.checked = state.textOnly;
    document.body.dataset.layout = state.layout;
    document.body.dataset.edge = state.edge;
    $('desktop-background-setting').hidden = state.textOnly;
    $('desktop-edge-setting').hidden = state.textOnly;
    opacity.value = state.backgroundOpacity;
    paintOpacity(state.backgroundOpacity);
    overallOpacity.value = state.windowOpacity;
    paintOverallOpacity(state.windowOpacity);
    $('desktop-muted').checked = state.muted;
    if (document.activeElement !== width) width.value = state.bounds.width;
    if (document.activeElement !== height) height.value = state.bounds.height;
    monitor.replaceChildren(...state.displays.map(item => new Option(`${item.label || item.id} · ${item.width} × ${item.height}`, item.id)));
    monitor.value = state.activeDisplay;
    reportFollow();
  }

  function dragWindow(phase, event) {
    api.drag(phase, Math.round(event.screenX), Math.round(event.screenY)).catch(() => {});
  }

  function stopDrag() {
    const released = pointer;
    pointer = undefined;
    delete view.dataset.dragging;
    if (view.hasPointerCapture(released)) view.releasePointerCapture(released);
    api.drag('end').catch(() => {});
  }

  view.addEventListener('pointerdown', event => {
    if (!active?.mouseResponsive || event.button !== 0 || pointer !== undefined) return;
    view.setPointerCapture(event.pointerId);
    pointer = event.pointerId;
    view.dataset.dragging = '';
    dragWindow('start', event);
    event.preventDefault();
  });
  view.addEventListener('pointermove', event => {
    if (event.pointerId === pointer) dragWindow('move', event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    view.addEventListener(type, event => { if (event.pointerId === pointer) stopDrag(); });
  }

  async function change(patch) {
    try { paint(await api.setWindow(patch)); showError(); }
    catch { showError('settingsError'); }
  }

  $('desktop-source').addEventListener('submit', async event => {
    event.preventDefault();
    const value = server.value.trim();
    if (value || mode.value === 'follow') {
      const url = URL.parse(value);
      if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
        showError('invalidAddress');
        return;
      }
    }
    try {
      if (await api.setSource(mode.value, value)) location.reload();
      else showError();
    } catch { showError('settingsError'); }
  });
  $('desktop-size').addEventListener('submit', event => {
    event.preventDefault();
    change({ width: width.valueAsNumber, height: height.valueAsNumber });
  });
  monitor.addEventListener('change', () => change({ display: Number(monitor.value) }));
  layout.addEventListener('change', () => change({ layout: layout.value }));
  edge.addEventListener('change', () => change({ edge: edge.value }));
  textOnly.addEventListener('change', () => change({ textOnly: textOnly.checked }));
  opacity.addEventListener('input', () => paintOpacity(opacity.valueAsNumber));
  opacity.addEventListener('change', () => change({ backgroundOpacity: opacity.valueAsNumber }));
  overallOpacity.addEventListener('input', () => paintOverallOpacity(overallOpacity.valueAsNumber));
  overallOpacity.addEventListener('change', () => change({ windowOpacity: overallOpacity.valueAsNumber }));
  $('desktop-muted').addEventListener('change', event => change({ muted: event.target.checked }));
  $('desktop-lock').addEventListener('click', async () => {
    try { paint(await api.lock()); } catch { showError('settingsError'); }
  });
  new MutationObserver(() => {
    applyLanguage();
    api.setWindow({ language: language() }).catch(() => {});
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  applyLanguage();
  window.addEventListener('countdown-overlay-state', event => { remote = event.detail; reportFollow(); });
  api.onTheme(() => $('display-theme').click());
  api.onChange(paint);
  api.get().then(paint).catch(() => showError('settingsError'));
})();
