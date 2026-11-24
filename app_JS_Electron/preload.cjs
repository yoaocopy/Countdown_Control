const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('countdownDesktop', {
  get: () => ipcRenderer.invoke('overlay:get'),
  setWindow: patch => ipcRenderer.invoke('overlay:window', patch),
  setSource: (source, server) => ipcRenderer.invoke('overlay:source', source, server),
  reportFollow: (server, instance, connected, client, appearance) => ipcRenderer.invoke('overlay:follow-state', server, instance, connected, client, appearance),
  drag: (phase, x, y) => ipcRenderer.invoke('overlay:drag', phase, x, y),
  lock: () => ipcRenderer.invoke('overlay:lock'),
  onChange(callback) {
    ipcRenderer.on('overlay:change', (_event, state) => callback(state));
  },
  onTheme(callback) { ipcRenderer.on('overlay:theme', () => callback()); },
});
