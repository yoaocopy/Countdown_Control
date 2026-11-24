(() => {
const { $, t, setupLanguage, drawTime, remainingTime, currentName, stageName, phaseLabel, finalPalette, reducedMotion,
  showNotice, isFile, storage, temporary, setupTemporaryClear, restoreClock, rememberClock,
  createTimerAudio } = CountdownUI;

const key = new URLSearchParams(location.hash.slice(1)).get("speaker");
const notice = message => showNotice($("display-notice"), message);
const audio = createTimerAudio();
const directFile = isFile && !window.opener;
const modeKey = directFile ? "display-file-mode" : "display-mode";
const cachedMode = !key && temporary(modeKey);
let standalone = cachedMode ? cachedMode === "standalone" : directFile;
let light = storage("localStorage", "countdown-display-theme") === "light";
const savedDuration = Number(storage("localStorage", "countdown-display-duration"));
let duration = Number.isInteger(savedDuration) && savedDuration >= 1 && savedDuration <= 5999 ? savedDuration : 300;
const localNow = () => performance.now();
const local = restoreClock("standalone-clock", duration * 1000, localNow);
let localTouched = standalone && local.phase !== "ready";
$("standalone-minutes").value = Math.floor(duration / 60);
$("standalone-seconds").value = duration % 60;
const localSound = $("standalone-sound");
const localVolume = $("standalone-volume");
localSound.value = storage("localStorage", "countdown-display-sound") || "beep";
if (!localSound.value) localSound.value = "beep";
localVolume.value = storage("localStorage", "countdown-display-volume") ?? "70";
$("standalone-volume-value").value = localVolume.value + "%";

function paint() {
  document.body.dataset.displayMode = standalone ? "standalone" : "follow";
  document.body.dataset.theme = light ? "light" : "dark";
  $("display-mode").textContent = t(standalone ? "followProjection" : "standalone");
  $("display-theme").textContent = t(light ? "darkTheme" : "lightTheme");
  $("standalone-controls").hidden = !standalone;
  $("standalone-start").textContent = t(local.phase === "paused" ? "resume" : "start");
  $("standalone-start").hidden = local.phase === "running";
  $("standalone-pause").hidden = local.phase !== "running";
  $("standalone-start").disabled = local.phase === "finished";
  for (const id of ["standalone-minutes", "standalone-seconds", "standalone-set"]) {
    $(id).disabled = local.phase === "running";
  }
  const state = follower.state;
  const group = state?.groups.find(item => item.id === state.current);
  currentName($("current-name"), group);
  $("first").textContent = state?.upcoming[0]?.name || "—";
  $("second").textContent = state?.upcoming[1]?.name || "—";
  $("active-stage").hidden = standalone || !state?.twoStage;
  $("active-stage").textContent = state?.twoStage ? stageName(state.stage) : "";
  const label = phaseLabel(standalone ? local : state);
  if ($("phase").textContent !== label) $("phase").textContent = label;
  follower.paintControls();
}

function updateClock(timer, clockNow, settings) {
  const clock = $("clock");
  const remaining = timer ? remainingTime(timer, clockNow) : 0;
  const running = timer?.phase === "running" && remaining > 0;
  const finalCountdown = finalPalette(document.body, timer?.phase, remaining, light);
  const seconds = drawTime(timer, clockNow, remaining);
  clock.dataset.effect = !finalCountdown && running && settings && seconds <= settings.warning ? settings.effect : "off";
  clock.dataset.phase = timer?.phase || "";
  return seconds;
}

function tick() {
  if (standalone) {
    if (local.deadline !== null && localNow() >= local.deadline) {
      local.phase = "finished";
      local.deadline = null;
      local.remainingMs = 0;
      rememberLocal();
      paint();
      animateFinish();
      audio.play(localSound.value, localVolume.valueAsNumber);
    }
    updateClock(local, localNow);
    return;
  }
  const state = follower.state;
  if (!state && $("timer").textContent !== "--:--") $("timer").textContent = "--:--";
  follower.checkDeadline(updateClock(state, follower.serverNow, state?.settings));
}

function rememberLocal() {
  localTouched = true;
  rememberClock("standalone-clock", local, localNow);
}

function animateFinish() {
  if (reducedMotion.matches) return;
  $("clock").animate([{ scale: 1 }, { scale: 1.035 }, { scale: 1 }], {
    duration: 640, easing: "ease-out",
  });
}

function pauseLocal() {
  if (local.deadline === null) return;
  const remaining = Math.max(0, local.deadline - localNow());
  local.phase = remaining ? "paused" : "finished";
  local.remainingMs = remaining;
  local.deadline = null;
  rememberLocal();
}

function resetLocal() {
  audio.stop();
  local.phase = "ready";
  local.remainingMs = duration * 1000;
  local.deadline = null;
  rememberLocal();
  paint();
  tick();
}

const follower = createProjectionFollower({
  audio, isActive: () => !standalone, update() { paint(); tick(); }, animate: animateFinish,
});

$("display-mode").onclick = () => {
  audio.stop();
  if (standalone) pauseLocal();
  standalone = !standalone;
  if (!key) temporary(modeKey, standalone ? "standalone" : "follow");
  notice();
  paint();
  tick();
};

$("display-theme").onclick = () => {
  light = !light;
  storage("localStorage", "countdown-display-theme", light ? "light" : "dark");
  paint();
  tick();
};

$("standalone-duration").onsubmit = event => {
  event.preventDefault();
  if (local.phase === "running") return;
  const minutes = $("standalone-minutes").valueAsNumber;
  const seconds = $("standalone-seconds").valueAsNumber;
  const total = minutes * 60 + seconds;
  if (!Number.isSafeInteger(total) || total < 1 || total > 5999) return notice("invalidTime");
  duration = total;
  storage("localStorage", "countdown-display-duration", String(duration));
  notice();
  resetLocal();
};

$("standalone-start").onclick = () => {
  if (local.phase !== "ready" && local.phase !== "paused") return;
  audio.unlock().catch(() => {});
  local.phase = "running";
  local.deadline = localNow() + local.remainingMs;
  rememberLocal();
  paint();
  tick();
};
$("standalone-pause").onclick = () => { pauseLocal(); paint(); tick(); };
$("standalone-reset").onclick = () => { notice(); resetLocal(); };
localSound.onchange = () => storage("localStorage", "countdown-display-sound", localSound.value);
localVolume.oninput = () => {
  $("standalone-volume-value").value = localVolume.value + "%";
  storage("localStorage", "countdown-display-volume", localVolume.value);
};
$("standalone-preview").onclick = async () => {
  try {
    await audio.unlock();
    if (standalone) audio.play(localSound.value, localVolume.valueAsNumber);
  } catch {
    notice("soundBlocked");
  }
};

$("fullscreen").onclick = async () => {
  try {
    await document.documentElement.requestFullscreen();
    notice();
  } catch {
    notice("fullscreenFailed");
  }
};

setupLanguage(() => { paint(); notice($("display-notice").dataset.message); });
window.addEventListener("pagehide", () => {
  if (localTouched) rememberLocal();
  if (!key && standalone !== directFile) temporary(modeKey, standalone ? "standalone" : "follow");
});
setupTemporaryClear(() => {
  standalone = directFile;
  resetLocal();
  localTouched = false;
  notice("temporaryCleared");
});
tick();
setInterval(tick, 100);
})();
