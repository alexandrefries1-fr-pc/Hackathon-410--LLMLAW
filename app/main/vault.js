// Coffre local : chiffrement AES-256-GCM des dossiers et des pièces au repos.
// La clé est elle-même protégée par le trousseau du système (DPAPI sous Windows, Keychain sous macOS)
// via safeStorage d'Electron. Rien n'est jamais écrit en clair sur le disque, hors métadonnées techniques.

import { app, safeStorage } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

let KEY = null;
let PROTECTED = false;

export function vaultInfo() {
  key(); // charge (ou crée) la clé pour connaître son mode de protection réel
  return { encrypted: true, keyProtectedByOS: PROTECTED, algorithm: 'AES-256-GCM', dataDir: dataDir() };
}

export function dataDir() {
  return path.join(app.getPath('userData'), 'cases');
}

function key() {
  if (KEY) return KEY;
  const file = path.join(app.getPath('userData'), 'vault.key');
  PROTECTED = safeStorage.isEncryptionAvailable();
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file);
    const kind = raw.subarray(0, 4).toString();
    const body = raw.subarray(4);
    KEY = Buffer.from(kind === 'SAFE' ? safeStorage.decryptString(body) : body.toString(), 'base64');
    PROTECTED = kind === 'SAFE';
  } else {
    KEY = crypto.randomBytes(32);
    const b64 = KEY.toString('base64');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, PROTECTED ? Buffer.concat([Buffer.from('SAFE'), safeStorage.encryptString(b64)]) : Buffer.concat([Buffer.from('RAW_'), Buffer.from(b64)]));
  }
  return KEY;
}

export function seal(buf) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([Buffer.from('LCC1'), iv, c.getAuthTag(), enc]);
}

export function open(buf) {
  if (buf.subarray(0, 4).toString() !== 'LCC1') throw new Error('Format de coffre inconnu');
  const iv = buf.subarray(4, 16), tag = buf.subarray(16, 32), data = buf.subarray(32);
  const d = crypto.createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]);
}

export function writeSealed(file, buf) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, seal(Buffer.isBuffer(buf) ? buf : Buffer.from(buf)));
}

export function readSealed(file) {
  return open(fs.readFileSync(file));
}
