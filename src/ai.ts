import { FLEET, SIZE, cellsFor, colOf, neighbours, rowOf, type Orientation, type ShotResult } from './game';

export type Difficulty = 'easy' | 'normal' | 'hard';

type Knowledge = 'unknown' | 'miss' | 'hit' | 'sunk';

const pick = <T>(items: readonly T[]): T => items[Math.floor(Math.random() * items.length)];

/**
 * Computer opponent. Only sees the results of its own shots (plus which ship was
 * sunk, as announced in the real game) — never the player's board layout.
 *
 * - easy:   random shots, occasionally follows up a hit.
 * - normal: classic hunt/target with checkerboard parity.
 * - hard:   probability density over every legal placement of the remaining ships.
 */
export class AI {
  private readonly known: Knowledge[] = new Array<Knowledge>(SIZE * SIZE).fill('unknown');
  private readonly remaining: number[] = FLEET.map((s) => s.length);

  constructor(readonly difficulty: Difficulty) {}

  chooseTarget(): number {
    switch (this.difficulty) {
      case 'easy':
        return this.easy();
      case 'normal':
        return this.huntTarget();
      case 'hard':
        return this.densityTarget();
    }
  }

  record(i: number, result: ShotResult): void {
    if (result.kind === 'miss') {
      this.known[i] = 'miss';
      return;
    }
    this.known[i] = 'hit';
    if (result.kind === 'sunk') {
      for (const c of result.ship.cells) this.known[c] = 'sunk';
      const idx = this.remaining.indexOf(result.ship.type.length);
      if (idx >= 0) this.remaining.splice(idx, 1);
    }
  }

  private unknownCells(): number[] {
    const out: number[] = [];
    this.known.forEach((k, i) => k === 'unknown' && out.push(i));
    return out;
  }

  private openHits(): number[] {
    const out: number[] = [];
    this.known.forEach((k, i) => k === 'hit' && out.push(i));
    return out;
  }

  private easy(): number {
    const hits = this.openHits();
    if (hits.length && Math.random() < 0.45) {
      const options = hits.flatMap(neighbours).filter((n) => this.known[n] === 'unknown');
      if (options.length) return pick(options);
    }
    return pick(this.unknownCells());
  }

  private huntTarget(): number {
    const hits = this.openHits();
    if (hits.length) {
      // Prefer extending a line of two or more adjacent hits.
      const lineEnds: number[] = [];
      for (const h of hits) {
        for (const [dr, dc] of [[0, 1], [1, 0]] as const) {
          const r = rowOf(h);
          const c = colOf(h);
          const nr = r + dr;
          const nc = c + dc;
          if (nr >= SIZE || nc >= SIZE || this.known[nr * SIZE + nc] !== 'hit') continue;
          // Walk both directions to the end of this run of hits.
          for (const sign of [-1, 1]) {
            let rr = r;
            let cc = c;
            while (rr >= 0 && cc >= 0 && rr < SIZE && cc < SIZE && this.known[rr * SIZE + cc] === 'hit') {
              rr += dr * sign;
              cc += dc * sign;
            }
            if (rr >= 0 && cc >= 0 && rr < SIZE && cc < SIZE && this.known[rr * SIZE + cc] === 'unknown') {
              lineEnds.push(rr * SIZE + cc);
            }
          }
        }
      }
      if (lineEnds.length) return pick(lineEnds);
      const adjacent = hits.flatMap(neighbours).filter((n) => this.known[n] === 'unknown');
      if (adjacent.length) return pick(adjacent);
    }
    const minLen = Math.min(...this.remaining);
    const unknown = this.unknownCells();
    const parity = unknown.filter((i) => (rowOf(i) + colOf(i)) % minLen === 0);
    return pick(parity.length ? parity : unknown);
  }

  private densityTarget(): number {
    const targeting = this.openHits().length > 0;
    let scores = this.density(targeting);
    if (targeting && Math.max(...scores) === 0) scores = this.density(false);
    const best = Math.max(...scores);
    if (best === 0) return pick(this.unknownCells());
    const candidates: number[] = [];
    scores.forEach((s, i) => s === best && candidates.push(i));
    return pick(candidates);
  }

  /** Counts, for each unknown cell, how many legal placements of the remaining ships cover it. */
  private density(targeting: boolean): number[] {
    const scores = new Array<number>(SIZE * SIZE).fill(0);
    for (const len of this.remaining) {
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          for (const o of ['h', 'v'] as Orientation[]) {
            const cells = cellsFor(r, c, len, o);
            if (!cells) continue;
            let hitCount = 0;
            let blocked = false;
            for (const cell of cells) {
              const k = this.known[cell];
              if (k === 'miss' || k === 'sunk') {
                blocked = true;
                break;
              }
              if (k === 'hit') hitCount++;
            }
            if (blocked || (targeting && hitCount === 0)) continue;
            const weight = targeting ? 1 + hitCount * hitCount * 20 : 1;
            for (const cell of cells) if (this.known[cell] === 'unknown') scores[cell] += weight;
          }
        }
      }
    }
    return scores;
  }
}
