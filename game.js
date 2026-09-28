'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, theme;
let pendingPowerUps, freezeRemaining, lastPowerUp;
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
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = THEME_CANVAS[theme].highlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (colorIndex >= POWERUP_MIN) {
    context.font = `${Math.floor(size * 0.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = '#000';
    context.fillText(POWERUP_INFO[colorIndex].icon, x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawPiece(context, shape, ox, oy, size, alpha) {
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(context, ox + c, oy + r, shape[r][c], size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = THEME_CANVAS[theme].grid;
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
  if (lastEntry) {
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
  combo = 0;
  bestCombo = 0;
  lastEntry = null;
  lastStats = null;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  startScreen.classList.add('hidden');
  document.activeElement?.blur();
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

// Start screen: no game running until "Jugar".
board = createBoard();
gameOver = true;
applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark');
renderAllRecords();
startBtn.focus();
