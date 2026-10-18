/**
 * Ringtone synthesised with WebAudio — no audio asset needed.
 * Browsers may block audio until the page has had a user gesture; failures are silent.
 */
let ctx = null;
let timer = null;

function burst() {
  if (!ctx) return;
  const now = ctx.currentTime;
  [[0, 523.25], [0.22, 659.25], [0.44, 523.25], [0.66, 659.25]].forEach(([offset, freq]) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + offset);
    gain.gain.linearRampToValueAtTime(0.12, now + offset + 0.03);
    gain.gain.linearRampToValueAtTime(0, now + offset + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + offset);
    osc.stop(now + offset + 0.22);
  });
}

export function startRingtone() {
  stopRingtone();
  try {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    ctx.resume?.().catch(() => {});
    burst();
    timer = window.setInterval(burst, 2800);
  } catch { /* audio unavailable */ }
}

export function stopRingtone() {
  if (timer) window.clearInterval(timer);
  timer = null;
  if (ctx) {
    ctx.close?.().catch(() => {});
    ctx = null;
  }
}
