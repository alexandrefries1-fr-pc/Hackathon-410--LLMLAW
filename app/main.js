// Processus principal Electron : fenêtre, protocole app:// local, garde réseau, coffre chiffré, pont vers le LLM.
// Le renderer n'a accès à aucun réseau. Côté main, deux destinations seulement sont autorisées :
// Ollama sur 127.0.0.1 (agents en local) et api.mistral.ai (agents en cloud, choisi dans les réglages).

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
const MISTRAL_API = 'https://api.mistral.ai';
function assertMistral(url) {
  if (new URL(url).hostname !== 'api.mistral.ai') throw new Error('Network call refused: only api.mistral.ai is allowed in cloud mode.');
}
const cloudStats = { calls: 0, lastCall: null };

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
    // Always streamed from Ollama: a non-streamed answer longer than 300 s (a document read by a 3B model on CPU)
    // would hit Node's fetch headers timeout. Chunks are forwarded to the renderer only when it asked for streaming.
    const body = { model: req.model, messages: req.messages, stream: true, options: { temperature: 0.1, num_ctx: 8192, ...(req.options || {}) }, keep_alive: '30m' };
    if (req.format) body.format = req.format;
    const res = await lfetch(`${OLLAMA}/api/chat`, { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`Ollama ${res.status} : ${await res.text()}`);
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
        if (j.error) throw new Error(`Ollama: ${j.error}`);
        const piece = j.message?.content ?? '';
        full += piece;
        if (piece && req.stream) e.sender.send('llm:chunk', { id: req.id, content: piece });
        if (j.done) meta = { evalCount: j.eval_count };
      }
    }
    return { content: full, ms: Date.now() - t0, model: req.model, ...meta };
  } finally {
    aborts.delete(req.id);
  }
});
ipcMain.handle('llm:abort', (_e, id) => { aborts.get(id)?.abort(); return true; });

// ------------------------------------------------------------------ Settings and cloud agents (Mistral API)
// Settings are sealed (AES-256-GCM, key protected by the OS). The API key never reaches the renderer.
const SETTINGS_DEFAULT = { agentsBackend: 'cloud', cloudModel: 'mistral-large-latest' };
const settingsFile = () => path.join(app.getPath('userData'), 'settings.enc');
function readSettings() {
  try { return { ...SETTINGS_DEFAULT, ...JSON.parse(readSealed(settingsFile()).toString('utf8')) }; } catch { return { ...SETTINGS_DEFAULT }; }
}
function apiKey() { return readSettings().mistralApiKey || process.env.MISTRAL_API_KEY || ''; }
function publicSettings() {
  const s = readSettings();
  const k = apiKey();
  return { agentsBackend: s.agentsBackend, cloudModel: s.cloudModel, hasKey: !!k, keyHint: k ? `…${k.slice(-4)}` : '', keyFromEnv: !s.mistralApiKey && !!process.env.MISTRAL_API_KEY, cloud: cloudStats };
}
ipcMain.handle('settings:get', () => publicSettings());
ipcMain.handle('settings:set', (_e, patch) => {
  const s = readSettings();
  if (patch.agentsBackend && ['cloud', 'local'].includes(patch.agentsBackend)) s.agentsBackend = patch.agentsBackend;
  if (patch.cloudModel) { s.cloudModel = String(patch.cloudModel).slice(0, 80); delete s.cloudModelWanted; blockedModels.delete(s.cloudModel); }
  if (typeof patch.apiKey === 'string') { if (patch.apiKey.trim()) s.mistralApiKey = patch.apiKey.trim(); else delete s.mistralApiKey; }
  writeSealed(settingsFile(), JSON.stringify(s));
  return publicSettings();
});
async function mistralFetch(pathname, init = {}) {
  const url = `${MISTRAL_API}${pathname}`;
  assertMistral(url);
  const key = apiKey();
  if (!key) throw new Error('No Mistral API key configured (Settings).');
  return globalThis.fetch(url, { ...init, headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...(init.headers || {}) } });
}
// Models tried in this order when the chosen one is not included in the account's plan (403 tier_not_allowed)
const CLOUD_FALLBACK = ['mistral-medium-latest', 'mistral-small-latest', 'ministral-8b-latest', 'open-mistral-nemo'];
const blockedModels = new Set();
// Rate limit (free plan ~1 request/s): after a 429 the calls are spaced out and retried
let cloudGap = 0, cloudNext = 0;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function mistralChat(body) {
  for (let attempt = 0; ; attempt++) {
    const slot = Math.max(Date.now(), cloudNext);
    cloudNext = slot + cloudGap;
    if (slot > Date.now()) await wait(slot - Date.now());
    const r = await mistralFetch('/v1/chat/completions', { method: 'POST', body: JSON.stringify(body) });
    if ((r.status === 429 || r.status >= 500) && attempt < 6) {
      cloudGap = Math.max(cloudGap, 1200);
      const ra = Number(r.headers.get('retry-after'));
      await wait(ra > 0 ? ra * 1000 : 1500 * 2 ** Math.min(attempt, 3));
      continue;
    }
    return r;
  }
}
const tierBlocked = (status, text) => status === 403 && /tier|subscription|not available/i.test(text);
// One chat call with the chosen model, falling back to a model of the plan if needed (the working model is saved)
// The model chosen by the user is retried first after a fallback (e.g. once the plan has been upgraded).
async function chatWithFallback(req) {
  const preferred = readSettings().cloudModelWanted;
  const wanted = req.model || readSettings().cloudModel;
  const all = [preferred, wanted, ...CLOUD_FALLBACK].filter((m, i, a) => m && a.indexOf(m) === i);
  const open = all.filter((m) => !blockedModels.has(m));
  const candidates = open.length ? open : all;
  let lastErr = '';
  for (const model of candidates) {
    const body = { model, messages: req.messages, temperature: 0.1, max_tokens: Math.min(16000, req.maxTokens || 2500) };
    if (req.format) body.response_format = { type: 'json_schema', json_schema: { name: 'lccc_output', schema: req.format, strict: false } };
    let r = await mistralChat(body);
    if (r.status === 400 && req.format) { body.response_format = { type: 'json_object' }; r = await mistralChat(body); }
    if (r.ok) {
      const s = readSettings();
      if (model !== s.cloudModel || (s.cloudModelWanted && model === s.cloudModelWanted)) {
        if (model === s.cloudModelWanted) delete s.cloudModelWanted;
        else if (!s.cloudModelWanted) s.cloudModelWanted = s.cloudModel;
        s.cloudModel = model;
        writeSealed(settingsFile(), JSON.stringify(s));
      }
      return { r, model, switchedFrom: model !== wanted ? wanted : null };
    }
    const text = (await r.text()).slice(0, 200);
    lastErr = `Mistral API ${r.status}: ${text}`;
    if (tierBlocked(r.status, text) || r.status === 404) { blockedModels.add(model); continue; }
    throw new Error(lastErr);
  }
  throw new Error(`${lastErr} (no model of your Mistral plan accepted the request)`);
}
ipcMain.handle('cloud:test', async () => {
  try {
    const r = await mistralFetch('/v1/models');
    if (!r.ok) return { ok: false, error: `Mistral API ${r.status}${r.status === 401 ? ' (invalid key)' : ''}` };
    const j = await r.json();
    const models = (j.data || []).map((m) => m.id).filter((id) => /mistral|ministral|magistral/.test(id)).slice(0, 40);
    // a 1-token call checks that the chosen model is included in the plan
    const c = await chatWithFallback({ messages: [{ role: 'user', content: 'ok' }], maxTokens: 1 });
    return { ok: true, models, model: c.model, switchedFrom: c.switchedFrom };
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
});
ipcMain.handle('cloud:chat', async (_e, req) => {
  const t0 = Date.now();
  const { r, model, switchedFrom } = await chatWithFallback(req);
  const j = await r.json();
  cloudStats.calls++; cloudStats.lastCall = new Date().toISOString();
  return { content: j.choices?.[0]?.message?.content ?? '', finish: j.choices?.[0]?.finish_reason || null, ms: Date.now() - t0, model, switchedFrom, usage: j.usage || null };
});

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
