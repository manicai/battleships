export const SIZE = 10;

export interface ShipType {
  readonly name: string;
  readonly length: number;
}

export const FLEET: readonly ShipType[] = [
  { name: 'Carrier', length: 5 },
  { name: 'Battleship', length: 4 },
  { name: 'Cruiser', length: 3 },
  { name: 'Submarine', length: 3 },
  { name: 'Destroyer', length: 2 },
];

export type Orientation = 'h' | 'v';

export interface Ship {
  readonly type: ShipType;
  readonly cells: readonly number[];
  readonly orientation: Orientation;
  readonly hits: Set<number>;
}

export type ShotResult =
  | { kind: 'miss' }
  | { kind: 'hit'; ship: Ship }
  | { kind: 'sunk'; ship: Ship };

export const index = (row: number, col: number): number => row * SIZE + col;
export const rowOf = (i: number): number => Math.floor(i / SIZE);
export const colOf = (i: number): number => i % SIZE;
export const coordLabel = (i: number): string =>
  `${String.fromCharCode(65 + rowOf(i))}${colOf(i) + 1}`;

export const isSunk = (ship: Ship): boolean => ship.hits.size === ship.type.length;

/** Cells covered by a ship of `length` starting at (row, col), or null if it runs off the board. */
export function cellsFor(row: number, col: number, length: number, o: Orientation): number[] | null {
  const cells: number[] = [];
  for (let k = 0; k < length; k++) {
    const r = o === 'v' ? row + k : row;
    const c = o === 'h' ? col + k : col;
    if (r < 0 || c < 0 || r >= SIZE || c >= SIZE) return null;
    cells.push(index(r, c));
  }
  return cells;
}

export function neighbours(i: number): number[] {
  const r = rowOf(i);
  const c = colOf(i);
  const out: number[] = [];
  if (r > 0) out.push(i - SIZE);
  if (r < SIZE - 1) out.push(i + SIZE);
  if (c > 0) out.push(i - 1);
  if (c < SIZE - 1) out.push(i + 1);
  return out;
}

export class Board {
  readonly ships: Ship[] = [];
  readonly shots = new Map<number, 'miss' | 'hit'>();
  private readonly occupancy = new Map<number, Ship>();

  shipAt(i: number): Ship | undefined {
    return this.occupancy.get(i);
  }

  canPlace(cells: readonly number[] | null): cells is number[] {
    return cells !== null && cells.every((c) => !this.occupancy.has(c));
  }

  place(type: ShipType, row: number, col: number, o: Orientation): Ship | null {
    const cells = cellsFor(row, col, type.length, o);
    if (!this.canPlace(cells)) return null;
    const ship: Ship = { type, cells, orientation: o, hits: new Set() };
    this.ships.push(ship);
    for (const c of cells) this.occupancy.set(c, ship);
    return ship;
  }

  clear(): void {
    this.ships.length = 0;
    this.occupancy.clear();
    this.shots.clear();
  }

  /** True if any cell (or any of its 8 surrounding cells) is already occupied by a ship. */
  touchesShip(cells: readonly number[]): boolean {
    return cells.some((i) => {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const r = rowOf(i) + dr;
          const c = colOf(i) + dc;
          if (r >= 0 && c >= 0 && r < SIZE && c < SIZE && this.occupancy.has(index(r, c))) return true;
        }
      }
      return false;
    });
  }

  /**
   * Places the whole fleet at random, replacing any ships already on the board.
   * Ships never touch, not even diagonally, so they don't clump together.
   */
  randomize(fleet: readonly ShipType[] = FLEET): void {
    for (let attempt = 0; attempt < 100; attempt++) {
      if (this.tryRandomize(fleet, true)) return;
    }
    this.tryRandomize(fleet, false);
  }

  private tryRandomize(fleet: readonly ShipType[], spaced: boolean): boolean {
    this.clear();
    for (const type of fleet) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const o: Orientation = Math.random() < 0.5 ? 'h' : 'v';
        const row = Math.floor(Math.random() * SIZE);
        const col = Math.floor(Math.random() * SIZE);
        const cells = cellsFor(row, col, type.length, o);
        if (cells && spaced && this.touchesShip(cells)) continue;
        placed = this.place(type, row, col, o) !== null;
      }
      if (!placed) return false;
    }
    return true;
  }

  hasShot(i: number): boolean {
    return this.shots.has(i);
  }

  fire(i: number): ShotResult {
    if (this.shots.has(i)) throw new Error(`Cell ${coordLabel(i)} already targeted`);
    const ship = this.occupancy.get(i);
    if (!ship) {
      this.shots.set(i, 'miss');
      return { kind: 'miss' };
    }
    this.shots.set(i, 'hit');
    ship.hits.add(i);
    return isSunk(ship) ? { kind: 'sunk', ship } : { kind: 'hit', ship };
  }

  get allSunk(): boolean {
    return this.ships.length > 0 && this.ships.every(isSunk);
  }
}
