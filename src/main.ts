import { AI, type Difficulty } from './ai';
import { Sound } from './audio';
import { defeatEffect, stopEffects, victoryEffect } from './effects';
import {
  Board,
  FLEET,
  SIZE,
  cellsFor,
  colOf,
  coordLabel,
  isSunk,
  rowOf,
  type Orientation,
  type Ship,
  type ShotResult,
} from './game';
import { TUTORIAL_STEPS, Tour } from './tutorial';

type Phase = 'placing' | 'player' | 'enemy' | 'over';

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing #${id}`);
  return el as T;
};

const ui = {
  status: $('status'),
  placement: $('placement'),
  shipQueue: $('ship-queue'),
  rotate: $<HTMLButtonElement>('rotate'),
  randomize: $<HTMLButtonElement>('randomize'),
  clear: $<HTMLButtonElement>('clear'),
  start: $<HTMLButtonElement>('start'),
  newGame: $<HTMLButtonElement>('new-game'),
  difficulty: $<HTMLSelectElement>('difficulty'),
  soundBtn: $<HTMLButtonElement>('sound-btn'),
  playerBoard: $('player-board'),
  enemyBoard: $('enemy-board'),
  playerFleet: $('player-fleet'),
  enemyFleet: $('enemy-fleet'),
  playerWrap: $('player-wrap'),
  enemyWrap: $('enemy-wrap'),
  log: $('log'),
  overlay: $('overlay'),
  overlayArt: $('overlay-art'),
  overlayTitle: $('overlay-title'),
  overlaySub: $('overlay-sub'),
  overlayStats: $('overlay-stats'),
  playAgain: $<HTMLButtonElement>('play-again'),
  viewBoard: $<HTMLButtonElement>('view-board'),
  resultsBtn: $<HTMLButtonElement>('results-btn'),
  helpBtn: $<HTMLButtonElement>('help-btn'),
};

const sound = new Sound();

const state = {
  phase: 'placing' as Phase,
  player: new Board(),
  enemy: new Board(),
  ai: new AI('normal'),
  orientation: 'h' as Orientation,
  hover: null as number | null,
  lastPlayerShot: null as number | null,
  lastEnemyShot: null as number | null,
  stats: { shots: 0, hits: 0, enemyShots: 0, enemyHits: 0 },
  timers: [] as number[],
};

const later = (fn: () => void, ms: number): void => {
  state.timers.push(window.setTimeout(fn, ms));
};

// ---------- Board construction ----------

function buildBoard(container: HTMLElement, owner: 'player' | 'enemy'): HTMLButtonElement[] {
  container.replaceChildren();
  const corner = document.createElement('div');
  corner.className = 'label corner';
  container.append(corner);
  for (let c = 0; c < SIZE; c++) {
    const l = document.createElement('div');
    l.className = 'label';
    l.textContent = String(c + 1);
    container.append(l);
  }
  const cells: HTMLButtonElement[] = [];
  for (let r = 0; r < SIZE; r++) {
    const l = document.createElement('div');
    l.className = 'label';
    l.textContent = String.fromCharCode(65 + r);
    container.append(l);
    for (let c = 0; c < SIZE; c++) {
      const i = r * SIZE + c;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.dataset.index = String(i);
      cell.setAttribute('aria-label', `${owner === 'enemy' ? 'Fire at' : 'Square'} ${coordLabel(i)}`);
      container.append(cell);
      cells.push(cell);
    }
  }
  return cells;
}

const playerCells = buildBoard(ui.playerBoard, 'player');
const enemyCells = buildBoard(ui.enemyBoard, 'enemy');

const cellIndex = (e: Event): number | null => {
  const target = (e.target as HTMLElement).closest<HTMLElement>('.cell');
  return target?.dataset.index != null ? Number(target.dataset.index) : null;
};

// ---------- Rendering ----------

function shipClasses(ship: Ship, i: number): string[] {
  const classes = ['ship', `ship-${ship.orientation}`];
  if (ship.cells[0] === i) classes.push('ship-start');
  if (ship.cells[ship.cells.length - 1] === i) classes.push('ship-end');
  return classes;
}

function previewCells(): { cells: number[]; valid: boolean } | null {
  if (state.phase !== 'placing' || state.hover === null) return null;
  const type = FLEET[state.player.ships.length];
  if (!type) return null;
  const cells = cellsFor(rowOf(state.hover), colOf(state.hover), type.length, state.orientation);
  if (cells) return { cells, valid: state.player.canPlace(cells) };
  // Clip the preview to the board so the player still sees where it would go.
  const clipped: number[] = [];
  for (let k = 0; k < type.length; k++) {
    const r = state.orientation === 'v' ? rowOf(state.hover) + k : rowOf(state.hover);
    const c = state.orientation === 'h' ? colOf(state.hover) + k : colOf(state.hover);
    if (r < SIZE && c < SIZE) clipped.push(r * SIZE + c);
  }
  return { cells: clipped, valid: false };
}

function renderPlayerBoard(): void {
  const preview = previewCells();
  const previewSet = new Set(preview?.cells ?? []);
  playerCells.forEach((cell, i) => {
    const classes = ['cell'];
    const ship = state.player.shipAt(i);
    if (ship) classes.push(...shipClasses(ship, i));
    const shot = state.player.shots.get(i);
    if (shot) classes.push(shot);
    if (ship && isSunk(ship)) classes.push('sunk');
    if (previewSet.has(i)) classes.push(preview!.valid ? 'preview-ok' : 'preview-bad');
    if (i === state.lastEnemyShot) classes.push('last');
    cell.className = classes.join(' ');
    cell.tabIndex = -1;
  });
  ui.playerBoard.classList.toggle('placing', state.phase === 'placing');
}

function renderEnemyBoard(): void {
  const reveal = state.phase === 'over';
  enemyCells.forEach((cell, i) => {
    const classes = ['cell'];
    const ship = state.enemy.shipAt(i);
    const shot = state.enemy.shots.get(i);
    if (shot) classes.push(shot);
    if (ship && (isSunk(ship) || reveal)) {
      classes.push(...shipClasses(ship, i));
      if (isSunk(ship)) classes.push('sunk');
      else classes.push('ghost');
    }
    if (i === state.lastPlayerShot) classes.push('last');
    const canFire = state.phase === 'player' && !shot;
    if (canFire) classes.push('target');
    cell.className = classes.join(' ');
    cell.disabled = !!shot || state.phase === 'over' || state.phase === 'placing';
    cell.setAttribute(
      'aria-label',
      `${coordLabel(i)}${shot ? ` — ${ship && isSunk(ship) ? 'sunk' : shot}` : ''}`,
    );
  });
  ui.enemyBoard.classList.toggle('locked', state.phase !== 'player');
}

function renderFleet(list: HTMLElement, board: Board, hidden: boolean): void {
  list.replaceChildren(
    ...FLEET.map((type, idx) => {
      const ship = board.ships[idx];
      const sunk = !!ship && isSunk(ship);
      const li = document.createElement('li');
      li.className = sunk ? 'sunk' : '';
      const name = document.createElement('span');
      name.textContent = type.name;
      const pips = document.createElement('span');
      pips.className = 'pips';
      for (let k = 0; k < type.length; k++) {
        const pip = document.createElement('i');
        // Show damage on your own ships; enemy ships only reveal when sunk.
        const damaged = ship && (hidden ? sunk : ship.hits.has(ship.cells[k]));
        if (damaged) pip.className = 'dmg';
        pips.append(pip);
      }
      li.append(name, pips);
      return li;
    }),
  );
}

function renderPlacement(): void {
  const placing = state.phase === 'placing';
  ui.placement.hidden = !placing;
  const placed = state.player.ships.length;
  ui.shipQueue.replaceChildren(
    ...FLEET.map((type, idx) => {
      const chip = document.createElement('span');
      chip.className = `chip${idx < placed ? ' done' : idx === placed ? ' current' : ''}`;
      chip.textContent = `${type.name} (${type.length})`;
      return chip;
    }),
  );
  ui.start.disabled = placed < FLEET.length;
  ui.rotate.textContent = '';
  ui.rotate.append(`↻ ${state.orientation === 'h' ? 'Horizontal' : 'Vertical'} `);
  const kbd = document.createElement('kbd');
  kbd.textContent = 'R';
  ui.rotate.append(kbd);
}

function render(): void {
  renderPlayerBoard();
  renderEnemyBoard();
  renderFleet(ui.playerFleet, state.player, false);
  renderFleet(ui.enemyFleet, state.enemy, true);
  renderPlacement();
  ui.playerWrap.classList.toggle('active', state.phase === 'enemy');
  ui.enemyWrap.classList.toggle('active', state.phase === 'player');
}

function setStatus(text: string, tone: 'info' | 'good' | 'bad' = 'info'): void {
  ui.status.textContent = text;
  ui.status.dataset.tone = tone;
}

function log(text: string, who: 'you' | 'ai' | 'sys'): void {
  const li = document.createElement('li');
  li.className = who;
  li.textContent = text;
  ui.log.prepend(li);
  while (ui.log.children.length > 40) ui.log.lastElementChild?.remove();
}

/** Floating "HIT!" / "MISS" label over a cell. */
function popText(cell: HTMLElement, text: string, kind: string): void {
  const pop = document.createElement('span');
  pop.className = `pop pop-${kind}`;
  pop.textContent = text;
  cell.append(pop);
  pop.addEventListener('animationend', () => pop.remove());
}

function announce(result: ShotResult, cell: HTMLElement): void {
  if (result.kind === 'miss') {
    sound.splash();
    popText(cell, 'MISS', 'miss');
  } else if (result.kind === 'hit') {
    sound.hit();
    popText(cell, 'HIT!', 'hit');
  } else {
    sound.sunk();
    popText(cell, 'SUNK!', 'sunk');
  }
}

// ---------- Game flow ----------

function newGame(): void {
  state.timers.forEach((t) => window.clearTimeout(t));
  state.timers = [];
  stopEffects();
  ui.overlay.hidden = true;
  ui.resultsBtn.hidden = true;
  ui.overlay.classList.remove('victory', 'defeat');
  state.phase = 'placing';
  state.player = new Board();
  state.enemy = new Board();
  state.enemy.randomize();
  state.hover = null;
  state.lastEnemyShot = null;
  state.lastPlayerShot = null;
  state.stats = { shots: 0, hits: 0, enemyShots: 0, enemyHits: 0 };
  ui.log.replaceChildren();
  setStatus('Deploy your fleet: click your board to place each ship, or press Randomize.');
  render();
}

function placeAt(i: number): void {
  const type = FLEET[state.player.ships.length];
  if (!type) return;
  if (state.player.place(type, rowOf(i), colOf(i), state.orientation)) {
    sound.splash();
    const next = FLEET[state.player.ships.length];
    setStatus(next ? `Placed ${type.name}. Now place your ${next.name} (${next.length}).` : 'Fleet ready! Press Start Battle.');
  } else {
    setStatus(`The ${type.name} doesn't fit there.`, 'bad');
  }
  render();
}

function rotate(): void {
  state.orientation = state.orientation === 'h' ? 'v' : 'h';
  render();
}

function startBattle(): void {
  if (state.player.ships.length < FLEET.length) return;
  const difficulty = ui.difficulty.value as Difficulty;
  state.ai = new AI(difficulty);
  state.phase = 'player';
  state.hover = null;
  log(`Battle stations! Facing a ${difficulty} AI.`, 'sys');
  setStatus('Your turn — pick a target in enemy waters.');
  render();
  enemyCells.find((c) => !c.disabled)?.focus({ preventScroll: true });
}

function playerFire(i: number): void {
  if (state.phase !== 'player' || state.enemy.hasShot(i)) return;
  const result = state.enemy.fire(i);
  state.stats.shots++;
  state.lastPlayerShot = i;
  const where = coordLabel(i);
  if (result.kind === 'miss') {
    log(`You fired at ${where} — miss.`, 'you');
    setStatus(`${where}: miss.`);
  } else {
    state.stats.hits++;
    if (result.kind === 'sunk') {
      log(`You fired at ${where} — sunk their ${result.ship.type.name}!`, 'you');
      setStatus(`You sunk their ${result.ship.type.name}!`, 'good');
    } else {
      log(`You fired at ${where} — hit!`, 'you');
      setStatus(`${where}: direct hit!`, 'good');
    }
  }
  state.phase = state.enemy.allSunk ? 'over' : 'enemy';
  render();
  announce(result, enemyCells[i]);
  if (state.enemy.allSunk) {
    later(() => endGame(true), 900);
    return;
  }
  later(() => setStatus('Enemy is taking aim…'), 650);
  later(enemyFire, 1200 + Math.random() * 400);
}

function enemyFire(): void {
  if (state.phase !== 'enemy') return;
  const i = state.ai.chooseTarget();
  const result = state.player.fire(i);
  state.ai.record(i, result);
  state.stats.enemyShots++;
  state.lastEnemyShot = i;
  const where = coordLabel(i);
  if (result.kind === 'miss') {
    log(`Enemy fired at ${where} — miss.`, 'ai');
  } else {
    state.stats.enemyHits++;
    log(
      result.kind === 'sunk'
        ? `Enemy fired at ${where} — sunk your ${result.ship.type.name}!`
        : `Enemy fired at ${where} — hit your ${result.ship.type.name}.`,
      'ai',
    );
  }
  if (state.player.allSunk) {
    state.phase = 'over';
    render();
    announce(result, playerCells[i]);
    later(() => endGame(false), 900);
    return;
  }
  state.phase = 'player';
  render();
  announce(result, playerCells[i]);
  if (result.kind === 'sunk') setStatus(`They sunk your ${result.ship.type.name}! Your turn.`, 'bad');
  else if (result.kind === 'hit') setStatus(`Enemy hit your ${result.ship.type.name} at ${where}. Your turn.`, 'bad');
  else setStatus(`Enemy missed at ${where}. Your turn.`);
}

const VICTORY_ART = `
<svg viewBox="0 0 240 150" class="art art-victory" aria-hidden="true">
  <g class="rays">${Array.from({ length: 12 }, (_, k) => `<path d="M120 90 L${120 + 160 * Math.cos((k * Math.PI) / 6 - 0.12)} ${90 + 160 * Math.sin((k * Math.PI) / 6 - 0.12)} L${120 + 160 * Math.cos((k * Math.PI) / 6 + 0.12)} ${90 + 160 * Math.sin((k * Math.PI) / 6 + 0.12)}Z"/>`).join('')}</g>
  <g class="bob">
    <path class="flag" d="M122 22 l28 7 -28 7z"/>
    <line x1="121" y1="20" x2="121" y2="60" class="mast"/>
    <rect x="95" y="50" width="50" height="16" rx="2" class="deck"/>
    <rect x="105" y="40" width="22" height="12" rx="2" class="deck"/>
    <path d="M50 66 H190 L176 92 H66 Z" class="hull"/>
  </g>
  <path class="wave" d="M-40 96 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 V150 H-40Z"/>
</svg>`;

const DEFEAT_ART = `
<svg viewBox="0 0 240 150" class="art art-defeat" aria-hidden="true">
  <g class="sink">
    <rect x="95" y="50" width="50" height="16" rx="2" class="deck"/>
    <rect x="105" y="40" width="22" height="12" rx="2" class="deck"/>
    <path d="M50 66 H190 L176 92 H66 Z" class="hull"/>
    <circle cx="80" cy="58" r="10" class="smoke s1"/>
    <circle cx="150" cy="44" r="12" class="smoke s2"/>
  </g>
  ${Array.from({ length: 7 }, (_, k) => `<circle cx="${80 + k * 14}" cy="120" r="${2 + (k % 3)}" class="bubble" style="animation-delay:${(k * 0.37).toFixed(2)}s"/>`).join('')}
  <path class="wave" d="M-40 96 q20 -8 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 V150 H-40Z"/>
</svg>`;

function endGame(won: boolean): void {
  state.phase = 'over';
  render();
  const { shots, hits, enemyShots, enemyHits } = state.stats;
  const accuracy = shots ? Math.round((hits / shots) * 100) : 0;
  const enemyAccuracy = enemyShots ? Math.round((enemyHits / enemyShots) * 100) : 0;
  const shipsLeft = state.player.ships.filter((s) => !isSunk(s)).length;

  ui.overlay.classList.toggle('victory', won);
  ui.overlay.classList.toggle('defeat', !won);
  ui.overlayArt.innerHTML = won ? VICTORY_ART : DEFEAT_ART;
  ui.overlayTitle.textContent = won ? 'Victory!' : 'Defeat';
  ui.overlaySub.textContent = won
    ? `The enemy fleet is at the bottom of the sea. ${shipsLeft} of your ships survived.`
    : 'Your fleet has been sunk. The enemy rules the waves… for now.';
  const stats: [string, string][] = [
    ['Your shots', String(shots)],
    ['Your accuracy', `${accuracy}%`],
    ['Enemy shots', String(enemyShots)],
    ['Enemy accuracy', `${enemyAccuracy}%`],
  ];
  ui.overlayStats.replaceChildren(
    ...stats.flatMap(([k, v]) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      return [dt, dd];
    }),
  );
  showResults();
  log(won ? 'Victory! Enemy fleet destroyed.' : 'Defeat. Your fleet was destroyed.', 'sys');
  setStatus(won ? 'Victory! Press New Game to play again.' : 'Defeat. Press New Game for a rematch.', won ? 'good' : 'bad');
  if (won) {
    sound.victory();
    victoryEffect();
  } else {
    sound.defeat();
    defeatEffect();
  }
}

function showResults(): void {
  ui.overlay.hidden = false;
  ui.resultsBtn.hidden = true;
  ui.playAgain.focus();
}

/** Hide the end-game card so the final boards (including unsunk enemy ships) can be inspected. */
function viewBoard(): void {
  if (ui.overlay.hidden) return;
  ui.overlay.hidden = true;
  ui.resultsBtn.hidden = false;
  stopEffects();
  setStatus(
    state.enemy.allSunk
      ? 'Final board. Press Results to see your stats again, or New Game to play again.'
      : 'Final board: dashed outlines show the enemy ships you never found. Press New Game for a rematch.',
  );
  ui.resultsBtn.focus();
}

// ---------- Events ----------

ui.playerBoard.addEventListener('mouseover', (e) => {
  if (state.phase !== 'placing') return;
  const i = cellIndex(e);
  if (i !== null && i !== state.hover) {
    state.hover = i;
    renderPlayerBoard();
  }
});
ui.playerBoard.addEventListener('mouseleave', () => {
  if (state.hover === null) return;
  state.hover = null;
  renderPlayerBoard();
});
ui.playerBoard.addEventListener('click', (e) => {
  if (state.phase !== 'placing') return;
  const i = cellIndex(e);
  if (i !== null) placeAt(i);
});
ui.playerBoard.addEventListener('contextmenu', (e) => {
  if (state.phase !== 'placing') return;
  e.preventDefault();
  rotate();
});
ui.enemyBoard.addEventListener('click', (e) => {
  const i = cellIndex(e);
  if (i !== null) playerFire(i);
});

ui.rotate.addEventListener('click', rotate);
ui.randomize.addEventListener('click', () => {
  state.player.randomize();
  setStatus('Fleet deployed at random. Press Start Battle, or Randomize again.');
  render();
});
ui.clear.addEventListener('click', () => {
  state.player.clear();
  setStatus('Board cleared. Place your Carrier (5).');
  render();
});
ui.start.addEventListener('click', startBattle);
ui.newGame.addEventListener('click', newGame);
ui.playAgain.addEventListener('click', newGame);
ui.viewBoard.addEventListener('click', viewBoard);
ui.resultsBtn.addEventListener('click', showResults);
ui.overlay.addEventListener('click', (e) => {
  if (e.target === ui.overlay) viewBoard();
});

document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLSelectElement || tour.active) return;
  if ((e.key === 'r' || e.key === 'R') && state.phase === 'placing') rotate();
  if (e.key === 'Escape') viewBoard();
});

const SOUND_KEY = 'battleship:sound';
try {
  sound.enabled = localStorage.getItem(SOUND_KEY) !== 'off';
} catch {
  /* storage unavailable — keep default */
}
const renderSoundBtn = (): void => {
  ui.soundBtn.textContent = sound.enabled ? '🔊' : '🔇';
  ui.soundBtn.setAttribute('aria-pressed', String(sound.enabled));
};
ui.soundBtn.addEventListener('click', () => {
  sound.enabled = !sound.enabled;
  try {
    localStorage.setItem(SOUND_KEY, sound.enabled ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  renderSoundBtn();
});
renderSoundBtn();

newGame();

const TUTORIAL_KEY = 'battleship:tutorial-seen';
const tour = new Tour(TUTORIAL_STEPS, () => {
  try {
    localStorage.setItem(TUTORIAL_KEY, '1');
  } catch {
    /* ignore */
  }
});
ui.helpBtn.addEventListener('click', () => tour.start());
let seenTutorial = false;
try {
  seenTutorial = localStorage.getItem(TUTORIAL_KEY) === '1';
} catch {
  /* storage unavailable — show the tour */
}
if (!seenTutorial) window.setTimeout(() => tour.start(), 400);

// Exposed in dev builds only, for debugging in the browser console.
declare global {
  interface Window {
    battleship?: { state: typeof state; endGame: typeof endGame };
  }
}
if (import.meta.env.DEV) window.battleship = { state, endGame };
