// Motion between pages: a yellow panel sweeps up over the screen carrying one giant word,
// the page changes underneath it, then the panel leaves through the top.
// Also a small "press" ripple on every button.

const WORDS = { home: 'hello', ar: 'ready?', cards: 'pick', camera: 'smile', loading: 'magic', result: 'ta-da' };
const IN_MS = 360;   // panel covers the screen
const OUT_MS = 420;  // panel leaves
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

let wipeEl, wordEl, busy = false, pending = null;

function ensureWipe() {
  if (wipeEl) return;
  wipeEl = document.createElement('div');
  wipeEl.className = 'wipe';
  wipeEl.setAttribute('aria-hidden', 'true');
  wipeEl.innerHTML = '<div class="wipe-panel"><span class="wipe-word"></span></div>';
  document.body.appendChild(wipeEl);
  wordEl = wipeEl.querySelector('.wipe-word');
}

/**
 * Change page with the wipe. `swap(name)` does the real page change; it runs while the
 * panel covers the screen. If another change is asked for mid-wipe, the last one wins.
 */
export function transitionTo(name, swap) {
  if (reduced() || !document.body.dataset.screen) return swap(name); // first paint: no wipe
  pending = name;
  if (busy) return;
  ensureWipe();
  busy = true;
  wordEl.textContent = WORDS[name] || '';
  wipeEl.className = 'wipe in';
  setTimeout(() => {
    const target = pending; pending = null;
    swap(target);
    wordEl.textContent = WORDS[target] || '';
    wipeEl.className = 'wipe out';
    setTimeout(() => {
      wipeEl.className = 'wipe';
      busy = false;
      if (pending) transitionTo(pending, swap); // a change arrived during the exit
    }, OUT_MS);
  }, IN_MS);
}

// Ripple from where the button was pressed.
export function initButtonMotion() {
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest?.('.btn, .ar-tab, .cat-tab, .card');
    if (!b || b.disabled || reduced()) return;
    const r = b.getBoundingClientRect();
    const s = document.createElement('span');
    s.className = 'ripple';
    const d = Math.max(r.width, r.height) * 2.2;
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    b.appendChild(s);
    setTimeout(() => s.remove(), 650);
  });
}
