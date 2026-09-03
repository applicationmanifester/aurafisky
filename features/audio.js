// -- IMMERSIVE AUDIO WEATHER SOUNDSCAPES (Web Audio Synthesizer) --

function toggleAmbientSoundscape(forceState) {
    if (forceState !== undefined) {
      this.audioActive = forceState;
    } else {
      this.audioActive = !this.audioActive;
    }

    if (this.$.settingsSoundToggle) {
      this.$.settingsSoundToggle.checked = this.audioActive;
    }

    if (this.audioActive) {
      if (!this.audioContext) {
        this.audioContext = new (
          window.AudioContext || window.webkitAudioContext
        )();
      }
      if (this.audioContext.state === "suspended") {
        this.audioContext.resume();
      }
      this.showToast("Weather ambient soundscapes active.", "success");

      if (this.weatherData) {
        const weather = WeatherService.getHourlyAtIndex(
          this.weatherData,
          parseInt(this.$.timelineSlider.value, 10),
        );
        if (weather) {
          this.updateAmbientSoundscapeSynthesizer(
            weather.weatherCode,
            weather.windSpeed,
          );
        }
      }
    } else {
      this.stopAllSounds();
    }
  }

function updateAmbientSoundscapeSynthesizer(code, windSpeed) {
    if (!this.audioActive || !this.audioContext) return;

    let soundType = "calm";

    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
      soundType = "rain";
    } else if (code >= 95 && code <= 99) {
      soundType = "storm";
    } else if (windSpeed > 25) {
      soundType = "windy";
    }

    if (this.activeSoundType === soundType) return;
    this.activeSoundType = soundType;

    this.stopAllSounds();

    const ctx = this.audioContext;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(
      this.volumeLevel * 0.24,
      ctx.currentTime + 1.5,
    );
    masterGain.connect(ctx.destination);
    this.audioNodes.master = masterGain;

    // Shared noise buffer — allocate once and reuse
    if (!this._noiseBuffer) {
      const bufSize = 2 * ctx.sampleRate;
      this._noiseBuffer = ctx.createBuffer(1, bufSize, ctx.sampleRate);
      const data = this._noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    }

    if (soundType === "rain") {
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = this._noiseBuffer;
      whiteNoise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1000;
      filter.Q.value = 1;

      whiteNoise.connect(filter);
      filter.connect(masterGain);
      whiteNoise.start();

      this.audioNodes.whiteNoise = whiteNoise;
      this.audioNodes.filter = filter;
    } else if (soundType === "storm") {
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = this._noiseBuffer;
      whiteNoise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 800;

      whiteNoise.connect(filter);
      filter.connect(masterGain);
      whiteNoise.start();

      this.audioNodes.whiteNoise = whiteNoise;
      this.audioNodes.filter = filter;

      this.thunderInterval = setInterval(() => {
        this.triggerSynthesizedThunder(ctx, masterGain);
      }, 9000);

      this.triggerSynthesizedThunder(ctx, masterGain);
    } else if (soundType === "windy") {
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = this._noiseBuffer;
      whiteNoise.loop = true;

      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 350;
      filter.Q.value = 3.0;

      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.12;

      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 180;

      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      whiteNoise.connect(filter);
      filter.connect(masterGain);

      lfo.start();
      whiteNoise.start();

      this.audioNodes.whiteNoise = whiteNoise;
      this.audioNodes.lfo = lfo;
      this.audioNodes.filter = filter;
    } else {
      this.birdsInterval = setInterval(() => {
        this.triggerBirdChirp(ctx, masterGain);
      }, 6000);

      this.triggerBirdChirp(ctx, masterGain);
    }
  }

function triggerSynthesizedThunder(ctx, destinationGain) {
    if (!this.audioActive || !ctx) return;

    const thunderOsc = ctx.createOscillator();
    thunderOsc.type = "triangle";
    thunderOsc.frequency.setValueAtTime(60, ctx.currentTime);
    thunderOsc.frequency.exponentialRampToValueAtTime(
      12,
      ctx.currentTime + 3.0,
    );

    const thunderGain = ctx.createGain();
    thunderGain.gain.setValueAtTime(0.001, ctx.currentTime);
    thunderGain.gain.linearRampToValueAtTime(0.7, ctx.currentTime + 0.1);
    thunderGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 3.0);

    thunderOsc.connect(thunderGain);
    thunderGain.connect(destinationGain);

    thunderOsc.start();
    thunderOsc.stop(ctx.currentTime + 3.5);
  }

function triggerBirdChirp(ctx, destinationGain) {
    if (!this.audioActive || !ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = "sine";

    osc.frequency.setValueAtTime(2200, now);
    osc.frequency.exponentialRampToValueAtTime(3200, now + 0.1);
    osc.frequency.setValueAtTime(2400, now + 0.15);
    osc.frequency.exponentialRampToValueAtTime(3600, now + 0.25);

    gainNode.gain.setValueAtTime(0.001, now);
    gainNode.gain.linearRampToValueAtTime(0.08, now + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gainNode);
    gainNode.connect(destinationGain);

    osc.start(now);
    osc.stop(now + 0.35);
  }

function stopAllSounds() {
    if (this.thunderInterval) {
      clearInterval(this.thunderInterval);
      this.thunderInterval = null;
    }
    if (this.birdsInterval) {
      clearInterval(this.birdsInterval);
      this.birdsInterval = null;
    }

    Object.keys(this.audioNodes).forEach((key) => {
      const node = this.audioNodes[key];
      if (node) {
        try {
          node.stop();
        } catch {}
        try {
          node.disconnect();
        } catch {}
      }
    });
    this.audioNodes = {};
    this.activeSoundType = null;
  }

// -- VOLUME CONTROLS --

function handleVolumeChange(volume) {
    this.volumeLevel = volume;
    if (this.audioActive && this.audioNodes.master && this.audioContext) {
      this.audioNodes.master.gain.setValueAtTime(
        volume * 0.24,
        this.audioContext.currentTime,
      );
    }
  }

export function init(app) {
  app.toggleAmbientSoundscape = toggleAmbientSoundscape;
  app.updateAmbientSoundscapeSynthesizer = updateAmbientSoundscapeSynthesizer;
  app.triggerSynthesizedThunder = triggerSynthesizedThunder;
  app.triggerBirdChirp = triggerBirdChirp;
  app.stopAllSounds = stopAllSounds;
  app.handleVolumeChange = handleVolumeChange;
}
