// QR download: stores each finished photo plus a small download page, and returns a link for the QR code.
//
//   SHARE_STORAGE=s3     online storage (Cloudflare R2, Amazon S3, Backblaze B2, …): works on any phone, anywhere
//   SHARE_STORAGE=local  this computer: phones must be on the same Wi-Fi (handy for testing)
//
// Every link has a long random id that can't be guessed. Photos expire after SHARE_TTL_HOURS
// (local: deleted by this server; online: set a lifecycle rule on the bucket, see SHARING.md).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const env = (k, d = '') => (process.env[k] ?? d).trim();
const MODE = () => env('SHARE_STORAGE', 'local').toLowerCase();
const TTL_HOURS = () => Number(env('SHARE_TTL_HOURS', '24')) || 24;

// ---------- Download page (what players see on their phone) ----------
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function downloadPage({ imageUrl, fileName, title, brand, colors, expiresAt }) {
  const c = { primary: '#FDD00D', secondary: '#202959', light: '#FFFFFF', ...colors };
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · ${esc(brand)}</title>
<style>
  body { margin: 0; font-family: "Segoe UI", system-ui, -apple-system, sans-serif; background: ${c.secondary}; color: ${c.light};
         display: flex; flex-direction: column; align-items: center; padding: 20px 16px 40px; text-align: center; }
  h1 { font-size: 1.5rem; margin: 6px 0 4px; } .brand { color: ${c.primary}; font-weight: 800; letter-spacing: .5px; }
  img { width: 100%; max-width: 560px; border-radius: 14px; margin: 16px 0; box-shadow: 0 10px 30px #0008; }
  a.btn { display: inline-block; background: ${c.primary}; color: ${c.secondary}; font-weight: 800; font-size: 1.15rem;
          padding: 14px 36px; border-radius: 99px; text-decoration: none; }
  p { opacity: .8; font-size: .92rem; max-width: 520px; }
</style></head><body>
  <div class="brand">${esc(brand)}</div>
  <h1>${esc(title)}</h1>
  <img src="${esc(imageUrl)}" alt="${esc(title)}">
  <a class="btn" href="${esc(imageUrl)}" download="${esc(fileName)}">⬇ Download photo</a>
  <p>On iPhone you can also press and hold the photo, then tap <b>Save to Photos</b>.</p>
  <p>This link expires on ${esc(new Date(expiresAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}.</p>
</body></html>`;
}

// ---------- Local storage (same Wi-Fi) ----------
const LOCAL_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'shares');

function lanAddress() {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if (a.family === 'IPv4' && !a.internal) return a.address;
  }
  return 'localhost';
}

function localBaseUrl() {
  return env('SHARE_BASE_URL') || `http://${lanAddress()}:${env('PORT', '3000')}`;
}

async function storeLocal(id, jpeg, html) {
  fs.mkdirSync(LOCAL_DIR, { recursive: true });
  fs.writeFileSync(path.join(LOCAL_DIR, `${id}.jpg`), jpeg);
  fs.writeFileSync(path.join(LOCAL_DIR, `${id}.html`), html);
  return `${localBaseUrl()}/p/${id}`;
}

// Serve /p/<id> and /p/<id>.jpg from the local shares folder. Returns true if handled.
export function serveLocalShare(req, res) {
  const m = /^\/p\/([a-f0-9]{32})(\.jpg)?$/.exec(new URL(req.url, 'http://x').pathname);
  if (!m) return false;
  const file = path.join(LOCAL_DIR, `${m[1]}${m[2] ? '.jpg' : '.html'}`);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('This photo has expired or does not exist.'); }
    res.writeHead(200, { 'Content-Type': m[2] ? 'image/jpeg' : 'text/html; charset=utf-8', 'X-Robots-Tag': 'noindex' });
    res.end(data);
  });
  return true;
}

// Delete local photos older than the TTL (runs hourly).
function cleanupLocal() {
  if (!fs.existsSync(LOCAL_DIR)) return;
  const cutoff = Date.now() - TTL_HOURS() * 3600 * 1000;
  for (const f of fs.readdirSync(LOCAL_DIR)) {
    const p = path.join(LOCAL_DIR, f);
    try { if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p); } catch { /* ignore */ }
  }
}
setInterval(cleanupLocal, 3600 * 1000).unref();
cleanupLocal();

// ---------- Online storage (S3-compatible: Cloudflare R2, Amazon S3, Backblaze B2, …) ----------
const sha256 = (data) => crypto.createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

// Signs a request with AWS Signature V4 (path-style URL: endpoint/bucket/key).
export function signS3Put({ endpoint, region, bucket, accessKeyId, secretAccessKey, key, body, contentType, now = new Date() }) {
  const url = new URL(endpoint);
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(body);
  const basePath = url.pathname.replace(/\/$/, '');
  const canonicalUri = `${basePath}/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const headers = { 'content-type': contentType, host: url.host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': amzDate };
  const signedHeaders = Object.keys(headers).sort().join(';');
  const canonicalHeaders = Object.keys(headers).sort().map((h) => `${h}:${headers[h]}\n`).join('');
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonicalRequest)].join('\n');
  const kSigning = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), 's3'), 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return {
    url: `${url.origin}${canonicalUri}`,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
  };
}

function s3Config() {
  const cfg = {
    endpoint: env('S3_ENDPOINT'), region: env('S3_REGION', 'auto'), bucket: env('S3_BUCKET'),
    accessKeyId: env('S3_ACCESS_KEY_ID'), secretAccessKey: env('S3_SECRET_ACCESS_KEY'), publicUrl: env('S3_PUBLIC_URL').replace(/\/$/, ''),
  };
  const missing = Object.entries({ S3_ENDPOINT: cfg.endpoint, S3_BUCKET: cfg.bucket, S3_ACCESS_KEY_ID: cfg.accessKeyId,
    S3_SECRET_ACCESS_KEY: cfg.secretAccessKey, S3_PUBLIC_URL: cfg.publicUrl }).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) throw new Error(`Online sharing is not set up: add ${missing.join(', ')} to .env (see SHARING.md)`);
  return cfg;
}

async function s3Put(cfg, key, body, contentType) {
  const { url, headers } = signS3Put({ ...cfg, key, body, contentType });
  const res = await fetch(url, { method: 'PUT', headers: { ...headers, 'cache-control': 'private, max-age=86400' }, body });
  if (!res.ok) {
    const text = await res.text();
    const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1] || res.status;
    throw new Error(`Upload to online storage failed (${code}). Check the S3_ settings in .env.`);
  }
}

async function storeS3(id, jpeg, html) {
  const cfg = s3Config();
  await s3Put(cfg, `p/${id}.jpg`, jpeg, 'image/jpeg');
  await s3Put(cfg, `p/${id}.html`, Buffer.from(html), 'text/html; charset=utf-8');
  return `${cfg.publicUrl}/p/${id}.html`;
}

// ---------- Public API ----------
export function shareStatus() {
  if (MODE() !== 's3') return { mode: 'local', note: 'Phones must be on the same Wi-Fi as this computer' };
  try { s3Config(); return { mode: 's3', note: 'Online storage' }; }
  catch (e) { return { mode: 's3', error: e.message }; }
}

export async function createShare({ jpeg, title, careerId, brand, colors }) {
  const id = crypto.randomBytes(16).toString('hex');
  const expiresAt = Date.now() + TTL_HOURS() * 3600 * 1000;
  const fileName = `future-${careerId}.jpg`;
  const mode = MODE();
  // The page and the photo sit side by side, so the page can link to the photo by file name.
  const html = downloadPage({ imageUrl: mode === 's3' ? `${id}.jpg` : `/p/${id}.jpg`, fileName, title, brand, colors, expiresAt });
  const url = mode === 's3' ? await storeS3(id, jpeg, html) : await storeLocal(id, jpeg, html);
  const qrSvg = await QRCode.toString(url, {
    type: 'svg', margin: 1, errorCorrectionLevel: 'M',
    color: { dark: colors?.secondary || '#202959', light: '#FFFFFF' },
  });
  return { url, qrSvg, expiresAt, mode };
}
