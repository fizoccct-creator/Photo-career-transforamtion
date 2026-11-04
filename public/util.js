// Screen orientation decides the photo shape: vertical screens get 3:4 photos, horizontal ones 4:3.
export const getOrientation = () => (innerWidth >= innerHeight ? 'landscape' : 'portrait');
export const ratioFor = (orientation) => (orientation === 'landscape' ? 4 / 3 : 3 / 4);

// Draw a source (video/image) into a centre-cropped canvas of the given aspect ratio
// (longest side max 1536px), optionally mirrored like a selfie.
export function toCroppedDataUrl(src, w, h, mirror, ratio) {
  let sw = w, sh = h;
  if (w / h > ratio) sw = h * ratio; else sh = w / ratio;
  const sx = (w - sw) / 2, sy = (h - sh) / 2;
  const scale = Math.min(1, 1536 / Math.max(sw, sh));
  const outW = Math.round(sw * scale), outH = Math.round(sh * scale);
  const c = document.createElement('canvas');
  c.width = outW; c.height = outH;
  const ctx = c.getContext('2d');
  if (mirror) { ctx.translate(outW, 0); ctx.scale(-1, 1); }
  ctx.drawImage(src, sx, sy, sw, sh, 0, 0, outW, outH);
  return c.toDataURL('image/jpeg', 0.92);
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
