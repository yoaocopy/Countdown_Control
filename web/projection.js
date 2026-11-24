function createProjectionFollower({ audio, isActive, update, animate }) {
  const { $, t, connect, isFile, showNotice } = CountdownUI;
  const offline = isFile || new URLSearchParams(location.search).get("mode") === "offline";
  const notice = message => showNotice($("display-notice"), message);
  let state;
  let connected = false;
  let checkedDeadline = null;
  const audible = value => !!value && value.settings.sound !== "mute" && value.settings.volume > 0;

  const service = (offline ? OfflineCountdown.projection : connect)({
    onState(next) {
      if (isActive() && audible(state) && !audible(next)) audio.stop();
      state = next;
      update();
    },
    onConnection(value) { connected = value; update(); },
    onFinish(event, now) {
      if (isActive() && connected && now() - event.deadline < 2000 &&
          (state?.phase === "finished" || event.transition)) animate();
    },
    onAudio(event, now) {
      if (isActive() && connected && now() - event.issued < 2000) audio.play(event.sound, event.volume);
    },
  });

  function paintControls() {
    const hasController = window.opener && !window.opener.closed;
    $("connection").textContent = connected ? "" : t(offline && !hasController ? "localProjectionHelp" : "offline");
    $("connection").hidden = !isActive() || connected;
    const showAudio = isActive() && connected && audible(state);
    if (showAudio) {
      try { audio.prepare(paintControls); } catch { /* Keep the display usable without an audio context. */ }
    }
    $("enable-sound").hidden = !showAudio || audio.ready;
  }

  $("enable-sound").onclick = async () => {
    if (!isActive()) return;
    try {
      await audio.unlock();
      paintControls();
    } catch {
      notice("soundBlocked");
    }
  };
  document.addEventListener("click", event => {
    if (!isActive() || audio.ready || event.target.closest?.("#enable-sound")) return;
    audio.unlock().then(paintControls).catch(() => {});
  }, true);

  return {
    serverNow: service.serverNow, paintControls,
    get state() { return state; },
    checkDeadline(seconds) {
      if (offline && state?.deadline != null && seconds === 0 && state.deadline !== checkedDeadline) {
        checkedDeadline = state.deadline;
        service.checkDeadline();
      }
    },
  };
}
