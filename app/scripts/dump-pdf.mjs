// Affiche le texte reconstruit d'un PDF (debug de l'extraction). Usage : node scripts/dump-pdf.mjs <fichier.pdf> [page]
import fs from 'node:fs';
import { loadPdfjs } from './node-pdfjs.mjs';
import { extractPdf } from '../engine/pdftext.js';

const [file, onlyPage] = process.argv.slice(2);
const pdfjs = await loadPdfjs();
const pages = await extractPdf(pdfjs.lib, new Uint8Array(fs.readFileSync(file)), pdfjs.docOptions);
for (const p of pages) {
  if (onlyPage && +onlyPage !== p.n) continue;
  console.log(`===== page ${p.n} =====  margin: ${JSON.stringify(p.margin)}`);
  console.log(p.text);
}
