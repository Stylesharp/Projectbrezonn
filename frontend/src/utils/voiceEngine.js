// Zero-dependency Web Speech API cockpit annunciator with Chromium/Brave stall fixes
class CockpitVoiceEngine {
  constructor() {
    this.enabled = false;
    this.lastSpoken = {};
    this.voices = [];
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      const loadVoices = () => {
        this.voices = window.speechSynthesis.getVoices() || [];
      };
      loadVoices();
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }

  setEnabled(flag) {
    this.enabled = Boolean(flag);
    if (!this.enabled) this.stop();
  }

  stop() {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // ignore
      }
    }
  }

  speak(text, key = text, cooldownMs = 6000) {
    if (!this.enabled || !text || typeof window === 'undefined' || !window.speechSynthesis) return;
    const now = Date.now();
    if (this.lastSpoken[key] && now - this.lastSpoken[key] < cooldownMs) return;
    this.lastSpoken[key] = now;

    try {
      const synth = window.speechSynthesis;
      if (synth.paused) synth.resume();
      synth.cancel();

      const cleanText = String(text).replace(/[*_`#]/g, '').slice(0, 260);
      const utter = new SpeechSynthesisUtterance(cleanText);
      const preferred = this.voices.find((v) => /en-(US|GB|IN)/i.test(v.lang));
      if (preferred) utter.voice = preferred;
      utter.lang = preferred?.lang || 'en-US';
      utter.rate = 1.06;
      utter.pitch = 0.94;
      utter.volume = 0.85;
      synth.speak(utter);
    } catch {
      // Ignore speech synthesis errors on restricted browsers
    }
  }
}

export const cockpitVoice = new CockpitVoiceEngine();
