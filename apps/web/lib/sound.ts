// Tiny WebAudio "ding" for new-order notifications — no audio asset needed.
let ctx: AudioContext | null = null;

export function playDing() {
  try {
    ctx = ctx ?? new (window.AudioContext || (window as any).webkitAudioContext)();
    const t = ctx.currentTime;
    for (const [freq, start] of [[880, 0], [1318.5, 0.12]] as const) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t + start);
      gain.gain.exponentialRampToValueAtTime(0.3, t + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + start + 0.5);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t + start);
      osc.stop(t + start + 0.55);
    }
  } catch { /* audio blocked until first user gesture — fine */ }
}
