// Synthesized sound: every effect and the music loop are built with WebAudio.
// No audio files, no network — oscillators and filtered noise only.
export function createAudio() {
  let ctx = null;
  let master = null;
  let muted = false;
  let engineOsc = null, engineGain = null, engineFilter = null;
  let sirenOsc = null, sirenGain = null, sirenLfo = null;
  let musicTimer = null;
  let musicStep = 0;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  function noise(dur, vol = 0.3, freq = 800, when = 0) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(master);
    src.start(t0);
  }

  // A short bass-and-hat loop in A minor, scheduled a bar ahead.
  const BASS = [55, 0, 55, 0, 65.41, 0, 49, 0, 55, 0, 55, 0, 82.41, 0, 73.42, 0];
  function startMusic() {
    if (!ctx || musicTimer) return;
    const stepDur = 0.22;
    musicTimer = setInterval(() => {
      if (muted) return;
      const note = BASS[musicStep % BASS.length];
      if (note) tone(note, stepDur * 0.9, 'triangle', 0.10);
      if (musicStep % 2 === 0) noise(0.03, 0.05, 6000); // hat
      if (musicStep % 8 === 0) tone(120, 0.12, 'sine', 0.16, 40); // kick
      musicStep++;
    }, stepDur * 1000);
  }

  return {
    get muted() { return muted; },
    unlock() {
      if (ensure() && ctx.state === 'suspended') ctx.resume();
      startMusic();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    click() { tone(660, 0.06, 'square', 0.08); },
    pickup() { tone(880, 0.09, 'sine', 0.18); tone(1320, 0.12, 'sine', 0.16, null, 0.08); },
    coin() { tone(1046, 0.08, 'sine', 0.15); tone(1568, 0.14, 'sine', 0.15, null, 0.07); },
    punch() { noise(0.12, 0.35, 500); tone(140, 0.1, 'square', 0.2, 60); },
    crash() { noise(0.3, 0.4, 300); tone(90, 0.25, 'sawtooth', 0.2, 40); },
    busted() { tone(392, 0.3, 'square', 0.15); tone(311, 0.4, 'square', 0.15, null, 0.28); },
    mission() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.18, null, i * 0.11));
    },
    phone() { tone(1200, 0.12, 'sine', 0.12); tone(1200, 0.12, 'sine', 0.12, null, 0.22); },

    // Engine hum follows the car's speed (0..1). Call every frame while driving.
    engine(on, speed01) {
      if (!ctx || muted) { this.engineOff(); return; }
      if (!on) { this.engineOff(); return; }
      if (!engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineFilter = ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 420;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0.0;
        engineOsc.connect(engineFilter).connect(engineGain).connect(master);
        engineOsc.start();
      }
      engineOsc.frequency.value = 55 + speed01 * 130;
      engineGain.gain.value = 0.05 + speed01 * 0.05;
    },
    engineOff() {
      if (engineGain) engineGain.gain.value = 0;
    },

    // Two-tone police siren while wanted. Call every frame.
    siren(on) {
      if (!ctx || muted) { this.sirenOff(); return; }
      if (!on) { this.sirenOff(); return; }
      if (!sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'triangle';
        sirenOsc.frequency.value = 750;
        sirenLfo = ctx.createOscillator();
        sirenLfo.frequency.value = 0.7;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 260;
        sirenLfo.connect(lfoGain).connect(sirenOsc.frequency);
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.045;
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
        sirenLfo.start();
      }
    },
    sirenOff() {
      if (sirenOsc) {
        try { sirenOsc.stop(); sirenLfo.stop(); } catch { /* already stopped */ }
        sirenOsc = null; sirenLfo = null; sirenGain = null;
      }
    },
  };
}
