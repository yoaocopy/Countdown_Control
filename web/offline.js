const OfflineCountdown = (() => {
  const { isFile, appUrl, storage, restoreClock, rememberClock, temporary } = CountdownUI;
  const key = "countdown-offline-configuration";
  const namespace = "project-demo-countdown";
  const target = isFile ? "*" : location.origin;
  const defaults = { duration: 300, warning: 30, effect: "color", sound: "beep", volume: 70,
    twoStage: false, questionsDuration: 120, autoAdvance: false };
  const sounds = ["beep", "double", "tone", "chime", "bell", "mute"];
  const now = () => Date.now();
  const identifier = () => Array.from(crypto.getRandomValues(new Uint32Array(4)), number =>
    number.toString(16).padStart(8, "0")).join("");
  const correctOrigin = event => event.origin === (isFile ? "null" : location.origin);

  function check(condition, error = "invalid") {
    if (!condition) throw { error };
  }
  function settings(value) {
    const { duration, warning, effect, sound, volume = defaults.volume, twoStage = defaults.twoStage,
      questionsDuration = defaults.questionsDuration, autoAdvance = defaults.autoAdvance } = value || {};
    check(Number.isInteger(duration) && duration >= 1 && duration <= 5999);
    check(Number.isInteger(warning) && warning >= 0 && warning <= 5999);
    check(["off", "color", "pulse"].includes(effect) && sounds.includes(sound));
    check(Number.isInteger(volume) && volume >= 0 && volume <= 100);
    check(typeof twoStage === "boolean" && typeof autoAdvance === "boolean");
    check(Number.isInteger(questionsDuration) && questionsDuration >= 1 && questionsDuration <= 5999);
    return { duration, warning, effect, sound, volume, twoStage, questionsDuration, autoAdvance };
  }
  function name(raw) {
    check(typeof raw === "string");
    const value = raw.trim();
    check(value && [...value].length <= 120 && !/[\u0000-\u001f\ud800-\udfff]/u.test(value));
    return value;
  }
  function configuration(value) {
    check(value?.version === 1 && Array.isArray(value.groups) && value.groups.length <= 200);
    const ids = new Set();
    const groups = value.groups.map(group => {
      check(typeof group?.id === "string" && /^[a-zA-Z0-9]{1,64}$/.test(group.id) && !ids.has(group.id));
      ids.add(group.id);
      return { id: group.id, name: name(group.name) };
    });
    check(groups.length ? ids.has(value.current) : value.current === null);
    return { version: 1, groups, current: value.current, settings: settings(value.settings) };
  }

  function send(windowRef, kind, data) {
    windowRef.postMessage({ namespace, kind, data }, target);
  }

  function create(seed, onStorageFailure) {
    let config;
    try {
      const saved = storage("localStorage", key);
      if (saved) config = configuration(JSON.parse(saved));
    } catch {
      // A damaged local backup can be replaced from the console.
    }
    config ??= seed ? configuration(seed) : { version: 1, groups: [], current: null, settings: defaults };
    let revision = 0;
    const restored = restoreClock("offline-clock", config.settings.duration * 1000, now, config.current);
    let phase = restored.phase;
    let remaining = restored.remainingMs;
    let deadline = restored.deadline;
    const saved = phase !== "ready" && temporary("offline-clock");
    let stage = saved?.stage === "questions" ? "questions" : "presentation";
    let plan = planFor(config.settings);
    if (typeof saved?.plan?.twoStage === "boolean" && typeof saved.plan.autoAdvance === "boolean" &&
        Number.isInteger(saved.plan.questionsMs) && saved.plan.questionsMs >= 1000 && saved.plan.questionsMs <= 5999000) {
      plan = saved.plan;
    }
    if (saved?.phase === "running" && phase === "finished" && waitingQuestions() && plan.autoAdvance) {
      startQuestions(saved.wallDeadline);
      if (now() >= deadline) finish();
    }
    const instance = identifier();
    const listeners = new Set();
    const clients = new Map();

    function planFor(value) {
      return { twoStage: value.twoStage, questionsMs: value.questionsDuration * 1000, autoAdvance: value.autoAdvance };
    }
    function waitingQuestions() {
      return plan.twoStage && stage === "presentation" && phase === "finished";
    }
    function startQuestions(at) {
      stage = "questions";
      phase = "running";
      remaining = plan.questionsMs;
      deadline = at + remaining;
    }
    function finish() {
      deadline = null;
      remaining = 0;
      phase = "finished";
    }
    function resetClock(value) {
      phase = "ready";
      remaining = value.duration * 1000;
      deadline = null;
      stage = "presentation";
      plan = planFor(value);
    }
    function snapshot() {
      const index = config.groups.findIndex(group => group.id === config.current);
      const serverNow = now();
      return { ...config, instance, mode: "local", revision, serverNow, phase, deadline,
        twoStage: plan.twoStage, stage, waitingQuestions: waitingQuestions(),
        remainingMs: deadline === null ? remaining : Math.max(0, deadline - serverNow),
        upcoming: index < 0 ? [] : config.groups.slice(index + 1, index + 3) };
    }
    function publish(kind, data) {
      for (const [child, client] of clients) {
        if (child.closed) {
          clients.delete(child);
        } else if (client) send(child, kind, data);
      }
    }
    function stateChanged() {
      const state = snapshot();
      remember();
      listeners.forEach(listener => listener.onState(state));
      publish("state", state);
    }
    function remember() {
      rememberClock("offline-clock", { phase, remainingMs: remaining, deadline }, now, config.current, { stage, plan });
    }
    window.addEventListener("pagehide", remember);
    function audio(sound, volume = config.settings.volume, issued = now()) {
      const event = { sound, volume, issued };
      publish("audio", event);
      listeners.forEach(listener => listener.onAudio?.(event));
    }
    function settle() {
      const timestamp = now();
      if (deadline === null || timestamp < deadline) return;
      let finishedAt = deadline;
      finish();
      if (waitingQuestions() && plan.autoAdvance) {
        startQuestions(finishedAt);
        if (timestamp >= deadline) {
          finishedAt = deadline;
          finish();
        }
      }
      revision++;
      stateChanged();
      if (timestamp - finishedAt < 2000) {
        const transition = phase === "running";
        publish("finish", { deadline: finishedAt, transition });
        const { sound, volume } = config.settings;
        if (sound !== "mute" && volume > 0) audio(transition ? "double" : sound, volume, finishedAt);
      }
    }
    setInterval(settle, 150);
    document.addEventListener("visibilitychange", settle);

    function save() {
      if (!storage("localStorage", key, JSON.stringify(config))) onStorageFailure();
    }
    save();

    function command(body) {
      check(body.revision === revision, "stale");
      const { action, id, before, confirmed } = body;
      const next = structuredClone(config);
      const index = next.groups.findIndex(group => group.id === id);
      let reset = false;
      switch (action) {
        case "add": {
          check(next.groups.length + body.names.length <= 200, "groupLimit");
          check(body.names.length > 0);
          next.groups.push(...body.names.map(value => ({ id: identifier(), name: name(value) })));
          if (next.current === null) { next.current = next.groups[0].id; reset = phase === "ready"; }
          break;
        }
        case "select":
          check(index >= 0);
          reset = next.current !== id;
          next.current = id;
          break;
        case "rename":
          check(index >= 0);
          next.groups[index].name = name(body.name);
          break;
        case "remove":
          check(index >= 0);
          next.groups.splice(index, 1);
          if (id === next.current) {
            next.current = next.groups[Math.min(index, next.groups.length - 1)]?.id ?? null;
            reset = true;
          }
          break;
        case "move": {
          check(index >= 0);
          if (before === id) return snapshot();
          const [group] = next.groups.splice(index, 1);
          const destination = before === null ? next.groups.length : next.groups.findIndex(item => item.id === before);
          check(destination >= 0);
          next.groups.splice(destination, 0, group);
          break;
        }
        case "editQueue": {
          const byId = new Map(next.groups.map(group => [group.id, group]));
          const { order, removed } = body;
          check(Array.isArray(order) && new Set(order).size === byId.size && order.length === byId.size);
          check(Array.isArray(removed) && new Set(removed).size === removed.length);
          check([...order, ...removed].every(item => byId.has(item)));
          const removedIds = new Set(removed);
          const kept = order.filter(item => !removedIds.has(item));
          next.groups = kept.map(item => byId.get(item));
          if (removedIds.has(next.current)) {
            next.current = order.slice(order.indexOf(next.current) + 1).find(item => !removedIds.has(item)) ?? kept.at(-1) ?? null;
            reset = true;
          }
          break;
        }
        case "next": {
          const following = snapshot().upcoming[0];
          check(following, "noNext");
          next.current = following.id;
          reset = true;
          break;
        }
        case "settings":
          next.settings = settings(body.settings);
          reset = phase === "ready";
          break;
        case "import":
          Object.assign(next, configuration(body.configuration));
          reset = true;
          break;
        case "reset":
          reset = true;
          break;
        case "questions":
          check(waitingQuestions(), "unavailable");
          startQuestions(now());
          break;
        case "start":
        case "resume":
          check(phase === (action === "start" ? "ready" : "paused"), "unavailable");
          phase = "running";
          deadline = now() + remaining;
          break;
        case "pause":
          check(phase === "running", "unavailable");
          remaining = Math.max(1, deadline - now());
          deadline = null;
          phase = "paused";
          break;
        default:
          check(false);
      }
      if (reset) {
        check((!["running", "paused"].includes(phase) && !waitingQuestions()) || confirmed, "confirmRequired");
        resetClock(next.settings);
      }
      if (JSON.stringify(next) !== JSON.stringify(config)) {
        config = next;
        save();
      }
      revision++;
      stateChanged();
      return snapshot();
    }

    window.addEventListener("message", event => {
      const child = event.source;
      const { namespace: channel, kind, data } = event.data || {};
      if (channel !== namespace || !correctOrigin(event)) return;
      if (!clients.has(child) && (kind !== "hello" || child?.opener !== window)) return;
      settle();
      if (kind === "hello") {
        const client = identifier();
        clients.set(child, client);
        send(child, "welcome", { client, state: snapshot() });
      } else if (kind === "ping") {
        send(child, "heartbeat");
      }
    });
    setInterval(() => publish("heartbeat"), 2000);

    return {
      clearClock() {
        resetClock(config.settings);
        revision++;
        stateChanged();
      },
      connect(callbacks) {
        listeners.add(callbacks);
        queueMicrotask(() => {
          if (!listeners.has(callbacks)) return;
          settle();
          callbacks.onState(snapshot());
          callbacks.onConnection(true);
        });
        return { update() {}, serverNow: now, close: () => listeners.delete(callbacks) };
      },
      projectionUrl(twoStage = false) {
        const page = twoStage ? "two-stage" : "display";
        const url = appUrl(page + (isFile ? ".html" : ""));
        url.searchParams.set("mode", "offline");
        return url.href;
      },
      openProjection(url) {
        const child = window.open(url, "_blank");
        if (child) clients.set(child, null);
        return !!child;
      },
      async post(path, body) {
        settle();
        if (path === "command") {
          try {
            return command(body);
          } catch (failure) {
            throw { error: failure.error || "unexpected", state: snapshot() };
          }
        }
        if (path === "preview") {
          check([...clients].some(([child, client]) => client && !child.closed), "projectionMissing");
          check(sounds.includes(body.sound));
          const volume = body.volume === undefined ? config.settings.volume : body.volume;
          check(Number.isInteger(volume) && volume >= 0 && volume <= 100);
          audio(body.sound, volume);
          return {};
        }
        throw { error: "invalid" };
      },
    };
  }

  function projection(callbacks) {
    const parent = window.opener;
    let lastContact = 0;
    let online = false;
    function requestConnection() {
      if (!parent || parent.closed) {
        if (online) { online = false; callbacks.onConnection(false); }
        return;
      }
      if (now() - lastContact > 8000) {
        if (online) { online = false; callbacks.onConnection(false); }
        send(parent, "hello");
      } else {
        send(parent, "ping");
      }
    }
    window.addEventListener("message", event => {
      const { namespace: channel, kind, data } = event.data || {};
      if (event.source !== parent || !correctOrigin(event) || channel !== namespace) return;
      lastContact = now();
      if (kind === "welcome") {
        online = true;
        callbacks.onState(data.state);
        callbacks.onConnection(true);
      } else if (online) {
        if (kind === "state") callbacks.onState(data);
        if (kind === "finish") callbacks.onFinish(data, now);
        if (kind === "audio") callbacks.onAudio(data, now);
      }
    });
    requestConnection();
    setInterval(requestConnection, 2000);
    return {
      serverNow: now,
      checkDeadline() { if (online && parent && !parent.closed) send(parent, "ping"); },
    };
  }
  return { create, projection };
})();
