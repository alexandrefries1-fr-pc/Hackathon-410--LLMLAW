// Processus principal Electron : fenêtre, protocole app:// local, garde réseau, coffre chiffré, pont vers le LLM local.
// Aucune donnée du dossier ne quitte la machine : le renderer n'a accès à aucun réseau,
// et le seul appel réseau autorisé côté main est Ollama sur 127.0.0.1.

import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dataDir, readSealed, vaultInfo, writeSealed } from './main/vault.js';

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEMO_DIR = path.resolve(APP_DIR, '..', 'dossier_fictif', 'pieces');
const OLLAMA = process.env.LCCC_OLLAMA || 'http://127.0.0.1:11434';
const SHOT_DIR = process.env.LCCC_SHOT_DIR || null;

app.setName('LCCC Copilote penal local');
// Les tests automatisés travaillent dans un profil jetable, jamais dans les dossiers de l'utilisateur
if (process.env.LCCC_AUTOTEST) app.setPath('userData', path.join(app.getPath('temp'), 'lccc-autotest-profile'));
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.pfb': 'application/octet-stream', '.bcmap': 'application/octet-stream', '.wasm': 'application/wasm' };

// ------------------------------------------------------------------ Garde réseau
const netStats = { blocked: 0, allowedLocal: 0, lastBlocked: [] };
function isLocalUrl(u) {
  return /^(app|devtools|data|blob|chrome-extension):/.test(u);
}
function assertOllama(url) {
  const h = new URL(url).hostname;
  if (!['127.0.0.1', 'localhost', '::1', '[::1]'].includes(h)) throw new Error('Appel réseau refusé : seul un LLM local (127.0.0.1) est autorisé.');
}

// ------------------------------------------------------------------ Fenêtre
let win;
function createWindow() {
  // En mode test automatisé, rendu hors écran : la fenêtre n'apparaît pas sur le bureau
  const headless = !!process.env.LCCC_AUTOTEST && !!SHOT_DIR;
  win = new BrowserWindow({
    width: 1480, height: 940, minWidth: 1180, minHeight: 720, show: false, backgroundColor: '#f4f5f7', title: 'LCCC · Copilote pénal local',
    webPreferences: { preload: path.join(APP_DIR, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false, offscreen: headless },
  });
  win.setMenuBarVisibility(false);
  if (!headless) win.once('ready-to-show', () => win.show());
  win.loadURL('app://lccc/renderer/index.html');
}

app.whenReady().then(() => {
  protocol.handle('app', async (req) => {
    const u = new URL(req.url);
    const file = path.normalize(path.join(APP_DIR, decodeURIComponent(u.pathname)));
    if (!file.startsWith(APP_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return new Response('Not found', { status: 404 });
    return new Response(fs.readFileSync(file), { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' } });
  });
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => {
    if (isLocalUrl(d.url)) { netStats.allowedLocal++; return cb({}); }
    netStats.blocked++;
    netStats.lastBlocked = [d.url.slice(0, 120), ...netStats.lastBlocked].slice(0, 10);
    cb({ cancel: true });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
  createWindow();
});

app.on('web-contents-created', (_e, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) e.preventDefault(); });
});
app.on('window-all-closed', () => app.quit());

// ------------------------------------------------------------------ Fichiers importés
const KIND = (n) => /\.pdf$/i.test(n) ? 'pdf' : /\.(txt|md)$/i.test(n) ? 'text' : /\.(png|jpe?g|webp)$/i.test(n) ? 'image' : null;
function readImport(p) {
  const kind = KIND(p);
  if (!kind) return null;
  const buf = fs.readFileSync(p);
  return { name: path.basename(p), size: buf.length, kind, data: kind === 'text' ? null : new Uint8Array(buf), text: kind === 'text' ? buf.toString('utf8') : null };
}
function listDir(dir, depth = 1) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory() && depth > 0 && !e.name.startsWith('.')) out.push(...listDir(p, depth - 1));
    else if (e.isFile() && KIND(e.name)) out.push(p);
  }
  return out.sort();
}

ipcMain.handle('files:pick', async (_e, { folder }) => {
  const r = await dialog.showOpenDialog(win, folder
    ? { title: 'Sélectionner le dossier des pièces', properties: ['openDirectory'] }
    : { title: 'Ajouter des pièces', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Pièces', extensions: ['pdf', 'txt', 'md', 'png', 'jpg', 'jpeg'] }] });
  if (r.canceled) return [];
  const paths = folder ? listDir(r.filePaths[0]) : r.filePaths;
  return paths.map(readImport).filter(Boolean);
});
ipcMain.handle('demo:available', () => fs.existsSync(DEMO_DIR));
ipcMain.handle('demo:files', () => (fs.existsSync(DEMO_DIR) ? listDir(DEMO_DIR, 0).map(readImport).filter(Boolean) : []));

// ------------------------------------------------------------------ Dossiers (chiffrés)
const caseDir = (id) => path.join(dataDir(), id.replace(/[^a-zA-Z0-9-]/g, ''));
ipcMain.handle('case:list', () => {
  if (!fs.existsSync(dataDir())) return [];
  const out = [];
  for (const id of fs.readdirSync(dataDir())) {
    try { out.push(JSON.parse(readSealed(path.join(caseDir(id), 'meta.enc')).toString('utf8'))); } catch { /* dossier illisible */ }
  }
  return out.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
});
ipcMain.handle('case:create', (_e, meta) => {
  const id = `C-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  const m = { ...meta, id, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  writeSealed(path.join(caseDir(id), 'meta.enc'), JSON.stringify(m));
  return m;
});
ipcMain.handle('case:saveMeta', (_e, meta) => { writeSealed(path.join(caseDir(meta.id), 'meta.enc'), JSON.stringify({ ...meta, updatedAt: new Date().toISOString() })); return true; });
ipcMain.handle('case:save', (_e, id, json) => { writeSealed(path.join(caseDir(id), 'case.enc'), json); return true; });
ipcMain.handle('case:load', (_e, id) => {
  const f = path.join(caseDir(id), 'case.enc');
  return fs.existsSync(f) ? readSealed(f).toString('utf8') : null;
});
ipcMain.handle('case:delete', (_e, id) => { fs.rmSync(caseDir(id), { recursive: true, force: true }); return true; });
ipcMain.handle('file:put', (_e, id, fileId, bytes) => { writeSealed(path.join(caseDir(id), 'files', `${fileId}.enc`), Buffer.from(bytes)); return true; });
ipcMain.handle('file:get', (_e, id, fileId) => {
  const f = path.join(caseDir(id), 'files', `${fileId}.enc`);
  return fs.existsSync(f) ? new Uint8Array(readSealed(f)) : null;
});

// ------------------------------------------------------------------ LLM local (Ollama)
// fetch de Node (hors pile réseau Chromium) : la garde réseau de la session reste stricte pour l'interface,
// et assertOllama() garantit que seul 127.0.0.1 est joignable d'ici.
const aborts = new Map();
const lfetch = (url, opts) => { assertOllama(url); return globalThis.fetch(url, opts); };
ipcMain.handle('llm:status', async () => {
  try {
    assertOllama(OLLAMA);
    const v = await (await lfetch(`${OLLAMA}/api/version`)).json();
    const t = await (await lfetch(`${OLLAMA}/api/tags`)).json();
    return { ok: true, url: OLLAMA, version: v.version, models: (t.models || []).map((m) => ({ name: m.name, size: m.size, family: m.details?.family, params: m.details?.parameter_size, quant: m.details?.quantization_level })) };
  } catch (e) {
    return { ok: false, url: OLLAMA, error: String(e.message || e) };
  }
});
ipcMain.handle('llm:chat', async (e, req) => {
  assertOllama(OLLAMA);
  const ctrl = new AbortController();
  aborts.set(req.id, ctrl);
  const t0 = Date.now();
  try {
    const body = { model: req.model, messages: req.messages, stream: !!req.stream, options: { temperature: 0.1, num_ctx: 8192, ...(req.options || {}) }, keep_alive: '30m' };
    if (req.format) body.format = req.format;
    const res = await lfetch(`${OLLAMA}/api/chat`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Ollama ${res.status} : ${await res.text()}`);
    if (!req.stream) {
      const j = await res.json();
      return { content: j.message?.content ?? '', ms: Date.now() - t0, evalCount: j.eval_count, model: req.model };
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '', full = '', meta = {};
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        const j = JSON.parse(line);
        const piece = j.message?.content ?? '';
        full += piece;
        if (piece) e.sender.send('llm:chunk', { id: req.id, content: piece });
        if (j.done) meta = { evalCount: j.eval_count };
      }
    }
    return { content: full, ms: Date.now() - t0, model: req.model, ...meta };
  } finally {
    aborts.delete(req.id);
  }
});
ipcMain.handle('llm:abort', (_e, id) => { aborts.get(id)?.abort(); return true; });

// ------------------------------------------------------------------ Divers
ipcMain.handle('app:info', () => ({
  version: app.getVersion(), electron: process.versions.electron, platform: process.platform, vault: vaultInfo(), net: netStats, ollama: OLLAMA,
  demoDir: fs.existsSync(DEMO_DIR) ? DEMO_DIR : null, autotest: process.env.LCCC_AUTOTEST || null, refDate: process.env.LCCC_REFDATE || null,
}));
ipcMain.handle('net:stats', () => netStats);
ipcMain.handle('export:save', async (_e, { defaultName, content, ext }) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: defaultName, filters: [{ name: ext.toUpperCase(), extensions: [ext] }] });
  if (r.canceled || !r.filePath) return null;
  fs.writeFileSync(r.filePath, content, 'utf8');
  return r.filePath;
});
ipcMain.handle('app:reveal', (_e, p) => { if (p) shell.showItemInFolder(p); return true; });
ipcMain.handle('app:capture', async (_e, name) => {
  if (!SHOT_DIR) return null;
  const img = await win.webContents.capturePage();
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const f = path.join(SHOT_DIR, `${name}.png`);
  fs.writeFileSync(f, img.toPNG());
  return f;
});
ipcMain.handle('app:quit', () => { setTimeout(() => app.quit(), 200); return true; });
void pathToFileURL;
