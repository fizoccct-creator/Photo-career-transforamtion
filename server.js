// Career Transformation — zero-dependency Node server.
// Serves the web app and proxies photo transformation requests to an AI image service,
// so API keys never reach the browser.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createShare, serveLocalShare, shareStatus } from './share.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
if (fs.existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const PROVIDER = (process.env.AI_PROVIDER || 'demo').toLowerCase();
const MAX_BODY = 15 * 1024 * 1024; // 15 MB

const loadOccupations = () =>
  JSON.parse(fs.readFileSync(path.join(ROOT, 'occupations.json'), 'utf8'));

function buildPrompt(occ, orientation) {
  return [
    `Transform the person in this photo into ${occ.prompt}.`,
    'Keep the exact same person: preserve their face, facial features, skin tone, hairstyle, age and expression so they are clearly recognisable.',
    'Change only the clothing, accessories, pose if needed, and background to match the occupation.',
    `Photorealistic, professional portrait photography, natural lighting, sharp focus, ${orientation === 'landscape' ? 'waist-up shot in a wide landscape frame showing more of the workplace' : 'upper-body portrait in a vertical frame'}.`,
  ].join(' ');
}

// ---------- AI providers ----------
async function transformWithGemini(imageB64, mime, prompt, orientation) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY is not set in .env');
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
    throw new Error((json.error?.message || `Gemini error ${res.status}`) + hint);
  }
  const parts = json.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  if (!img) throw new Error('The AI did not return an image (it may have declined the photo). Try another photo.');
  const data = img.inlineData || img.inline_data;
  return { b64: data.data, mime: data.mimeType || data.mime_type || 'image/png' };
}

async function transformWithOpenAI(imageB64, mime, prompt, orientation) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY is not set in .env');
  const form = new FormData();
  form.append('model', process.env.OPENAI_MODEL || 'gpt-image-2.5-sunburst');
  form.append('prompt', prompt);
  form.append('size', orientation === 'landscape' ? '1536x1024' : '1024x1536');
  form.append('image', new Blob([Buffer.from(imageB64, 'base64')], { type: mime }), mime === 'image/png' ? 'selfie.png' : 'selfie.jpg');
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  const json = await res.json();
  if (!res.ok) {
    const hint = /model/i.test(json.error?.message || '') ? ' (run "npm run models" and set OPENAI_MODEL in .env)' : '';
    throw new Error((json.error?.message || `OpenAI error ${res.status}`) + hint);
  }
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('The AI did not return an image. Try another photo.');
  return { b64, mime: 'image/png' };
}

async function transformDemo(imageB64, mime) {
  await new Promise((r) => setTimeout(r, 1500)); // simulate processing
  return { b64: imageB64, mime };
}

// ComfyUI on your own GPU PC. Uses a workflow saved with "Export (API)" in ComfyUI.
// Before sending it, the server fills in:
//   - "{{PROMPT}}" anywhere in the workflow → the career prompt (type it in your positive prompt box)
//   - the first LoadImage node (or one titled "selfie") → the uploaded selfie
//   - width/height of ImageScale / EmptyLatentImage nodes → the photo shape (portrait or landscape)
//   - seed / noise_seed of sampler nodes → a new random number, so every photo differs
const COMFY_SIZES = { landscape: [1152, 896], portrait: [896, 1152] }; // 4:3 and 3:4, about 1 megapixel for SDXL

async function comfyFetch(base, urlPath, opts) {
  let res;
  try {
    res = await fetch(base + urlPath, { ...opts, signal: AbortSignal.timeout(30000) });
  } catch (err) {
    throw new Error(`Cannot reach ComfyUI at ${base}. Is it running with --listen, and is COMFYUI_URL right? (${err.cause?.code || err.message})`);
  }
  if (!res.ok) {
    let detail = '';
    try {
      const j = await res.json();
      detail = j.error?.message || '';
      const nodeErr = Object.values(j.node_errors || {})[0];
      if (nodeErr) detail += ` ${nodeErr.class_type}: ${nodeErr.errors?.[0]?.message || ''} ${nodeErr.errors?.[0]?.details || ''}`;
    } catch { /* not JSON */ }
    throw new Error(`ComfyUI error ${res.status}${detail ? `: ${detail.trim()}` : ''}`);
  }
  return res;
}

function prepareComfyWorkflow(workflow, { prompt, imageName, orientation }) {
  const [width, height] = COMFY_SIZES[orientation];
  let json = JSON.stringify(workflow);
  if (!json.includes('{{PROMPT}}')) {
    throw new Error('The ComfyUI workflow has no {{PROMPT}}. Type {{PROMPT}} in your positive prompt box, then export it again.');
  }
  json = json.replaceAll('{{PROMPT}}', JSON.stringify(prompt).slice(1, -1));
  const wf = JSON.parse(json);
  const nodes = Object.values(wf);

  const loaders = nodes.filter((n) => n.class_type === 'LoadImage');
  const selfie = loaders.find((n) => /selfie/i.test(n._meta?.title || '')) || loaders[0];
  if (!selfie) throw new Error('The ComfyUI workflow needs a "Load Image" node for the selfie.');
  selfie.inputs.image = imageName;

  for (const n of nodes) {
    if (['ImageScale', 'EmptyLatentImage', 'EmptySD3LatentImage'].includes(n.class_type)) {
      if ('width' in n.inputs) n.inputs.width = width;
      if ('height' in n.inputs) n.inputs.height = height;
    }
    for (const key of ['seed', 'noise_seed']) {
      if (typeof n.inputs?.[key] === 'number') n.inputs[key] = Math.floor(Math.random() * 2 ** 48);
    }
    if (process.env.COMFYUI_CHECKPOINT && n.class_type === 'CheckpointLoaderSimple') {
      n.inputs.ckpt_name = process.env.COMFYUI_CHECKPOINT;
    }
  }
  return wf;
}

async function transformWithComfyUI(imageB64, mime, prompt, orientation) {
  const base = (process.env.COMFYUI_URL || 'http://127.0.0.1:8188').replace(/\/+$/, '');
  const wfPath = path.resolve(ROOT, process.env.COMFYUI_WORKFLOW || 'comfyui-workflow.json');
  if (!fs.existsSync(wfPath)) {
    throw new Error(`ComfyUI workflow not found at ${path.basename(wfPath)}. Copy comfyui-workflow.example.json to comfyui-workflow.json, or set COMFYUI_WORKFLOW in .env.`);
  }
  const timeoutMs = (Number(process.env.COMFYUI_TIMEOUT_SECONDS) || 180) * 1000;
  const started = Date.now();

  // 1. Upload the selfie into ComfyUI's input folder
  const ext = mime === 'image/png' ? 'png' : 'jpg';
  const form = new FormData();
  form.append('image', new Blob([Buffer.from(imageB64, 'base64')], { type: mime }), `career-selfie-${Date.now()}.${ext}`);
  form.append('overwrite', 'true');
  const up = await (await comfyFetch(base, '/upload/image', { method: 'POST', body: form })).json();
  const imageName = up.subfolder ? `${up.subfolder}/${up.name}` : up.name;

  // 2. Queue the workflow
  const workflow = prepareComfyWorkflow(JSON.parse(fs.readFileSync(wfPath, 'utf8')), { prompt, imageName, orientation });
  const queued = await (await comfyFetch(base, '/prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: 'career-transformation' }),
  })).json();
  const id = queued.prompt_id;
  if (!id) throw new Error('ComfyUI did not accept the workflow.');

  // 3. Wait until it is finished
  let entry;
  while (!entry) {
    if (Date.now() - started > timeoutMs) {
      fetch(`${base}/interrupt`, { method: 'POST' }).catch(() => {});
      throw new Error(`ComfyUI took longer than ${timeoutMs / 1000} seconds. Try again, or raise COMFYUI_TIMEOUT_SECONDS.`);
    }
    await new Promise((r) => setTimeout(r, 1000));
    const history = await (await comfyFetch(base, `/history/${id}`)).json();
    const h = history[id];
    if (h?.status?.status_str === 'error') {
      const msg = h.status.messages?.find(([type]) => type === 'execution_error')?.[1];
      throw new Error(`ComfyUI failed${msg ? ` in ${msg.node_type}: ${msg.exception_message}` : ''}`);
    }
    if (h?.status?.completed) entry = h;
  }

  // 4. Download the result (prefer a Save Image output over previews)
  const images = Object.values(entry.outputs || {}).flatMap((o) => o.images || []);
  const img = images.find((i) => i.type === 'output') || images[0];
  if (!img) throw new Error('The ComfyUI workflow finished without an image. Does it end in a "Save Image" node?');
  const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder || '', type: img.type || 'output' });
  const file = await comfyFetch(base, `/view?${q}`);
  const type = file.headers.get('content-type') || '';
  console.log(`ComfyUI finished in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return { b64: Buffer.from(await file.arrayBuffer()).toString('base64'), mime: type.startsWith('image/') ? type : 'image/png' };
}

const providers = { gemini: transformWithGemini, openai: transformWithOpenAI, comfyui: transformWithComfyUI, demo: transformDemo };

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

// ---------- Routes ----------
const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/api/occupations') {
      const list = loadOccupations().map(({ prompt, ...pub }) => pub);
      return sendJSON(res, 200, { provider: PROVIDER, share: shareStatus(), occupations: list });
    }

    if (req.method === 'GET' && req.url === '/api/design') return sendJSON(res, 200, loadDesign());

    if (req.method === 'POST' && req.url === '/api/transform') {
      const { occupationId, image, orientation } = JSON.parse(await readBody(req));
      const occ = loadOccupations().find((o) => o.id === occupationId);
      if (!occ) return sendJSON(res, 400, { error: 'Unknown occupation' });
      const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(image || '');
      if (!m) return sendJSON(res, 400, { error: 'Invalid image' });

      const run = providers[PROVIDER];
      if (!run) return sendJSON(res, 500, { error: `Unknown AI_PROVIDER "${PROVIDER}"` });
      const orient = orientation === 'landscape' ? 'landscape' : 'portrait';
      const out = await run(m[2], m[1], buildPrompt(occ, orient), orient);
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
    console.error(err);
    sendJSON(res, 500, { error: err.message || 'Something went wrong' });
  }
});

server.listen(PORT, () => {
  const sh = shareStatus();
  console.log(`Career Transformation running at http://localhost:${PORT}  (AI provider: ${PROVIDER}, QR sharing: ${sh.mode}${sh.error ? ' (not set up yet)' : ''})`);
});
