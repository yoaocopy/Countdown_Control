(() => {
const { $, t, setupLanguage, connect, paintCountdown, currentName, stageName, phaseLabel,
  post, showNotice, isFile, appUrl, storage, temporary, setupTemporaryClear, createTimerAudio } = CountdownUI;

let state;
let online = false;
let verified = false;
let busy = false;
let token = isFile ? null : storage("sessionStorage", "countdown-controller");
let pairedInstance;
let pairingEpoch = 0;
let queueSignature;
let settingsSignature;
let overlaySignature;
let overlaySaved = false;
let overlayReadStatus;
let overlayClients = [];
let overlayScreen;
let dragging;
let candidate;
let batch;
let pendingBatch;
let lastDraft = "null";
let service;
let local;
let offline = false;
let previewLight = storage("localStorage", "countdown-display-theme") === "light";
let lastOnlineState;
let storageFailed = false;
const notice = key => showNotice($("notice"), key);
const canWrite = () => online && verified && !busy && !!state;
const active = () => ["running", "paused"].includes(state?.phase) || !!state?.waitingQuestions;
const localAudio = createTimerAudio();
const queueState = () => JSON.stringify([offline ? "local" : state?.instance, state?.groups, state?.current]);
const batchChanged = () => batch && (batch.removed.size > 0 || batch.order.some((id, index) => id !== batch.groups[index].id));
const draftKey = () => offline ? "console-offline" : "console-online";
const overlayInputs = {
  layout: "overlay-layout", textOnly: "overlay-text-only", edge: "overlay-edge", position: "overlay-position", width: "overlay-width", height: "overlay-height",
  offsetX: "overlay-x", offsetY: "overlay-y", windowOpacity: "overlay-window-opacity", backgroundOpacity: "overlay-background-opacity",
};
const overlayDefaults = { layout: "card", textOnly: false, edge: "solid", position: "keep", width: 500, height: 295, offsetX: 0, offsetY: 0, windowOpacity: 100, backgroundOpacity: 88 };
const overlayDemo = $("overlay-demo-window");
const overlayDemoScreen = $("overlay-demo-screen");
const overlayDemoClock = overlayDemo.querySelector(".stage-clock");
const fitOverlayDemoNames = OverlayNames(overlayDemo.querySelector(".stage"));

function rememberConsole(refresh = false) {
  if (!state) return;
  const names = $("names").value;
  const draft = batch && { base: batch.base, order: batch.order, removed: [...batch.removed] };
  const data = names || candidate || draft ? { names, candidate, batch: draft } : null;
  const serialized = JSON.stringify(data);
  if (serialized !== lastDraft ||
      (refresh && data && serialized === JSON.stringify(temporary(draftKey())))) {
    temporary(draftKey(), data);
    lastDraft = serialized;
  }
}

function restoreBatch() {
  const saved = pendingBatch;
  pendingBatch = null;
  if (!saved || saved.base !== queueState()) return;
  const ids = new Set(state.groups.map(group => group.id));
  if (!Array.isArray(saved.order) || saved.order.length !== ids.size || new Set(saved.order).size !== ids.size ||
      !saved.order.every(id => ids.has(id)) || !Array.isArray(saved.removed) || !saved.removed.every(id => ids.has(id))) return;
  batch = { base: saved.base, order: saved.order, groups: state.groups, removed: new Set(saved.removed) };
}

function moveGroup(id, before) {
  if (!batch) {
    command("move", { id, before });
    return;
  }
  if (before === id) return;
  const order = batch.order.filter(item => item !== id);
  order.splice(before === null ? order.length : order.indexOf(before), 0, id);
  batch.order = order;
  queueSignature = null;
  render();
}

function button(label, handler) {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = t(label);
  element.dataset.write = "";
  element.onclick = handler;
  return element;
}

function renderQueue() {
  const byId = batch && new Map(batch.groups.map(group => [group.id, group]));
  const groups = batch ? batch.order.map(id => byId.get(id)) : state?.groups || [];
  $("group-count").textContent = groups.length;
  $("empty").hidden = groups.length > 0;
  $("queue").replaceChildren(...groups.map((group, index) => {
    const row = document.createElement("li");
    const current = state?.current === group.id;
    row.classList.toggle("selected", current);
    row.dataset.id = group.id;
    const handle = document.createElement("span");
    handle.textContent = "⠿";
    handle.title = t("drag");
    handle.className = "drag-grip";
    handle.setAttribute("aria-hidden", "true");
    handle.ondragstart = event => {
      if (!canWrite()) return event.preventDefault();
      dragging = group.id;
      event.dataTransfer.setData("text/plain", group.id);
      event.dataTransfer.effectAllowed = "move";
    };
    handle.ondragend = () => { dragging = null; clearDrop(); };
    const title = batch ? document.createElement("span") : button("current", () => {
      candidate = current || candidate === group.id ? null : group.id;
      render();
    });
    title.textContent = group.name;
    title.className = "group-name";
    if (current) title.setAttribute("aria-current", "true");
    const caption = document.createElement("span");
    caption.className = "queue-role";
    const up = button("moveUp", () => moveGroup(group.id, groups[index - 1].id));
    const down = button("moveDown", () => moveGroup(group.id, groups[index + 2]?.id ?? null));
    up.dataset.unavailable = String(index === 0);
    down.dataset.unavailable = String(index === groups.length - 1);
    up.textContent = "↑";
    down.textContent = "↓";
    up.title = t("moveUp");
    down.title = t("moveDown");
    up.setAttribute("aria-label", up.title);
    down.setAttribute("aria-label", down.title);
    const actions = document.createElement("div");
    actions.className = "row-actions";
    actions.append(up, down);
    if (batch) {
      const mark = document.createElement("input");
      mark.type = "checkbox";
      mark.dataset.write = "";
      mark.checked = batch.removed.has(group.id);
      mark.setAttribute("aria-label", t("markRemove") + " (" + group.name + ")");
      mark.title = t("markRemove");
      mark.onchange = () => {
        if (mark.checked) batch.removed.add(group.id);
        else batch.removed.delete(group.id);
        render();
      };
      row.append(mark);
    } else {
      const rename = button("rename", () => {
        const name = window.prompt(t("rename"), group.name);
        if (name !== null && name.trim() !== group.name) command("rename", { id: group.id, name });
      });
      const remove = button("remove", () => command("remove", { id: group.id },
        current && active() ? "confirmRemoveCurrent" : "confirmRemove"));
      actions.append(rename, remove);
    }
    row.append(handle, title, caption, actions);
    return row;
  }));
}

function clearDrop() {
  $("queue").querySelectorAll(".drop-before, .drop-after").forEach(row => row.classList.remove("drop-before", "drop-after"));
}
$("queue").ondragover = event => {
  const row = event.target.closest("li");
  if (!dragging || !row || !canWrite()) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = "move";
  clearDrop();
  const box = row.getBoundingClientRect();
  row.classList.add(event.clientY < box.top + box.height / 2 ? "drop-before" : "drop-after");
};
$("queue").ondragleave = event => { if (!$("queue").contains(event.relatedTarget)) clearDrop(); };
$("queue").ondrop = event => {
  const row = event.target.closest("li");
  if (!dragging || !row || !canWrite()) return;
  event.preventDefault();
  if (row.dataset.id !== dragging) {
    const target = row.classList.contains("drop-after") ? row.nextElementSibling : row;
    moveGroup(dragging, target?.dataset.id ?? null);
  }
  dragging = null;
  clearDrop();
};

function render() {
  $("connection").hidden = offline;
  $("connection").textContent = t(online ? "online" : "offline");
  $("connection").dataset.online = String(online);
  $("mode").textContent = t(offline ? "local" : state?.mode || "public");
  $("mode").dataset.local = String(offline);
  $("switch-mode").textContent = t(offline ? "goOnline" : "goOffline");
  $("switch-mode").disabled = busy;
  $("session-title").textContent = t(offline ? "localSession" : "pairing");
  $("pair-status").textContent = t(offline ? storageFailed ? "offlineStorage" : "localHelp" : verified ? "paired" : "unpaired");
  $("pair-form").hidden = offline || verified;
  $("code").placeholder = t("code");
  $("pair-form").querySelector("button").disabled = !online || busy;
  const current = state?.groups.find(group => group.id === state.current);
  currentName($("current-name"), current);
  $("local-next").textContent = state?.upcoming[0]?.name || "—";
  $("local-after").textContent = state?.upcoming[1]?.name || "—";
  $("local-fullscreen").hidden = !offline;
  $("phase").textContent = phaseLabel(state) || "—";
  $("timer-preview").dataset.theme = previewLight ? "light" : "dark";
  $("preview-theme").textContent = t(previewLight ? "darkTheme" : "lightTheme");
  $("console-stage").hidden = !state?.twoStage;
  $("console-stage").textContent = state?.twoStage ? stageName(state.stage) : "";
  $("open-display").href = projectionUrl();
  const signature = queueState();
  if (state && (!state.groups.some(group => group.id === candidate) || candidate === state.current)) candidate = null;
  if (queueSignature !== signature) {
    queueSignature = signature;
    renderQueue();
  }
  if (state && JSON.stringify(state.settings) !== settingsSignature) {
    const { duration, warning, effect, sound, volume, twoStage, questionsDuration, autoAdvance } = state.settings;
    settingsSignature = JSON.stringify(state.settings);
    $("minutes").value = Math.floor(duration / 60);
    $("seconds").value = duration % 60;
    $("warning").value = warning;
    $("effect").value = effect;
    $("sound").value = sound;
    $("volume").value = volume;
    $("volume-value").value = volume + "%";
    $("two-stage-groups").checked = !!twoStage;
    $("questions-minutes").value = Math.floor((questionsDuration ?? 120) / 60);
    $("questions-seconds").value = (questionsDuration ?? 120) % 60;
    $("auto-advance").checked = !!autoAdvance;
  }
  document.querySelectorAll("[data-write]").forEach(control => {
    control.disabled = !canWrite() || control.dataset.unavailable === "true";
  });
  const batchStale = batch && batch.base !== signature;
  $("copy-queue").disabled = !state?.groups.length;
  $("queue-tools").hidden = !!batch || !state?.groups.length;
  $("use-group").disabled = !canWrite() || !candidate;
  $("batch-tools").hidden = !batch;
  $("batch-conflict").hidden = !batchStale;
  $("batch-count").textContent = batch?.removed.size ? t("pendingRemoval") + " · " + batch.removed.size : "";
  $("batch-count").hidden = !batch?.removed.size;
  $("apply-queue").disabled = !canWrite() || !!batchStale || !batchChanged();
  $("cancel-queue").disabled = busy;
  $("add-form").hidden = !!batch;
  $("import").hidden = !!batch;
  for (const row of $("queue").children) {
    const id = row.dataset.id;
    const isCurrent = id === state?.current;
    const isCandidate = !batch && id === candidate;
    const title = row.querySelector(".group-name");
    row.classList.toggle("candidate", isCandidate);
    row.classList.toggle("batch-removed", !!batch?.removed.has(id));
    if (!batch) title.setAttribute("aria-pressed", String(isCandidate));
    const caption = row.querySelector(".queue-role");
    caption.textContent = isCurrent ? t("current") : isCandidate ? t("candidate") : "";
    caption.hidden = !isCurrent && !isCandidate;
  }
  document.querySelectorAll(".drag-grip").forEach(grip => { grip.draggable = canWrite(); });
  document.querySelectorAll("[data-command]").forEach(control => {
    const { command } = control.dataset;
    const phase = state?.phase;
    const appropriate = ({ start: !state?.waitingQuestions && (!phase || phase === "ready" || phase === "finished"),
      questions: !!state?.waitingQuestions && state.questionsAt == null, pause: phase === "running",
      resume: phase === "paused", reset: true, next: true })[command];
    control.hidden = !appropriate;
    control.disabled = !canWrite() || (command === "start" && phase !== "ready") ||
      (command === "next" && (!!batch || !state.upcoming.length));
  });
  $("settings-fields").disabled = !canWrite();
  renderStageSettings();
  renderOverlay();
  rememberConsole();
}

function paintOverlayForm() {
  const custom = $("overlay-position").value === "custom";
  $("overlay-offsets").hidden = !custom;
  $("overlay-x").disabled = !custom;
  $("overlay-y").disabled = !custom;
  $("overlay-background-setting").hidden = $("overlay-text-only").checked;
  $("overlay-edge-setting").hidden = $("overlay-text-only").checked;
  $("overlay-window-value").value = $("overlay-window-opacity").value + "%";
  $("overlay-background-value").value = $("overlay-background-opacity").value + "%";
  $("overlay-saved").textContent = overlaySaved ? t("overlaySaved") : "";
  $("overlay-read-status").textContent = overlayReadStatus ? t(overlayReadStatus) : "";
  $("overlay-devices").setAttribute("aria-label", t("overlayDevice"));
  for (const option of $("overlay-devices").options) option.textContent = `${t("overlayDevice")} ${option.value}`;
  paintOverlayDemo();
}

function writeOverlayForm(saved) {
  const settings = { ...overlayDefaults, ...saved };
  if (settings.layout === "text") { settings.layout = "card"; settings.textOnly = true; }
  for (const [name, id] of Object.entries(overlayInputs)) {
    const control = $(id);
    if (control.type === "checkbox") control.checked = settings[name];
    else control.value = settings[name];
  }
}

function readOverlayForm() {
  return Object.fromEntries(Object.entries(overlayInputs).map(([key, id]) => {
    const control = $(id);
    let value = control.valueAsNumber;
    if (control.disabled) value = overlayDefaults[key];
    else if (control.type === "checkbox") value = control.checked;
    else if (control.tagName === "SELECT") value = control.value;
    return [key, value];
  }));
}

function paintOverlayDemo() {
  if (!overlayDemoScreen.clientWidth) return;
  const form = readOverlayForm();
  const display = overlayScreen ?? { width: 1000, height: 625 };
  const width = Math.max(1, Math.min(display.width, form.width || overlayDefaults.width));
  const height = Math.max(1, Math.min(display.height, form.height || overlayDefaults.height));
  const availableX = display.width - width;
  const availableY = display.height - height;
  const insetX = Math.min(20, availableX / 2);
  const insetY = Math.min(20, availableY / 2);
  const [horizontal, vertical] = (form.position === "keep" ? "right-top" : form.position).split("-");
  const x = form.position === "custom" ? Math.min(availableX, Math.max(0, form.offsetX || 0)) :
    { left: insetX, center: availableX / 2, right: availableX - insetX }[horizontal];
  const y = form.position === "custom" ? Math.min(availableY, Math.max(0, form.offsetY || 0)) :
    { top: insetY, middle: availableY / 2, bottom: availableY - insetY }[vertical];
  const scale = Math.min(overlayDemoScreen.clientWidth / display.width, overlayDemoScreen.clientHeight / display.height);
  Object.assign(overlayDemo.style, { width: `${width}px`, height: `${height}px`,
    left: `${(overlayDemoScreen.clientWidth - display.width * scale) / 2 + x * scale}px`,
    top: `${(overlayDemoScreen.clientHeight - display.height * scale) / 2 + y * scale}px`, transform: `scale(${scale})` });
  overlayDemo.dataset.layout = form.layout;
  overlayDemo.dataset.edge = form.edge;
  overlayDemo.dataset.theme = previewLight ? "light" : "dark";
  overlayDemo.toggleAttribute("data-no-backdrop", form.textOnly || form.backgroundOpacity === 0);
  overlayDemo.style.setProperty("--desktop-opacity", form.backgroundOpacity / 100);
  overlayDemo.style.setProperty("--desktop-window-opacity", form.windowOpacity / 100);
  const group = state?.groups.find(item => item.id === state.current);
  fitOverlayDemoNames([group?.name || "N/A", state?.upcoming[0]?.name || "—", state?.upcoming[1]?.name || "—"]);
  overlayDemo.querySelector(".stage-name").style.opacity = group ? "1" : ".5";
  const stage = overlayDemo.querySelector(".overlay-active-stage");
  overlayDemo.classList.toggle("two-stage", !!state?.twoStage);
  stage.hidden = !state?.twoStage;
  if (state?.twoStage) stage.textContent = stageName(state.stage);
  overlayDemo.querySelector(".stage-phase").textContent = phaseLabel(state);
  paintOverlayTimer();
}

function paintOverlayTimer() {
  if (!overlayDemoScreen.clientWidth) return;
  paintCountdown(overlayDemo, overlayDemoClock, state, service?.serverNow, previewLight, overlayDemoClock.querySelector(".timer"));
}

function renderOverlay() {
  const enabled = !offline && state && Object.hasOwn(state, "overlay");
  $("overlay-fields").disabled = !enabled || !canWrite();
  $("overlay-form").hidden = offline;
  $("overlay-help").hidden = offline;
  $("overlay-offline").hidden = !offline;
  const key = enabled ? `${state.instance}:${state.overlay?.revision ?? 0}` : null;
  if (key !== overlaySignature) {
    overlaySignature = key;
    overlaySaved = false;
    writeOverlayForm(enabled ? state.overlay : null);
  }
  paintOverlayForm();
}

$("overlay-form").addEventListener("input", () => { overlaySaved = false; paintOverlayForm(); });
new ResizeObserver(paintOverlayDemo).observe(overlayDemoScreen);
$("overlay-form").onsubmit = async event => {
  event.preventDefault();
  if (offline || !canWrite() || !Object.hasOwn(state, "overlay")) return;
  overlaySaved = await command("overlay", { overlay: readOverlayForm() });
  paintOverlayForm();
};

function loadOverlayClient(device) {
  const client = overlayClients.find(item => String(item.device) === device);
  if (!client) return;
  overlayScreen = client.screen;
  writeOverlayForm(client.appearance);
  overlaySaved = false;
  overlayReadStatus = "overlayLoaded";
  paintOverlayForm();
}

$("overlay-read").onclick = () => {
  if (offline || !canWrite()) return;
  perform(async () => {
    const { clients } = await request("overlay/clients", {});
    const devices = $("overlay-devices");
    const selected = devices.value;
    overlayClients = clients;
    devices.replaceChildren(...clients.map(client => new Option(`${t("overlayDevice")} ${client.device}`, client.device)));
    devices.hidden = clients.length < 2;
    if (clients.some(client => String(client.device) === selected)) devices.value = selected;
    if (clients.length) loadOverlayClient(devices.value);
    else { overlayReadStatus = "overlayNoApps"; paintOverlayForm(); }
  });
};
$("overlay-devices").onchange = event => loadOverlayClient(event.target.value);

function renderStageSettings() {
  const enabled = $("two-stage-groups").checked;
  $("questions-fields").hidden = !enabled;
  $("questions-fields").disabled = !enabled;
  $("stage-auto-option").hidden = !enabled;
  $("presentation-time-label").textContent = enabled ? stageName("presentation") : t("defaultDuration");
}

function projectionUrl() {
  if (offline && local) return local.projectionUrl();
  const url = appUrl("display");
  url.searchParams.set("follow", "1");
  return url.href;
}

function forgetPairing() {
  pairingEpoch++;
  verified = false;
  token = null;
  pairedInstance = null;
  storage("sessionStorage", "countdown-controller", null);
}

function receive(next) {
  state = next;
  if (pendingBatch) restoreBatch();
  render();
  paintPreview();
}

function paintPreview() {
  const preview = $("timer-preview");
  paintCountdown(preview, preview, state, service.serverNow, previewLight);
  paintOverlayTimer();
}

const onlineCallbacks = {
  onState(next) {
    if (pairedInstance && next.instance !== pairedInstance) forgetPairing();
    lastOnlineState = next;
    receive(next);
  },
  onConnection(value) { online = value; render(); },
  async onWelcome({ state: welcomed }) {
    if (!token) return;
    const checkedToken = token;
    try {
      const session = await post("session", {}, checkedToken);
      if (!offline && token === checkedToken && state?.instance === welcomed.instance && session.instance === welcomed.instance) {
        pairedInstance = session.instance;
        verified = true;
      }
    } catch (failure) {
      if (!offline && token === checkedToken && state?.instance === welcomed.instance && failure.error === "unpaired") forgetPairing();
    }
    render();
  },
};

function switchMode(useLocal) {
  service?.close();
  state = null;
  online = false;
  offline = useLocal;
  verified = useLocal;
  const draft = temporary(draftKey());
  lastDraft = JSON.stringify(draft);
  batch = null;
  pendingBatch = draft?.batch || null;
  candidate = typeof draft?.candidate === "string" ? draft.candidate : null;
  $("names").value = typeof draft?.names === "string" ? draft.names : "";
  queueSignature = null;
  settingsSignature = null;
  overlayClients = [];
  overlayScreen = undefined;
  overlayReadStatus = undefined;
  $("overlay-devices").replaceChildren();
  $("overlay-devices").hidden = true;
  $("server-form").hidden = true;
  notice();
  if (offline) {
    local ??= OfflineCountdown.create(lastOnlineState, () => { storageFailed = true; });
    service = local.connect({
      onState: receive,
      onConnection(value) { online = value; render(); },
      onAudio(event) {
        if (document.fullscreenElement === $("local-stage")) localAudio.play(event.sound, event.volume);
      },
    });
  } else {
    service = connect(onlineCallbacks);
  }
  render();
}

function request(path, body) {
  return offline ? local.post(path, body) : post(path, body, token);
}

async function perform(operation) {
  if (busy) return false;
  busy = true;
  notice();
  render();
  try {
    await operation();
    return true;
  } catch (failure) {
    if (failure.error === "unpaired") forgetPairing();
    if (offline && failure.state) receive(failure.state);
    else service.update(failure.state);
    notice(failure.error || "unexpected");
    return false;
  } finally {
    busy = false;
    render();
  }
}

async function command(action, fields = {}, confirmation) {
  if (!canWrite()) return false;
  const revision = state.revision;
  if (confirmation && !window.confirm(t(confirmation))) return false;
  return perform(async () => {
    const next = await request("command", { action, revision, confirmed: !!confirmation, ...fields });
    service.update(next);
  });
}

$("pair-form").onsubmit = event => {
  event.preventDefault();
  const epoch = pairingEpoch;
  perform(async () => {
    const result = await post("pair", { code: $("code").value });
    if (epoch !== pairingEpoch) return;
    token = result.token;
    pairedInstance = result.instance;
    storage("sessionStorage", "countdown-controller", token);
    verified = true;
    $("code").value = "";
  });
};

document.querySelectorAll("[data-command]").forEach(control => {
  control.onclick = () => {
    const action = control.dataset.command;
    const confirmation = active() && ({ reset: "confirmReset", next: "confirmSwitch" })[action];
    command(action, {}, confirmation);
  };
});

$("use-group").onclick = async () => {
  if (candidate && await command("select", { id: candidate }, active() && "confirmSwitch")) {
    candidate = null;
    render();
  }
};
$("edit-queue").onclick = () => {
  if (!canWrite() || !state.groups.length) return;
  batch = { base: queueState(), groups: state.groups, order: state.groups.map(group => group.id), removed: new Set() };
  candidate = null;
  queueSignature = null;
  render();
};
$("cancel-queue").onclick = () => {
  batch = null;
  queueSignature = null;
  render();
  $("edit-queue").focus();
};
$("apply-queue").onclick = async () => {
  if (!batchChanged() || batch.base !== queueState()) return;
  const confirm = batch.removed.has(state.current) && active() && "confirmBatch";
  if (await command("editQueue", { order: batch.order, removed: [...batch.removed] }, confirm)) {
    batch = null;
    queueSignature = null;
    render();
    notice("batchApplied");
  }
};

$("add-form").onsubmit = async event => {
  event.preventDefault();
  const value = $("names").value;
  const names = value.split(/\r?\n/).map(name => name.trim()).filter(Boolean);
  if (await command("add", { names }) && $("names").value === value) {
    $("names").value = "";
    rememberConsole();
  }
};
$("names").oninput = () => rememberConsole();
$("settings-form").onsubmit = async event => {
  event.preventDefault();
  const settings = {
    duration: 60 * $("minutes").valueAsNumber + $("seconds").valueAsNumber,
    warning: $("warning").valueAsNumber, effect: $("effect").value, sound: $("sound").value, volume: $("volume").valueAsNumber,
    twoStage: $("two-stage-groups").checked,
    questionsDuration: $("two-stage-groups").checked
      ? 60 * $("questions-minutes").valueAsNumber + $("questions-seconds").valueAsNumber
      : state?.settings.questionsDuration ?? 120,
    autoAdvance: $("auto-advance").checked,
  };
  if (await command("settings", { settings })) notice("saved");
};
$("two-stage-groups").onchange = renderStageSettings;

$("volume").oninput = () => { $("volume-value").value = $("volume").value + "%"; };
$("local-preview").onclick = async () => {
  try {
    await localAudio.unlock();
    localAudio.play($("sound").value, $("volume").valueAsNumber);
  } catch {
    notice("soundBlocked");
  }
};
$("preview").onclick = async () => {
  if (canWrite() && await perform(() => request("preview", { sound: $("sound").value, volume: $("volume").valueAsNumber }))) notice("previewSent");
};

$("export").onclick = () => {
  if (!canWrite()) return;
  const { version, groups, current, settings } = state;
  const backup = JSON.stringify({ version, groups, current, settings }, null, 2);
  const url = URL.createObjectURL(new Blob([backup], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "countdown-backup.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("copy-queue").onclick = async () => {
  const text = state?.groups.map(group => group.name).join("\n");
  if (!text) return;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      notice("queueCopied");
      return;
    } catch {
      // Use selection-based copy when browser clipboard permissions are unavailable.
    }
  }
  const previous = document.activeElement;
  const buffer = document.createElement("textarea");
  buffer.className = "clipboard-buffer";
  buffer.value = text;
  buffer.readOnly = true;
  document.body.append(buffer);
  buffer.select();
  let copied = false;
  try { copied = document.execCommand("copy"); } catch { /* Use the manual copy dialog below. */ }
  buffer.remove();
  previous?.focus();
  if (copied) {
    notice("queueCopied");
    return;
  }
  $("copy-queue-text").value = text;
  $("copy-queue-dialog").showModal();
  $("copy-queue-text").select();
};
$("import").onclick = () => $("import-file").click();
$("import-file").onchange = async event => {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file || !canWrite()) return;
  try {
    if (file.size > 384 * 1024) throw new Error();
    const configuration = JSON.parse(await file.text());
    if (await command("import", { configuration }, "replaceAll")) notice("imported");
  } catch {
    notice("invalid");
  }
};

$("switch-mode").onclick = () => {
  if (isFile) {
    const form = $("server-form");
    form.hidden = !form.hidden;
    if (!form.hidden) $("server-url").focus();
  } else {
    rememberConsole();
    switchMode(!offline);
    temporary("console-mode", offline ? "offline" : null);
  }
};
$("server-form").onsubmit = event => {
  event.preventDefault();
  try {
    const address = new URL($("server-url").value);
    if (!["http:", "https:"].includes(address.protocol) || address.username || address.password || address.search || address.hash) throw new Error();
    location.assign(address.href);
  } catch {
    notice("invalid");
  }
};
$("open-display").onclick = event => {
  if (!offline) return;
  event.preventDefault();
  if (!local.openProjection(projectionUrl())) notice("popupBlocked");
};
$("local-fullscreen").onclick = async () => {
  try {
    localAudio.unlock().catch(() => {});
    await $("local-stage").requestFullscreen();
  } catch {
    notice("fullscreenFailed");
  }
};
$("preview-theme").onclick = () => {
  previewLight = !previewLight;
  storage("localStorage", "countdown-display-theme", previewLight ? "light" : "dark");
  render();
  paintPreview();
};
window.addEventListener("storage", event => {
  if (event.key !== "countdown-display-theme") return;
  previewLight = event.newValue === "light";
  render();
  paintPreview();
});

switchMode(isFile || temporary("console-mode") === "offline");
setupLanguage(() => {
  queueSignature = null;
  render();
  notice($("notice").dataset.message);
});
window.addEventListener("pagehide", () => {
  rememberConsole(true);
  if (!isFile && offline) temporary("console-mode", "offline");
});
setupTemporaryClear(() => {
  forgetPairing();
  batch = pendingBatch = candidate = null;
  $("names").value = "";
  local?.clearClock();
  switchMode(isFile);
  notice("temporaryCleared");
});
setInterval(paintPreview, 100);
})();
