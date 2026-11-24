(() => {
  const { $, t, setupLanguage, paintCountdown, remainingTime, currentName, stageName, phaseLabel, reducedMotion, settleClock,
    showNotice, isFile, storage, temporary, setupTemporaryClear, createTimerAudio } = CountdownUI;

  const params = new URLSearchParams(location.search);
  const desktopMode = document.body.dataset.desktopMode;
  const fitNames = desktopMode && OverlayNames(document.querySelector('.stage'));
  const directFile = isFile && !window.opener;
  const forcedFollow = !!window.opener || params.has("follow") || params.get("mode") === "offline" ||
    new URLSearchParams(location.hash.slice(1)).has("speaker");
  const modeKey = directFile ? "display-file-mode" : "display-mode";
  const legacyPage = /\/two-stage(?:\.html)?$/.test(location.pathname);
  const cachedMode = !forcedFollow && (temporary(modeKey) || (legacyPage && temporary("two-stage-mode")));
  let standalone = desktopMode ? desktopMode === "standalone" :
    !forcedFollow && (cachedMode ? cachedMode === "standalone" : directFile);
  let light = storage("localStorage", "countdown-display-theme") === "light";
  const settingsKey = "countdown-two-stage-settings";
  const validTime = seconds => Number.isInteger(seconds) && seconds >= 1 && seconds <= 5999;
  const savedSingle = Number(storage("localStorage", "countdown-display-duration"));
  const savedVolume = storage("localStorage", "countdown-display-volume");
  const sound = $("standalone-sound");
  const volume = $("standalone-volume");
  const audio = createTimerAudio();
  const notice = message => showNotice($("display-notice"), message);
  const now = Date.now;
  const settings = {
    single: validTime(savedSingle) ? savedSingle : 300,
    presentation: 300, questions: 120, auto: false, twoStage: legacyPage,
    sound: storage("localStorage", "countdown-display-sound") || "beep", volume: savedVolume === null ? 70 : Number(savedVolume),
  };
  try {
    const saved = JSON.parse(storage("localStorage", settingsKey));
    for (const field of ["single", "presentation", "questions"]) {
      if (validTime(saved?.[field])) settings[field] = saved[field];
    }
    settings.auto = saved?.auto === true;
    if (typeof saved?.twoStage === "boolean") settings.twoStage = saved.twoStage;
    if (typeof saved?.sound === "string") settings.sound = saved.sound;
    if (Number.isInteger(saved?.volume) && saved.volume >= 0 && saved.volume <= 100) settings.volume = saved.volume;
  } catch {
    // Use the defaults and any older single-stage preferences.
  }
  if (params.get("stages") === "2") settings.twoStage = true;
  sound.value = settings.sound;
  if (!sound.value) sound.value = settings.sound = "beep";
  volume.value = settings.volume;
  settings.volume = volume.valueAsNumber;

  function clockKey() {
    return settings.twoStage ? "two-stage-clock" : "standalone-clock";
  }
  function durationField() {
    return settings.twoStage ? "presentation" : "single";
  }
  function ready() {
    return { stage: "presentation", phase: "ready", deadline: null, remainingMs: settings[durationField()] * 1000 };
  }
  function restore() {
    const saved = temporary(clockKey());
    if (!saved) return ready();
    const stage = settings.twoStage && saved.stage === "questions" ? "questions" : "presentation";
    const deadline = saved.wallDeadline ?? saved.deadline;
    if (saved.phase === "running" && Number.isFinite(deadline) && deadline - now() <= 5999000) {
      return { stage, phase: "running", deadline, remainingMs: 0 };
    }
    if (saved.phase === "paused" && Number.isFinite(saved.remainingMs) && saved.remainingMs > 0 && saved.remainingMs <= 5999000) {
      return { stage, phase: "paused", deadline: null, remainingMs: saved.remainingMs };
    }
    if (saved.phase === "finished") return { stage, phase: "finished", deadline: null, remainingMs: 0,
      questionsAt: stage === "presentation" && settings.twoStage && settings.auto && Number.isFinite(saved.questionsAt) ? saved.questionsAt : null };
    return ready();
  }

  let timer = restore();
  let localTouched = standalone;
  const waiting = () => settings.twoStage && timer.stage === "presentation" && timer.phase === "finished";

  function remember() {
    localTouched = true;
    temporary(clockKey(), timer.phase === "ready" ? null : timer);
  }
  function save() {
    storage("localStorage", settingsKey, JSON.stringify(settings));
  }
  function setFields() {
    const fields = [["standalone", settings[durationField()]], ["questions", settings.questions]];
    for (const [id, seconds] of fields) {
      $(id + "-minutes").value = Math.floor(seconds / 60);
      $(id + "-seconds").value = seconds % 60;
    }
  }
  function paint() {
    const state = follower.state;
    const twoStages = standalone ? settings.twoStage : !!state?.twoStage;
    document.body.dataset.displayMode = standalone ? "standalone" : "follow";
    document.body.dataset.theme = light ? "light" : "dark";
    document.body.classList.toggle("two-stage", twoStages);

    $("display-theme").textContent = t(light ? "darkTheme" : "lightTheme");
    $("display-mode").textContent = t(standalone ? "followProjection" : "standalone");
    $("standalone-stages").hidden = !standalone;
    $("standalone-stages").textContent = t(settings.twoStage ? "enableSingleStage" : "enableTwoStage");
    $("standalone-controls").hidden = !standalone;
    $("standalone-questions").hidden = !settings.twoStage;
    $("standalone-questions").disabled = !settings.twoStage;
    $("standalone-auto").hidden = !settings.twoStage;
    $("standalone-duration-label").textContent = settings.twoStage ? stageName("presentation") : t("defaultDuration");
    $("standalone-set").textContent = t(settings.twoStage ? "saveTimes" : "setTime");

    const group = state?.groups.find(item => item.id === state.current);
    if (fitNames) {
      $("current-name").toggleAttribute("data-placeholder", !group);
      fitNames([group?.name || "N/A", state?.upcoming[0]?.name || "—", state?.upcoming[1]?.name || "—"]);
    } else {
      currentName($("current-name"), group);
      $("first").textContent = state?.upcoming[0]?.name || "—";
      $("second").textContent = state?.upcoming[1]?.name || "—";
    }
    const label = twoStages ? stageName(standalone ? timer.stage : state?.stage) : "";
    $("stage-identification").hidden = !twoStages;
    if ($("active-stage").textContent !== label) $("active-stage").textContent = label;
    const status = standalone ? t(waiting() ? "waitingQuestions" : timer.phase) : phaseLabel(state);
    if ($("phase").textContent !== status) $("phase").textContent = status;

    const running = timer.phase === "running";
    const paused = timer.phase === "paused";
    $("stage-fields").disabled = running || (settings.twoStage && paused);
    $("standalone-start").textContent = t(waiting() ? "startQuestions" : paused ? "resume" : "start");
    $("standalone-start").hidden = running || timer.questionsAt != null;
    $("standalone-start").disabled = timer.phase === "finished" && !waiting();
    $("standalone-pause").hidden = !running;
    $("next-stage").hidden = !standalone || !twoStages || timer.stage === "questions";
    $("next-time").textContent = [Math.floor(settings.questions / 60), settings.questions % 60]
      .map(value => String(value).padStart(2, "0")).join(":");
    follower.paintControls();
  }

  function startQuestions(at) {
    timer = { stage: "questions", phase: "running", deadline: at + settings.questions * 1000,
      remainingMs: settings.questions * 1000 };
  }
  function settle(audible) {
    const timestamp = now();
    const result = settleClock(timer, timestamp, { questionsMs: settings.questions * 1000,
      autoQuestions: settings.twoStage && settings.auto, sound: settings.sound, volume: settings.volume }, audible);
    if (!result) return;
    timer = result.timer;
    remember();
    paint();
    if (audible && result.finishedAt !== null && timestamp - result.finishedAt < 2000) {
      animate();
      audio.play(settings.sound, settings.volume);
    }
  }
  function animate() {
    if (!reducedMotion.matches) {
      $("clock").animate([{ scale: 1 }, { scale: 1.035 }, { scale: 1 }], { duration: 640, easing: "ease-out" });
    }
  }
  function tick() {
    if (standalone) settle(true);
    const current = standalone ? timer : follower.state;
    const clockNow = standalone ? now : follower.serverNow;
    const seconds = paintCountdown(document.body, $("clock"), current, clockNow, light);
    if (!standalone) follower.checkDeadline(seconds);
  }
  function reset() {
    audio.stop();
    timer = ready();
    remember();
    paint();
    tick();
  }
  function pause() {
    if (timer.phase !== "running") return;
    timer.remainingMs = Math.max(1, remainingTime(timer, now));
    timer.phase = "paused";
    timer.deadline = null;
    remember();
  }

  const follower = createProjectionFollower({ audio, enabled: desktopMode !== "standalone", isActive: () => !standalone,
    update() {
      paint();
      tick();
      if (desktopMode === "follow") {
        const { instance, overlay } = follower.state ?? {};
        window.dispatchEvent(new CustomEvent("countdown-overlay-state", { detail: { instance, overlay, connected: follower.connected, client: follower.client } }));
      }
    }, animate });

  setFields();
  $("auto-advance").checked = settings.auto;
  $("standalone-volume-value").value = volume.value + "%";
  $("standalone-duration").onsubmit = event => {
    event.preventDefault();
    if (!standalone || $("stage-fields").disabled) return;
    const main = $("standalone-minutes").valueAsNumber * 60 + $("standalone-seconds").valueAsNumber;
    const questions = $("questions-minutes").valueAsNumber * 60 + $("questions-seconds").valueAsNumber;
    if (!validTime(main) || (settings.twoStage && !validTime(questions))) return notice("invalidTime");
    settings[durationField()] = main;
    if (settings.twoStage) settings.questions = questions;
    save();
    notice();
    reset();
  };
  $("auto-advance").onchange = event => {
    settle(true);
    settings.auto = event.target.checked;
    if (!settings.auto && timer.questionsAt != null) {
      timer.questionsAt = null;
      remember();
      paint();
    }
    save();
  };
  $("standalone-start").onclick = () => {
    if (!standalone || timer.questionsAt != null || (!waiting() && !["ready", "paused"].includes(timer.phase))) return;
    audio.unlock().catch(() => {});
    if (waiting()) startQuestions(now());
    else {
      timer.phase = "running";
      timer.deadline = now() + timer.remainingMs;
    }
    remember();
    paint();
    tick();
  };
  $("standalone-pause").onclick = () => { tick(); pause(); paint(); tick(); };
  $("standalone-reset").onclick = () => { notice(); reset(); };
  sound.onchange = () => { settings.sound = sound.value; save(); };
  volume.oninput = () => {
    settings.volume = volume.valueAsNumber;
    $("standalone-volume-value").value = volume.value + "%";
    save();
  };
  $("standalone-preview").onclick = async () => {
    try {
      await audio.unlock();
      if (standalone) audio.play(settings.sound, settings.volume);
    } catch {
      notice("soundBlocked");
    }
  };
  $("standalone-stages").onclick = () => {
    if (!standalone) return;
    audio.stop();
    settle(false);
    pause();
    settings.twoStage = !settings.twoStage;
    save();
    timer = restore();
    setFields();
    notice();
    settle(false);
    paint();
    tick();
  };
  $("display-mode").onclick = () => {
    if (desktopMode) return;
    audio.stop();
    if (standalone) { settle(false); pause(); }
    standalone = !standalone;
    localTouched ||= standalone;
    if (!forcedFollow) temporary(modeKey, standalone ? "standalone" : "follow");
    if (standalone) settle(false);
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
  window.addEventListener("storage", event => {
    if (event.key !== "countdown-display-theme") return;
    light = event.newValue === "light";
    paint();
    tick();
  });
  $("fullscreen").onclick = async () => {
    try {
      await document.documentElement.requestFullscreen();
      notice();
    } catch {
      notice("fullscreenFailed");
    }
  };

  setupLanguage(() => { paint(); notice($("display-notice").dataset.message); });
  setupTemporaryClear(() => {
    standalone = desktopMode ? desktopMode === "standalone" : directFile && !forcedFollow;
    reset();
    localTouched = false;
    notice("temporaryCleared");
  });
  window.addEventListener("pagehide", () => {
    if (localTouched) remember();
    if (!desktopMode && !forcedFollow && standalone !== directFile) temporary(modeKey, standalone ? "standalone" : "follow");
  });
  if (standalone) settle(false);
  tick();
  setInterval(tick, 100);
})();
