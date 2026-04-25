let activeSource: OscillatorNode | null = null;
let activeCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!activeCtx || activeCtx.state === "closed") {
    activeCtx = new AudioContext();
  }
  return activeCtx;
}

function stopCurrent(): void {
  if (activeSource) {
    try {
      activeSource.stop();
    } catch {}
    activeSource = null;
  }
}

export function playBadgeSound(): void {
  stopCurrent();

  try {
    const ctx = getCtx();

    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 0.01);
    masterGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);
    masterGain.connect(ctx.destination);

    const notes = [
      { freq: 523.25, start: 0, dur: 0.35 },
      { freq: 659.25, start: 0.18, dur: 0.35 },
      { freq: 783.99, start: 0.36, dur: 0.55 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(note.freq, ctx.currentTime + note.start);

      gain.gain.setValueAtTime(0, ctx.currentTime + note.start);
      gain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + note.start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + note.start + note.dur);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(ctx.currentTime + note.start);
      osc.stop(ctx.currentTime + note.start + note.dur + 0.05);

      if (note === notes[notes.length - 1]) {
        activeSource = osc;
        osc.onended = () => {
          activeSource = null;
        };
      }
    }
  } catch (err) {
    console.warn("Audio playback failed:", err);
  }
}
