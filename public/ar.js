// AR card picker: the webcam fills the stage and the career cards float in 3D along the bottom.
// - Point at a card with your index finger, or pinch (thumb + index) to pick it up and carry it.
// - Keep hovering or holding it for HOLD_MS and it's chosen, then a COUNTDOWN takes the photo.
// - The cards react in 3D: they tilt toward your finger, and when you move your head they turn
//   as if you're looking around them (head tracking, with the hand or mouse as a fallback).
// - The mouse works as a stand-in hand (move = point, press = pinch).
import { toCroppedDataUrl, ratioFor, sleep } from './util.js';

// ---- Settings you may want to tweak ----
const HOLD_MS = 3000;          // how long to hover or hold a card to choose it
const COUNTDOWN = 5;           // seconds of countdown before the photo is taken
const READY_MS = 1500;         // pause after choosing, to lower your hand
const CARD_RATIO = 4 / 3;      // card height / width (design your card images at 3:4, e.g. 750×1000)
const LOOK_AROUND = 1;         // strength of the head-tracked 3D effect (0 = off)
// -----------------------------------------

const GRACE_MS = 350;          // tolerate short tracking dropouts before resetting the timer
const PINCH_ON = 0.33, PINCH_OFF = 0.5; // pinch distance relative to hand size (hysteresis)
const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const FACE_MODEL = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';

const $ = (s) => document.querySelector(s);
const stage = $('#arStage');
const video = $('#arVideo');
const cardsLayer = $('#arCards');
const cursorsLayer = $('#arCursors');
const banner = $('#arBanner');
const countdownEl = $('#arCountdown');
const flash = $('#arFlash');
const statusEl = $('#arStatus');

let hands = null, faces = null, visionLoading = null;
let stream = null;
let running = false;
let occupations = [];
let cards = [];             // { occ, el, ring, slot, pos, tilt:{x,y}, lift }
let onCaptured = () => {};
let size = { cw: 100, ch: 133 };
const BOTTOM_PAD = 28;

const ui = {
  locked: false,
  held: null,               // { card, key, lastX }
  holdCard: null, holdStart: 0, lastActive: 0,
  prevPinch: {}, handPinch: [], smooth: {},
  mouse: { inside: false, x: 0, y: 0, down: false },
  head: { x: 0, y: 0, seen: 0 },  // viewer position, -1..1 (smoothed)
  sway: 0,                         // extra tilt from moving a held card
};

// ---------- Setup ----------
function buildCards() {
  cardsLayer.innerHTML = '';
  cards = occupations.map((occ, i) => {
    const el = document.createElement('div');
    el.className = 'ar-card' + (occ.cardImage ? ' has-image' : '');
    el.innerHTML = `
      ${occ.cardImage
        ? `<img class="card-art" src="${occ.cardImage}" alt="${occ.title}" draggable="false">`
        : `<div class="emoji">${occ.emoji}</div><div class="title">${occ.title}</div>`}
      <div class="sheen"></div>
      <svg class="ring" viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect x="1.5" y="1.5" width="97" height="97" rx="7" pathLength="100" vector-effect="non-scaling-stroke"/>
      </svg>`;
    cardsLayer.appendChild(el);
    return { occ, el, i, ring: el.querySelector('.ring rect'), slot: { x: 0, y: 0 }, pos: { x: 0, y: 0 }, tilt: { x: 0, y: 0 }, lift: 0 };
  });
  layoutSlots(true);
}

export const stageOrientation = () => (stage.clientWidth >= stage.clientHeight ? 'landscape' : 'portrait');

// Horizontal screen: one row along the bottom. Vertical screen: rows of 3 along the bottom.
function layoutSlots(snap = false) {
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H || !cards.length) return;
  const portrait = stageOrientation() === 'portrait';
  const cols = portrait ? Math.min(3, cards.length) : cards.length;
  const rows = Math.ceil(cards.length / cols);
  let cw = Math.min(portrait ? 170 : 180, W / (cols + (portrait ? 0.9 : 1.5)));
  const maxCardsH = H * 0.32; // keep the face area clear
  if ((cw * CARD_RATIO + 16) * rows > maxCardsH) cw = (maxCardsH / rows - 16) / CARD_RATIO;
  cw = Math.max(64, cw);
  const ch = cw * CARD_RATIO;
  size = { cw, ch };
  cards.forEach((c, i) => {
    const row = Math.floor(i / cols), inRow = Math.min(cols, cards.length - row * cols), col = i % cols;
    const gap = (W - cw * inRow) / (inRow + 1);
    c.el.style.width = `${cw}px`; c.el.style.height = `${ch}px`;
    c.el.style.setProperty('--cw', `${cw}px`);
    const fromBottom = rows - 1 - row;
    c.slot = { x: gap + col * (cw + gap) + cw / 2, y: H - BOTTOM_PAD - ch / 2 - fromBottom * (ch + 16) };
    if (snap) c.pos = { ...c.slot };
  });
}

new ResizeObserver(() => layoutSlots()).observe(stage);

async function loadVision() {
  if (!visionLoading) {
    visionLoading = (async () => {
      const { FilesetResolver, HandLandmarker, FaceDetector } = await import(`${MP_BASE}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const withFallback = (make) => make('GPU').catch(() => make('CPU'));
      hands = await withFallback((delegate) => HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 2,
      }));
      // Face tracking only powers the look-around effect; the app works without it.
      faces = await withFallback((delegate) => FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.5,
      })).catch((e) => { console.warn('Face tracking unavailable', e); return null; });
    })();
  }
  return visionLoading;
}

// Start loading the tracking models early (e.g. while the home screen is showing).
export function preloadHands() { loadVision().catch(() => {}); }

export async function startAR(list, capturedCallback) {
  occupations = list;
  onCaptured = capturedCallback;
  Object.assign(ui, { locked: false, held: null, holdCard: null, prevPinch: {}, handPinch: [], smooth: {}, sway: 0 });
  flash.classList.remove('go');
  countdownEl.hidden = true;
  buildCards();
  setBanner('✋ Reach for a card');
  if (!running) { running = true; requestAnimationFrame(loop); }

  if (!stream) {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false,
      });
      video.srcObject = stream;
      stage.classList.remove('no-camera');
    } catch {
      stage.classList.add('no-camera');
      setStatus('Camera not available: allow camera access, or use classic mode');
      return;
    }
  }

  setStatus('Loading hand tracking…');
  try {
    await loadVision();
    setStatus(faces ? 'Hand + head tracking ready ✋🙂' : 'Hand tracking ready ✋');
  } catch (e) {
    console.warn('Hand tracking unavailable', e);
    setStatus('Hand tracking unavailable: use your mouse to pick a card');
  }
}

export function stopAR() {
  running = false;
  stream?.getTracks().forEach((t) => t.stop());
  stream = null;
  video.srcObject = null;
}

const setBanner = (t) => (banner.textContent = t);
const setStatus = (t) => (statusEl.textContent = t);

// ---------- Input ----------
stage.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect();
  Object.assign(ui.mouse, { inside: true, x: e.clientX - r.left, y: e.clientY - r.top });
});
stage.addEventListener('pointerleave', () => { ui.mouse.inside = false; ui.mouse.down = false; });
stage.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  ui.mouse.down = true; stage.setPointerCapture?.(e.pointerId);
});
stage.addEventListener('pointerup', () => (ui.mouse.down = false));

// Map a normalized point (video space) to stage pixels, accounting for object-fit: cover + mirroring.
function toStage(nx, ny) {
  const W = stage.clientWidth, H = stage.clientHeight;
  const vw = video.videoWidth || W, vh = video.videoHeight || H;
  const s = Math.max(W / vw, H / vh);
  const dw = vw * s, dh = vh * s;
  return { x: (W - dw) / 2 + (1 - nx) * dw, y: (H - dh) / 2 + ny * dh };
}

let lastVideoTime = -1, lastHands = [], frameNo = 0;
function track() {
  if (!hands || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const ts = performance.now();
  lastHands = hands.detectForVideo(video, ts).landmarks || [];
  if (faces && LOOK_AROUND && frameNo++ % 2 === 0) {
    const d = faces.detectForVideo(video, ts).detections?.[0];
    if (d) {
      const b = d.boundingBox;
      const p = toStage((b.originX + b.width / 2) / video.videoWidth, (b.originY + b.height / 2) / video.videoHeight);
      setHead((p.x / stage.clientWidth) * 2 - 1, (p.y / stage.clientHeight) * 2 - 1, 0.25);
      ui.head.seen = ts;
    }
  }
}

function setHead(x, y, k) {
  ui.head.x += (Math.max(-1, Math.min(1, x)) - ui.head.x) * k;
  ui.head.y += (Math.max(-1, Math.min(1, y)) - ui.head.y) * k;
}

function readPointers() {
  track();
  const pointers = [];
  lastHands.forEach((hand, i) => {
    const d = (a, b) => Math.hypot(hand[a].x - hand[b].x, hand[a].y - hand[b].y);
    const ratio = d(4, 8) / (d(0, 9) || 1);
    const was = ui.handPinch[i] || false;
    const pinch = was ? ratio < PINCH_OFF : ratio < PINCH_ON;
    ui.handPinch[i] = pinch;
    const tip = pinch ? { x: (hand[4].x + hand[8].x) / 2, y: (hand[4].y + hand[8].y) / 2 } : hand[8];
    pointers.push({ key: `hand${i}`, ...toStage(tip.x, tip.y), pinch });
  });
  if (ui.mouse.inside) pointers.push({ key: 'mouse', x: ui.mouse.x, y: ui.mouse.y, pinch: ui.mouse.down });

  for (const p of pointers) {
    const s = ui.smooth[p.key] || { x: p.x, y: p.y };
    s.x += (p.x - s.x) * 0.55; s.y += (p.y - s.y) * 0.55;
    ui.smooth[p.key] = s; p.x = s.x; p.y = s.y;
  }

  // No face seen recently? Let the first pointer steer the look-around effect instead.
  if (performance.now() - ui.head.seen > 800) {
    const p = pointers[0];
    if (p) setHead((p.x / stage.clientWidth) * 2 - 1, (p.y / stage.clientHeight) * 2 - 1, 0.06);
    else setHead(0, 0, 0.03);
  }
  return pointers;
}

function cardAt(x, y) {
  const { cw, ch } = size;
  const pad = 14;
  return [...cards].reverse().find((c) =>
    Math.abs(x - c.pos.x) < cw / 2 + pad && Math.abs(y - c.pos.y) < ch / 2 + pad) || null;
}

// ---------- Frame loop ----------
function loop(now = performance.now()) {
  if (!running) return;
  const pointers = ui.locked ? [] : readPointers();
  drawCursors(pointers);
  const hoverPointer = {};

  if (!ui.locked) {
    let active = null;

    if (ui.held) {
      const p = pointers.find((q) => q.key === ui.held.key);
      if (p && p.pinch) {
        ui.sway += ((p.x - ui.held.card.pos.x) * 0.9 - ui.sway) * 0.2; // lean in the direction of travel
        ui.held.card.pos = { x: p.x, y: p.y };
        active = ui.held.card;
      } else ui.held = null;
    }

    if (!ui.held) {
      ui.sway *= 0.85;
      for (const p of pointers) {
        const c = cardAt(p.x, p.y);
        const pinchStarted = p.pinch && !ui.prevPinch[p.key];
        if (c && pinchStarted) { ui.held = { card: c, key: p.key }; active = c; break; }
        if (c && !active) { active = c; hoverPointer.p = p; }
      }
    }
    for (const p of pointers) ui.prevPinch[p.key] = p.pinch;

    if (active) {
      if (active !== ui.holdCard) { ui.holdCard = active; ui.holdStart = now; }
      ui.lastActive = now;
    } else if (ui.holdCard && now - ui.lastActive > GRACE_MS) {
      ui.holdCard = null;
    }

    const progress = ui.holdCard ? Math.min(1, (now - ui.holdStart) / HOLD_MS) : 0;
    updateBanner(progress);

    for (const c of cards) {
      if (ui.held?.card !== c) {
        c.pos.x += (c.slot.x - c.pos.x) * 0.18;
        c.pos.y += (c.slot.y - c.pos.y) * 0.18;
      }
      const isActive = c === ui.holdCard;
      c.el.classList.toggle('hover', isActive);
      c.el.classList.toggle('held', ui.held?.card === c);
      c.ring.style.strokeDashoffset = String(100 * (1 - (isActive ? progress : 0)));
    }
    if (progress >= 1) select(ui.holdCard);
  }

  for (const c of cards) if (!c.el.classList.contains('chosen')) place(c, now, hoverPointer.p);
  requestAnimationFrame(loop);
}

// 3D pose of one card: idle float + look-around from head position + tilt toward the finger.
function place(c, now, pointer) {
  const t = now / 1000;
  const W = stage.clientWidth;
  const held = ui.held?.card === c, hover = c === ui.holdCard;
  const k = LOOK_AROUND;

  // Viewer to the right → right edge comes toward you (rotateY negative), viewer above → top comes toward you.
  let ry = -ui.head.x * 26 * k + ((c.pos.x - W / 2) / W) * -18 + Math.cos(t * 1.1 + c.i) * 3;
  let rx = ui.head.y * 16 * k + 8 + Math.sin(t * 1.3 + c.i) * 3; // +8: cards lean back slightly, like on a table
  let shiftX = -ui.head.x * 14 * k, shiftY = -ui.head.y * 8 * k;  // parallax
  let lift = 0, scale = 1;

  if (hover && pointer && !held) {
    const px = (pointer.x - c.pos.x) / (size.cw / 2), py = (pointer.y - c.pos.y) / (size.ch / 2);
    ry += px * 16; rx -= py * 16; lift = 40; scale = 1.08;
  }
  if (held) { ry += Math.max(-35, Math.min(35, ui.sway * 0.6)); rx = -4; lift = 90; scale = 1.25; shiftX = shiftY = 0; }

  c.tilt.x += (rx - c.tilt.x) * 0.2; c.tilt.y += (ry - c.tilt.y) * 0.2; c.lift += (lift - c.lift) * 0.2;
  const bob = held ? 0 : Math.sin(t * 1.6 + c.i * 1.7) * 4;
  c.el.style.transform =
    `translate(${c.pos.x + shiftX}px, ${c.pos.y + shiftY + bob}px) translate(-50%, -50%) ` +
    `translateZ(${c.lift}px) rotateX(${c.tilt.x}deg) rotateY(${c.tilt.y}deg) scale(${scale})`;
  c.el.style.setProperty('--sheen-x', `${50 - c.tilt.y * 2.2}%`);
  c.el.style.setProperty('--sheen-y', `${50 + c.tilt.x * 2.2}%`);
}

function updateBanner(progress) {
  if (!ui.holdCard) return setBanner('✋ Reach for a card, or pinch to pick it up');
  const left = Math.max(1, Math.ceil((HOLD_MS * (1 - progress)) / 1000));
  const verb = ui.held ? 'Holding' : 'Hovering';
  setBanner(`${ui.holdCard.occ.emoji} ${verb} ${ui.holdCard.occ.title}… ${left}`);
}

function drawCursors(pointers) {
  while (cursorsLayer.children.length < pointers.length) {
    const d = document.createElement('div'); d.className = 'ar-cursor'; cursorsLayer.appendChild(d);
  }
  [...cursorsLayer.children].forEach((d, i) => {
    const p = pointers[i];
    d.hidden = !p;
    if (!p) return;
    d.classList.toggle('pinch', p.pinch);
    d.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
  });
}

// ---------- Selection → countdown → photo ----------
async function select(card) {
  ui.locked = true;
  ui.held = null;
  cursorsLayer.innerHTML = '';
  for (const c of cards) c.el.classList.toggle('faded', c !== card);
  card.el.classList.remove('hover', 'held');
  card.el.classList.add('chosen');
  const W = stage.clientWidth, H = stage.clientHeight;
  card.el.style.transform = `translate(${W / 2}px, ${H / 2}px) translate(-50%, -50%) translateZ(120px) rotateY(360deg) scale(1.9)`;
  setBanner(`🎉 Future ${card.occ.title}! Lower your hand and get ready…`);
  await sleep(READY_MS + 800);

  // Park the card in the corner so the face is clear (re-read the size in case the screen rotated)
  const W2 = stage.clientWidth, H2 = stage.clientHeight;
  card.el.style.transform = `translate(${W2 - size.cw * 0.55 - 16}px, ${H2 - size.ch * 0.55 - 16}px) translate(-50%, -50%) scale(0.8)`;
  setBanner('😄 Smile!');
  for (let n = COUNTDOWN; n >= 1; n--) {
    countdownEl.hidden = false; countdownEl.textContent = n;
    countdownEl.style.animation = 'none'; void countdownEl.offsetWidth; countdownEl.style.animation = '';
    await sleep(1000);
  }
  countdownEl.hidden = true;
  flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');

  if (!video.videoWidth) {
    setBanner('No camera image to capture. Allow the camera, or use classic mode.');
    await sleep(2500);
    return startAR(occupations, onCaptured);
  }
  const orientation = stageOrientation();
  const photo = toCroppedDataUrl(video, video.videoWidth, video.videoHeight, true, ratioFor(orientation));
  onCaptured(card.occ, photo, orientation);
}
