(() => {
  const { $, t, setupLanguage, drawTime, remainingTime, currentName, stageName, phaseLabel, finalPalette, reducedMotion, showNotice,
    isFile, appUrl, storage, temporary, setupTemporaryClear, createTimerAudio } = CountdownUI;
  const settingsKey = "countdown-two-stage-settings";
  const clockKey = "two-stage-clock";
  const modeKey = "two-stage-mode";
  const stages = ["presentation", "questions"];
  const validTime = seconds => Number.isInteger(seconds) && seconds >= 1 && seconds <= 5999;
  const now = Date.now;
  const audio = createTimerAudio();
  const notice = key => showNotice($("display-notice"), key);
  const sound = $("stage-sound");
  const volume = $("stage-volume");
  const directFile = isFile && !window.opener;
  const forcedFollow = !!window.opener || new URLSearchParams(location.search).has("follow") ||
    new URLSearchParams(location.hash.slice(1)).has("speaker");
  const storedMode = !forcedFollow && temporary(modeKey);
  let standalone = !forcedFollow && (storedMode ? storedMode === "standalone" : directFile);
  let light = storage("localStorage", "countdown-display-theme") === "light";
  const settings = { presentation: 300, questions: 120, auto: false, sound: "beep", volume: 70 };
  try {
    const saved = JSON.parse(storage("localStorage", settingsKey));
    for (const stage of stages) if (validTime(saved?.[stage])) settings[stage] = saved[stage];
    settings.auto = saved?.auto === true;
    if ([...sound.options].some(option => option.value === saved?.sound)) settings.sound = saved.sound;
    if (Number.isInteger(saved?.volume) && saved.volume >= 0 && saved.volume <= 100) settings.volume = saved.volume;
  } catch {
    // Fresh preferences are usable if stored data is damaged.
  }

  function ready() {
    return { stage: "presentation", phase: "ready", deadline: null, remainingMs: settings.presentation * 1000 };
  }
  function restore() {
    const saved = temporary(clockKey);
    if (!stages.includes(saved?.stage)) return ready();
    if (saved.phase === "running" && Number.isFinite(saved.deadline) && saved.deadline - now() <= 5999000) {
      return { stage: saved.stage, phase: "running", deadline: saved.deadline, remainingMs: 0 };
    }
    if (saved.phase === "paused" && Number.isFinite(saved.remainingMs) && saved.remainingMs > 0 && saved.remainingMs <= 5999000) {
      return { stage: saved.stage, phase: "paused", deadline: null, remainingMs: saved.remainingMs };
    }
    if (saved.phase === "finished") return { stage: saved.stage, phase: "finished", deadline: null, remainingMs: 0 };
    return ready();
  }
  let timer = restore();
  const waiting = () => timer.stage === "presentation" && timer.phase === "finished";

  function remember() {
    temporary(clockKey, timer.phase === "ready" ? null : timer);
  }
  function save() {
    storage("localStorage", settingsKey, JSON.stringify(settings));
  }
  function paint() {
    document.body.dataset.displayMode = standalone ? "standalone" : "follow";
    document.body.dataset.theme = light ? "light" : "dark";
    $("display-theme").textContent = t(light ? "darkTheme" : "lightTheme");
    $("display-mode").textContent = t(standalone ? "followProjection" : "standalone");
    $("standalone-controls").hidden = !standalone;
    const state = follower.state;
    const group = state?.groups.find(item => item.id === state.current);
    currentName($("current-name"), group);
    $("first").textContent = state?.upcoming[0]?.name || "—";
    $("second").textContent = state?.upcoming[1]?.name || "—";
    const active = stageName(standalone ? timer.stage : state?.stage);
    $("stage-identification").hidden = !standalone && !state?.twoStage;
    if ($("active-stage").textContent !== active) $("active-stage").textContent = active;
    const status = standalone ? t(waiting() ? "waitingQuestions" : timer.phase) : phaseLabel(state);
    if ($("phase").textContent !== status) $("phase").textContent = status;
    const running = timer.phase === "running";
    const paused = timer.phase === "paused";
    $("stage-fields").disabled = running || paused;
    $("stage-start").textContent = t(waiting() ? "startQuestions" : paused ? "resume" : "start");
    $("stage-start").hidden = running || (timer.stage === "questions" && timer.phase === "finished");
    $("stage-pause").hidden = !running;
    $("next-stage").hidden = !standalone || timer.stage === "questions";
    $("next-time").textContent = [Math.floor(settings.questions / 60), settings.questions % 60]
      .map(value => String(value).padStart(2, "0")).join(":");
    follower.paintControls();
  }

  function startQuestions(at) {
    timer = { stage: "questions", phase: "running", deadline: at + settings.questions * 1000,
      remainingMs: settings.questions * 1000 };
  }
  function finish() {
    timer.phase = "finished";
    timer.deadline = null;
    timer.remainingMs = 0;
  }
  function settle(audible) {
    if (timer.deadline === null) return;
    const currentTime = now();
    if (currentTime < timer.deadline) return;
    const endedAt = timer.deadline;
    if (timer.stage === "presentation" && settings.auto) {
      startQuestions(endedAt);
      if (currentTime >= timer.deadline) finish();
    } else {
      finish();
    }
    remember();
    paint();
    if (audible && currentTime - endedAt < 2000) {
      animate();
      audio.play(timer.phase === "running" && settings.sound !== "mute" ? "double" : settings.sound, settings.volume);
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
    const remaining = current ? remainingTime(current, clockNow) : 0;
    const seconds = drawTime(current, clockNow, remaining);
    if (!current) $("timer").textContent = "--:--";
    const final = finalPalette(document.body, current?.phase, remaining, light);
    const warning = !standalone && !final && current?.phase === "running" &&
      seconds > 0 && seconds <= current.settings.warning;
    $("clock").dataset.effect = warning ? current.settings.effect : "off";
    $("clock").dataset.phase = current?.phase || "";
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
    timer.remainingMs = remainingTime(timer, now);
    timer.phase = "paused";
    timer.deadline = null;
    remember();
  }

  const follower = createProjectionFollower({ audio, isActive: () => !standalone,
    update() { paint(); tick(); }, animate });

  for (const stage of stages) {
    $(stage + "-minutes").value = Math.floor(settings[stage] / 60);
    $(stage + "-seconds").value = settings[stage] % 60;
  }
  if (!isFile) $("single-stage").href = appUrl("display");
  $("auto-advance").checked = settings.auto;
  sound.value = settings.sound;
  volume.value = settings.volume;
  $("stage-volume-value").value = settings.volume + "%";

  $("stage-times").onsubmit = event => {
    event.preventDefault();
    if (timer.phase === "running" || timer.phase === "paused") return;
    const values = stages.map(stage => $(stage + "-minutes").valueAsNumber * 60 + $(stage + "-seconds").valueAsNumber);
    if (!values.every(validTime)) return notice("invalidTime");
    stages.forEach((stage, index) => { settings[stage] = values[index]; });
    save();
    notice();
    reset();
  };
  $("auto-advance").onchange = event => {
    settle(true);
    settings.auto = event.target.checked;
    save();
  };
  $("stage-start").onclick = () => {
    if (!waiting() && !["ready", "paused"].includes(timer.phase)) return;
    audio.unlock().catch(() => {});
    if (waiting()) {
      startQuestions(now());
    } else {
      timer.phase = "running";
      timer.deadline = now() + timer.remainingMs;
    }
    remember();
    paint();
    tick();
  };
  $("stage-pause").onclick = () => {
    tick();
    pause();
    paint();
    tick();
  };
  $("stage-reset").onclick = () => { notice(); reset(); };
  sound.onchange = () => { settings.sound = sound.value; save(); };
  volume.oninput = () => {
    settings.volume = volume.valueAsNumber;
    $("stage-volume-value").value = settings.volume + "%";
    save();
  };
  $("stage-preview").onclick = async () => {
    try {
      await audio.unlock();
      audio.play(settings.sound, settings.volume);
    } catch {
      notice("soundBlocked");
    }
  };
  $("display-mode").onclick = () => {
    audio.stop();
    if (standalone) { settle(false); pause(); }
    standalone = !standalone;
    if (!forcedFollow) temporary(modeKey, standalone ? "standalone" : "follow");
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
    standalone = directFile && !forcedFollow;
    reset();
    notice("temporaryCleared");
  });
  window.addEventListener("pagehide", remember);
  settle(false);
  tick();
  setInterval(tick, 100);
})();
