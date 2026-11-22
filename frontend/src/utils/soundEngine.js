// Zero-dependency Web Audio API synthesizer for UAV Rotors, Turbofan Spools & Repair Laser
class PropulsionAudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.masterGain = null;
    this.rotorOsc = null;
    this.rotorGain = null;
    this.turbineOsc = null;
    this.turbineGain = null;
    this.noiseGain = null;
    this.noiseFilter = null;
    this.laserOsc = null;
    this.laserGain = null;
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.0;
    this.masterGain.connect(this.ctx.destination);

    // 1. Hexacopter blade-pass saw/triangle harmonic
    this.rotorOsc = this.ctx.createOscillator();
    this.rotorOsc.type = 'sawtooth';
    this.rotorOsc.frequency.value = 95;
    const rotorFilter = this.ctx.createBiquadFilter();
    rotorFilter.type = 'lowpass';
    rotorFilter.frequency.value = 340;
    this.rotorGain = this.ctx.createGain();
    this.rotorGain.gain.value = 0.14;
    this.rotorOsc.connect(rotorFilter);
    rotorFilter.connect(this.rotorGain);
    this.rotorGain.connect(this.masterGain);
    this.rotorOsc.start();

    // 2. High-pitched N1/N2 jet turbine spool whine
    this.turbineOsc = this.ctx.createOscillator();
    this.turbineOsc.type = 'sine';
    this.turbineOsc.frequency.value = 520;
    this.turbineGain = this.ctx.createGain();
    this.turbineGain.gain.value = 0.06;
    this.turbineOsc.connect(this.turbineGain);
    this.turbineGain.connect(this.masterGain);
    this.turbineOsc.start();

    // 3. Jet airflow / rotor downwash filtered white noise
    const bufSize = this.ctx.sampleRate * 2;
    const noiseBuf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const out = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) out[i] = Math.random() * 2 - 1;

    const noiseSrc = this.ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    noiseSrc.loop = true;

    this.noiseFilter = this.ctx.createBiquadFilter();
    this.noiseFilter.type = 'bandpass';
    this.noiseFilter.frequency.value = 420;
    this.noiseFilter.Q.value = 1.2;

    this.noiseGain = this.ctx.createGain();
    this.noiseGain.gain.value = 0.12;
    noiseSrc.connect(this.noiseFilter);
    this.noiseFilter.connect(this.noiseGain);
    this.noiseGain.connect(this.masterGain);
    noiseSrc.start();

    // 4. Maintenance bot laser weld hum
    this.laserOsc = this.ctx.createOscillator();
    this.laserOsc.type = 'triangle';
    this.laserOsc.frequency.value = 180;
    this.laserGain = this.ctx.createGain();
    this.laserGain.gain.value = 0.0;
    this.laserOsc.connect(this.laserGain);
    this.laserGain.connect(this.masterGain);
    this.laserOsc.start();
  }

  toggle() {
    this.init();
    if (!this.ctx) return false;
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.enabled = !this.enabled;
    const now = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(now);
    this.masterGain.gain.setTargetAtTime(this.enabled ? 0.22 : 0.0, now, 0.12);
    return this.enabled;
  }

  update({ rpm = 2800, assetMode = 'HEXA', welding = false }) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const norm = Math.max(0, Math.min(1, rpm / 5500));

    if (assetMode === 'HEXA') {
      this.rotorOsc.frequency.setTargetAtTime(55 + norm * 165, now, 0.08);
      this.rotorGain.gain.setTargetAtTime(0.08 + norm * 0.14, now, 0.1);
      this.turbineOsc.frequency.setTargetAtTime(320 + norm * 480, now, 0.08);
      this.turbineGain.gain.setTargetAtTime(0.02 + norm * 0.04, now, 0.1);
    } else {
      this.rotorOsc.frequency.setTargetAtTime(42 + norm * 90, now, 0.08);
      this.rotorGain.gain.setTargetAtTime(0.04 + norm * 0.06, now, 0.1);
      this.turbineOsc.frequency.setTargetAtTime(420 + norm * 1250, now, 0.08);
      this.turbineGain.gain.setTargetAtTime(0.05 + norm * 0.09, now, 0.1);
    }

    this.noiseFilter.frequency.setTargetAtTime(240 + norm * 1100, now, 0.1);
    this.noiseGain.gain.setTargetAtTime(0.05 + norm * 0.16, now, 0.1);

    // Subtle buzzing crackle while maintenance bot is laser-welding
    this.laserOsc.frequency.setTargetAtTime(welding ? 165 + Math.random() * 65 : 140, now, 0.04);
    this.laserGain.gain.setTargetAtTime(welding ? 0.09 : 0.0, now, 0.06);
  }
}

export const propulsionAudio = new PropulsionAudioEngine();
