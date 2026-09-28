'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

// Retro palette; each skin in SKINS carries its own palette with the same indices.
const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#64b5f6', // J - pale blue
  '#ffb74d', // L - orange
  '#90a4ae', // Nut - metallic gray
  '#ef5350', // Bomba
  '#fff176', // Rayo
  '#f06292', // Tinte
  '#7e57c2', // Gravedad
  '#b3e5fc', // Congelar
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut (challenge)
  [[9]],                                       // Bomba
  [[10]],                                      // Rayo
  [[11]],                                      // Tinte
  [[12]],                                      // Gravedad
  [[13]],                                      // Congelar
];

const NUT_TYPE = 8;
const NUT_CHANCE = 0.05;

// Power-ups: 1×1 pieces whose effect fires on lock; never stored in `board`.
const BOMB = 9, RAY = 10, TINT = 11, GRAVITY = 12, FREEZE = 13;
const POWERUP_MIN = BOMB;
const POWERUP_COUNT = 5;
const POWERUP_EVERY = 5; // lines
const POWERUP_BLOCK_SCORE = 10;
const FREEZE_MS = 5000;
const POWERUP_INFO = {
  [BOMB]:    { icon: '💣', name: 'Bomba' },
  [RAY]:     { icon: '⚡', name: 'Rayo' },
  [TINT]:    { icon: '🎨', name: 'Tinte' },
  [GRAVITY]: { icon: '⬇', name: 'Gravedad' },
  [FREEZE]:  { icon: '❄', name: 'Congelar' },
};

const LINE_SCORES = [0, 100, 300, 500, 800];

const SKIN_STORAGE_KEY = 'tetris-skin';
const SKINS = {
  retro: {
    colors: COLORS,
    iconColor: '#000',
    block: drawRetroBlock,
  },
  neon: {
    colors: [null, '#00f0ff', '#fff200', '#d000ff', '#39ff14', '#ff073a', '#1f51ff', '#ff9f00', '#c0c0d0',
      '#ff3355', '#ffff66', '#ff4fd8', '#9d4dff', '#7df9ff'],
    iconColor: '#fff',
    grid: { dark: '#12121c', light: '#12121c' }, // board is always black
    block: drawNeonBlock,
  },
  pastel: {
    colors: [null, '#a0e7e5', '#fff5ba', '#d5b8ff', '#b5ead7', '#ffb7b2', '#aec6ff', '#ffdac1', '#cfd8dc',
      '#ff9aa2', '#fff9a6', '#f7c6e0', '#c3b1e1', '#d6f0ff'],
    iconColor: '#555',
    block: drawPastelBlock,
  },
  pixel: {
    colors: [null, '#3cbcfc', '#f8b800', '#b53bfc', '#58d854', '#f83800', '#0078f8', '#fc7460', '#a4a4a4',
      '#e40058', '#f8d878', '#f878f8', '#6844fc', '#a4e4fc'],
    iconColor: '#000',
    block: drawPixelBlock,
  },
};

const THEME_STORAGE_KEY = 'tetris-theme';
const THEME_CANVAS = {
  dark: { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' },
  light: { grid: '#c9c9d6', highlight: 'rgba(0,0,0,0.12)' },
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeToggle = document.getElementById('theme-toggle');
const powerupEl = document.getElementById('powerup');
const skinSelect = document.getElementById('skin-select');

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, theme, skin;
let pendingPowerUps, freezeRemaining, lastPowerUp;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  let type;
  if (pendingPowerUps > 0) {
    pendingPowerUps--;
    type = POWERUP_MIN + Math.floor(Math.random() * POWERUP_COUNT);
  } else {
    type = Math.random() < NUT_CHANCE ? NUT_TYPE : Math.floor(Math.random() * 7) + 1;
  }
  return makePiece(type);
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    const prevLines = lines;
    lines += cleared;
    pendingPowerUps += Math.floor(lines / POWERUP_EVERY) - Math.floor(prevLines / POWERUP_EVERY);
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.type >= POWERUP_MIN) {
    applyPowerUp(current.type, current.x, current.y);
  } else {
    merge();
  }
  clearLines();
  spawn();
}

// Empties cells matching `predicate(r, c)`; returns how many were filled.
function clearCells(predicate) {
  let removed = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] && predicate(r, c)) {
        board[r][c] = 0;
        removed++;
      }
  return removed;
}

function mostFrequentColor() {
  const counts = {};
  let best = 0;
  for (const row of board)
    for (const v of row)
      if (v && (counts[v] = (counts[v] || 0) + 1) > (counts[best] || 0)) best = v;
  return best;
}

function compactBoard() {
  for (let c = 0; c < COLS; c++) {
    let write = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (board[r][c]) {
        const v = board[r][c];
        board[r][c] = 0;
        board[write--][c] = v;
      }
    }
  }
}

function applyPowerUp(type, x, y) {
  let removed = 0;
  switch (type) {
    case BOMB:
      removed = clearCells((r, c) => Math.abs(r - y) <= 1 && Math.abs(c - x) <= 1);
      break;
    case RAY:
      removed = clearCells((r, c) => r === y || c === x);
      break;
    case TINT: {
      const below = y + 1 < ROWS ? board[y + 1][x] : 0;
      const color = below || mostFrequentColor();
      if (color) removed = clearCells((r, c) => board[r][c] === color);
      break;
    }
    case GRAVITY:
      compactBoard();
      break;
    case FREEZE:
      freezeRemaining = FREEZE_MS;
      break;
  }
  score += removed * POWERUP_BLOCK_SCORE * level;
  lastPowerUp = type;
  updateHUD();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  updatePowerUpHUD();
}

function updatePowerUpHUD() {
  let text = '—';
  if (freezeRemaining > 0) {
    text = `❄ ${(freezeRemaining / 1000).toFixed(1)}s`;
  } else if (lastPowerUp) {
    const info = POWERUP_INFO[lastPowerUp];
    text = `${info.icon} ${info.name}`;
  }
  if (powerupEl.textContent !== text) powerupEl.textContent = text;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const px = x * size, py = y * size;
  context.save();
  context.globalAlpha = alpha ?? 1;
  skin.block(context, px, py, size, skin.colors[colorIndex]);
  if (colorIndex >= POWERUP_MIN) {
    context.shadowBlur = 0;
    context.font = `${Math.floor(size * 0.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = skin.iconColor;
    context.fillText(POWERUP_INFO[colorIndex].icon, px + size / 2, py + size / 2 + 1);
  }
  context.restore();
}

// ---- Skins: each draws one block at pixel (px, py); drawBlock handles alpha/save/restore ----

function drawRetroBlock(context, px, py, size, color) {
  context.fillStyle = color;
  context.fillRect(px + 1, py + 1, size - 2, size - 2);
  context.fillStyle = THEME_CANVAS[theme].highlight;
  context.fillRect(px + 1, py + 1, size - 2, 4);
}

function drawNeonBlock(context, px, py, size, color) {
  const inset = 3;
  context.shadowColor = color;
  context.shadowBlur = size * 0.5;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.strokeRect(px + inset, py + inset, size - inset * 2, size - inset * 2);
  context.shadowBlur = 0;
  context.fillStyle = shade(color, -0.6);
  context.fillRect(px + inset + 1, py + inset + 1, size - inset * 2 - 2, size - inset * 2 - 2);
}

function drawPastelBlock(context, px, py, size, color) {
  const r = size * 0.25;
  roundRectPath(context, px + 1.5, py + 1.5, size - 3, size - 3, r);
  context.fillStyle = color;
  context.fill();
  context.lineWidth = 1.5;
  context.strokeStyle = shade(color, -0.15);
  context.stroke();
  // soft inner shine
  roundRectPath(context, px + size * 0.2, py + size * 0.15, size * 0.35, size * 0.18, size * 0.09);
  context.fillStyle = 'rgba(255,255,255,0.55)';
  context.fill();
}

// 6×6 sub-pixel texture: lit top-left edge, shadowed bottom-right edge, dithered core.
function drawPixelBlock(context, px, py, size, color) {
  const n = 6, p = size / n;
  const light = shade(color, 0.45), dark = shade(color, -0.4), mid = shade(color, -0.15);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let c = color;
      if (i === n - 1 || j === n - 1) c = dark;
      else if (i === 0 || j === 0) c = light;
      else if ((i + j) % 3 === 0) c = mid;
      else if (i === 1 && j === 1) c = light;
      context.fillStyle = c;
      context.fillRect(Math.floor(px + j * p), Math.floor(py + i * p), Math.ceil(p), Math.ceil(p));
    }
  }
}

function roundRectPath(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

// Lightens (amt > 0) or darkens (amt < 0) a #rrggbb color; memoized since draw() runs every frame.
const shadeCache = new Map();
function shade(hex, amt) {
  const key = hex + amt;
  let out = shadeCache.get(key);
  if (!out) {
    const n = parseInt(hex.slice(1), 16);
    const ch = v => Math.round(amt > 0 ? v + (255 - v) * amt : v * (1 + amt));
    out = `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
    shadeCache.set(key, out);
  }
  return out;
}

function drawPiece(context, shape, ox, oy, size, alpha) {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, ox + c, oy + r, shape[r][c], size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = skin.grid?.[theme] ?? THEME_CANVAS[theme].grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  if (freezeRemaining > 0) {
    ctx.fillStyle = 'rgba(129, 212, 250, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // ghost
  drawPiece(ctx, current.shape, current.x, ghostY(), BLOCK, 0.2);

  // current piece
  drawPiece(ctx, current.shape, current.x, current.y, BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  drawPiece(nextCtx, shape, offX, offY, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function applyTheme(t, { redraw = true } = {}) {
  theme = t;
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(THEME_STORAGE_KEY, t);
  themeToggle.textContent = t === 'light' ? '🌙' : '☀️';
  themeToggle.setAttribute('aria-label', t === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  themeToggle.setAttribute('aria-pressed', String(t === 'light'));
  if (redraw && current) {
    draw();
    drawNext();
  }
}

function applySkin(name, { redraw = true } = {}) {
  if (!SKINS[name]) name = 'retro';
  skin = SKINS[name];
  document.documentElement.setAttribute('data-skin', name);
  localStorage.setItem(SKIN_STORAGE_KEY, name);
  skinSelect.value = name;
  if (redraw && current) {
    draw();
    drawNext();
  }
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeRemaining > 0) {
    freezeRemaining = Math.max(0, freezeRemaining - dt);
    updatePowerUpHUD();
  } else {
    dropAccum += dt;
  }
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  pendingPowerUps = 0;
  freezeRemaining = 0;
  lastPowerUp = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur(); // arrow keys must go back to the game, not the <select>
});
themeToggle.addEventListener('click', () => {
  applyTheme(theme === 'light' ? 'dark' : 'light');
});

applySkin(localStorage.getItem(SKIN_STORAGE_KEY), { redraw: false });
applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark', { redraw: false });
init();
