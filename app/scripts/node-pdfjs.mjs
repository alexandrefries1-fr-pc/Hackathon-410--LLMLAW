// Charge pdf.js (build "legacy") sous Node pour les tests et le pré-calcul hors Electron.
// Les dépendances npm sont installées hors OneDrive (voir setup_windows.ps1) : LCCC_DEPS ou %LOCALAPPDATA%\LLMLAW\deps.
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

function depsDir() {
  const candidates = [
    process.env.LCCC_DEPS,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'LLMLAW', 'deps'),
    path.resolve(import.meta.dirname, '..'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'node_modules', 'pdfjs-dist'))) return c;
  }
  throw new Error('pdfjs-dist introuvable : lancez setup_windows.ps1 ou npm install dans app/.');
}

export async function loadPdfjs() {
  const root = path.join(depsDir(), 'node_modules', 'pdfjs-dist');
  const base = path.join(root, 'legacy', 'build');
  const pdfjs = await import(pathToFileURL(path.join(base, 'pdf.mjs')).href);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(base, 'pdf.worker.mjs')).href;
  // docOptions : à passer à getDocument (polices standard, évite un avertissement)
  return { lib: pdfjs, docOptions: { standardFontDataUrl: path.join(root, 'standard_fonts').replace(/\\/g, '/') + '/' } };
}
