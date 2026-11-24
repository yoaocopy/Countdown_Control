(() => {
  const { $, t, setupLanguage, appUrl, isFile, storage, showNotice } = CountdownUI;
  const settingsKey = "countdown-wall-clock";
  const maxSampleAge = 5 * 60 * 1000;
  const cities = {
    beijing: ["Asia/Shanghai", "Beijing", "北京"],
    tokyo: ["Asia/Tokyo", "Tokyo", "东京"],
    singapore: ["Asia/Singapore", "Singapore", "新加坡"],
    delhi: ["Asia/Kolkata", "New Delhi", "新德里"],
    dubai: ["Asia/Dubai", "Dubai", "迪拜"],
    paris: ["Europe/Paris", "Paris", "巴黎"],
    london: ["Europe/London", "London", "伦敦"],
    newYork: ["America/New_York", "New York", "纽约"],
    losAngeles: ["America/Los_Angeles", "Los Angeles", "洛杉矶"],
    saoPaulo: ["America/Sao_Paulo", "São Paulo", "圣保罗"],
    sydney: ["Australia/Sydney", "Sydney", "悉尼"],
    utc: ["UTC", "UTC", "UTC"],
  };
  const modes = ["local", "network", "both"];
  const prefs = { mode: "local", primary: "local", size: 100, cities: ["beijing", "tokyo", "london", "newYork"], server: "" };
  try {
    const saved = JSON.parse(storage("localStorage", settingsKey));
    if (modes.includes(saved?.mode)) prefs.mode = saved.mode;
    if (saved?.primary === "local" || Object.hasOwn(cities, saved?.primary)) prefs.primary = saved.primary;
    if (Number.isInteger(saved?.size) && saved.size >= 60 && saved.size <= 160) prefs.size = saved.size;
    if (Array.isArray(saved?.cities)) prefs.cities = [...new Set(saved.cities.filter(id => Object.hasOwn(cities, id)))];
    if (typeof saved?.server === "string") prefs.server = saved.server;
  } catch {
    // Fresh preferences are usable if stored data is damaged.
  }

  let light = storage("localStorage", "countdown-display-theme") === "light";
  let localZone = computerZone();
  let readings = [];
  let sample = null;
  let status = "";
  let syncing = false;
  let syncAttempt = 0;

  function computerZone() {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }
  function save() {
    storage("localStorage", settingsKey, JSON.stringify(prefs));
  }
  function updateText(node, text) {
    if (node.textContent !== text) node.textContent = text;
  }
  function cityName(id) {
    return cities[id][document.documentElement.lang.startsWith("zh") ? 2 : 1];
  }
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function applySize() {
    $("clock-size-value").value = prefs.size + "%";
    document.body.style.setProperty("--clock-scale", String(prefs.size / 100));
  }
  function renderControls() {
    const primary = $("clock-primary-zone");
    primary.replaceChildren(new Option(t("clockLocalZone"), "local"),
      ...Object.keys(cities).map(id => new Option(cityName(id), id)));
    primary.value = prefs.primary;
    $("clock-source").value = prefs.mode;
    $("clock-size").value = prefs.size;
    $("clock-server").value = prefs.server;
    $("clock-server-label").hidden = !isFile;
    $("clock-city-picker").replaceChildren(...Object.keys(cities).map(id => {
      const label = element("label", "clock-city-choice");
      const box = element("input");
      box.type = "checkbox";
      box.checked = prefs.cities.includes(id);
      box.onchange = () => {
        prefs.cities = box.checked ? [...prefs.cities, id] : prefs.cities.filter(city => city !== id);
        save();
        renderClocks();
      };
      label.append(box, element("span", "", cityName(id)));
      return label;
    }));
    document.body.dataset.theme = light ? "light" : "dark";
    $("display-theme").textContent = t(light ? "darkTheme" : "lightTheme");
    applySize();
  }

  function fillReadings(container, zone, primary) {
    const sources = prefs.mode === "both" ? ["local", "network"] : [prefs.mode];
    container.dataset.sourceCount = sources.length;
    const dateOptions = primary ? { dateStyle: "full" } : { month: "short", day: "numeric" };
    const dateFormat = new Intl.DateTimeFormat(document.documentElement.lang, { timeZone: zone, ...dateOptions });
    const timeFormat = new Intl.DateTimeFormat("en-GB", {
      timeZone: zone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    });
    container.replaceChildren(...sources.map(source => {
      const reading = element("div", "clock-reading");
      if (primary || sources.length > 1) {
        reading.append(element("p", "clock-reading-source", t(source === "local" ? "clockLocal" : "clockNetwork")));
      }
      const time = element("time", "clock-digits", "--:--:--");
      const date = element("p", "clock-date");
      reading.append(time, date);
      readings.push({ source, time, date, format: timeFormat, dateFormat });
      return reading;
    }));
  }
  function renderClocks() {
    readings = [];
    const zone = prefs.primary === "local" ? localZone : cities[prefs.primary][0];
    const name = prefs.primary === "local" ? t("clockLocalZone") : cityName(prefs.primary);
    $("primary-zone-name").textContent = name;
    $("primary-zone-id").textContent = zone;
    $("primary-zone-id").hidden = name === zone;
    fillReadings($("primary-readings"), zone, true);
    const secondary = Object.keys(cities).filter(id => prefs.cities.includes(id) && cities[id][0] !== zone);
    $("clock-city-section").hidden = secondary.length === 0;
    $("city-readings").replaceChildren(...secondary.map(id => {
      const article = element("article", "clock-city-card");
      const times = element("div", "clock-readings");
      article.append(element("h3", "", cityName(id)), times);
      fillReadings(times, cities[id][0], false);
      return article;
    }));
    $("clock-network-form").hidden = prefs.mode === "local";
    $("clock-sync-status").hidden = prefs.mode === "local";
    tick();
  }

  function usableSample() {
    return sample && performance.now() - sample.at < maxSampleAge;
  }
  function paintStatus() {
    const key = status === "failed" ? (usableSample() ? "clockStale" : "clockUnavailable") :
      status === "clockSynced" && !usableSample() ? "clockUnavailable" : status;
    updateText($("clock-sync-status"), prefs.mode !== "local" && key ? t(key) : "");
    $("clock-sync").disabled = syncing;
  }
  function tick() {
    const local = Date.now();
    const elapsed = performance.now();
    const network = usableSample() ? sample.epochMs + elapsed - sample.at : null;
    for (const { source, time, date, format, dateFormat } of readings) {
      const value = source === "local" ? local : network;
      updateText(time, value === null ? "--:--:--" : format.format(value));
      updateText(date, value === null ? "" : dateFormat.format(value));
    }
    paintStatus();
  }

  function endpoint() {
    if (!isFile) return appUrl("api/time");
    if (!prefs.server) return null;
    const address = new URL(prefs.server);
    if (!["https:", "http:"].includes(address.protocol) || address.username ||
        address.password || address.search || address.hash) throw new Error("Invalid server address");
    if (!address.pathname.endsWith("/")) address.pathname += "/";
    return new URL("api/time", address);
  }
  async function sync() {
    if (prefs.mode === "local" || syncing) return;
    let url;
    try {
      url = endpoint();
    } catch {
      status = "clockInvalidServer";
      paintStatus();
      return;
    }
    if (!url) {
      status = "clockEnterServer";
      paintStatus();
      return;
    }
    const attempt = ++syncAttempt;
    syncing = true;
    status = "clockSyncing";
    paintStatus();
    let best = null;
    try {
      // Use the lowest-latency sample and advance it with the browser's monotonic clock.
      for (let index = 0; index < 3 && attempt === syncAttempt; index++) {
        const started = performance.now();
        const response = await fetch(url, { cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(2500) });
        if (!response.ok) break;
        const { epochMs } = await response.json();
        const ended = performance.now();
        if (!Number.isSafeInteger(epochMs) || epochMs < 0 || epochMs >= 8.64e15 - maxSampleAge) break;
        const latency = ended - started;
        if (!best || latency < best.latency) best = { epochMs, latency, at: (started + ended) / 2 };
      }
    } catch {
      // A prior successful sample stays available briefly if the server disappears.
    }
    if (attempt !== syncAttempt) return;
    syncing = false;
    status = best ? "clockSynced" : "failed";
    if (best) sample = best;
    tick();
  }
  function resetSync() {
    syncAttempt++;
    syncing = false;
    status = "";
    sample = null;
  }

  $("clock-source").onchange = event => {
    prefs.mode = event.target.value;
    save();
    resetSync();
    renderClocks();
    sync();
  };
  $("clock-primary-zone").onchange = event => {
    prefs.primary = event.target.value;
    save();
    renderClocks();
  };
  $("clock-size").oninput = event => {
    prefs.size = event.target.valueAsNumber;
    save();
    applySize();
  };
  $("clock-network-form").onsubmit = event => {
    event.preventDefault();
    if (isFile && prefs.server !== $("clock-server").value.trim()) {
      prefs.server = $("clock-server").value.trim();
      save();
      resetSync();
    }
    sync();
  };
  $("display-theme").onclick = () => {
    light = !light;
    document.body.dataset.theme = light ? "light" : "dark";
    $("display-theme").textContent = t(light ? "darkTheme" : "lightTheme");
    storage("localStorage", "countdown-display-theme", light ? "light" : "dark");
  };
  $("fullscreen").onclick = async () => {
    try {
      await document.documentElement.requestFullscreen();
      showNotice($("clock-notice"));
    } catch {
      showNotice($("clock-notice"), "fullscreenFailed");
    }
  };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    const nextZone = computerZone();
    if (localZone !== nextZone) {
      localZone = nextZone;
      renderClocks();
    }
    sync();
  });
  setupLanguage(() => {
    renderControls();
    renderClocks();
    showNotice($("clock-notice"), $("clock-notice").dataset.message);
  });
  sync();
  setInterval(tick, 250);
  setInterval(sync, 60 * 1000);
})();
