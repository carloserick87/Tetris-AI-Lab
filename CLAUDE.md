# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris on HTML5 Canvas. No dependencies, no `package.json`, no build, no tests, no linter. UI text and README are in Spanish.

## Run

```bash
open index.html                 # direct
python3 -m http.server 8000     # or any static server → http://localhost:8000
```

## Architecture

Three files: `index.html` (DOM: `#board` canvas 300×600, side panel with `#score`/`#lines`/`#level`/`#next-canvas`, `#overlay` for game over, `#pause-menu` with main/controls views and start-level stepper), `style.css`, and `game.js` (all logic, global script with `'use strict'`, no modules).

`game.js` key points:
- **State** is module-level `let` globals (`board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId`), reset in `init()`. `init()` is also the restart handler.
- **Board**: `ROWS × COLS` matrix; `0` = empty, `1–7` = piece type, which doubles as index into `COLORS` and as the cell value inside `PIECES` shapes. Adding a piece type means updating `PIECES`, `COLORS`, and the `* 7` in `randomPiece()`.
- **Piece**: `{ type, shape, x, y }`; shape is a square matrix copied from `PIECES`. Rotation = `rotateCW` (transpose + reverse); `tryRotate` applies simple kicks `[0,-1,1,-2,2]` (not SRS).
- **Collision**: `collide(shape, ox, oy)` is the single validity check used by movement, rotation, gravity, ghost (`ghostY`), and spawn (spawn collision → `endGame()`).
- **Power-ups**: types 9–13 (`BOMB..FREEZE`), 1×1 pieces. Every `POWERUP_EVERY` lines `clearLines()` bumps `pendingPowerUps`; `randomPiece()` consumes it. On lock they run `applyPowerUp()` instead of `merge()`, so `board` never holds values ≥9. Freeze sets `freezeRemaining`, which `loop()` drains instead of accumulating `dropAccum`.
- **Lock pipeline**: `lockPiece()` → `merge()` (or `applyPowerUp()`) → `clearLines()` (updates lines/score/level/`dropInterval`) → `spawn()`.
- **Pause menu**: `pause()`/`resume()` via `togglePause()` (P/Esc). While paused, keydown goes to `handleMenuKey()` and codes are added to `heldKeys`; the game ignores those keys until `keyup`, preventing accidental moves on resume. `hidePauseMenu()` blurs focused menu buttons.
- **Loop**: `requestAnimationFrame(loop)` accumulates `dt` into `dropAccum`; gravity step when ≥ `dropInterval`. Pause/game over cancel via `animId`; resume restarts `loop` manually.
- **Scoring**: `LINE_SCORES[cleared] * level`; soft drop +1/row, hard drop +2/row. Level = `startLevel + floor(lines/10)`; `dropInterval = intervalForLevel(level) = max(100, 1000 − (level−1)×90)`. `startLevel` (1–`MAX_START_LEVEL`) persists in localStorage and applies on `init()`.
- **Rendering**: full redraw each frame in `draw()` (grid → board → ghost at alpha 0.2 → current). `drawBlock` is shared with the next-piece preview (`drawNext`, 4×4 grid of 30px).

Changing `COLS`/`ROWS`/`BLOCK` requires matching the `#board` canvas `width`/`height` in `index.html`.
