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

const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 10;
const KEY_ACTIONS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'soft', ArrowUp: 'rotate', KeyX: 'rotate', Space: 'hard',
};
// Touch: held buttons repeat after a delay; board gestures (tap/drag/swipe) are measured in cells.
const REPEATABLE_ACTIONS = new Set(['left', 'right', 'soft']);
const REPEAT_DELAY = 170;
const REPEAT_RATE = 50;
const TAP_MAX_MS = 250;
const SWIPE_DROP_SPEED = 1; // px/ms of downward flick that triggers a hard drop
const AXIS_LOCK = 0.5;      // cells moved before a drag commits to horizontal or vertical
// Canvas bitmaps are scaled by this; all drawing stays in logical (CSS) pixels via setTransform.
const DPR = Math.min(window.devicePixelRatio || 1, 3);
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

const RECORDS_KEY = 'tetris-records';
const LAST_NAME_KEY = 'tetris-last-name';
const MAX_RECORDS = 5;
const DEFAULT_NAME = 'Jugador';

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
const pauseMenu = document.getElementById('pause-menu');
const menuMain = document.getElementById('menu-main');
const menuControls = document.getElementById('menu-controls');
const resumeBtn = document.getElementById('resume-btn');
const menuRestartBtn = document.getElementById('menu-restart-btn');
const showControlsBtn = document.getElementById('show-controls-btn');
const hideControlsBtn = document.getElementById('hide-controls-btn');
const startLevelEl = document.getElementById('start-level');
const levelDownBtn = document.getElementById('level-down');
const levelUpBtn = document.getElementById('level-up');
const skinSelect = document.getElementById('skin-select');
const startScreen = document.getElementById('start-screen');
const startBtn = document.getElementById('start-btn');
const startRecordsEl = document.getElementById('start-records');
const startStatsEl = document.getElementById('start-stats');
const gameoverRecordsEl = document.getElementById('gameover-records');
const gameoverStatsEl = document.getElementById('gameover-stats');
const newRecordEl = document.getElementById('new-record');
const recordForm = document.getElementById('record-form');
const recordNameInput = document.getElementById('record-name');
const resetRecordsBtns = document.querySelectorAll('.reset-records-btn');
const pauseBtn = document.getElementById('pause-btn');
const touchControls = document.getElementById('touch-controls');
const isTouch = window.matchMedia('(pointer: coarse)').matches;

for (const [cv, cx] of [[canvas, ctx], [nextCanvas, nextCtx]]) {
  const w = cv.width, h = cv.height;
  cv.width = w * DPR;
  cv.height = h * DPR;
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
}

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, theme, skin;
let pendingPowerUps, freezeRemaining, lastPowerUp;
let startLevel = 1;
// Keys pressed while the menu was open; ignored by the game until released.
const heldKeys = new Set();
// combo = consecutive locks that cleared lines; bestCombo is this game's max.
let combo, bestCombo;
// records = { top: [{ name, score, lines, level }], bestCombo, maxLines } (all-time).
let records = loadRecords();
let lastEntry = null;    // this game's entry in records.top, if it made the top
let lastStats = null;    // { newCombo, newLines } flags from the last game over

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

function tryMove(dx) {
  if (!collide(current.shape, current.x + dx, current.y)) current.x += dx;
}

const ACTIONS = {
  left: () => tryMove(-1),
  right: () => tryMove(1),
  soft: () => softDrop(),
  hard: () => hardDrop(),
  rotate: () => tryRotate(),
};

// Single entry point for keyboard, touch buttons and board gestures.
function doAction(name) {
  if (paused || gameOver) return;
  ACTIONS[name]();
  updateHUD();
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
  combo = cleared ? combo + 1 : 0;
  bestCombo = Math.max(bestCombo, combo);
  if (cleared) {
    const prevLines = lines;
    lines += cleared;
    pendingPowerUps += Math.floor(lines / POWERUP_EVERY) - Math.floor(prevLines / POWERUP_EVERY);
    score += (LINE_SCORES[cleared] || 0) * level;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = intervalForLevel(level);
    updateHUD();
  }
}

function intervalForLevel(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
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
  scoreEl.classList.toggle('in-top', recordRank(score) !== -1);
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
  context.shadowBlur = size * 0.5 * DPR; // shadowBlur ignores the canvas transform
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

  lastStats = { newCombo: bestCombo > records.bestCombo, newLines: lines > records.maxLines };
  records.bestCombo = Math.max(records.bestCombo, bestCombo);
  records.maxLines = Math.max(records.maxLines, lines);

  const rank = recordRank(score);
  lastEntry = null;
  if (rank !== -1) {
    // Saved right away with a default name so restarting never loses it.
    lastEntry = { name: localStorage.getItem(LAST_NAME_KEY) || DEFAULT_NAME, score, lines, level };
    records.top.splice(rank, 0, lastEntry);
    records.top.length = Math.min(records.top.length, MAX_RECORDS);
    newRecordEl.textContent = rank === 0 ? '¡NUEVO RÉCORD!' : `¡Entras en el top! Puesto #${rank + 1}`;
    recordNameInput.value = lastEntry.name;
  }
  saveRecords();
  newRecordEl.classList.toggle('hidden', !lastEntry);
  recordForm.classList.toggle('hidden', !lastEntry);
  renderAllRecords();
  overlay.classList.remove('hidden');
  // On touch, focusing the input would pop the on-screen keyboard over the records.
  if (lastEntry && !isTouch) {
    recordNameInput.focus();
    recordNameInput.select();
  } else {
    restartBtn.focus();
  }
}

function loadRecords() {
  try {
    const data = JSON.parse(localStorage.getItem(RECORDS_KEY));
    if (data && Array.isArray(data.top)) {
      return {
        top: data.top.filter(r => r && typeof r.score === 'number').slice(0, MAX_RECORDS),
        bestCombo: Number(data.bestCombo) || 0,
        maxLines: Number(data.maxLines) || 0,
      };
    }
  } catch { /* corrupt data → start fresh */ }
  return { top: [], bestCombo: 0, maxLines: 0 };
}

function saveRecords() {
  localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
}

// Position `s` would take in the top, or -1 if it doesn't qualify.
function recordRank(s) {
  if (s <= 0) return -1;
  const i = records.top.findIndex(r => s > r.score);
  if (i !== -1) return i;
  return records.top.length < MAX_RECORDS ? records.top.length : -1;
}

function renderRecords(listEl, statsEl, { highlight = null, stats = null } = {}) {
  listEl.replaceChildren();
  if (!records.top.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Sin records todavía';
    listEl.append(li);
  }
  for (const r of records.top) {
    const li = document.createElement('li');
    if (r === highlight) li.className = 'highlight';
    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = r.name;
    name.title = `${r.lines} líneas · nivel ${r.level}`;
    const pts = document.createElement('span');
    pts.className = 'pts';
    pts.textContent = r.score.toLocaleString();
    li.append(name, pts);
    listEl.append(li);
  }

  statsEl.replaceChildren();
  const stat = (label, value, isNew) => {
    const strong = document.createElement('strong');
    strong.textContent = value;
    statsEl.append(`${label}: `, strong);
    if (isNew) {
      const tag = document.createElement('span');
      tag.className = 'is-new';
      tag.textContent = ' ¡nuevo!';
      statsEl.append(tag);
    }
  };
  stat('Mejor combo', `x${records.bestCombo}`, stats?.newCombo && records.bestCombo > 0);
  statsEl.append(' · ');
  stat('Máx. líneas', records.maxLines, stats?.newLines && records.maxLines > 0);
}

function renderAllRecords() {
  renderRecords(startRecordsEl, startStatsEl);
  renderRecords(gameoverRecordsEl, gameoverStatsEl, { highlight: lastEntry, stats: lastStats });
}

function setEntryName(value) {
  if (!lastEntry) return;
  lastEntry.name = value.trim() || DEFAULT_NAME;
  localStorage.setItem(LAST_NAME_KEY, lastEntry.name);
  saveRecords();
  renderAllRecords();
}

function resetRecords() {
  records = { top: [], bestCombo: 0, maxLines: 0 };
  lastEntry = null;
  lastStats = null;
  saveRecords();
  newRecordEl.classList.add('hidden');
  recordForm.classList.add('hidden');
  renderAllRecords();
  if (current) updateHUD();
}

function applyTheme(t, { redraw = true } = {}) {
  theme = t;
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem(THEME_STORAGE_KEY, t);
  themeToggle.textContent = t === 'light' ? '🌙' : '☀️';
  themeToggle.setAttribute('aria-label', t === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
  themeToggle.setAttribute('aria-pressed', String(t === 'light'));
  if (!redraw) return;
  if (current) {
    draw();
    drawNext();
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
  }
}

function applySkin(name, { redraw = true } = {}) {
  if (!SKINS[name]) name = 'retro';
  skin = SKINS[name];
  document.documentElement.setAttribute('data-skin', name);
  localStorage.setItem(SKIN_STORAGE_KEY, name);
  skinSelect.value = name;
  if (!redraw) return;
  if (current) {
    draw();
    drawNext();
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
  }
}

function togglePause() {
  if (gameOver) return;
  if (paused) resume();
  else pause();
}

function pause() {
  paused = true;
  cancelAnimationFrame(animId);
  showMenuView(menuMain);
  pauseMenu.classList.remove('hidden');
  resumeBtn.focus();
}

function resume() {
  hidePauseMenu();
  paused = false;
  lastTime = performance.now();
  loop(lastTime);
}

function hidePauseMenu() {
  pauseMenu.classList.add('hidden');
  // Drop focus so Space/Enter can't re-trigger a menu button mid-game.
  if (pauseMenu.contains(document.activeElement)) document.activeElement.blur();
}

function showMenuView(view) {
  menuMain.classList.toggle('hidden', view !== menuMain);
  menuControls.classList.toggle('hidden', view !== menuControls);
  view.querySelector('.menu-btn').focus();
}

function setStartLevel(lvl, { save = true } = {}) {
  startLevel = Math.min(MAX_START_LEVEL, Math.max(1, lvl));
  startLevelEl.textContent = startLevel;
  levelDownBtn.disabled = startLevel === 1;
  levelUpBtn.disabled = startLevel === MAX_START_LEVEL;
  // A disabled button drops focus; hand it to its sibling.
  if (document.activeElement === levelDownBtn && levelDownBtn.disabled) levelUpBtn.focus();
  if (document.activeElement === levelUpBtn && levelUpBtn.disabled) levelDownBtn.focus();
  if (save) localStorage.setItem(START_LEVEL_KEY, startLevel);
}

function moveMenuFocus(dir) {
  const view = menuControls.classList.contains('hidden') ? menuMain : menuControls;
  const items = [...view.querySelectorAll('button:not(:disabled)')];
  const i = items.indexOf(document.activeElement);
  items[(i + dir + items.length) % items.length].focus();
}

function handleMenuKey(e) {
  switch (e.code) {
    case 'ArrowUp':
      e.preventDefault();
      moveMenuFocus(-1);
      break;
    case 'ArrowDown':
      e.preventDefault();
      moveMenuFocus(1);
      break;
    case 'ArrowLeft':
    case 'ArrowRight':
      e.preventDefault();
      if (!menuMain.classList.contains('hidden')) setStartLevel(startLevel + (e.code === 'ArrowLeft' ? -1 : 1));
      break;
    case 'Space':
      if (!(document.activeElement instanceof HTMLButtonElement)) e.preventDefault();
      break;
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
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = intervalForLevel(level);
  dropAccum = 0;
  pendingPowerUps = 0;
  freezeRemaining = 0;
  lastPowerUp = 0;
  combo = 0;
  bestCombo = 0;
  lastEntry = null;
  lastStats = null;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  hidePauseMenu();
  startScreen.classList.add('hidden');
  document.activeElement?.blur();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.target === recordNameInput) return; // typing a record name, not playing
  if (e.code === 'KeyP' || e.code === 'Escape') {
    e.preventDefault();
    if (e.repeat) return;
    // Esc inside "Ver controles" goes back to the main menu instead of resuming.
    if (paused && e.code === 'Escape' && !menuControls.classList.contains('hidden')) {
      showMenuView(menuMain);
    } else {
      togglePause();
    }
    return;
  }
  if (paused) {
    heldKeys.add(e.code);
    handleMenuKey(e);
    return;
  }
  if (gameOver) return;
  const action = KEY_ACTIONS[e.code];
  if (!action) return;
  e.preventDefault();
  if (heldKeys.has(e.code)) return;
  doAction(action);
});

document.addEventListener('keyup', e => heldKeys.delete(e.code));
window.addEventListener('blur', () => heldKeys.clear());
// Leaving the tab/app (e.g. phone lock, app switch) pauses the game.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !paused && !gameOver) pause();
});

// ---- Touch buttons: press = action, hold = auto-repeat for moves/soft drop ----
let repeatTimer = null;
function stopRepeat() {
  clearTimeout(repeatTimer);
  repeatTimer = null;
}
for (const btn of touchControls.querySelectorAll('[data-action]')) {
  const name = btn.dataset.action;
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    stopRepeat();
    doAction(name);
    if (!REPEATABLE_ACTIONS.has(name)) return;
    const tick = delay => {
      repeatTimer = setTimeout(() => {
        if (paused || gameOver) return stopRepeat();
        doAction(name);
        tick(REPEAT_RATE);
      }, delay);
    };
    tick(REPEAT_DELAY);
  });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(type, stopRepeat);
  btn.addEventListener('contextmenu', e => e.preventDefault()); // long-press menu on mobile
}

// ---- Board gestures: tap = rotate, drag = move/soft drop per cell, fast flick down = hard drop ----
let gesture = null;
canvas.addEventListener('pointerdown', e => {
  if (paused || gameOver) return;
  canvas.setPointerCapture(e.pointerId);
  gesture = {
    id: e.pointerId,
    x0: e.clientX, y0: e.clientY, t0: e.timeStamp,
    cell: canvas.getBoundingClientRect().width / COLS,
    piece: current, // a lock/spawn mid-drag ends the gesture
    axis: null, stepsX: 0, stepsY: 0,
  };
});
canvas.addEventListener('pointermove', e => {
  const g = gesture;
  if (!g || e.pointerId !== g.id) return;
  if (paused || gameOver || current !== g.piece) { gesture = null; return; }
  const dx = (e.clientX - g.x0) / g.cell;
  const dy = (e.clientY - g.y0) / g.cell;
  if (!g.axis) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < AXIS_LOCK) return;
    g.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
  }
  if (g.axis === 'x') {
    const target = Math.round(dx);
    while (g.stepsX !== target && current === g.piece) {
      const dir = Math.sign(target - g.stepsX);
      doAction(dir > 0 ? 'right' : 'left');
      g.stepsX += dir;
    }
  } else {
    // Only move down while there's room: a drag never locks the piece, only the flick does.
    const target = Math.floor(dy);
    while (g.stepsY < target && !collide(current.shape, current.x, current.y + 1)) {
      doAction('soft');
      g.stepsY++;
    }
  }
});
canvas.addEventListener('pointerup', e => {
  const g = gesture;
  if (!g || e.pointerId !== g.id) return;
  gesture = null;
  if (current !== g.piece) return;
  const dt = e.timeStamp - g.t0;
  if (!g.axis && dt < TAP_MAX_MS) doAction('rotate');
  else if (g.axis === 'y' && (e.clientY - g.y0) / dt > SWIPE_DROP_SPEED) doAction('hard');
});
canvas.addEventListener('pointercancel', () => { gesture = null; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

restartBtn.addEventListener('click', init);
resumeBtn.addEventListener('click', resume);
pauseBtn.addEventListener('click', togglePause);
menuRestartBtn.addEventListener('click', init);
showControlsBtn.addEventListener('click', () => showMenuView(menuControls));
hideControlsBtn.addEventListener('click', () => showMenuView(menuMain));
levelDownBtn.addEventListener('click', () => setStartLevel(startLevel - 1));
levelUpBtn.addEventListener('click', () => setStartLevel(startLevel + 1));
skinSelect.addEventListener('change', () => {
  applySkin(skinSelect.value);
  skinSelect.blur(); // arrow keys must go back to the game, not the <select>
});
startBtn.addEventListener('click', init);
recordNameInput.addEventListener('input', () => setEntryName(recordNameInput.value));
recordForm.addEventListener('submit', e => {
  e.preventDefault();
  setEntryName(recordNameInput.value);
  recordForm.classList.add('hidden');
  restartBtn.focus();
});
// Two-step confirm instead of a blocking confirm() dialog.
for (const btn of resetRecordsBtns) {
  btn.addEventListener('click', () => {
    if (!btn.classList.contains('confirm')) {
      btn.classList.add('confirm');
      btn.textContent = '¿Seguro? Pulsa otra vez';
      return;
    }
    resetRecords();
    for (const b of resetRecordsBtns) {
      b.classList.remove('confirm');
      b.textContent = 'Borrar records';
    }
  });
  btn.addEventListener('blur', () => {
    btn.classList.remove('confirm');
    btn.textContent = 'Borrar records';
  });
}
themeToggle.addEventListener('click', () => {
  applyTheme(theme === 'light' ? 'dark' : 'light');
});

applySkin(localStorage.getItem(SKIN_STORAGE_KEY), { redraw: false });
setStartLevel(parseInt(localStorage.getItem(START_LEVEL_KEY), 10) || 1, { save: false });
// Start screen: no game running until "Jugar".
board = createBoard();
gameOver = true;
applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark');
renderAllRecords();
startBtn.focus();
