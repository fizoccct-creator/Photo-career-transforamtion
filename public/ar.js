// AR card picker: the webcam fills the stage and the career cards float in 3D along the top.
// - The player stands in the marked zone in the middle of the screen, at medium-shot distance
//   (waist up in the photo).
// - First page: point at a category (Business, Sports, …) to open it. Only that category's careers
//   are shown; the tabs at the top switch category, "← Categories" goes back.
// - Point at a card with ONE finger (index out, other fingers folded) for GRAB_MS and it sticks to
//   your finger. Open your hand to let go of it.
// - Pull it down below the line and keep it there for CONFIRM_MS to choose it; a card that stays
//   in the top area is never chosen. Then a COUNTDOWN takes the photo.
// - "✕ Cancel" (point at it, or click) puts a held card back, or stops the countdown.
// - The cards react in 3D: they tilt toward your finger, and when you move your head they turn
//   as if you're looking around them (head tracking, with the hand or mouse as a fallback).
// - The mouse works as a stand-in finger (move = point).
// - One player at a time: the closest face inside the zone is the player, and only a hand that
//   belongs to that face (close to it, about the same size) can pick up cards.
import { toCroppedDataUrl, ratioFor, sleep } from './util.js';

// ---- Settings you may want to tweak ----
const GRAB_MS = 600;           // point at a card this long to pick it up
const PRESS_MS = 700;          // point at a button (category, tab, cancel) this long to press it
const CONFIRM_MS = 800;        // keep the carried card below the line this long to choose it
const POINT_ONLY = true;       // only a pointing hand (one finger out) moves the cursor; false = any hand
const DROP_MS = 700;           // a carried card goes back if the hand is lost for this long
const COUNTDOWN = 5;           // seconds of countdown before the photo is taken
const READY_MS = 1500;         // pause after choosing, to lower your hand
const CARD_RATIO = 4 / 3;      // card height / width (design your card images at 3:4, e.g. 750×1000)
const ROW_LANDSCAPE = 8;       // cards per row along the top: horizontal screens…
const ROW_PORTRAIT = 4;        // …and vertical screens
const LOOK_AROUND = 1;         // strength of the head-tracked 3D effect (0 = off)
// Stand zone: where the player has to stand to play
const ZONE_WIDTH = 0.42;       // share of the screen width, centred (landscape screens)
const ZONE_WIDTH_PORTRAIT = 0.6; // same, for vertical screens
// Medium shot (waist up): the face is about 1/5 of the photo height. Measured as face height / photo height.
const SHOT_TARGET = 0.2;       // ideal medium shot (used to draw the guide silhouette)
const SHOT_MIN = 0.15;         // smaller face = too far, more than waist up ("step closer")
const SHOT_MAX = 0.27;         // bigger face = too close, only chest up ("step back")
// One-player lock (sizes are in face widths, so they work at any distance from the camera)
const MIN_FACE = 0.04;         // ignore faces narrower than this share of the camera width (people far away)
const PLAYER_LOST_MS = 1500;   // keep the player this long when their face is briefly hidden
const TAKEOVER_RATIO = 1.5;    // someone this much closer (bigger face) than the player…
const TAKEOVER_MS = 1200;      // …for this long, while no card is in progress, becomes the new player
const REACH = 4.5;             // a hand counts only if its wrist is within this many face widths of the face
const MIN_HAND = 0.35;         // and its palm is at least this many face widths long (not a hand further back)
// -----------------------------------------

const GRACE_MS = 350;          // tolerate short tracking dropouts before resetting the timer
const POSE_GRACE_MS = 250;     // a pointing finger that briefly looks open still counts
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
const catsEl = $('#arCats');
const tabsEl = $('#arTabs');
const cancelBtn = $('#arCancel');

let hands = null, faces = null, visionLoading = null;
let stream = null;
let running = false;
let occupations = [];
let categories = [];        // categories that have at least one career
let cards = [];             // { occ, el, ring, slot, pos, tilt:{x,y}, lift }
let onCaptured = () => {};
let size = { cw: 100, ch: 133 };

const ui = {
  locked: false,
  grab: null,               // card stuck to a finger: { card, key, lostAt }
  hoverCard: null, hoverKey: null, hoverStart: 0, lastActive: 0,
  confirmStart: 0,          // when the carried card went above the lift line
  smooth: {},
  mouse: { inside: false, x: 0, y: 0 },
  head: { x: 0, y: 0, seen: 0 },  // viewer position, -1..1 (smoothed)
  player: null,                    // locked face, in video pixels: { cx, cy, w, seen, challenge }
  handLock: null,                  // wrist of the player's active hand, in video pixels
  faces: [],                       // every face seen this frame (to tell whose hand is whose)
  zoneHint: 'none',                // why nobody is playing yet: none | far | near | side
  sway: 0,                         // extra tilt from moving a held card
  page: 'categories',              // categories | cards
  category: null,                  // open category id
  hot: null, hotDone: null,        // button being pointed at: { el, start, last }; button just pressed
  session: 0,                      // bumped by Cancel to stop a running countdown
  captured: false,                 // photo taken: nothing left to cancel
  note: null,                      // short message shown in the banner: { text, until }
  pose: { last: -1e9 },            // last time the player's hand made a pointing pose
  openHand: false,                 // the player's hand is visible but not pointing
};

// ---------- Setup ----------
function buildCards(list) {
  cardsLayer.innerHTML = '';
  cards = list.map((occ, i) => {
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
  for (const c of cards) c.pos.y = -size.ch; // slide in from the top
}

// ---------- Pages: categories → careers of one category ----------
function buildCategoryUI() {
  catsEl.innerHTML = ''; tabsEl.innerHTML = '';
  const button = (cls, html, onPress) => {
    const b = document.createElement('button');
    b.className = `pointable ${cls}`; b.innerHTML = html;
    b.addEventListener('click', onPress);
    return b;
  };
  tabsEl.append(button('ar-tab back', '← Categories', showCategories));
  for (const cat of categories) {
    const n = occupations.filter((o) => o.category === cat.id).length;
    const tile = button('ar-cat', `<span class="emoji">${cat.emoji}</span><span class="title">${cat.title}</span><span class="count">${n} careers</span>`, () => openCategory(cat.id));
    tile.style.setProperty('--c', cat.color || 'var(--secondary)');
    tile.dataset.title = cat.title;
    catsEl.append(tile);
    const tab = button('ar-tab', `${cat.emoji} ${cat.title}`, () => openCategory(cat.id));
    tab.dataset.cat = cat.id; tab.dataset.title = cat.title;
    tabsEl.append(tab);
  }
}

function showCategories() {
  if (ui.locked) return;
  if (!categories.length) return openCategory(null); // no categories set up: show every career
  resetHold();
  ui.page = 'categories'; ui.category = null;
  cards = []; cardsLayer.innerHTML = '';
  catsEl.hidden = false; tabsEl.hidden = true;
}

function openCategory(id) {
  if (ui.locked) return;
  resetHold();
  ui.page = 'cards'; ui.category = id;
  catsEl.hidden = true; tabsEl.hidden = !categories.length; // show the tabs first: the cards go under them
  buildCards(id ? occupations.filter((o) => o.category === id) : occupations);
  for (const t of tabsEl.children) t.classList.toggle('active', t.dataset.cat === id);
}

function resetHold() {
  Object.assign(ui, { grab: null, hoverCard: null, confirmStart: 0, hot: null, sway: 0 });
}

export const stageOrientation = () => (stage.clientWidth >= stage.clientHeight ? 'landscape' : 'portrait');

// Cards sit along the top, under the category tabs: rows of ROW_LANDSCAPE (horizontal screens)
// or ROW_PORTRAIT (vertical screens). The player reaches up to point, then pulls a card down.
function layoutSlots(snap = false) {
  const W = stage.clientWidth, H = stage.clientHeight;
  if (!W || !H || !cards.length) return;
  const portrait = stageOrientation() === 'portrait';
  const cols = Math.min(cards.length, portrait ? ROW_PORTRAIT : ROW_LANDSCAPE);
  const rows = Math.ceil(cards.length / cols);
  let cw = Math.min(portrait ? 170 : 180, W / (cols + (portrait ? 0.9 : 1.5)));
  const maxCardsH = H * (rows > 1 ? 0.4 : 0.32); // leave room to pull a card down
  if ((cw * CARD_RATIO + 16) * rows > maxCardsH) cw = (maxCardsH / rows - 16) / CARD_RATIO;
  cw = Math.max(64, cw);
  const ch = cw * CARD_RATIO;
  size = { cw, ch };
  cards.forEach((c, i) => {
    const row = Math.floor(i / cols), inRow = Math.min(cols, cards.length - row * cols), col = i % cols;
    const gap = (W - cw * inRow) / (inRow + 1);
    c.el.style.width = `${cw}px`; c.el.style.height = `${ch}px`;
    c.el.style.setProperty('--cw', `${cw}px`);
    c.slot = { x: gap + col * (cw + gap) + cw / 2, y: trayTop() + ch / 2 + row * (ch + 16) };
    if (snap) c.pos = { ...c.slot };
  });
}

// Top of the card area: just under the buttons and category tabs.
function trayTop() {
  const s = stage.getBoundingClientRect();
  const bars = [stage.querySelector('.ar-topbar'), tabsEl].filter((e) => e && !e.hidden && e.offsetHeight);
  return Math.max(70, ...bars.map((e) => e.getBoundingClientRect().bottom - s.top)) + 22;
}
const trayBottom = () => Math.max(...cards.map((c) => c.slot.y)) + size.ch / 2;

new ResizeObserver(() => layoutSlots()).observe(stage);

async function loadVision() {
  if (!visionLoading) {
    visionLoading = (async () => {
      const { FilesetResolver, HandLandmarker, FaceDetector } = await import(`${MP_BASE}/vision_bundle.mjs`);
      const fileset = await FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
      const withFallback = (make) => make('GPU').catch(() => make('CPU'));
      hands = await withFallback((delegate) => HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate }, runningMode: 'VIDEO', numHands: 4, // see everyone's hands, then keep only the player's
      }));
      // Face tracking picks the player and powers the look-around effect; the app works without it.
      faces = await withFallback((delegate) => FaceDetector.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL, delegate }, runningMode: 'VIDEO', minDetectionConfidence: 0.5,
      })).catch((e) => { console.warn('Face tracking unavailable', e); return null; });
    })();
  }
  return visionLoading;
}

// Start loading the tracking models early (e.g. while the home screen is showing).
export function preloadHands() { loadVision().catch(() => {}); }

export async function startAR(list, cats, capturedCallback) {
  occupations = list;
  categories = (cats || []).filter((cat) => list.some((o) => o.category === cat.id));
  onCaptured = capturedCallback;
  Object.assign(ui, { locked: false, captured: false, smooth: {}, player: null, handLock: null, zoneHint: 'none', hotDone: null });
  ui.session++;
  flash.classList.remove('go');
  countdownEl.hidden = true;
  buildCategoryUI();
  showCategories();
  setBanner(faces ? '🧍 Stand in the frame to play' : '☝️ Point at a category');
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
stage.addEventListener('pointerleave', () => { ui.mouse.inside = false; });

// Map a normalized point (video space) to stage pixels, accounting for object-fit: cover + mirroring.
function toStage(nx, ny) {
  const W = stage.clientWidth, H = stage.clientHeight;
  const vw = video.videoWidth || W, vh = video.videoHeight || H;
  const s = Math.max(W / vw, H / vh);
  const dw = vw * s, dh = vh * s;
  return { x: (W - dw) / 2 + (1 - nx) * dw, y: (H - dh) / 2 + ny * dh };
}

// Stage pixels per video pixel (object-fit: cover).
const videoScale = () => Math.max(stage.clientWidth / (video.videoWidth || 1), stage.clientHeight / (video.videoHeight || 1));

let lastVideoTime = -1, lastHands = [];
function track() {
  if (!hands || video.readyState < 2 || video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const ts = performance.now();
  const vw = video.videoWidth, vh = video.videoHeight;
  lastHands = hands.detectForVideo(video, ts).landmarks || [];
  if (faces) {
    const found = (faces.detectForVideo(video, ts).detections || [])
      .map(({ boundingBox: b }) => ({ cx: b.originX + b.width / 2, cy: b.originY + b.height / 2, w: b.width, h: b.height }))
      .filter((f) => f.w >= vw * MIN_FACE);
    updatePlayer(found, ts);
  }
  const p = ui.player;
  if (p && LOOK_AROUND && ts - p.seen < 800) {
    const s = toStage(p.cx / vw, p.cy / vh);
    setHead((s.x / stage.clientWidth) * 2 - 1, (s.y / stage.clientHeight) * 2 - 1, 0.25);
    ui.head.seen = ts;
  }
}

// Where a face is relative to the stand zone: in | far | near | side
function zoneStatus(f) {
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
  const shot = (f.h || f.w) / photoHeight();
  if (shot < SHOT_MIN) return 'far';
  if (shot > SHOT_MAX) return 'near';
  const x = toStage(f.cx / vw, f.cy / vh).x / stage.clientWidth;
  return Math.abs(x - 0.5) <= zoneWidth() / 2 ? 'in' : 'side';
}
// Height (video pixels) of the part of the camera image that ends up in the photo.
function photoHeight() {
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1, r = ratioFor(stageOrientation());
  return vw / vh > r ? vh : vw / r;
}
const zoneWidth = () => (stageOrientation() === 'portrait' ? ZONE_WIDTH_PORTRAIT : ZONE_WIDTH);

// Keep following the same face; switch only when they leave, or someone clearly closer stays put.
function updatePlayer(all, ts) {
  ui.faces = all;
  const biggest = (list) => list.reduce((a, b) => (!a || b.w > a.w ? b : a), null);
  const found = all.filter((f) => zoneStatus(f) === 'in'); // only people in the stand zone can play
  ui.zoneHint = found.length ? 'in' : all.length ? zoneStatus(biggest(all)) : 'none';
  const lock = (f) => { ui.player = { ...f, seen: ts, challenge: 0 }; ui.handLock = null; };
  const p = ui.player;
  if (!p) { if (found.length) lock(biggest(found)); return; }

  const match = found
    .map((f) => ({ f, d: Math.hypot(f.cx - p.cx, f.cy - p.cy) }))
    .filter(({ d }) => d < p.w * 0.6) // the same person barely moves between frames
    .sort((a, b) => a.d - b.d)[0]?.f;
  if (match) {
    p.cx += (match.cx - p.cx) * 0.5; p.cy += (match.cy - p.cy) * 0.5; p.w += (match.w - p.w) * 0.3;
    p.seen = ts;
  }

  const rival = biggest(found.filter((f) => f !== match));
  const busy = ui.grab || ui.hoverCard || ui.hot || ui.locked;
  if (rival && !busy && rival.w > (match ? match.w : p.w) * TAKEOVER_RATIO) {
    p.challenge ||= ts;
    if (ts - p.challenge > TAKEOVER_MS) return lock(rival);
  } else p.challenge = 0;

  if (!match && ts - p.seen > PLAYER_LOST_MS) {
    ui.player = null; ui.handLock = null;
    if (found.length) lock(biggest(found));
  }
}

// The one hand allowed to interact: the player's hand (or, with no face to go on, the closest hand).
function pickPlayerHand(list) {
  const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
  const now = performance.now();
  const hs = list.map((hand) => {
    const wrist = { x: hand[0].x * vw, y: hand[0].y * vh };
    const palm = Math.hypot((hand[9].x - hand[0].x) * vw, (hand[9].y - hand[0].y) * vh);
    return { hand, wrist, palm };
  });
  const p = ui.player && now - ui.player.seen < PLAYER_LOST_MS ? ui.player : null;
  let candidates = hs;
  if (p) {
    // A hand belongs to whichever face is nearest to it (measured in that face's widths).
    const reach = (f, wrist) => Math.hypot(wrist.x - f.cx, wrist.y - f.cy) / f.w;
    const others = ui.faces.filter((f) => Math.hypot(f.cx - p.cx, f.cy - p.cy) > p.w * 0.6);
    candidates = hs.filter(({ wrist, palm }) => {
      const mine = reach(p, wrist);
      return palm >= p.w * MIN_HAND && mine <= REACH && others.every((f) => reach(f, wrist) > mine);
    });
  } else if (faces) {
    candidates = []; // nobody in the stand zone (or the player's face is gone): ignore all hands
  }
  if (!candidates.length) { ui.handLock = null; return null; }

  const lockRange = (p ? p.w : 120) * 2;
  const near = (pt) => (a, b) => Math.hypot(a.wrist.x - pt.x, a.wrist.y - pt.y) - Math.hypot(b.wrist.x - pt.x, b.wrist.y - pt.y);
  let chosen = null;
  if (ui.handLock) {
    const same = [...candidates].sort(near(ui.handLock))[0];
    if (Math.hypot(same.wrist.x - ui.handLock.x, same.wrist.y - ui.handLock.y) < lockRange) chosen = same;
  }
  if (!chosen) {
    chosen = p ? [...candidates].sort(near({ x: p.cx, y: p.cy }))[0] : [...candidates].sort((a, b) => b.palm - a.palm)[0];
  }
  ui.handLock = { ...chosen.wrist };
  return chosen.hand;
}

function setHead(x, y, k) {
  ui.head.x += (Math.max(-1, Math.min(1, x)) - ui.head.x) * k;
  ui.head.y += (Math.max(-1, Math.min(1, y)) - ui.head.y) * k;
}

// Pointing pose: index finger out; middle finger and the ring or little finger folded.
// (3D distances from the wrist, so it still works when the finger points toward the camera.)
export function isPointing(h, vw = 1, vh = 1) {
  const d = (a, b) => Math.hypot((h[a].x - h[b].x) * vw, (h[a].y - h[b].y) * vh, ((h[a].z || 0) - (h[b].z || 0)) * vw);
  const out = (tip, pip) => d(0, tip) > d(0, pip) * 1.1;   // tip further from the wrist than the middle joint
  const folded = (tip, pip) => d(0, tip) < d(0, pip);       // tip curled back toward the palm
  if (!out(8, 6) || !folded(12, 10)) return false;          // index out, middle folded (not a peace sign)
  return folded(16, 14) || folded(20, 18);                   // and the ring or little finger folded too
}

// At most ONE cursor on screen: the player's pointing finger, or (with no hand) the mouse.
function readPointers() {
  track();
  const pointers = [];
  const now = performance.now();
  const hand = pickPlayerHand(lastHands);
  const posed = hand && (!POINT_ONLY || isPointing(hand, video.videoWidth || 1, video.videoHeight || 1));
  if (posed) ui.pose.last = now;
  const pointing = hand && (posed || now - ui.pose.last < POSE_GRACE_MS);
  ui.openHand = !!hand && !pointing;
  if (pointing) pointers.push({ key: 'hand', ...toStage(hand[8].x, hand[8].y) }); // index fingertip
  else if (ui.mouse.inside && !hand) pointers.push({ key: 'mouse', x: ui.mouse.x, y: ui.mouse.y });

  for (const k of Object.keys(ui.smooth)) if (!pointers.some((p) => p.key === k)) delete ui.smooth[k];
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

// On-screen guides: the stand zone, the player's face frame, and the line to lift a card above.
const zoneEl = document.createElement('div');
zoneEl.className = 'ar-zone';
zoneEl.innerHTML = '<span>Stand here · waist up</span>';
// Medium-shot outline (head + shoulders down to the waist): line up with it before playing.
const shapeEl = document.createElement('div');
shapeEl.className = 'ar-shape';
shapeEl.innerHTML = `<svg viewBox="0 0 200 300" preserveAspectRatio="none">
  <ellipse cx="100" cy="50" rx="34" ry="44"/>
  <path d="M100 116 C72 116 64 126 48 136 C24 148 14 172 14 210 L14 300 M186 300 L186 210 C186 172 176 148 152 136 C136 126 128 116 100 116"/>
</svg>`;
const liftEl = document.createElement('div');
liftEl.className = 'ar-lift';
liftEl.innerHTML = '<span>⬇ Pull the card down below this line</span>';
const playerEl = document.createElement('div');
playerEl.className = 'ar-player';
playerEl.innerHTML = '<span>Player</span>';
zoneEl.prepend(shapeEl); // clipped to the stand frame
cardsLayer.before(zoneEl, liftEl, playerEl); // the player outline goes behind the cards

// The carried card (its centre, where the finger is) must go below this line to be chosen.
function pullLineY() {
  return Math.min(stage.clientHeight * 0.8, trayBottom() + size.ch * 0.6);
}

function drawGuides() {
  const W = stage.clientWidth, H = stage.clientHeight;
  const p = ui.player;
  const playing = p && performance.now() - p.seen < PLAYER_LOST_MS;

  zoneEl.hidden = ui.locked || !faces;
  const zw = zoneWidth() * W, zoneTop = H * 0.05;
  if (!zoneEl.hidden) {
    // Runs behind the cards, from near the top down to just above the banner.
    zoneEl.style.left = `${(W - zw) / 2}px`; zoneEl.style.width = `${zw}px`;
    zoneEl.style.top = `${zoneTop}px`; zoneEl.style.height = `${H - 110 - zoneTop}px`;
    zoneEl.classList.toggle('occupied', !!playing);
  }

  // Cancel: only when there is something to cancel (a card in your hand, or the countdown).
  // It sits just under the cards, beside the stand frame, above the pull-down line.
  cancelBtn.hidden = ui.captured || !(ui.grab || ui.locked);
  if (!cancelBtn.hidden) {
    const bw = cancelBtn.offsetWidth, bh = cancelBtn.offsetHeight;
    const x = Math.min(W - bw - 16, (W + zw) / 2 + 24);
    const y = cards.length ? Math.min(trayBottom() + 18, pullLineY() - bh - 12) : H * 0.4;
    cancelBtn.style.left = `${x}px`; cancelBtn.style.top = `${y}px`;
  }

  // The outline is drawn so a face of SHOT_TARGET size at the top of the photo means waist up.
  shapeEl.hidden = zoneEl.hidden || !!playing;
  if (!shapeEl.hidden && video.videoWidth) {
    const vh = video.videoHeight, ph = photoHeight();
    const k = (SHOT_TARGET * ph * videoScale()) / 63;          // svg units → stage px (face box ≈ 63 units)
    const headY = toStage(0.5, ((vh - ph) / 2 + ph * 0.25) / vh).y; // face centre ~1/4 down the photo
    shapeEl.style.width = `${200 * k}px`; shapeEl.style.height = `${300 * k}px`;
    shapeEl.style.transform = `translate(${zw / 2 - 100 * k}px, ${headY - 50 * k - zoneTop}px)`; // zone-relative
  }

  liftEl.hidden = ui.locked || !ui.grab;
  if (!liftEl.hidden) {
    liftEl.style.transform = `translateY(${pullLineY()}px)`;
    liftEl.classList.toggle('reached', !!ui.confirmStart);
  }

  playerEl.hidden = ui.locked || !playing;
  if (!playerEl.hidden) {
    const c = toStage(p.cx / video.videoWidth, p.cy / video.videoHeight);
    const w = p.w * videoScale() * 1.25;
    playerEl.style.width = `${w}px`; playerEl.style.height = `${w * 1.3}px`;
    playerEl.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -50%)`;
  }
}

function cardAt(x, y) {
  const { cw, ch } = size;
  const pad = 14;
  return [...cards].reverse().find((c) =>
    Math.abs(x - c.pos.x) < cw / 2 + pad && Math.abs(y - c.pos.y) < ch / 2 + pad) || null;
}

// ---------- Buttons you press by pointing (categories, tabs, cancel) ----------
// Which buttons the finger can press right now.
function pressable() {
  if (ui.captured) return [];
  if (ui.locked || ui.grab) return cancelBtn.hidden ? [] : [cancelBtn];
  if (ui.page === 'categories') return [...catsEl.children];
  return tabsEl.hidden ? [] : [...tabsEl.children].filter((t) => !t.classList.contains('active'));
}

function buttonAt(x, y, list) {
  const s = stage.getBoundingClientRect(), pad = 10;
  return list.find((el) => {
    const r = el.getBoundingClientRect();
    return x >= r.left - s.left - pad && x <= r.right - s.left + pad && y >= r.top - s.top - pad && y <= r.bottom - s.top + pad;
  }) || null;
}

let shownHot = null;
function updateButtons(pointers, now) {
  const list = pressable();
  let over = null;
  for (const p of pointers) if ((over = buttonAt(p.x, p.y, list))) break;
  if (ui.hotDone && over !== ui.hotDone) ui.hotDone = null; // move off a pressed button to press again
  if (over && over === ui.hotDone) over = null;

  if (over) {
    if (ui.hot?.el !== over) ui.hot = { el: over, start: now, last: now };
    else ui.hot.last = now;
  } else if (ui.hot && (now - ui.hot.last > GRACE_MS || !list.includes(ui.hot.el))) ui.hot = null;

  const el = ui.hot?.el || null;
  if (shownHot && shownHot !== el) { shownHot.style.setProperty('--p', 0); shownHot.classList.remove('pointing'); }
  shownHot = el;
  if (!el) return;
  const p = Math.min(1, (now - ui.hot.start) / PRESS_MS);
  el.style.setProperty('--p', p); el.classList.add('pointing');
  if (p >= 1) {
    ui.hot = null; ui.hotDone = el;
    el.style.setProperty('--p', 0); el.classList.remove('pointing'); shownHot = null;
    el.click();
  }
}

// Cancel: put the held card back, or stop the countdown and go back to the cards.
cancelBtn.addEventListener('click', () => {
  if (ui.captured) return;
  if (ui.locked) {
    ui.session++; // stops select() where it is
    ui.locked = false;
    countdownEl.hidden = true;
    for (const c of cards) c.el.classList.remove('faded', 'chosen');
  }
  resetHold();
  ui.note = { text: '↩️ Cancelled. Point at another card', until: performance.now() + 1800 };
});

// ---------- Frame loop ----------
function loop(now = performance.now()) {
  if (!running) return;
  const pointers = ui.captured ? [] : readPointers();
  drawCursors(pointers);
  drawGuides();
  updateButtons(pointers, now);
  let tiltPointer = null;

  if (!ui.locked && ui.page === 'cards') {
    let ring = 0, ringCard = null; // progress shown around a card: picking it up, then confirming

    // Carrying a card: it follows the finger; above the lift line it gets confirmed.
    if (ui.grab) {
      const g = ui.grab, c = g.card;
      const p = pointers.find((q) => q.key === g.key);
      if (p) {
        g.lostAt = 0;
        ui.sway += ((p.x - c.pos.x) * 0.9 - ui.sway) * 0.2; // lean in the direction of travel
        c.pos = { x: p.x, y: p.y };
      } else if (!g.lostAt) g.lostAt = now;

      if (g.lostAt && now - g.lostAt > DROP_MS) { ui.grab = null; ui.confirmStart = 0; } // hand gone: put it back
      else {
        if (c.pos.y > pullLineY()) {
          ui.confirmStart ||= now;
          ring = Math.min(1, (now - ui.confirmStart) / CONFIRM_MS);
        } else ui.confirmStart = 0; // still in the top area: not chosen
        ringCard = c;
      }
    }

    // Not carrying: point at a card for GRAB_MS to pick it up.
    if (!ui.grab) {
      ui.sway *= 0.85;
      let over = null;
      for (const p of ui.hot ? [] : pointers) {
        const c = cardAt(p.x, p.y);
        if (c) { over = c; tiltPointer = p; ui.hoverKey = p.key; break; }
      }
      if (over) {
        if (over !== ui.hoverCard) { ui.hoverCard = over; ui.hoverStart = now; }
        ui.lastActive = now;
      } else if (ui.hoverCard && now - ui.lastActive > GRACE_MS) ui.hoverCard = null;

      if (ui.hoverCard) {
        ring = Math.min(1, (now - ui.hoverStart) / GRAB_MS); ringCard = ui.hoverCard;
        if (ring >= 1) {
          ui.grab = { card: ui.hoverCard, key: ui.hoverKey, lostAt: 0 };
          ui.hoverCard = null; ui.confirmStart = 0; ring = 0;
        }
      }
    }
    for (const c of cards) {
      if (ui.grab?.card !== c) {
        c.pos.x += (c.slot.x - c.pos.x) * 0.18;
        c.pos.y += (c.slot.y - c.pos.y) * 0.18;
      }
      c.el.classList.toggle('hover', c === ui.hoverCard);
      c.el.classList.toggle('held', ui.grab?.card === c);
      c.ring.style.strokeDashoffset = String(100 * (1 - (c === ringCard ? ring : 0)));
    }
    if (ui.grab && ui.confirmStart && now - ui.confirmStart >= CONFIRM_MS) select(ui.grab.card);
  }
  if (!ui.locked) updateBanner();

  for (const c of cards) if (!c.el.classList.contains('chosen')) place(c, now, tiltPointer);
  requestAnimationFrame(loop);
}

// 3D pose of one card: idle float + look-around from head position + tilt toward the finger.
function place(c, now, pointer) {
  const t = now / 1000;
  const W = stage.clientWidth;
  const held = ui.grab?.card === c, hover = c === ui.hoverCard;
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

const ZONE_HINTS = {
  none: '🧍 Stand in the frame to play',
  far: '🚶 Step closer: we want you waist up',
  near: '↩️ Step back a little: we want you waist up',
  side: '🧍 Move into the frame in the middle',
};

function updateBanner() {
  const g = ui.grab;
  const hot = ui.hot?.el;
  if (!g && !hot && !ui.hoverCard && ui.note && performance.now() < ui.note.until) return setBanner(ui.note.text);
  if (g) {
    const { emoji, title } = g.card.occ;
    if (hot === cancelBtn) return setBanner(`✕ Putting ${title} back…`);
    if (g.lostAt) return setBanner(`✋ Letting go of ${title}…`);
    return setBanner(ui.confirmStart ? `✨ Keep ${title} down there…` : `⬇ Pull ${emoji} ${title} down below the line to choose it`);
  }
  if (hot) {
    if (hot.classList.contains('back')) return setBanner('☝️ Going back to the categories…');
    return setBanner(ui.page === 'categories' ? `☝️ Opening ${hot.dataset.title}…` : `☝️ Switching to ${hot.dataset.title}…`);
  }
  if (ui.hoverCard) return setBanner(`☝️ Picking up ${ui.hoverCard.occ.title}…`);
  const playing = ui.player && performance.now() - ui.player.seen < PLAYER_LOST_MS;
  if (faces && hands && !playing && !ui.mouse.inside) return setBanner(ZONE_HINTS[ui.zoneHint] || ZONE_HINTS.none);
  if (ui.openHand) return setBanner('☝️ Point with one finger');
  setBanner(ui.page === 'categories' ? '☝️ Point at a category to choose it' : '☝️ Point at a card to pick it up');
}

function drawCursors(pointers) {
  while (cursorsLayer.children.length < pointers.length) {
    const d = document.createElement('div'); d.className = 'ar-cursor'; cursorsLayer.appendChild(d);
  }
  [...cursorsLayer.children].forEach((d, i) => {
    const p = pointers[i];
    d.hidden = !p;
    if (!p) return;
    d.classList.toggle('carrying', ui.grab?.key === p.key);
    d.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
  });
}

// ---------- Selection → countdown → photo ----------
async function select(card) {
  ui.locked = true;
  const token = ++ui.session;
  const wait = async (ms) => { await sleep(ms); return token === ui.session; }; // false: cancelled
  ui.grab = null; ui.hoverCard = null; ui.confirmStart = 0; ui.hot = null;
  for (const c of cards) c.el.classList.toggle('faded', c !== card);
  card.el.classList.remove('hover', 'held');
  card.el.classList.add('chosen');
  const W = stage.clientWidth, H = stage.clientHeight;
  card.el.style.transform = `translate(${W / 2}px, ${H / 2}px) translate(-50%, -50%) translateZ(120px) rotateY(360deg) scale(1.9)`;
  setBanner(`🎉 Future ${card.occ.title}! Lower your hand and get ready…`);
  if (!await wait(READY_MS + 800)) return;

  // Park the card in the corner so the face is clear (re-read the size in case the screen rotated)
  const W2 = stage.clientWidth, H2 = stage.clientHeight;
  card.el.style.transform = `translate(${W2 - size.cw * 0.55 - 16}px, ${H2 - size.ch * 0.55 - 16}px) translate(-50%, -50%) scale(0.8)`;
  setBanner('😄 Smile!');
  for (let n = COUNTDOWN; n >= 1; n--) {
    countdownEl.hidden = false; countdownEl.textContent = n;
    countdownEl.style.animation = 'none'; void countdownEl.offsetWidth; countdownEl.style.animation = '';
    if (!await wait(1000)) return;
  }
  ui.captured = true; // too late to cancel now
  countdownEl.hidden = true;
  flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');

  if (!video.videoWidth) {
    setBanner('No camera image to capture. Allow the camera, or use classic mode.');
    await sleep(2500);
    return startAR(occupations, categories, onCaptured);
  }
  const orientation = stageOrientation();
  const photo = toCroppedDataUrl(video, video.videoWidth, video.videoHeight, true, ratioFor(orientation));
  onCaptured(card.occ, photo, orientation);
}
