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

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, theme;
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
themeToggle.addEventListener('click', () => {
  applyTheme(theme === 'light' ? 'dark' : 'light');
});

applyTheme(localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : 'dark', { redraw: false });
init();
