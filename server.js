// Career Transformation — zero-dependency Node server.
// Serves the web app and proxies photo transformation requests to an AI image service,
// so API keys never reach the browser.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import { createShare, serveLocalShare, shareStatus } from './share.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE = path.join(ROOT, '.env');
// Hosted on Vercel: the disk is read-only and settings come from the Vercel project's
// Environment Variables (there is no .env file and no Setup page).
const HOSTED = !!process.env.VERCEL;
// First run on a new computer: start from the example settings.
if (!HOSTED && !fs.existsSync(ENV_FILE) && fs.existsSync(path.join(ROOT, '.env.example'))) {
  try { fs.copyFileSync(path.join(ROOT, '.env.example'), ENV_FILE); } catch (e) { console.warn(`Could not create .env: ${e.message}`); }
}
if (!HOSTED && fs.existsSync(ENV_FILE)) process.loadEnvFile(ENV_FILE);
const SETTINGS_WHERE = HOSTED ? 'in your Vercel project (Settings → Environment Variables), then redeploy' : 'in .env (or on the Setup page)';

const PORT = Number(process.env.PORT) || 3000;
const provider = () => (process.env.AI_PROVIDER || 'demo').toLowerCase(); // can change from the Setup page
const MAX_BODY = 15 * 1024 * 1024; // 15 MB

const loadOccupations = () =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'occupations.json'), 'utf8'));
// Career categories (the first page after Start). Each career names its category in occupations.json.
const loadCategories = () => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'categories.json'), 'utf8')); } catch { return []; }
};

function buildPrompt(occ, orientation) {
  return [
    `Transform the person in this photo into ${occ.prompt}.`,
    'Keep the exact same person: preserve their face, facial features, skin tone, hairstyle, age and expression so they are clearly recognisable.',
    'Change only the clothing, accessories, pose if needed, and background to match the occupation.',
    `Photorealistic, professional portrait photography, natural lighting, sharp focus, ${orientation === 'landscape' ? 'waist-up shot in a wide landscape frame showing more of the workplace' : 'upper-body portrait in a vertical frame'}.`,
  ].join(' ');
}

// ---------- AI providers ----------
// "Out of credit" errors (no money left on the AI account). The booth then still gives the
// player their normal photo in the frame, and shows staff a note to top up.
const credit = { out: false, provider: '', since: 0 };
function isNoCredit(status, error = {}) {
  if (status === 402) return true;
  const text = `${error.code || ''} ${error.type || ''} ${error.status || ''} ${error.message || ''}`;
  if (/rate limit|per minute|requests per|too many requests/i.test(text)) return false; // just busy: not about credit
  return /insufficient_quota|billing|quota|credit|RESOURCE_EXHAUSTED|payment/i.test(text);
}
function aiError(message, status, error) {
  const e = new Error(message);
  e.noCredit = isNoCredit(status, error);
  return e;
}

async function transformWithGemini(imageB64, mime, prompt, orientation) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error(`GEMINI_API_KEY is not set: add it ${SETTINGS_WHERE}`);
  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-image';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mime, data: imageB64 } }] }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: { aspectRatio: orientation === 'landscape' ? '4:3' : '3:4' },
        },
      }),
    }
  );
  const json = await res.json();
  if (!res.ok) {
    const hint = res.status === 404 ? ` (model "${model}" not found: run "npm run models" and set GEMINI_MODEL in .env)` : '';
    throw aiError((json.error?.message || `Gemini error ${res.status}`) + hint, res.status, json.error);
  }
  const parts = json.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  if (!img) throw new Error('The AI did not return an image (it may have declined the photo). Try another photo.');
  const data = img.inlineData || img.inline_data;
  return { b64: data.data, mime: data.mimeType || data.mime_type || 'image/png' };
}

async function transformWithOpenAI(imageB64, mime, prompt, orientation) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error(`OPENAI_API_KEY is not set: add it ${SETTINGS_WHERE}`);
  const form = new FormData();
  form.append('model', process.env.OPENAI_MODEL || 'gpt-image-2.5-sunburst');
  form.append('prompt', prompt);
  form.append('size', orientation === 'landscape' ? '1536x1024' : '1024x1536');
  form.append('image', new Blob([Buffer.from(imageB64, 'base64')], { type: mime }), mime === 'image/png' ? 'selfie.png' : 'selfie.jpg');
  // Vercel answers at most 4.5 MB per response: a JPEG keeps the photo well under that.
  if (HOSTED) { form.append('output_format', 'jpeg'); form.append('output_compression', '90'); }
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const hint = /model/i.test(json.error?.message || '') ? ' (run "npm run models" and set OPENAI_MODEL in .env)' : '';
    throw aiError((json.error?.message || `OpenAI error ${res.status}`) + hint, res.status, json.error);
  }
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('The AI did not return an image. Try another photo.');
  return { b64, mime: HOSTED ? 'image/jpeg' : 'image/png' };
}

async function transformDemo(imageB64, mime) {
  await new Promise((r) => setTimeout(r, 1500)); // simulate processing
  return { b64: imageB64, mime };
}

const providers = { gemini: transformWithGemini, openai: transformWithOpenAI, demo: transformDemo };

// ---------- HTTP helpers ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.jpeg': 'image/jpeg',
};

function sendJSON(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('Photo is too large')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  // /design/... is served from the design folder (your artwork), everything else from public/
  const isDesign = urlPath.startsWith('/design/');
  const baseDir = path.join(ROOT, isDesign ? 'design' : 'public');
  const rel = isDesign ? urlPath.slice('/design/'.length) : urlPath === '/' ? 'index.html' : urlPath;
  const file = path.normalize(path.join(baseDir, rel));
  if (!file.startsWith(baseDir + path.sep)) return sendJSON(res, 403, { error: 'Forbidden' });
  // The Setup page itself, however the address is written: booth computer + logged in only.
  if (['setup.html', 'login.html'].includes(path.basename(file).toLowerCase())) {
    if (!isLocal(req)) return sendJSON(res, 403, { error: 'Setup only works on the booth computer itself.' });
    if (path.basename(file).toLowerCase() === 'setup.html' && !loggedIn(req)) { res.writeHead(302, { Location: '/login.html' }); return res.end(); }
  }
  if (isDesign && !IMAGE_EXTS.includes(path.extname(file).toLowerCase()) && path.extname(file) !== '.svg') {
    return sendJSON(res, 403, { error: 'Only images are served from /design' });
  }
  fs.readFile(file, (err, data) => {
    if (err) return sendJSON(res, 404, { error: 'Not found' });
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

// ---------- Design folder ----------
// Your artwork is found by file name, so you only drop files in; no code or settings to change.
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.webp'];
function findDesignFile(relNoExt) {
  for (const ext of IMAGE_EXTS) {
    const file = path.join(ROOT, 'design', relNoExt + ext);
    if (fs.existsSync(file)) {
      const v = Math.round(fs.statSync(file).mtimeMs); // cache-buster so new versions show up
      return `/design/${relNoExt}${ext}?v=${v}`;
    }
  }
  return '';
}

function loadDesign() {
  const t = JSON.parse(fs.readFileSync(path.join(ROOT, 'design', 'template.json'), 'utf8'));
  t.logo = findDesignFile('logo');
  t.homeBackground = findDesignFile('home-background');
  for (const o of ['portrait', 'landscape']) {
    if (!t.frames?.[o]) continue;
    t.frames[o].overlay = findDesignFile(`frames/frame-${o}`);
    t.frames[o].background = findDesignFile(`frames/background-${o}`);
  }
  t.cards = {};
  for (const occ of loadOccupations()) {
    const img = findDesignFile(`cards/${occ.id}`);
    if (img) t.cards[occ.id] = img;
  }
  return t;
}

// ---------- Setup page (API key and AI choice) ----------
// Settings are saved to .env. Only this computer can read or change them: the booth may also be
// reachable from phones on the same Wi-Fi (QR download), and they must never see or change the key.
const DEFAULT_MODELS = { OPENAI_MODEL: 'gpt-image-2.5-sunburst', GEMINI_MODEL: 'gemini-3.1-flash-image' };
const KEY_FOR = { openai: 'OPENAI_API_KEY', gemini: 'GEMINI_API_KEY' };

// On Vercel every request arrives through Vercel's proxy, so "local" can't be trusted: the Setup
// page is off there and settings live in the project's Environment Variables.
const isLocal = (req) => !HOSTED && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
const needsSetup = () => !HOSTED && !!KEY_FOR[provider()] && !process.env[KEY_FOR[provider()]];
const keyHint = (k) => (k ? `${k.slice(0, 3)}…${k.slice(-4)}` : '');

function settingsView() {
  const e = process.env;
  return {
    provider: provider(), needsSetup: needsSetup(), creditOut: credit.out && credit.provider === provider(),
    openai: { keySet: !!e.OPENAI_API_KEY, keyHint: keyHint(e.OPENAI_API_KEY), model: e.OPENAI_MODEL || DEFAULT_MODELS.OPENAI_MODEL },
    gemini: { keySet: !!e.GEMINI_API_KEY, keyHint: keyHint(e.GEMINI_API_KEY), model: e.GEMINI_MODEL || DEFAULT_MODELS.GEMINI_MODEL },
  };
}

// Write values into .env, keeping its comments and other settings.
function saveSettings(values) {
  let lines = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/) : [];
  for (const [k, v] of Object.entries(values)) {
    const i = lines.findIndex((l) => l.startsWith(`${k}=`));
    if (i >= 0) lines[i] = `${k}=${v}`; else lines.push(`${k}=${v}`);
    process.env[k] = v;
  }
  fs.writeFileSync(ENV_FILE, lines.join('\n'));
}

function cleanSettings(body) {
  const out = {};
  const p = String(body.provider || '').toLowerCase();
  if (p) {
    if (!['openai', 'gemini', 'demo'].includes(p)) throw new Error('Choose OpenAI, Gemini or Demo');
    out.AI_PROVIDER = p;
  }
  const fields = { openaiKey: 'OPENAI_API_KEY', openaiModel: 'OPENAI_MODEL', geminiKey: 'GEMINI_API_KEY', geminiModel: 'GEMINI_MODEL' };
  for (const [field, key] of Object.entries(fields)) {
    const v = String(body[field] ?? '').trim();
    if (!v) continue; // empty = keep what is saved
    if (/[\s"'#]/.test(v) || v.length > 300) throw new Error(`That ${field.includes('Key') ? 'API key' : 'model name'} doesn't look right. Paste it again.`);
    out[key] = v;
  }
  return out;
}

// Check a key works (and can see the model) without making an image.
async function testKey(p, key, model) {
  if (p === 'openai') {
    const r = await fetch(`https://api.openai.com/v1/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${key}` } });
    if (r.ok) return 'The OpenAI key works.';
    const msg = (await r.json().catch(() => ({}))).error?.message || `OpenAI error ${r.status}`;
    if (r.status === 404) return `The key works, but it can't use the model "${model}". Check the model name.`;
    throw new Error(r.status === 401 ? 'OpenAI says this API key is wrong. Copy it again from platform.openai.com/api-keys.' : msg);
  }
  if (p === 'gemini') {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}`, { headers: { 'x-goog-api-key': key } });
    if (r.ok) return 'The Gemini key works.';
    const msg = (await r.json().catch(() => ({}))).error?.message || `Gemini error ${r.status}`;
    throw new Error(r.status === 404 ? `The key works, but the model "${model}" wasn't found.` : msg);
  }
  return 'Demo mode needs no key.';
}

// ---------- Setup login ----------
// The Setup page needs a username and password, so players can't open it from the ⚙️ link.
// Change them in .env (SETUP_USERNAME, SETUP_PASSWORD). A login lasts SESSION_HOURS.
const SETUP_USERNAME = () => process.env.SETUP_USERNAME || 'admin';
const SETUP_PASSWORD = () => process.env.SETUP_PASSWORD || 'admin';
const SESSION_HOURS = 8;
const COOKIE = 'booth_setup';
const sessions = new Map(); // token → expiry time
const sameText = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
function loggedIn(req) {
  const m = /(?:^|;\s*)booth_setup=([a-f0-9]{64})/.exec(req.headers.cookie || '');
  const exp = m && sessions.get(m[1]);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(m[1]); return false; }
  return true;
}
async function handleLogin(req, res) {
  if (!isLocal(req)) return sendJSON(res, 403, { error: 'Setup only works on the booth computer itself (http://localhost).' });
  if (req.url === '/api/logout') {
    const m = /(?:^|;\s*)booth_setup=([a-f0-9]{64})/.exec(req.headers.cookie || '');
    if (m) sessions.delete(m[1]);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` });
    return res.end('{}');
  }
  const { username, password } = JSON.parse(await readBody(req));
  const ok = sameText(username || '', SETUP_USERNAME()) & sameText(password || '', SETUP_PASSWORD());
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800)); // slow down guessing
    return sendJSON(res, 401, { error: 'Wrong username or password.' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_HOURS * 3600 * 1000);
  res.writeHead(200, { 'Content-Type': 'application/json', 'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_HOURS * 3600}` });
  res.end('{}');
}

async function handleSettings(req, res) {
  if (!isLocal(req)) return sendJSON(res, 403, { error: 'Setup only works on the booth computer itself (http://localhost).' }), true;
  if (!loggedIn(req)) return sendJSON(res, 401, { error: 'Please log in first.', login: true }), true; // after the local check
  if (req.method === 'GET' && req.url === '/api/settings') return sendJSON(res, 200, settingsView()), true;
  if (req.method === 'POST' && req.url === '/api/settings') {
    saveSettings(cleanSettings(JSON.parse(await readBody(req))));
    credit.out = false; // new key or AI: try transforming again
    console.log(`Settings saved (AI provider: ${provider()})`);
    return sendJSON(res, 200, settingsView()), true;
  }
  if (req.method === 'POST' && req.url === '/api/settings/test') {
    const body = JSON.parse(await readBody(req));
    const p = String(body.provider || provider()).toLowerCase();
    const typed = cleanSettings({ openaiKey: body.key && p === 'openai' ? body.key : '', geminiKey: body.key && p === 'gemini' ? body.key : '' });
    const key = typed[KEY_FOR[p]] || process.env[KEY_FOR[p]];
    if (KEY_FOR[p] && !key) throw new Error('Paste an API key first.');
    const model = String(body.model || '').trim() || settingsView()[p]?.model;
    return sendJSON(res, 200, { message: await testKey(p, key, model) }), true;
  }
  return false;
}

// ---------- Routes ----------
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/occupations') {
      const list = loadOccupations().map(({ prompt, ...pub }) => pub);
      return sendJSON(res, 200, { provider: provider(), needsSetup: needsSetup(), creditOut: credit.out && credit.provider === provider(), share: shareStatus(), categories: loadCategories(), occupations: list });
    }

    if (req.method === 'GET' && req.url === '/api/design') return sendJSON(res, 200, loadDesign());
    // Decoded and lower case, like the file server and the (case-insensitive) Mac/Windows disk see it.
    let pathname = new URL(req.url, 'http://x').pathname;
    try { pathname = decodeURIComponent(pathname).toLowerCase(); } catch { return sendJSON(res, 400, { error: 'Bad address' }); }
    if (req.method === 'POST' && (pathname === '/api/login' || pathname === '/api/logout')) return handleLogin(req, res);
    if (pathname.startsWith('/api/settings') && await handleSettings(req, res)) return;
    if (pathname === '/setup.html' || pathname === '/login.html') {
      if (!isLocal(req)) return sendJSON(res, 403, { error: 'Setup only works on the booth computer itself.' });
      if (pathname === '/setup.html' && !loggedIn(req)) { res.writeHead(302, { Location: '/login.html' }); return res.end(); }
    }

    if (req.method === 'POST' && req.url === '/api/transform') {
      const { occupationId, image, orientation } = JSON.parse(await readBody(req));
      const occ = loadOccupations().find((o) => o.id === occupationId);
      if (!occ) return sendJSON(res, 400, { error: 'Unknown occupation' });
      const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(image || '');
      if (!m) return sendJSON(res, 400, { error: 'Invalid image' });

      const PROVIDER = provider();
      const run = providers[PROVIDER];
      if (!run) return sendJSON(res, 500, { error: `Unknown AI_PROVIDER "${PROVIDER}"` });
      const orient = orientation === 'landscape' ? 'landscape' : 'portrait';
      const started = Date.now();
      console.log(`Transforming photo into ${occ.title} with ${PROVIDER}…`);
      let out;
      try {
        out = await run(m[2], m[1], buildPrompt(occ, orient), orient);
      } catch (err) {
        if (!err.noCredit) throw err;
        // Out of AI credit: give the player their own photo in the frame instead of nothing.
        if (!credit.out) console.log(`\n⚠️  ${PROVIDER} AI credit has run out (${err.message}).\n    Players now get their normal photo in the frame. Add credit, then the booth transforms photos again.\n`);
        Object.assign(credit, { out: true, provider: PROVIDER, since: Date.now() });
        return sendJSON(res, 200, { image: image, provider: PROVIDER, fallback: 'no-credit' });
      }
      credit.out = false;
      console.log(`  done in ${((Date.now() - started) / 1000).toFixed(1)} s`);
      return sendJSON(res, 200, { image: `data:${out.mime};base64,${out.b64}`, provider: PROVIDER });
    }

    // QR download: store the finished (framed) photo and return a link + QR code
    if (req.method === 'POST' && req.url === '/api/share') {
      const { occupationId, image } = JSON.parse(await readBody(req));
      const occ = loadOccupations().find((o) => o.id === occupationId);
      const m = /^data:image\/jpeg;base64,(.+)$/.exec(image || '');
      if (!occ || !m) return sendJSON(res, 400, { error: 'Invalid photo' });
      const design = loadDesign();
      const share = await createShare({
        jpeg: Buffer.from(m[1], 'base64'), title: `Future ${occ.title}`, careerId: occ.id,
        brand: design.brandName || 'Career Transformation', colors: design.colors,
      });
      return sendJSON(res, 200, share);
    }

    if (req.method === 'GET' && serveLocalShare(req, res)) return;
    if (req.method === 'GET') return serveStatic(req, res);
    sendJSON(res, 405, { error: 'Method not allowed' });
  } catch (err) {
    console.error(`Error on ${req.method} ${req.url}: ${err.message}`);
    sendJSON(res, 500, { error: err.message || 'Something went wrong' });
  }
});

// Open the booth in the browser (the Start Booth launchers set OPEN_BROWSER=1).
function openBrowser(url) {
  if (process.env.OPEN_BROWSER !== '1') return;
  const [cmd, args] = process.platform === 'darwin' ? ['open', [url]]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`The booth is already running at http://localhost:${PORT}. Opening it.`);
    openBrowser(`http://localhost:${PORT}`);
    setTimeout(() => process.exit(0), 500);
  } else throw err;
});

server.listen(PORT, () => {
  const sh = shareStatus();
  console.log(`Career Transformation running at http://localhost:${PORT}  (AI provider: ${provider()}, QR sharing: ${sh.mode}${sh.error ? ' (not set up yet)' : ''})`);
  if (needsSetup()) console.log(`No API key yet: open http://localhost:${PORT}/setup.html to add it.`);
  openBrowser(`http://localhost:${PORT}${needsSetup() ? '/setup.html' : ''}`);
});
