import { startAR, stopAR, preloadHands } from './ar.js';
import { toCroppedDataUrl, getOrientation, ratioFor } from './util.js';
import { loadTemplate, applyTheme, renderFrame } from './frame.js';

const $ = (s) => document.querySelector(s);
const state = { occupations: [], selected: null, photo: null, result: null, stream: null, mode: 'ar', orientation: 'portrait', template: null };

// ---------- Screens ----------
function show(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
  document.body.dataset.screen = name;
  if (name === 'camera') startCamera(); else stopCamera();
  if (name === 'ar') { state.mode = 'ar'; startAR(state.occupations, onARCaptured); }
  else if (name !== 'loading' && name !== 'result') stopAR();
  if (name === 'cards') state.mode = 'classic';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 6000);
}

// ---------- Step 1: cards ----------
async function loadOccupations() {
  const res = await fetch('/api/occupations');
  const data = await res.json();
  state.occupations = data.occupations;
  $('#providerBadge').textContent = data.provider === 'demo' ? 'Demo mode (no AI)' : `AI: ${data.provider}`;
}

function buildClassicCards() {
  const grid = $('#cardGrid');
  grid.innerHTML = '';
  for (const occ of state.occupations) {
    const card = document.createElement('button');
    card.className = 'card';
    card.style.setProperty('--c', occ.color);
    card.setAttribute('aria-label', `Choose ${occ.title}`);
    card.innerHTML = `
      <div class="card-inner">
        ${occ.cardImage
          ? `<div class="card-face card-front has-image"><img class="card-art" src="${occ.cardImage}" alt="${occ.title}"></div>`
          : `<div class="card-face card-front"><div class="emoji">${occ.emoji}</div><div class="title">${occ.title}</div></div>`}
        <div class="card-face card-back"><div class="tagline">${occ.tagline}</div><div class="choose">Choose ${occ.title}</div></div>
      </div>`;
    card.addEventListener('click', () => chooseOccupation(occ, card));
    grid.appendChild(card);
  }
}

function chooseOccupation(occ, cardEl) {
  state.selected = occ;
  document.querySelectorAll('.card').forEach((c) => c.classList.remove('selected'));
  cardEl?.classList.add('selected', 'flipped');
  document.querySelectorAll('.occ-name').forEach((e) => (e.textContent = occ.title));
  document.querySelectorAll('.occ-emoji').forEach((e) => (e.textContent = occ.emoji));
  setTimeout(() => show('camera'), cardEl ? 500 : 0);
}

$('#surpriseBtn').addEventListener('click', () => {
  const cards = [...document.querySelectorAll('.card')];
  let i = 0;
  const spins = 12 + Math.floor(Math.random() * state.occupations.length);
  const tick = () => {
    cards.forEach((c) => c.classList.remove('selected'));
    cards[i % cards.length].classList.add('selected');
    if (i++ < spins) setTimeout(tick, 60 + i * 12);
    else { const idx = (i - 1) % cards.length; chooseOccupation(state.occupations[idx], cards[idx]); }
  };
  tick();
});

// ---------- Step 2: camera ----------
const video = $('#video');
const snapshot = $('#snapshot');

async function startCamera() {
  resetCapture();
  $('#camError').hidden = true;
  if (state.stream) return;
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false,
    });
    video.srcObject = state.stream;
    $('#captureBtn').disabled = false;
  } catch (err) {
    $('#camError').textContent = 'Camera not available. Allow camera access, or use "Upload photo" instead.';
    $('#camError').hidden = false;
    $('#captureBtn').disabled = true;
  }
}

function stopCamera() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
}

function resetCapture() {
  state.photo = null;
  snapshot.hidden = true; video.hidden = false;
  $('#captureBtn').hidden = false; $('#retakeBtn').hidden = true; $('#transformBtn').hidden = true;
}

function setPhoto(dataUrl) {
  state.photo = dataUrl;
  snapshot.src = dataUrl; snapshot.hidden = false; video.hidden = true;
  $('#captureBtn').hidden = true; $('#retakeBtn').hidden = false; $('#transformBtn').hidden = false;
}

$('#captureBtn').addEventListener('click', async () => {
  $('#captureBtn').disabled = true;
  const cd = $('#countdown');
  for (const n of [5, 4, 3, 2, 1]) {
    cd.hidden = false; cd.textContent = n;
    cd.style.animation = 'none'; void cd.offsetWidth; cd.style.animation = '';
    await new Promise((r) => setTimeout(r, 1000));
  }
  cd.hidden = true;
  $('#captureBtn').disabled = false;
  state.orientation = getOrientation();
  setPhoto(toCroppedDataUrl(video, video.videoWidth, video.videoHeight, true, ratioFor(state.orientation)));
});

$('#retakeBtn').addEventListener('click', resetCapture);
$('#fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const img = new Image();
  img.onload = () => {
    state.orientation = getOrientation();
    setPhoto(toCroppedDataUrl(img, img.naturalWidth, img.naturalHeight, false, ratioFor(state.orientation)));
    URL.revokeObjectURL(img.src);
  };
  img.src = URL.createObjectURL(file);
  e.target.value = '';
});

// ---------- Step 3: transform ----------
const loadingLines = ['Picking out your uniform…', 'Setting up the scene…', 'Adjusting the lighting…', 'Adding the finishing touches…'];

$('#transformBtn').addEventListener('click', () => transform());

function onARCaptured(occ, photo, orientation) {
  state.selected = occ;
  state.photo = photo;
  state.orientation = orientation;
  document.querySelectorAll('.occ-name').forEach((e) => (e.textContent = occ.title));
  document.querySelectorAll('.occ-emoji').forEach((e) => (e.textContent = occ.emoji));
  stopAR();
  transform();
}

async function transform() {
  show('loading');
  let li = 0;
  $('#loadingText').textContent = 'Transforming you…';
  const rotate = setInterval(() => ($('#loadingText').textContent = loadingLines[li++ % loadingLines.length]), 3000);
  try {
    const res = await fetch('/api/transform', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ occupationId: state.selected.id, image: state.photo, orientation: state.orientation }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Transformation failed');
    state.result = data.image;
    await renderResult();
    show('result');
    shareResult();
  } catch (err) {
    toast(err.message);
    show(state.mode === 'ar' ? 'ar' : 'camera');
  } finally {
    clearInterval(rotate);
  }
}

// ---------- Step 4: result + download ----------
async function renderResult() {
  // Reload the template each time so design changes show up without restarting.
  try { state.template = await loadTemplate(); } catch (e) { console.warn(e); }
  await renderFrame($('#resultCanvas'), state.result, state.selected, state.orientation, state.template);
}

// ---------- QR download ----------
let shareToken = 0;
async function shareResult() {
  const token = ++shareToken; // ignore late answers if the next player has already started
  const box = $('#qrCode'), note = $('#qrNote');
  $('#qrPanel').classList.remove('failed');
  box.innerHTML = '<div class="spinner"></div>';
  note.textContent = 'Preparing your link…';
  try {
    const res = await fetch('/api/share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ occupationId: state.selected.id, image: $('#resultCanvas').toDataURL('image/jpeg', 0.9) }),
    });
    const data = await res.json();
    if (token !== shareToken) return;
    if (!res.ok) throw new Error(data.error || 'Could not create the download link');
    box.innerHTML = data.qrSvg;
    const hours = Math.round((data.expiresAt - Date.now()) / 3600000);
    note.textContent = data.mode === 'local'
      ? `Connect your phone to the same Wi-Fi, then scan. Link works for ${hours} hours.`
      : `Scan with your phone camera. Link works for ${hours} hours.`;
  } catch (err) {
    if (token !== shareToken) return;
    $('#qrPanel').classList.add('failed');
    box.innerHTML = '⚠️';
    note.textContent = err.message;
  }
}

function download(href, name) {
  const a = document.createElement('a');
  a.href = href; a.download = name; a.click();
}
const fileBase = () => `future-${state.selected.id}-${Date.now()}`;

$('#downloadBtn').addEventListener('click', () => download($('#resultCanvas').toDataURL('image/png'), `${fileBase()}.png`));
$('#downloadRawBtn').addEventListener('click', () => {
  const ext = state.result.startsWith('data:image/jpeg') ? 'jpg' : 'png';
  download(state.result, `${fileBase()}-raw.${ext}`);
});
const resetCards = () => document.querySelectorAll('.card').forEach((c) => c.classList.remove('selected', 'flipped'));
$('#againBtn').addEventListener('click', () => { shareToken++; resetCards(); show(state.mode === 'ar' ? 'ar' : 'cards'); });
$('#nextPlayerBtn').addEventListener('click', () => { shareToken++; resetCards(); show('home'); });

// ---------- Home ----------
async function goFullscreen() {
  try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); } catch { /* not allowed: fine */ }
}
$('#startBtn').addEventListener('click', async () => { await goFullscreen(); show('ar'); });
$('#homeClassicBtn').addEventListener('click', async () => { await goFullscreen(); show('cards'); });
document.querySelectorAll('.home-btn').forEach((b) => b.addEventListener('click', () => show('home')));

$('#classicBtn').addEventListener('click', () => show('cards'));
$('#arModeBtn').addEventListener('click', () => show('ar'));
$('#backBtn').addEventListener('click', () => show('cards'));

show('home');
preloadHands();
// Load careers + your design folder, then attach your card artwork (design/cards/<id>.png).
Promise.all([loadOccupations(), loadTemplate()])
  .then(([, t]) => {
    state.template = t;
    applyTheme(t);
    for (const occ of state.occupations) occ.cardImage = t.cards?.[occ.id] || '';
    buildClassicCards();
    $('#startBtn').disabled = false; $('#homeClassicBtn').disabled = false;
  })
  .catch((e) => toast(`Could not start: ${e.message}`));
