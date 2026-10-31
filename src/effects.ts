import confetti from 'canvas-confetti';

const reducedMotion = (): boolean => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let stopCurrent: (() => void) | null = null;

export function stopEffects(): void {
  stopCurrent?.();
  stopCurrent = null;
  confetti.reset();
  document.body.classList.remove('shake', 'defeat-tint');
}

/** Fireworks bursts and side cannons for a win. */
export function victoryEffect(): void {
  stopEffects();
  if (reducedMotion()) {
    void confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 } });
    return;
  }
  const colors = ['#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#ffffff'];
  const end = Date.now() + 4500;
  const timer = window.setInterval(() => {
    if (Date.now() > end) {
      window.clearInterval(timer);
      return;
    }
    void confetti({
      particleCount: 60,
      startVelocity: 32,
      spread: 360,
      ticks: 70,
      gravity: 0.8,
      colors,
      origin: { x: 0.15 + Math.random() * 0.7, y: 0.15 + Math.random() * 0.35 },
    });
  }, 320);
  let frame = 0;
  const cannons = (): void => {
    if (Date.now() > end) return;
    void confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0, y: 0.8 }, colors });
    void confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1, y: 0.8 }, colors });
    frame = requestAnimationFrame(cannons);
  };
  cannons();
  stopCurrent = () => {
    window.clearInterval(timer);
    cancelAnimationFrame(frame);
  };
}

/** Screen shake, red tint and falling ash/fire for a loss. */
export function defeatEffect(): void {
  stopEffects();
  document.body.classList.add('defeat-tint');
  if (reducedMotion()) return;
  document.body.classList.add('shake');
  window.setTimeout(() => document.body.classList.remove('shake'), 900);

  const fire = confetti.shapeFromText({ text: '🔥', scalar: 2 });
  const boom = confetti.shapeFromText({ text: '💥', scalar: 2 });
  void confetti({ particleCount: 40, spread: 120, startVelocity: 45, scalar: 2, shapes: [boom, fire], origin: { y: 0.55 } });

  const end = Date.now() + 5000;
  let frame = 0;
  const ash = (): void => {
    if (Date.now() > end) return;
    void confetti({
      particleCount: 1,
      startVelocity: 0,
      ticks: 400,
      gravity: 0.35,
      drift: Math.random() - 0.5,
      scalar: 0.6 + Math.random() * 0.6,
      shapes: ['circle'],
      colors: ['#3a3a3a', '#555555', '#7a2e1f', '#222222'],
      origin: { x: Math.random(), y: -0.05 },
    });
    frame = requestAnimationFrame(ash);
  };
  ash();
  stopCurrent = () => cancelAnimationFrame(frame);
}
