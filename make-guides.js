// Writes design guide SVGs into design/ from design/template.json.
// Re-run after changing positions in template.json:  npm run guides
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'design', 'template.json'), 'utf8'));
const occupations = JSON.parse(fs.readFileSync(path.join(ROOT, 'occupations.json'), 'utf8'));

const label = (x, y, text, color, size = 26) =>
  `<text x="${x}" y="${y}" font-family="Segoe UI, Arial" font-size="${size}" font-weight="700" fill="${color}">${text}</text>`;

function frameGuide(o) {
  const f = t.frames[o];
  const p = f.photo, l = f.logo;
  const texts = (f.texts || []).map((tx) =>
    `<line x1="${tx.x - 24}" y1="${tx.y}" x2="${tx.x + 24}" y2="${tx.y}" stroke="#1a9e00" stroke-width="3"/>` +
    `<line x1="${tx.x}" y1="${tx.y - 24}" x2="${tx.x}" y2="${tx.y + 24}" stroke="#1a9e00" stroke-width="3"/>` +
    label(tx.x + 30, tx.y + 9, `text: ${tx.text.replace(/[{}]/g, '')}`, '#1a9e00', 22)).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f.width}" height="${f.height}" viewBox="0 0 ${f.width} ${f.height}">
<rect width="100%" height="100%" fill="#f4f4f4"/>
<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="${p.radius || 0}" fill="#ffd6f3" stroke="#e000a0" stroke-width="4" stroke-dasharray="18 10"/>
${label(p.x + 24, p.y + 50, 'PHOTO AREA: keep this transparent in your frame PNG', '#e000a0', 30)}
${label(p.x + 24, p.y + 90, `${p.w} × ${p.h} px at x ${p.x}, y ${p.y}`, '#e000a0')}
${l ? `<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" fill="none" stroke="#0090c0" stroke-width="4" stroke-dasharray="14 8"/>
${label(l.x + 8, l.y + l.h + 30, `LOGO ${l.w} × ${l.h}`, '#0090c0', 22)}` : ''}
${texts}
${label(20, f.height - 24, `CANVAS ${f.width} × ${f.height} px · ${o === 'portrait' ? 'vertical' : 'horizontal'} frame`, '#555', 26)}
</svg>`;
}

function cardGuide() {
  const W = 750, H = 1000, safe = 50;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" rx="${W * 0.09}" fill="#202959"/>
<rect x="${safe}" y="${safe}" width="${W - safe * 2}" height="${H - safe * 2}" rx="30" fill="none" stroke="#FDD00D" stroke-width="4" stroke-dasharray="16 10"/>
${label(safe + 20, safe + 50, 'SAFE AREA: keep text and icons inside', '#FDD00D', 28)}
${label(safe + 20, H - safe - 60, 'Card: 750 × 1000 px (3:4)', '#FFFFFF', 30)}
${label(safe + 20, H - safe - 20, 'Corners are rounded by the app', '#FFFFFF', 24)}
</svg>`;
}

fs.writeFileSync(path.join(ROOT, 'design', 'frames', 'guide-portrait.svg'), frameGuide('portrait'));
fs.writeFileSync(path.join(ROOT, 'design', 'frames', 'guide-landscape.svg'), frameGuide('landscape'));
fs.writeFileSync(path.join(ROOT, 'design', 'cards', 'guide-card.svg'), cardGuide());
console.log('Guides written to design/frames and design/cards');
console.log('Card file names:', occupations.map((o) => `${o.id}.png`).join(', '));
