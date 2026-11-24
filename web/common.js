const CountdownUI = (() => {
const strings = {
  title: ["Countdown Timer", "倒计时"],
  description: ["A countdown timer you can configure and control remotely.", "一个可远程设置和控制的倒计时。"],
  guide: ["Guide", "使用说明"], guideTitle: ["Countdown guide", "倒计时使用说明"],
  wallClock: ["Clock", "时钟"], clockLocal: ["Device time", "本机时间"],
  clockNetwork: ["Network time", "网络时间"], clockBoth: ["Both", "同时显示"],
  clockSource: ["Time source", "时间来源"], clockLocalZone: ["Computer time zone", "电脑当前时区"],
  clockPrimaryZone: ["Main time zone", "主时区"], clockSize: ["Main clock size", "主钟字号"],
  clockCities: ["Other cities", "其他城市"], clockServer: ["Time server address", "时间服务器地址"],
  clockSync: ["Sync now", "立即同步"], clockSyncing: ["Syncing time…", "正在同步时间…"],
  clockSynced: ["Synced with countdown server", "已与倒计时服务器同步"],
  clockStale: ["Server unreachable · using the last sync", "服务器不可达 · 暂用上次同步结果"],
  clockUnavailable: ["Network time unavailable", "网络时间暂不可用"],
  clockEnterServer: ["Enter a countdown server address to sync network time.", "输入倒计时服务器地址后可同步网络时间。"],
  clockInvalidServer: ["Enter a valid HTTP or HTTPS console address.", "请输入有效的 HTTP 或 HTTPS 控制台地址。"],
  enableTwoStage: ["Use two stages", "切换到双阶段"], enableSingleStage: ["Use one stage", "切换到单阶段"],
  autoAdvance: ["Automatically start Q&A", "自动开始 Q&A"], startQuestions: ["Start Q&A", "开始 Q&A"],
  nextStage: ["Next stage", "下一阶段"],
  waitingQuestions: ["Ready for Q&A", "等待开始 Q&A"], saveTimes: ["Set times", "设置时长"],
  twoStageGroups: ["Two stages per group", "每组两阶段"],
  defaultDuration: ["Default duration", "默认时长"],
  languageSwitch: ["Switch to Chinese", "切换到英语"],
  clearTemporary: ["Clear temporary state", "清除临时状态"],
  confirmClearTemporary: ["Clear temporary state for this site? Local timer progress, drafts, and browser pairing will reset. Saved queues and settings will stay.",
    "清除本站的临时状态？本机计时进度、草稿和浏览器配对会重置。已保存的队列和设置会保留。"],
  temporaryCleared: ["Temporary state cleared.", "临时状态已清除。"],
  openConsole: ["Open console", "打开控制台"],
  openDisplay: ["Open projection", "打开投影页"],
  public: ["Public server", "公共服务器"], lan: ["LAN mode", "局域网模式"],
  local: ["Offline", "离线模式"], localSession: ["Local session", "本机计时"],
  localHelp: ["Runs in this browser. Keep this console open while projecting.", "计时在本机浏览器运行。投影时请保持此控制台打开。"],
  localProjectionHelp: ["Open this projection from the offline console.", "请从离线控制台打开此投影页。"],
  standalone: ["Standalone timer", "独立计时"], followProjection: ["Follow console", "跟随控制台"],
  lightTheme: ["Light theme", "浅色主题"], darkTheme: ["Dark theme", "深色主题"],
  timerMinutes: ["Minutes", "分钟"], timerSeconds: ["Seconds", "秒"], setTime: ["Set time", "设置时长"],
  invalidTime: ["Enter a duration from 00:01 to 99:59.", "请输入 00:01 到 99:59 之间的时长。"],
  goOffline: ["Switch to Offline", "切换到离线模式"], goOnline: ["Switch to Online", "切换到在线模式"],
  serverAddress: ["Server address", "服务器地址"], connectServer: ["Open online console", "打开在线控制台"],
  popupBlocked: ["Allow pop-ups for this page to open the projection.", "请允许此页面打开弹出窗口，再试一次。"],
  offlineStorage: ["Browser storage is unavailable. Export your queue before closing.", "浏览器存储不可用，请在关闭前导出队列。"],
  online: ["Connected", "已连接"], offline: ["Disconnected · reconnecting", "连接中断 · 正在重连"],
  pairing: ["Controller pairing", "控制台配对"], code: ["Pairing code", "配对码"],
  pair: ["Pair", "配对"], paired: ["Paired on this tab", "当前标签页已配对"],
  unpaired: ["Enter the code from the server window or logs.", "请输入服务窗口或日志中的配对码。"],
  current: ["Current", "当前"], next: ["Next group", "下一组"],
  nextUp: ["Next up", "下一组"], onDeck: ["After next", "下下组"],
  start: ["Start", "开始"], pause: ["Pause", "暂停"], resume: ["Resume", "继续"],
  reset: ["Reset", "重置"], ready: ["Ready", "待开始"], running: ["Running", "计时中"],
  paused: ["Paused", "已暂停"], finished: ["Time’s up", "时间到"],
  queue: ["Group queue", "小组队列"], empty: ["Groups are optional.", "可按需添加小组。"],
  copyQueue: ["Copy queue", "复制当前队列"], queueCopied: ["Queue copied.", "已复制当前队列。"],
  copyQueueManually: ["Copy the selected group names.", "请手动复制已选中的组名。"], close: ["Close", "关闭"],
  useGroup: ["Set as current", "设为当前"], editQueue: ["Batch edit", "批量编辑"],
  candidate: ["Selected", "已选中"],
  batchHelp: ["Drag to reorder. Check groups to delete them on apply.", "拖动调整顺序，勾选待删除的小组。应用后统一生效。"],
  applyQueue: ["Apply changes", "应用更改"], cancel: ["Cancel", "取消"],
  markRemove: ["Mark for deletion", "标记待删除"],
  pendingRemoval: ["Marked for deletion", "待删除"],
  batchConflict: ["Queue changed in another session. Cancel and reopen batch edit.", "队列已在另一个会话中变更。请取消并重新打开批量编辑。"],
  batchApplied: ["Queue changes applied.", "队列更改已生效。"],
  confirmBatch: ["Apply these changes? Removing the current group will reset its countdown.", "应用这些更改？删除当前组会重置正在进行的计时。"],
  names: ["Paste group names, one per line", "粘贴组名，每行一组"], add: ["Add groups", "添加小组"],
  rename: ["Rename", "改名"], remove: ["Delete", "删除"], moveUp: ["Move up", "上移"],
  moveDown: ["Move down", "下移"], drag: ["Drag to reorder", "拖动排序"],
  settings: ["Timer settings", "计时设置"], warning: ["Warning (seconds)", "预警阈值（秒）"],
  effect: ["Warning effect", "预警动效"], sound: ["Finish sound", "到时铃声"],
  off: ["Off", "关闭"], color: ["Color", "变色"], pulse: ["Pulse", "脉冲"],
  chime: ["Chime", "清脆铃音"], bell: ["Bell", "钟声"], mute: ["Mute", "静音"],
  beep: ["Rising beeps", "渐强滴滴声"], double: ["Double beep", "双滴声"], tone: ["Tone", "提示长音"],
  volume: ["Volume", "音量"], testSound: ["Test sound", "试听"],
  save: ["Save settings", "保存设置"], saved: ["Settings saved.", "设置已保存。"],
  export: ["Export queue and settings", "导出队列和设置"], import: ["Import backup", "导入备份"],
  replaceAll: ["Replace this server’s queue and settings with this backup? The timer will reset.", "用此备份覆盖当前服务的队列和设置？计时将重置。"],
  imported: ["Backup imported.", "备份已导入。"],
  projectionAudio: ["Projection audio", "投影声音"],
  audioHelp: ["The projection plays the finish sound. Select Mute or set volume to 0 for a silent countdown.", "投影页默认播放到时铃声。需要安静计时时，可选择静音或将音量设为 0。"],
  preview: ["Preview on projection", "在投影端试听"], previewSent: ["Preview sent to the projection.", "试听已发送到投影端。"],
  enableSound: ["Enable sound", "启用声音"],
  overlayControls: ["Desktop overlay", "桌面悬浮窗"],
  overlayHelp: ["Applies to desktop apps following this server. Positions are relative to the screen selected on each app.", "应用于跟随此服务器的桌面悬浮窗。位置以每台电脑在 App 中选定的屏幕为准。"],
  overlayOffline: ["Switch the console online to control the desktop overlay.", "控制台切换到在线模式后可控制桌面悬浮窗。"],
  overlayLayout: ["Layout", "布局"], overlayCard: ["Standard card", "标准卡片"],
  overlayText: ["Text only", "仅文字（背景全透明）"], overlayCompact: ["Compact · side queue", "紧凑 · 队列在侧"],
  overlayCompactTop: ["Compact · queue above", "紧凑 · 队列在上"],
  overlayEdge: ["Background edge", "背景边缘"], overlayEdgeSolid: ["Defined border", "清晰边框"], overlayEdgeFade: ["Soft fade", "柔和渐隐"],
  overlayPosition: ["Position", "位置"], overlayKeep: ["Keep current location", "保持原位"],
  overlayCustom: ["Custom offset", "自定义偏移"],
  overlayLeftTop: ["Top left", "左上角"], overlayCenterTop: ["Top center", "上方居中"], overlayRightTop: ["Top right", "右上角"],
  overlayLeftMiddle: ["Middle left", "左侧居中"], overlayCenterMiddle: ["Center", "正中"], overlayRightMiddle: ["Middle right", "右侧居中"],
  overlayLeftBottom: ["Bottom left", "左下角"], overlayCenterBottom: ["Bottom center", "下方居中"], overlayRightBottom: ["Bottom right", "右下角"],
  overlayX: ["From left (px)", "距左侧（px）"], overlayY: ["From top (px)", "距顶部（px）"],
  overlayWidth: ["Width (px)", "宽度（px）"], overlayHeight: ["Height (px)", "高度（px）"],
  overlayWindowOpacity: ["Overall opacity", "整体不透明度"], overlayBackgroundOpacity: ["Background opacity", "背景不透明度"],
  overlayApply: ["Apply to desktop overlay", "应用到悬浮窗"], overlaySaved: ["Overlay settings saved to this server.", "悬浮窗设置已保存到此服务器。"],
  overlayPreview: ["Preview before applying", "应用前预览"],
  overlayRead: ["Read current app settings", "读取当前 App 参数"],
  overlayDevice: ["Desktop app", "桌面 App"],
  overlayLoaded: ["Loaded from the app into this form.", "已将 App 的当前参数载入本表单。"],
  overlayNoApps: ["No connected desktop app has reported settings.", "没有已连接的桌面 App 上报参数。"],
  soundBlocked: ["Could not enable audio in this browser.", "此浏览器未能启用声音。"],
  fullscreen: ["Fullscreen", "全屏"], fullscreenFailed: ["Fullscreen could not open. Try F11.", "无法进入全屏。可尝试按 F11。"],
  confirmReset: ["Reset the current countdown?", "重置当前计时？"],
  confirmSwitch: ["Switch groups and reset the current countdown?", "切换小组并重置当前计时？"],
  confirmRemove: ["Delete this group?", "删除此小组？"],
  confirmRemoveCurrent: ["Delete the current group and reset its countdown?", "删除当前组并重置计时？"],
  invalid: ["Check the values and try again. Group names can use up to 120 characters.", "请检查输入后重试。组名最多 120 个字符。"],
  groupLimit: ["The queue can hold up to 200 groups.", "队列最多容纳 200 个小组。"],
  badCode: ["Pairing code did not match.", "配对码不匹配。"],
  rateLimit: ["Too many incorrect codes. Try again in a minute.", "错误次数过多，请稍后再试。"],
  stale: ["Another update arrived. Check the latest state and try again.", "状态已更新，请查看当前状态后重试。"],
  confirmRequired: ["This operation requires confirmation.", "此操作需要确认。"],
  unavailable: ["This action is unavailable in the current timer state.", "当前计时状态无法执行此操作。"],
  noNext: ["There is no next group.", "没有下一组。"],
  storage: ["The server could not save the data.", "服务端无法保存数据。"],
  busy: ["The server is busy. Try again shortly.", "服务端繁忙，请稍后重试。"],
  projectionMissing: ["Open the projection page first.", "请先打开投影页。"],
  forbidden: ["Open the console using the server’s configured address.", "请使用服务配置的地址打开控制台。"],
  unexpected: ["The action failed. Try again.", "操作失败，请重试。"],
};

const $ = id => document.getElementById(id);
const isFile = location.protocol === "file:";
const appBase = new URL("./", document.currentScript.src);
const appUrl = (path = "") => new URL(path.replace(/^\//, ""), appBase);
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
function storage(area, key, value) {
  try {
    const store = window[area];
    if (value === undefined) return store.getItem(key);
    if (value === null) store.removeItem(key);
    else store.setItem(key, value);
    return true;
  } catch {
    return value === undefined ? null : false;
  }
}

const tempPrefix = "countdown-temp:";
const tempLifetime = 30 * 60 * 1000;
const clearSignal = "countdown-temp-cleared";
function temporary(key, value) {
  const name = tempPrefix + key;
  if (value === null) return storage("localStorage", name, null);
  if (value !== undefined) return storage("localStorage", name, JSON.stringify({ value, expires: Date.now() + tempLifetime }));
  const raw = storage("localStorage", name);
  try {
    const entry = JSON.parse(raw);
    if (entry && entry.expires > Date.now()) return entry.value;
  } catch {
    // Ignore a damaged temporary entry.
  }
  if (raw) storage("localStorage", name, null);
  return null;
}

function setupTemporaryClear(onClear) {
  $("clear-temporary").onclick = () => {
    if (!window.confirm(t("confirmClearTemporary"))) return;
    try {
      const store = window.localStorage;
      for (const key of Object.keys(store)) {
        if (key.startsWith(tempPrefix)) store.removeItem(key);
      }
    } catch {
      // In-memory state can still be reset with browser storage disabled.
    }
    storage("localStorage", clearSignal, String(Date.now()));
    onClear();
  };
  window.addEventListener("storage", event => {
    if (event.key === clearSignal && event.newValue) onClear();
  });
}

function restoreClock(key, duration, clockNow, group = null) {
  const saved = temporary(key);
  const ready = { phase: "ready", deadline: null, remainingMs: duration };
  if (!saved || saved.group !== group) return ready;
  if (saved.phase === "running" && Number.isFinite(saved.wallDeadline)) {
    const remaining = saved.wallDeadline - Date.now();
    if (remaining <= 0) return { phase: "finished", deadline: null, remainingMs: 0 };
    if (remaining <= 5999000) return { phase: "running", deadline: clockNow() + remaining, remainingMs: remaining };
  }
  if (saved.phase === "paused" && Number.isFinite(saved.remainingMs) && saved.remainingMs > 0 && saved.remainingMs <= 5999000) {
    return { phase: "paused", deadline: null, remainingMs: saved.remainingMs };
  }
  if (saved.phase === "finished") return { phase: "finished", deadline: null, remainingMs: 0 };
  return ready;
}

function rememberClock(key, timer, clockNow, group = null, details = {}) {
  if (timer.phase === "ready") return temporary(key, null);
  return temporary(key, { ...details, phase: timer.phase, group, remainingMs: timer.remainingMs,
    wallDeadline: timer.deadline === null ? null : Date.now() + (timer.deadline - clockNow()) });
}
let language = storage("localStorage", "countdown-language") === "zh" ? "zh" : "en";
const t = key => (strings[key] || strings.unexpected)[language === "zh" ? 1 : 0];

function setupLanguage(onChange) {
  function apply() {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = t(document.body.dataset.pageTitle || "title");
    document.querySelectorAll("[data-t]").forEach(node => { node.textContent = t(node.dataset.t); });
    $("language").setAttribute("aria-label", t("languageSwitch"));
    onChange();
  }
  $("language").onclick = () => {
    language = language === "en" ? "zh" : "en";
    storage("localStorage", "countdown-language", language);
    apply();
  };
  apply();
}

async function post(path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  let response;
  try {
    response = await fetch(appUrl("api/" + path), { method: "POST", headers, body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000) });
  } catch {
    throw { error: "offline" };
  }
  let result;
  try { result = await response.json(); } catch { throw { error: "unexpected" }; }
  if (!response.ok) throw result;
  return result;
}

function showNotice(node, key) {
  node.dataset.message = key || "";
  node.hidden = !key;
  node.textContent = key ? t(key) : "";
}

function connect({ onState, onConnection, onWelcome, onFinish, onAudio }) {
  let nowOffset = 0;
  let calibrated = false;
  let state;
  let connected = false;
  let client = null;
  let lastContact = performance.now();
  let source;
  const serverNow = () => performance.now() + nowOffset;
  function connection(value) {
    if (connected !== value) {
      connected = value;
      onConnection(value);
    }
  }
  function update(next) {
    if (!next || !state || state.instance !== next.instance || next.revision < state.revision) return;
    state = next;
    onState(state);
  }
  async function sync() {
    const usingClient = client;
    if (!usingClient) return;
    const sent = performance.now();
    try {
      const response = await fetch(appUrl("api/state"), { signal: AbortSignal.timeout(3500) });
      const latest = await response.json();
      const arrived = performance.now();
      if (client !== usingClient || latest.instance !== state.instance) return;
      if (!calibrated || arrived - sent < 500) {
        nowOffset = latest.serverNow - (sent + arrived) / 2;
        calibrated = true;
      }
      update(latest);
    } catch {
      // The stream detects disconnects and reconciles on reconnect.
    }
  }
  function openStream() {
    source?.close();
    client = null;
    lastContact = performance.now();
    source = new EventSource(appUrl(onAudio ? "api/events?view=projection" : "api/events"));
    source.addEventListener("welcome", event => {
      const welcome = JSON.parse(event.data);
      client = welcome.client;
      lastContact = performance.now();
      calibrated = false;
      nowOffset = welcome.state.serverNow - lastContact;
      state = welcome.state;
      onState(state);
      connection(true);
      onWelcome?.(welcome, serverNow);
      sync();
    });
    source.addEventListener("heartbeat", () => { lastContact = performance.now(); });
    source.addEventListener("state", event => {
      lastContact = performance.now();
      update(JSON.parse(event.data));
    });
    source.addEventListener("finish", event => onFinish?.(JSON.parse(event.data), serverNow));
    source.addEventListener("audio", event => onAudio?.(JSON.parse(event.data), serverNow));
    source.onerror = () => {
      client = null;
      connection(false);
    };
  }
  openStream();
  const watchdog = setInterval(() => {
    if (performance.now() - lastContact > 12000) {
      connection(false);
      openStream();
    }
  }, 1000);
  const calibrate = setInterval(sync, 15000);
  function onVisibility() { if (!document.hidden) sync(); }
  document.addEventListener("visibilitychange", onVisibility);
  return { update, serverNow, close() {
    client = null;
    source.close();
    clearInterval(watchdog);
    clearInterval(calibrate);
    document.removeEventListener("visibilitychange", onVisibility);
  } };
}

function currentName(node, group) {
  node.textContent = group?.name ?? "N/A";
  node.toggleAttribute("data-placeholder", !group);
}

function stageName(stage) {
  return stage === "questions" ? "Q&A" : "Presentation";
}

function phaseLabel(state) {
  return state ? t(state.waitingQuestions ? "waitingQuestions" : state.phase) : "";
}

function remainingTime(state, serverNow) {
  return state.deadline === null ? state.remainingMs : Math.max(0, state.deadline - serverNow());
}

function finalPalette(node, phase, remaining, light = false) {
  const active = phase === "running" && remaining > 0 && remaining <= 10000;
  if (active) {
    const elapsed = 10000 - remaining;
    const motion = !reducedMotion.matches;
    const flash = motion && remaining <= 2000;
    const alternate = flash && Math.floor((2000 - remaining) / 500) % 2 === 1;
    const breath = motion && !flash ? (1 - Math.cos(elapsed / 1000 * 2 * Math.PI)) / 2 : 0;
    const contrast = flash ? 68 + (2000 - remaining) / 2000 * 32
      : motion ? breath * (88 + elapsed / 8000 * 12) : elapsed / 10000 * 25;
    node.dataset.finalPalette = light !== alternate ? "light" : "dark";
    node.dataset.finalPhase = flash ? "flash" : motion ? "breathe" : "steady";
    node.style.setProperty("--final-contrast", contrast.toFixed(1) + "%");
  } else if (node.hasAttribute("data-final-palette")) {
    delete node.dataset.finalPalette;
    delete node.dataset.finalPhase;
    node.style.removeProperty("--final-contrast");
  }
  return active;
}

const soundPatterns = {
  beep: [
    [0, 1220, .09, 1.05], [.49, 1220, .09, 1.15], [.91, 1220, .09, 1.25],
    [1.26, 1220, .095, 1.35], [1.55, 1220, .095, 1.45], [1.79, 1220, .095, 1.5],
    [2, 1480, 1, 1.55],
  ],
  double: [[0, 1140, .16, 1.4], [.24, 1230, .16, 1.4]],
  tone: [[0, 700, .95, 1]],
  chime: [[0, 523.25, .39, 1], [.14, 659.25, .39, 1], [.28, 783.99, .39, 1]],
  bell: [[0, 740, .39, 1], [.26, 493.88, .39, 1]],
};

function settleClock(timer, now, { questionsMs, autoQuestions, sound, volume }, audible = true) {
  const next = { ...timer };
  let finishedAt = null;
  const finish = () => Object.assign(next, { phase: "finished", deadline: null, remainingMs: 0 });
  if (timer.deadline !== null && now >= timer.deadline) {
    finishedAt = timer.deadline;
    finish();
    if (autoQuestions && timer.stage === "presentation") {
      const duration = volume > 0 && soundPatterns[sound] ?
        Math.round(1000 * Math.max(...soundPatterns[sound].map(([offset, , length]) => offset + length))) : 0;
      const playsNow = duration > 0 && audible && now - finishedAt < 2000;
      next.questionsAt = (playsNow ? now : finishedAt) + duration;
    }
  } else if (timer.questionsAt == null || now < timer.questionsAt) {
    return null;
  }
  if (next.questionsAt != null && now >= next.questionsAt) {
    Object.assign(next, { stage: "questions", phase: "running", deadline: next.questionsAt + questionsMs,
      remainingMs: questionsMs, questionsAt: null });
    if (now >= next.deadline) {
      finishedAt = next.deadline;
      finish();
    }
  }
  return { timer: next, finishedAt, transition: finishedAt !== null && next.phase === "running" };
}

function createTimerAudio() {
  let context;
  const sounding = new Set();

  function prepare(onStateChange) {
    if (typeof AudioContext !== "undefined") context ??= new AudioContext();
    if (context && onStateChange) context.onstatechange = onStateChange;
  }
  async function unlock() {
    prepare();
    if (context.state !== "running") await context.resume();
  }
  function stop() {
    for (const oscillator of sounding) oscillator.stop();
    sounding.clear();
  }
  function play(sound, volume = 70) {
    stop();
    const notes = soundPatterns[sound];
    if (!Array.isArray(notes) || context?.state !== "running" || !(volume > 0)) return;
    const start = context.currentTime;
    const crisp = sound === "beep" || sound === "double";
    for (const [offset, frequency, length, level] of notes) {
      const at = start + offset;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = sound === "bell" ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      const peak = 0.16 * volume / 100 * level;
      gain.gain.setValueAtTime(0.00001, at);
      gain.gain.exponentialRampToValueAtTime(peak, at + (crisp ? .006 : .02));
      if (crisp) {
        gain.gain.setValueAtTime(peak, at + length - .025);
        gain.gain.linearRampToValueAtTime(0, at + length);
      } else {
        gain.gain.setValueAtTime(peak, at + length * .65);
        gain.gain.exponentialRampToValueAtTime(0.00001, at + length);
      }
      oscillator.connect(gain).connect(context.destination);
      sounding.add(oscillator);
      oscillator.onended = () => { sounding.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
      oscillator.start(at);
      oscillator.stop(at + length);
    }
  }
  return { prepare, unlock, stop, play, get ready() { return context?.state === "running"; } };
}

function paintCountdown(palette, clock, state, clockNow, light, timer = $("timer")) {
  const remaining = state ? remainingTime(state, clockNow) : 0;
  const seconds = Math.ceil(remaining / 1000);
  const digits = state ? [Math.floor(seconds / 60), seconds % 60].map(value => String(value).padStart(2, "0")).join(":") : "--:--";
  if (timer.textContent !== digits) timer.textContent = digits;
  const final = finalPalette(palette, state?.phase, remaining, light);
  const settings = state?.settings;
  const warning = !final && settings && state.phase === "running" && seconds > 0 && seconds <= settings.warning;
  clock.dataset.effect = warning ? settings.effect : "off";
  clock.dataset.phase = state?.phase || "";
  return seconds;
}

return { $, t, setupLanguage, connect, remainingTime, currentName, stageName, phaseLabel, reducedMotion,
  post, showNotice, isFile, appUrl, storage, temporary, setupTemporaryClear, restoreClock, rememberClock, createTimerAudio,
  paintCountdown, settleClock };
})();

if (document.body.classList.contains("guide-page")) {
  if (!CountdownUI.isFile) {
    document.querySelectorAll("[data-server-href]").forEach(link => { link.href = CountdownUI.appUrl(link.dataset.serverHref); });
  }
  const notice = CountdownUI.$("guide-notice");
  CountdownUI.setupLanguage(() => CountdownUI.showNotice(notice, notice.dataset.message));
  const savedScroll = CountdownUI.temporary("guide-scroll");
  if (!location.hash && Number.isFinite(savedScroll)) requestAnimationFrame(() => window.scrollTo(0, savedScroll));
  window.addEventListener("pagehide", () => CountdownUI.temporary("guide-scroll", window.scrollY || null));
  CountdownUI.setupTemporaryClear(() => {
    window.scrollTo(0, 0);
    CountdownUI.showNotice(notice, "temporaryCleared");
  });
}
