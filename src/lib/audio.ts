/**
 * Tiny chiptune SFX synthesized with WebAudio square/triangle waves — no audio
 * files, no licensing questions. Muted by default; the player opts in.
 */
type Note = { f: number; d: number; type?: OscillatorType; v?: number };

let ctx: AudioContext | null = null;
let enabled = false;

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (on) getCtx()?.resume().catch(() => {});
}

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function play(notes: Note[], gap = 0) {
  if (!enabled) return;
  const ac = getCtx();
  if (!ac) return;
  let t = ac.currentTime + 0.01;
  for (const n of notes) {
    if (n.f > 0) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = n.type ?? "square";
      osc.frequency.setValueAtTime(n.f, t);
      const v = n.v ?? 0.06;
      gain.gain.setValueAtTime(v, t);
      gain.gain.setValueAtTime(v, t + n.d * 0.8);
      gain.gain.linearRampToValueAtTime(0, t + n.d);
      osc.connect(gain).connect(ac.destination);
      osc.start(t);
      osc.stop(t + n.d + 0.02);
    }
    t += n.d + gap;
  }
}

const N = { C5: 523, D5: 587, E5: 659, F5: 698, G5: 784, A5: 880, B5: 988, C6: 1047, E6: 1319, G6: 1568, C4: 262, G4: 392, E4: 330 };

export const sfx = {
  blip: () => play([{ f: 1200, d: 0.03, v: 0.04 }]),
  select: () => play([{ f: N.E5, d: 0.05 }, { f: N.C6, d: 0.07 }]),
  error: () => play([{ f: 180, d: 0.09, type: "square" }, { f: 140, d: 0.12, type: "square" }]),
  throwBall: () => play([{ f: 400, d: 0.04 }, { f: 600, d: 0.04 }, { f: 900, d: 0.05 }]),
  wobble: () => play([{ f: 220, d: 0.05, type: "triangle", v: 0.12 }]),
  caught: () => play([{ f: N.G5, d: 0.08 }, { f: N.E5, d: 0.08 }, { f: N.C6, d: 0.18 }]),
  rare: () => play([{ f: N.C5, d: 0.07 }, { f: N.E5, d: 0.07 }, { f: N.G5, d: 0.07 }, { f: N.C6, d: 0.2 }]),
  master: () =>
    play([
      { f: N.C5, d: 0.09 }, { f: N.E5, d: 0.09 }, { f: N.G5, d: 0.09 }, { f: N.C6, d: 0.14 },
      { f: 0, d: 0.04 }, { f: N.G5, d: 0.09 }, { f: N.C6, d: 0.09 }, { f: N.E6, d: 0.09 }, { f: N.G6, d: 0.35 },
    ]),
  brokeFree: () => play([{ f: N.E5, d: 0.08 }, { f: N.C5, d: 0.08 }, { f: N.G4, d: 0.2, type: "triangle", v: 0.1 }]),
  victory: () =>
    play([
      { f: N.G4, d: 0.1 }, { f: N.C5, d: 0.1 }, { f: N.E5, d: 0.1 }, { f: N.G5, d: 0.2 },
      { f: N.E5, d: 0.1 }, { f: N.G5, d: 0.4 },
    ]),
};
