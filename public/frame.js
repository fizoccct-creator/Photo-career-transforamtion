// Photo frame template: reads design/template.json plus the artwork you dropped into design/
// (found by file name on the server via /api/design) and draws the final downloadable photo.
// Layers, bottom to top:
//   1. background  (your image, or the built-in brand design when "background" is empty)
//   2. AI photo    (fills the "photo" box, centre-cropped)
//   3. overlay     (your PNG with a transparent window over the photo box: frames, stickers, borders)
//   4. logo        (fitted inside the "logo" box)
//   5. texts       (career name, date… with {placeholders})

const imageCache = new Map();
function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (!imageCache.has(src)) {
    imageCache.set(src, new Promise((ok) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => { console.warn(`Template image not found: ${src}`); ok(null); };
      img.src = src;
    }));
  }
  return imageCache.get(src);
}

const brandPath = (p) => p || '';

export async function loadTemplate() {
  imageCache.clear();
  const res = await fetch('/api/design', { cache: 'no-store' });
  if (!res.ok) throw new Error('design/template.json could not be read');
  return res.json();
}

// Push the template colours and images into the page's CSS.
export function applyTheme(t) {
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(t.colors || {})) root.setProperty(`--${name}`, value);
  if (t.font) document.body.style.fontFamily = t.font;
  root.setProperty('--home-bg-image', t.homeBackground ? `url("${brandPath(t.homeBackground)}")` : 'none');
  document.querySelectorAll('[data-brand-name]').forEach((el) => {
    if (t.logo) {
      el.innerHTML = `<img class="home-logo-img" src="${brandPath(t.logo)}" alt="${t.brandName || ''}">`;
    }
  });
}

const colorOf = (t, c) => (t.colors && t.colors[c]) || c || t.colors?.light || '#fff';

function fillText(ctx, t, line, x, y, size, opt) {
  let s = size;
  const font = (px) => `${opt.weight || 700} ${px}px ${opt.font || t.font || 'sans-serif'}`;
  ctx.font = font(s);
  if (opt.maxWidth) {
    while (ctx.measureText(line).width > opt.maxWidth && s > 10) { s -= 2; ctx.font = font(s); }
  }
  ctx.fillText(line, x, y);
}

function drawText(ctx, t, item, vars) {
  if (item.onlyWithoutLogo && t.logo) return;
  const text = item.text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  if (!text.trim()) return;
  ctx.fillStyle = colorOf(t, item.color);
  ctx.textAlign = item.align || 'center';
  ctx.textBaseline = 'middle';
  const size = item.size || 48;
  ctx.font = `${item.weight || 700} ${size}px ${item.font || t.font || 'sans-serif'}`;

  let lines = text.split('\n');
  if (item.wrap && item.maxWidth) {
    lines = lines.flatMap((l) => {
      const out = [];
      let cur = '';
      for (const word of l.split(' ')) {
        const test = cur ? `${cur} ${word}` : word;
        if (cur && ctx.measureText(test).width > item.maxWidth) { out.push(cur); cur = word; } else cur = test;
      }
      return [...out, cur];
    });
  }
  const lh = size * (item.lineHeight || 1.05);
  lines.forEach((l, i) => fillText(ctx, t, l, item.x, item.y + i * lh, size, item));
}

function coverDraw(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / s, sh = h / s;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function containDraw(ctx, img, box) {
  const s = Math.min(box.w / img.naturalWidth, box.h / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  ctx.drawImage(img, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
}

// Built-in brand design, used when the frame has no "background" image.
function drawDefaultBackground(ctx, t, f, orientation) {
  const W = f.width, H = f.height;
  ctx.fillStyle = colorOf(t, 'secondary');
  ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = colorOf(t, 'primary');
  ctx.beginPath();
  if (orientation === 'landscape') {
    ctx.moveTo(W * 0.69, 0); ctx.lineTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(W * 0.615, H);
  } else {
    ctx.moveTo(0, H * 0.765); ctx.lineTo(W, H * 0.73); ctx.lineTo(W, H); ctx.lineTo(0, H);
  }
  ctx.closePath(); ctx.fill();
}

/**
 * Draw the finished photo into `canvas`.
 * photoSrc: image URL/data URL (or null for an empty placeholder), occ: occupation object.
 */
export async function renderFrame(canvas, photoSrc, occ, orientation, t) {
  const f = t.frames?.[orientation] || t.frames?.portrait;
  canvas.width = f.width; canvas.height = f.height;
  const ctx = canvas.getContext('2d');
  const [bg, photo, overlay, logo] = await Promise.all([
    loadImage(brandPath(f.background)), photoSrc ? loadImage(photoSrc) : null,
    loadImage(brandPath(f.overlay)), loadImage(brandPath(t.logo)),
  ]);
  if (photoSrc) imageCache.delete(photoSrc); // don't keep every player's photo around

  // 1. background
  if (bg) coverDraw(ctx, bg, 0, 0, f.width, f.height);
  else drawDefaultBackground(ctx, t, f, orientation);

  // 2. photo
  const p = f.photo;
  ctx.save();
  ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, p.radius || 0); ctx.clip();
  if (photo) coverDraw(ctx, photo, p.x, p.y, p.w, p.h);
  else { ctx.fillStyle = '#888'; ctx.fillRect(p.x, p.y, p.w, p.h); }
  ctx.restore();
  if (p.borderWidth && !overlay) {
    ctx.lineWidth = p.borderWidth; ctx.strokeStyle = colorOf(t, p.borderColor);
    ctx.beginPath(); ctx.roundRect(p.x, p.y, p.w, p.h, p.radius || 0); ctx.stroke();
  }

  // 3. overlay
  if (overlay) ctx.drawImage(overlay, 0, 0, f.width, f.height);

  // 4. logo
  if (logo && f.logo) containDraw(ctx, logo, f.logo);

  // 5. texts
  const vars = {
    career: occ.title, CAREER: occ.title.toUpperCase(), emoji: occ.emoji, tagline: occ.tagline || '',
    brand: t.brandName || '', date: new Date().toLocaleDateString(),
  };
  for (const item of f.texts || []) drawText(ctx, t, item, vars);
}
