'use strict';

// Web Audio playback engine for the offscreen document.
// Handles seamless looping, crossfades between sounds, fade in/out,
// and procedurally generated fallback ambience if a file is missing or broken.
// Now with high-quality real recordings from credible open sources (see assets/audio/ATTRIBUTION.md)
// Fallback is improved to be more pleasant if files fail.

const AudioEngine = (() => {
  const SWITCH_FADE_IN = 0.35;   // instant switch
  const SWITCH_FADE_OUT = 0.25;
  const NATURAL_STOP_FADE = 3;
  const QUICK_STOP_FADE = 0.5;
  const VOLUME_RAMP = 0.08;
  const bufferCache = new Map(); // instant switch via cache

  let ctx = null;
  let current = null;
  let stopRequested = false;

  function ensureContext() {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  async function getBuffer(soundId) {
    if (bufferCache.has(soundId)) return bufferCache.get(soundId);
    try {
      const url = chrome.runtime.getURL(`assets/audio/${soundId}.mp3`);
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = await res.arrayBuffer();
      if (arr.byteLength < 10240) throw new Error('File too small, likely placeholder');
      const buf = await ensureContext().decodeAudioData(arr);
      bufferCache.set(soundId, buf);
      // Preload others in background for instant next switch (credible, local)
      for (const id of ['rain','cafe','astral','ocean','forest']) {
        if (id !== soundId && !bufferCache.has(id)) {
          fetch(chrome.runtime.getURL(`assets/audio/${id}.mp3`)).then(r=> r.ok ? r.arrayBuffer() : null)
            .then(ab=> ab && ab.byteLength>10240 ? ensureContext().decodeAudioData(ab) : null)
            .then(b=>{ if(b) bufferCache.set(id, b); }).catch(()=>{});
        }
      }
      return buf;
    } catch (err) {
      console.warn('FocusFlow: audio file unavailable or invalid, using improved generated ambience', soundId, err);
      const gen = generateAmbience(soundId);
      // don't cache generated, but keep it fast
      return gen;
    }
  }

  // Improved procedural fallbacks — more pleasant, still seamless 8s loops
  function generateAmbience(soundId) {
    const sr = 22050;
    const n = sr * 8;
    const buffer = ensureContext().createBuffer(1, n, sr);
    const data = buffer.getChannelData(0);
    let seed = 987654321;
    const rand = () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296 * 2 - 1;
    };
    const TAU = Math.PI * 2;
    const clampS = (v) => Math.min(1, Math.max(-1, v));

    switch (soundId) {
      case 'astral': {
        // Warm evolving pad with 5 harmonic voices and slow LFO, plus subtle shimmer
        const voices = [[55, .18, 0.7], [110, .15, 1.1], [165, .12, 0.9], [220, .09, 1.3], [330, .05, 0.6]];
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          let s = 0;
          for (const [f, a, rate] of voices) {
            // slow evolution
            const mod = 0.85 + 0.15 * Math.sin(TAU * rate * t / 8);
            const detune = 1 + 0.008 * Math.sin(TAU * 0.3 * t);
            s += Math.sin(TAU * f * detune * t) * a * mod;
          }
          // subtle air
          s += rand() * 0.02 * (0.5 + 0.5 * Math.sin(TAU * 0.2 * t));
          data[i] = clampS(s * 0.85);
        }
        break;
      }
      case 'ocean': {
        // Deep swell with filtered noise, slow 12s + 8s cycles
        let b = 0, c = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const swell = 0.5 + 0.5 * Math.cos(TAU * t / 12) * Math.cos(TAU * t / 8 * 0.7);
          const foam = 0.3 + 0.3 * Math.sin(TAU * 0.15 * t);
          b += rand() * 0.04; b = b * 0.995 + rand() * 0.005; // low-pass
          c += (rand() - c) * 0.003; // very low rumble
          const wave = b * (0.2 + 1.2 * swell * swell) * 0.6 + c * 0.4 * foam;
          // gentle high-frequency hiss for spray
          const hiss = rand() * 0.03 * swell * 0.3;
          data[i] = clampS((wave + hiss) * 0.9);
        }
        break;
      }
      case 'cafe': {
        // Warm murmur: multiple filtered noise bands + occasional clink (sine burst)
        let b1 = 0, b2 = 0;
        // pre-generate clink times (3-5 per loop)
        const clinks = [1.2, 3.7, 5.1, 6.8];
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          b1 += rand() * 0.025; b1 *= 0.997; // low-mid murmur
          b2 += rand() * 0.015; b2 *= 0.9985; // high chatter
          const murmur = 0.65 + 0.2 * Math.sin(TAU * 0.4 * t) + 0.15 * Math.sin(TAU * 0.7 * t + 1.1);
          let s = (b1 * 1.8 + b2 * 1.2) * murmur * 0.45;
          // add clinks
          for (const ct of clinks) {
            const dt = t - ct;
            if (dt >= 0 && dt < 0.12) {
              const env = Math.exp(-dt * 28) * Math.sin(TAU * 1200 * dt) * 0.25;
              s += env * Math.exp(-Math.pow((dt-0.02)*80,2));
            }
            const dt2 = t - (ct+2.3);
            if (dt2 >= 0 && dt2 < 0.08) s += Math.exp(-dt2*35) * Math.sin(TAU * 1800 * dt2) * 0.12;
          }
          data[i] = clampS(s);
        }
        break;
      }
      case 'forest': {
        // Gentle wind + birds: low wind noise + sparse sine chirps
        let wind = 0;
        // bird chirp schedule: time, freq, duration
        const birds = [
          [0.8, 2200, 0.12], [1.5, 1800, 0.09], [2.9, 2600, 0.11], [4.2, 2000, 0.08],
          [5.6, 2400, 0.10], [6.3, 1900, 0.07], [7.1, 2300, 0.09]
        ];
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          wind += (rand() - wind) * 0.008;
          const breeze = 0.6 + 0.4 * Math.sin(TAU * 0.18 * t) * Math.cos(TAU * 0.07 * t);
          let s = wind * breeze * 0.22;
          // birds
          for (const [bt, freq, dur] of birds) {
            const dt = t - bt;
            if (dt >= 0 && dt < dur) {
              const env = Math.sin(Math.PI * dt / dur) * Math.exp(-dt*6);
              // chirp with slight frequency slide
              const f = freq * (1 + 0.15 * Math.sin(TAU * 12 * dt));
              s += Math.sin(TAU * f * dt) * env * 0.18;
              // second harmonic
              s += Math.sin(TAU * f * 1.6 * dt) * env * 0.07;
            }
            // mirrored for seamless loop (add at +8s)
            const dt2 = t - (bt - 8);
            if (dt2 >= 0 && dt2 < dur) {
              const env = Math.sin(Math.PI * dt2 / dur) * Math.exp(-dt2*6);
              const f = freq * (1 + 0.15 * Math.sin(TAU * 12 * dt2));
              s += Math.sin(TAU * f * dt2) * env * 0.05;
            }
          }
          data[i] = clampS(s);
        }
        break;
      }
      default: { // rain - layered filtered noise, gentle varying intensity
        let y = 0, y2 = 0, y3 = 0;
        for (let i = 0; i < n; i++) {
          const t = i / sr;
          const intensity = 0.75 + 0.25 * Math.sin(TAU * 0.11 * t) + 0.12 * Math.sin(TAU * 0.33 * t + 0.8);
          y += (rand() - y) * 0.18;
          y2 += (rand() - y2) * 0.06;
          y3 += (rand() - y3) * 0.025;
          // three bands: high hiss, mid patter, low rumble
          const hiss = y * 1.4 * intensity;
          const patter = y2 * 1.1 * (0.9 + 0.1 * Math.sin(TAU * 2.1 * t));
          const rumble = y3 * 0.5 * intensity * 0.6;
          const drop = rand() * 0.04 * intensity * (0.5 + 0.5 * Math.sin(TAU * 0.9 * t));
          data[i] = clampS((hiss * 0.5 + patter * 0.35 + rumble * 0.2 + drop) * 0.55);
        }
      }
    }
    // gentle fade in/out 30ms to avoid clicks at loop point
    const fade = Math.floor(sr * 0.03);
    for(let i=0;i<fade;i++){
      const w = i / fade;
      data[i] *= w;
      data[n-1-i] *= w;
    }
    return buffer;
  }

  function fadeOutAndStop(seconds) {
    if (!current || !ctx) return;
    const { source, gain } = current;
    current = null;
    const t = ctx.currentTime;
    try {
      gain.gain.cancelScheduledValues(t);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      source.stop(t + seconds + 0.05);
    } catch (err) {
      console.warn('FocusFlow: fade-out failed', err);
    }
  }

  async function play(soundId, volumePercent) {
    const context = ensureContext();
    const targetVolume = Utils.clamp(volumePercent, 0, 100) / 100;
    if (current && current.id === soundId) {
      setVolume(volumePercent);
      return;
    }
    stopRequested = false;
    // Immediate feedback: fade old out right away, don't wait for fetch/decode
    if (current) fadeOutAndStop(SWITCH_FADE_OUT);
    const buffer = await getBuffer(soundId);
    if (stopRequested) return;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const gain = context.createGain();
    const t = context.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, targetVolume), t + SWITCH_FADE_IN);
    source.connect(gain).connect(context.destination);
    source.start();
    current = { id: soundId, source, gain };
  }

  function setVolume(volumePercent) {
    if (!current || !ctx) return;
    const v = Math.max(0.0001, Utils.clamp(volumePercent, 0, 100) / 100);
    const t = ctx.currentTime;
    current.gain.gain.cancelScheduledValues(t);
    current.gain.gain.setValueAtTime(Math.max(current.gain.gain.value, 0.0001), t);
    current.gain.gain.linearRampToValueAtTime(v, t + VOLUME_RAMP);
  }

  return {
    play(soundId, volumePercent) {
      return play(soundId, volumePercent).catch((err) => console.warn('FocusFlow: play failed', err));
    },
    stop(fadeSeconds) {
      stopRequested = true;
      fadeOutAndStop(Number.isFinite(fadeSeconds) ? fadeSeconds : QUICK_STOP_FADE);
    },
    setVolume,
  };
})();
