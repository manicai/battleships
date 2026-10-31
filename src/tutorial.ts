export interface TourStep {
  /** Element to spotlight; omitted (or not visible) shows the card centred. */
  target?: () => HTMLElement | null;
  title: string;
  /** Trusted, static HTML. */
  body: string;
}

const PAD = 8;
const GAP = 14;

/** A guided tour: dims the page, spotlights one element per step and explains it in a card. */
export class Tour {
  private root: HTMLElement | null = null;
  private spot!: HTMLElement;
  private card!: HTMLElement;
  private step = 0;
  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') this.close();
    else if (e.key === 'ArrowRight') this.go(this.step + 1);
    else if (e.key === 'ArrowLeft') this.go(this.step - 1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  private readonly onLayout = (): void => this.position();

  constructor(
    private readonly steps: readonly TourStep[],
    private readonly onClose?: () => void,
  ) {}

  get active(): boolean {
    return this.root !== null;
  }

  start(): void {
    this.close(false);
    this.root = document.createElement('div');
    this.root.className = 'tour';
    this.spot = document.createElement('div');
    this.spot.className = 'tour-spot';
    this.card = document.createElement('div');
    this.card.className = 'tour-card';
    this.card.setAttribute('role', 'dialog');
    this.card.setAttribute('aria-modal', 'true');
    this.card.setAttribute('aria-labelledby', 'tour-title');
    this.root.append(this.spot, this.card);
    // Clicking the dimmed area advances, so the tour never feels stuck.
    this.root.addEventListener('click', (e) => {
      if (e.target === this.root || e.target === this.spot) this.go(this.step + 1);
    });
    document.body.append(this.root);
    document.addEventListener('keydown', this.onKey, true);
    window.addEventListener('resize', this.onLayout);
    window.addEventListener('scroll', this.onLayout, true);
    this.go(0);
  }

  close(notify = true): void {
    if (!this.root) return;
    this.root.remove();
    this.root = null;
    document.removeEventListener('keydown', this.onKey, true);
    window.removeEventListener('resize', this.onLayout);
    window.removeEventListener('scroll', this.onLayout, true);
    if (notify) this.onClose?.();
  }

  private go(n: number): void {
    if (n < 0) return;
    if (n >= this.steps.length) {
      this.close();
      return;
    }
    this.step = n;
    const s = this.steps[n];
    const last = n === this.steps.length - 1;
    this.card.innerHTML = `
      <div class="tour-progress">${this.steps.map((_, i) => `<i class="${i === n ? 'on' : ''}"></i>`).join('')}</div>
      <h3 id="tour-title">${s.title}</h3>
      <div class="tour-body">${s.body}</div>
      <div class="tour-actions">
        <button type="button" class="btn tour-skip">${last ? 'Close' : 'Skip tour'}</button>
        <span class="tour-nav">
          ${n > 0 ? '<button type="button" class="btn tour-back">Back</button>' : ''}
          <button type="button" class="btn primary tour-next">${last ? "Let's play!" : 'Next'}</button>
        </span>
      </div>`;
    this.card.querySelector('.tour-skip')?.addEventListener('click', () => this.close());
    this.card.querySelector('.tour-back')?.addEventListener('click', () => this.go(n - 1));
    const next = this.card.querySelector<HTMLButtonElement>('.tour-next');
    next?.addEventListener('click', () => this.go(n + 1));

    const target = this.target();
    target?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    this.position();
    // Re-measure once smooth scrolling has settled.
    window.setTimeout(() => this.position(), 400);
    next?.focus({ preventScroll: true });
  }

  private target(): HTMLElement | null {
    const el = this.steps[this.step]?.target?.() ?? null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? el : null;
  }

  private position(): void {
    if (!this.root) return;
    const el = this.target();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const card = this.card.getBoundingClientRect();

    if (!el) {
      this.spot.classList.add('none');
      this.card.style.left = `${Math.max(12, (vw - card.width) / 2)}px`;
      this.card.style.top = `${Math.max(12, (vh - card.height) / 2)}px`;
      return;
    }

    const r = el.getBoundingClientRect();
    this.spot.classList.remove('none');
    Object.assign(this.spot.style, {
      left: `${r.left - PAD}px`,
      top: `${r.top - PAD}px`,
      width: `${r.width + PAD * 2}px`,
      height: `${r.height + PAD * 2}px`,
    });

    // Prefer below the target, then above, then whichever side has room, else overlap the bottom.
    let top: number;
    if (r.bottom + PAD + GAP + card.height < vh) top = r.bottom + PAD + GAP;
    else if (r.top - PAD - GAP - card.height > 0) top = r.top - PAD - GAP - card.height;
    else top = vh - card.height - 12;
    let left = r.left + r.width / 2 - card.width / 2;
    if (vw > 900 && top === vh - card.height - 12) {
      // Wide screens: put the card beside a tall target instead of covering it.
      const right = r.right + PAD + GAP;
      const leftSide = r.left - PAD - GAP - card.width;
      if (right + card.width < vw) left = right;
      else if (leftSide > 0) left = leftSide;
      top = Math.min(Math.max(12, r.top), vh - card.height - 12);
    }
    this.card.style.left = `${Math.min(Math.max(12, left), vw - card.width - 12)}px`;
    this.card.style.top = `${Math.max(12, top)}px`;
  }
}

const legend = (cls: string, label: string): string =>
  `<span class="legend-item"><span class="cell legend-cell ${cls}"></span>${label}</span>`;

export const TUTORIAL_STEPS: readonly TourStep[] = [
  {
    title: 'Welcome, Admiral! ⚓',
    body: `<p>You and the computer each hide a fleet of <b>5 ships</b> on a 10×10 grid.
      Take turns firing at each other's grid. <b>Sink every enemy ship before they sink yours.</b></p>
      <p class="muted">Use the arrow keys or the buttons to move through this tour.</p>`,
  },
  {
    target: () => document.getElementById('placement'),
    title: '1. Deploy your fleet',
    body: `<p>Place these ships in order. The one highlighted in yellow is next.</p>
      <p><b>Rotate</b> (or press <kbd>R</kbd>, or right-click) switches between horizontal and vertical.
      <b>Randomize</b> places the whole fleet for you, with gaps between the ships.</p>`,
  },
  {
    target: () => document.getElementById('player-board'),
    title: '2. Place ships on your board',
    body: `<p>Move over your board to preview the ship, then click to place it.</p>
      ${legend('preview-ok', 'fits')} ${legend('preview-bad', "doesn't fit")}
      <p>When all 5 are placed, press <b>Start Battle</b>.</p>`,
  },
  {
    target: () => document.getElementById('enemy-board'),
    title: '3. Fire!',
    body: `<p>Click a square in <b>Enemy Waters</b> to fire. Then the enemy fires one shot back at your board.
      The board whose turn it is glows yellow.</p>`,
  },
  {
    target: () => document.getElementById('enemy-wrap'),
    title: '4. Read the results',
    body: `<p>${legend('miss', 'Miss')} ${legend('hit', 'Hit')} ${legend('ship ship-h ship-start ship-end sunk', 'Sunk')}</p>
      <p>When every square of a ship is hit, it's sunk and its outline appears.
      <b>Tip:</b> after a hit, fire at the squares next to it to find the rest of the ship.</p>`,
  },
  {
    target: () => document.getElementById('enemy-fleet'),
    title: '5. Track the fleets',
    body: `<p>This list shows which enemy ships are still afloat. The list under your board shows the damage to your own ships.
      The <b>Battle Log</b> below the boards records every shot.</p>`,
  },
  {
    target: () => document.querySelector<HTMLElement>('.controls'),
    title: '6. Controls',
    body: `<p>Choose the <b>AI</b> difficulty (applies when the battle starts), mute sound,
      replay this tour with <b>?</b>, or start over at any time with <b>New Game</b>.</p>
      <p>Good hunting! 🎯</p>`,
  },
];
