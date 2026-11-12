// Loading-screen mini game: a pixel graduate (cap, gown, gold collar, diploma) runs along and
// jumps over stacks of books, like the offline-dinosaur game. It jumps by itself; players can
// also tap, click or press Space to jump. There is no game over: it's something to watch
// while the photo is being made.

// ---------- Palette ----------
const C = {
  K: '#161c45', // cap, shoes, tie
  N: '#2b3680', // gown
  M: '#222a66', // gown shade
  B: '#3b6fe0', // blue collar stripe
  Y: '#FDD00D', // gold collar, tassel
  W: '#ffffff', // shirt, highlights
  S: '#f3c9a2', // skin
  H: '#1d1d2b', // hair
  R: '#d9776b', // mouth / cheeks
  D: '#202959', // diploma
  P: '#dba6ae', // hijab
  Q: '#b9838d', // hijab shade
  G: '#c9a227', // gold trim
};

// ---------- Sprites (20 × 27, one character per pixel, "." = empty) ----------
const HEAD_BOY = [
  '...KKKKKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKK...',
  '...KKKKKKKKKKKKKKY..',
  '....HKKKKKKKKKKH..Y.',
  '...HHHHHHHHHHHHHH.Y.',
  '...HHHHSHHHHSHHHH.YY',
  '...HSSSSSSSSSSSSH...',
  '...HSSKKSSSSKKSSH...',
  '...SSSKWSSSSKWSSS...',
  '...SRSSSSSSSSSSRS...',
  '....SSSKSSSSKSSS....',
  '.....SSSKKKKSSS.....',
  '.......SSSSSS.......',
];
const HEAD_GIRL = [
  '...KKKKKKKKKKKK.....',
  '.KKKKKKKKKKKKKKKK...',
  '...KKKKKKKKKKKKKKY..',
  '...PPKKKKKKKKKKPP.Y.',
  '..PPPPPPPPPPPPPPPPY.',
  '..PPPSSSSSSSSSSPPPYY',
  '..PPSSSSSSSSSSSSPP..',
  '..PPSSKKSSSSKKSSPP..',
  '..PPSSKWSSSSKWSSPP..',
  '..QPSRSSSSSSSSRSPQ..',
  '..QPPSSKSSSSKSSPPQ..',
  '..QQPPSSKKKKSSPPQQ..',
  '...QQPPPPPPPPPPQQ...',
];
const BODY_BOY = [
  '....YYYYWKKWYYYY....',
  '...NBYYYBWKWBYYYBN..',
  '..NNNBBYBKKBYBBNNN..',
  '..NNNNNBNKKNBNNNNN..',
  '.NNNNNNNNNNNNNNNNNN.',
  '.NNNSDDDDDDDDDDSNNN.',
  '.NM.SDGDDDDDDGDS.MN.',
  '.NM.SDDDDYYDDDDS.MN.',
  '..NNNNNNNNNNNNNNNN..',
  '..NNNMNNNNNNNNMNNN..',
  '...NNNNNNNNNNNNNN...',
  '...NNNNNNNNNNNNNN...',
];
const BODY_GIRL = [
  '...QPPYYYYYYYYPPQ...',
  '...NBYYYYYYYYYYBN...',
  '..NNNBBYYYYYYBBNNN..',
  '..NNNNNBBBBBBNNNNN..',
  '.NNNNNNNNNNNNNNNNNN.',
  '.NNNSDDDDDDDDDDSNNN.',
  '.NM.SDGDDDDDDGDS.MN.',
  '.NM.SDDDDYYDDDDS.MN.',
  '..NNNNNNNNNNNNNNNN..',
  '..NNNMNNNNNNNNMNNN..',
  '...NNNNNNNNNNNNNN...',
  '...NNNNNNNNNNNNNN...',
];
const LEGS = {
  a: ['....KK......KK......', '...KKK.......KKK....'], // stride 1
  b: ['......KK..KK........', '.....KKK..KKK.......'], // stride 2
  air: ['.....KK....KK.......', '....KKK....KKK......'],
};
export const MASCOTS = {
  boy: { head: HEAD_BOY, body: BODY_BOY },
  girl: { head: HEAD_GIRL, body: BODY_GIRL },
};
export const PALETTE = C;
export const SPRITE_W = 20, SPRITE_H = 27;
export const spriteRows = (who, legs = 'a') => [...MASCOTS[who].head, ...MASCOTS[who].body, ...LEGS[legs]];

const CLOUD = ['....XXXX....', '..XXXXXXXX..', 'XXXXXXXXXXXX'];

// ---------- Game ----------
let raf = 0, stopFn = null, nextWho = 'boy';

export function stopMascot() { stopFn?.(); stopFn = null; }

export function startMascot(canvas, opts = {}) {
  stopMascot();
  const who = opts.who || nextWho;
  nextWho = who === 'boy' ? 'girl' : 'boy'; // the next player meets the other mascot
  const ctx = canvas.getContext('2d');
  const ink = getComputedStyle(document.documentElement).getPropertyValue('--secondary').trim() || '#202959';
  const shade = '#d9d5cb';

  let W = 0, H = 0, px = 4, groundY = 0;
  function resize() {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    W = canvas.width; H = canvas.height;
    px = Math.max(2, Math.floor(H / 48));      // size of one "pixel"
    groundY = H - px * 6;
    ctx.imageSmoothingEnabled = false;
  }
  resize();
  const ro = new ResizeObserver(resize); ro.observe(canvas);

  const hero = { x: 0, y: 0, vy: 0, onGround: true };
  let obstacles = [], clouds = [], specks = [];
  let speed = 0, dist = 0, last = performance.now(), spawnIn = 1.2, t = 0, bumpUntil = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 4; i++) clouds.push({ x: rand(0, 1), y: rand(0.1, 0.4), s: rand(0.6, 1.1) });
  for (let i = 0; i < 40; i++) specks.push({ x: rand(0, 1), y: rand(1, 4) | 0, w: rand(1, 3) | 0 });

  function jump() { if (hero.onGround) { hero.vy = -px * 86; hero.onGround = false; } }
  const onKey = (e) => { if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); jump(); } };
  const onTap = () => jump();
  window.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', onTap);

  function drawRows(rows, x0, y0, pal = C, s = px) {
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c];
        if (ch === '.') continue;
        ctx.fillStyle = pal[ch] || ch;
        ctx.fillRect(Math.round(x0 + c * s), Math.round(y0 + r * s), s, s);
      }
    }
  }
  function drawBooks(o) {
    const cols = ['#3b6fe0', '#FDD00D', '#e8452c', '#2b3680'];
    let y = groundY;
    for (let i = 0; i < o.n; i++) {
      const w = (o.w - (i % 2) * 2) * px, h = 3 * px, x = o.x + ((o.w * px - w) / 2);
      y -= h;
      ctx.fillStyle = cols[(o.c + i) % cols.length]; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#fff'; ctx.fillRect(x + w - px * 2, y + px, px * 2, px);     // pages
      ctx.fillStyle = ink; ctx.fillRect(x, y + h - Math.max(1, px / 2), w, Math.max(1, px / 2));
    }
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    speed = px * (95 + Math.min(70, t * 2.2));        // gets a little faster over time
    dist += speed * dt;
    hero.x = W * 0.14;

    // physics
    hero.vy += px * 260 * dt;
    hero.y += hero.vy * dt;
    if (hero.y >= 0) { hero.y = 0; hero.vy = 0; hero.onGround = true; }

    // obstacles
    spawnIn -= dt;
    if (spawnIn <= 0) {
      obstacles.push({ x: W + px * 4, n: 1 + (Math.random() * 3 | 0), w: 9 + (Math.random() * 3 | 0), c: Math.random() * 4 | 0, hit: false });
      spawnIn = rand(1.1, 2.3);
    }
    for (const o of obstacles) o.x -= speed * dt;
    obstacles = obstacles.filter((o) => o.x > -o.w * px - 10);
    // jump on its own just before a stack (players can jump earlier themselves)
    const heroRight = hero.x + 16 * px;
    const next = obstacles.find((o) => o.x + o.w * px > hero.x);
    if (next && hero.onGround && next.x - heroRight < speed * 0.16) jump();
    // a bump if a player mistimes a jump: the stack wobbles, nothing else happens
    if (next && !next.hit && next.x < heroRight - px * 3 && next.x + next.w * px > hero.x + px * 3 && -hero.y < next.n * 3 * px) {
      next.hit = true; bumpUntil = now + 300;
    }

    // ---- draw ----
    ctx.clearRect(0, 0, W, H);
    for (const c of clouds) {
      c.x -= dt * 0.02 * c.s; if (c.x < -0.2) { c.x = 1.1; c.y = rand(0.1, 0.4); }
      drawRows(CLOUD, c.x * W, c.y * H, { X: shade }, px * c.s * 1.4);
    }
    ctx.fillStyle = ink;
    ctx.fillRect(0, groundY, W, Math.max(2, px / 2));
    for (const s of specks) {
      const x = ((s.x * W - dist) % W + W) % W;
      ctx.fillRect(x, groundY + s.y * px, s.w * px, Math.max(1, px / 2));
    }
    for (const o of obstacles) drawBooks(o);

    const legs = !hero.onGround ? 'air' : (Math.floor(dist / (px * 14)) % 2 ? 'a' : 'b');
    const bob = hero.onGround && legs === 'a' ? -px : 0;
    const y0 = groundY - SPRITE_H * px + hero.y + bob;
    if (now < bumpUntil) ctx.globalAlpha = 0.6;
    drawRows([...MASCOTS[who].head, ...MASCOTS[who].body, ...LEGS[legs]], hero.x, y0);
    ctx.globalAlpha = 1;

    // score, dino-style
    ctx.fillStyle = ink;
    ctx.font = `700 ${px * 4}px ui-monospace, "JetBrains Mono", Menlo, monospace`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(`XP ${String(Math.floor(dist / (px * 10))).padStart(5, '0')}`, W - px * 4, px * 3);

    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);

  stopFn = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('pointerdown', onTap);
  };
}
