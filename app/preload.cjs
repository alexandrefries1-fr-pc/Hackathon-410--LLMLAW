// Pont minimal et typé entre l'interface (sans accès Node ni réseau) et le processus principal.
const { contextBridge, ipcRenderer } = require('electron');

const listeners = new Map();
ipcRenderer.on('llm:chunk', (_e, msg) => { const f = listeners.get(msg.id); if (f) f(msg.content); });

contextBridge.exposeInMainWorld('lccc', {
  info: () => ipcRenderer.invoke('app:info'),
  netStats: () => ipcRenderer.invoke('net:stats'),
  pickFiles: (folder = false) => ipcRenderer.invoke('files:pick', { folder }),
  demoAvailable: () => ipcRenderer.invoke('demo:available'),
  demoFiles: () => ipcRenderer.invoke('demo:files'),
  cases: {
    list: () => ipcRenderer.invoke('case:list'),
    create: (meta) => ipcRenderer.invoke('case:create', meta),
    saveMeta: (meta) => ipcRenderer.invoke('case:saveMeta', meta),
    save: (id, json) => ipcRenderer.invoke('case:save', id, json),
    load: (id) => ipcRenderer.invoke('case:load', id),
    remove: (id) => ipcRenderer.invoke('case:delete', id),
    putFile: (id, fileId, bytes) => ipcRenderer.invoke('file:put', id, fileId, bytes),
    getFile: (id, fileId) => ipcRenderer.invoke('file:get', id, fileId),
  },
  llm: {
    status: () => ipcRenderer.invoke('llm:status'),
    chat: (req, onChunk) => {
      if (onChunk) listeners.set(req.id, onChunk);
      return ipcRenderer.invoke('llm:chat', req).finally(() => listeners.delete(req.id));
    },
    abort: (id) => ipcRenderer.invoke('llm:abort', id),
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    set: (patch) => ipcRenderer.invoke('settings:set', patch),
  },
  cloud: {
    test: () => ipcRenderer.invoke('cloud:test'),
    chat: (req) => ipcRenderer.invoke('cloud:chat', req),
  },
  exportFile: (opts) => ipcRenderer.invoke('export:save', opts),
  reveal: (p) => ipcRenderer.invoke('app:reveal', p),
  capture: (name) => ipcRenderer.invoke('app:capture', name),
  quit: () => ipcRenderer.invoke('app:quit'),
});
