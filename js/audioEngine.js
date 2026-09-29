class AudioEngine {
    constructor() {
        this.ctx = null;
        this.filter = null;
        this.fxProcessor = null;
        this.panner = null;
        this.masterGain = null;
        this.analyser = null;
        this.drumMachine = null;

        this.activeVoices = new Map();
        this.sampleBuffer = null;
        this.vibratoLFO = null;
        this.vibratoGain = null;
        this._scheduledVoices = new Map();

        this.activeEffects = {
            adsr: false,
            echo: false,
            reverb: false,
            chorus: false,
            flanger: false,
            equalizer: false,
            distortion: false,
            compressor: false,
            vibrato: false,
            bitcrusher: false,
            phaser: false
        };

        this.effectStates = {
            adsr: {
                attack: 0.01,
                decay: 0.2,
                sustain: 0.8,
                release: 0.3
            },
            echo: {
                time: 0.375,
                width: 0.05,
                feedback: 0.45,
                mix: 0.4,
                filter: 3500,
                modulationRate: 0.25,
                modulationDepth: 0.0008,
                pingpong: 1
            },
            reverb: {
                decay: 2.0,
                mix: 0.4
            },
            chorus: {
                rate: 1.5,
                depth: 0.003,
                mix: 0.6,
                type: 'chorus'
            },
            flanger: {
                rate: 0.5,
                depth: 0.002,
                mix: 0.7,
                type: 'flanger'
            },
            equalizer: {
                band1: 0,
                band2: 0,
                band3: 0,
                band4: 0,
                band5: 0
            },
            distortion: {
                drive: 50,
                mix: 0.8
            },
            compressor: {
                threshold: -24,
                ratio: 12,
                attack: 0.003,
                release: 0.25
            },
            vibrato: {
                rate: 5,
                depth: 10
            },
            bitcrusher: {
                bits: 8,
                normFreq: 0.1,
                mix: 0.8
            },
            phaser: {
                rate: 1.0,
                depth: 0.8,
                feedback: 0.5,
                mix: 0.7
            }
        };

        const voiceDefaults = (window.Voice && Voice.defaults)
            ? Voice.defaults()
            : {
                waveform: 'sawtooth',
                detune: 0,
                pulseWidth: 0.5,
                octaveOffset: 0,
                subEnabled: false,
                subWaveform: 'sine',
                subVolume: 0.5,
                osc2Enabled: false,
                osc2Waveform: 'sawtooth',
                osc2Detune: 0,
                osc2Octave: 0,
                osc2Semitone: 0,
                osc2Level: 0.5,
                osc2Pan: 0,
                attack: 0.01,
                decay: 0.2,
                sustain: 0.8,
                release: 0.3,
                cutoff: 8000,
                resonance: 1,
                filterEnvEnabled: false,
                filterEnvAmount: 0,
                filterEnvAttack: 0.05,
                filterEnvDecay: 0.3,
                filterEnvSustain: 0.6,
                filterEnvRelease: 0.3,
                glideEnabled: false,
                glideTime: 0.15,
            };

        const engineDefaults = {
            vibratoRate: 5,
            vibratoDepth: 0,
            masterVolume: 0.8,
            masterPan: 0,
            synthVolume: 1,
            drumVolume: 1,
        };

        this.params = Object.assign({}, voiceDefaults, engineDefaults);

        this.currentFX = null;
        this.visualizerRunning = false;
        this._pruneCounter = 0;
        this._visualizerHidden = false;
    }

    _pruneAudioVoices() {
        const now = this.ctx ? this.ctx.currentTime : 0;
        const PRUNE_MARGIN = 0.5;

        if (this._scheduledVoices && this._scheduledVoices.size > 0) {
            this._scheduledVoices.forEach((voice, key) => {
                if (!voice) { this._scheduledVoices.delete(key); return; }
                const stopTime = voice.stopTime || 0;
                if (stopTime && stopTime + PRUNE_MARGIN < now) {
                    try {
                            if (voice.source) voice.source.disconnect();
                            if (voice.subSource) voice.subSource.disconnect();
                            if (voice.gain) voice.gain.disconnect();
                            if (voice.subGain) voice.subGain.disconnect();
                            if (voice.osc2Source) voice.osc2Source.disconnect();
                            if (voice.osc2Gain) voice.osc2Gain.disconnect();
                    } catch (_) {}
                    this._scheduledVoices.delete(key);
                }
            });
        }

        if (this.activeVoices && this.activeVoices.size > 0) {
            let removed = false;
            this.activeVoices.forEach((voice, key) => {
                if (!voice) { this.activeVoices.delete(key); removed = true; return; }
                const stopTime = voice._stopTime || 0;
                const age = now - (voice._startTime || 0);
                const expired = stopTime
                    ? stopTime + PRUNE_MARGIN < now
                    : age > 30;

                if (!expired) return;

                try {
                    if (voice.osc) { voice.osc.stop(); voice.osc.disconnect(); }
                    if (voice.envGain) voice.envGain.disconnect();
                    if (voice.subOsc) { voice.subOsc.stop(); voice.subOsc.disconnect(); }
                    if (voice.subGain) voice.subGain.disconnect();
                    if (voice.osc2) { voice.osc2.stop(); voice.osc2.disconnect(); }
                    if (voice.osc2Gain) voice.osc2Gain.disconnect();
                    if (voice.osc2Panner) voice.osc2Panner.disconnect();
                } catch (_) {}
                this.activeVoices.delete(key);
                removed = true;
            });
            if (removed && typeof app !== 'undefined' && app.updateStatusDisplay) {
                app.updateStatusDisplay();
            }
        }
    }

    init() {
        if (this.ctx) {
            try { this.ctx.close(); } catch (_) {}
        }
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContext();

        if (window.EffectProcessor) this.fxProcessor = new EffectProcessor(this.ctx);

        this.filter = this.ctx.createBiquadFilter();
        this.filter.type = 'lowpass';
        this.synthGain = this.ctx.createGain();
        this.drumGain = this.ctx.createGain();
        this.panner = this.ctx.createStereoPanner();
        this.masterGain = this.ctx.createGain();
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        this.drumMachine = new DrumMachine(this.ctx);
        this.updateFilterParams();
        this.masterGain.gain.value = this.params.masterVolume;
        this.panner.pan.value = this.params.masterPan;
        this.setupVibrato();
        
        this.filter.connect(this.synthGain);
        this.synthGain.connect(this.fxProcessor ? this.fxProcessor.masterInput : this.panner);

        if (this.fxProcessor) this.fxProcessor.masterOutput.connect(this.panner);

        this.drumGain.connect(this.panner);

        this.panner.connect(this.masterGain);
        this.masterGain.connect(this.analyser);
        this.analyser.connect(this.ctx.destination);

        this.synthGain.gain.value = this.params.synthVolume ?? 1;
        this.drumGain.gain.value = this.params.drumVolume ?? 1;
        this.rebuildFXChain();
        this.startVisualizer();

		if (!this._pruneInterval) {
    		this._pruneInterval = setInterval(() => {
        		try { this._pruneAudioVoices(); } catch (_) {}
    		}, 500);
		}
        app.updateStatusDisplay();
        this.currentSequencer = this.sequencer;
    }

    stopAllNotes() {
        if (this.activeNotes) {
            Object.keys(this.activeNotes).forEach(note => {
                this.stopNote(note);
            });
            this.activeNotes = {};
        }

        if (this._scheduledVoices) {
            this._scheduledVoices.forEach(v => {
                try {
                    if (v.source) v.source.stop();
                    if (v.subSource) v.subSource.stop();
                    if (v.osc2Source) v.osc2Source.stop();
                    if (v.source) v.source.disconnect();
                    if (v.subSource) v.subSource.disconnect();
                    if (v.gain) v.gain.disconnect();
                    if (v.subGain) v.subGain.disconnect();
                    if (v.osc2Source) v.osc2Source.disconnect();
                    if (v.osc2Gain) v.osc2Gain.disconnect();
                } catch (_) {}
            });
            this._scheduledVoices.clear();
        }

        if (this.activeVoices) {
            this.activeVoices.forEach(v => {
                try {
                    if (v.osc) { v.osc.stop(); v.osc.disconnect(); }
                    if (v.envGain) v.envGain.disconnect();
                    if (v.subOsc) { v.subOsc.stop(); v.subOsc.disconnect(); }
                    if (v.subGain) v.subGain.disconnect();
                    if (v.osc2) { v.osc2.stop(); v.osc2.disconnect(); }
                    if (v.osc2Gain) v.osc2Gain.disconnect();
                    if (v.osc2Panner) v.osc2Panner.disconnect();
                } catch (_) {}
            });
            this.activeVoices.clear();
        }
    }

    playNoteScheduled(note, freq, startTime, duration, velocity = 1, options = {}) {
        try {
            if (!this.ctx) this.init();
            const now = startTime || this.ctx.currentTime;

            if (this._scheduledVoices && this._scheduledVoices.has(note)) {
                const prev = this._scheduledVoices.get(note);
                try {
                    prev.gain.gain.cancelScheduledValues(now);
                    prev.gain.gain.setValueAtTime(prev.gain.gain.value || 0.5, now);
                    prev.gain.gain.linearRampToValueAtTime(0.0001, now + 0.004);
                    if (prev.source) prev.source.stop(now + 0.005);
                    if (prev.subSource) prev.subSource.stop(now + 0.005);
                    if (prev.osc2) prev.osc2.stop(now + 0.005);
                } catch (_) {}
                this._scheduledVoices.delete(note);
            }

            let glideFromFreq = null;
            if (this.params.glideEnabled && this._scheduledVoices && this._scheduledVoices.size > 0) {
                let lastFreq = null, lastTime = 0;
                this._scheduledVoices.forEach(v => {
                    if (v && v._lastFreq && v._lastTime > lastTime) {
                        lastFreq = v._lastFreq;
                        lastTime = v._lastTime;
                    }
                });
                if (lastFreq) glideFromFreq = lastFreq;
            }

            const pan = typeof options.pan === 'number' ? options.pan : 0;

            const nodes = window.VoiceScheduler.scheduleVoice(this.ctx, this.params, {
                note, freq, when: now, duration, velocity, pan,
                glideFromFreq,
                sampleBuffer: this.sampleBuffer,
                outputNode: this.filter,
                adsrOverride: options.adsrOverride || null,
            });

            if (!nodes) return;

            let vibratoConnected = false;
            if (nodes.osc && nodes.osc.frequency && this.activeEffects['vibrato'] && this.vibratoGain) {
                try {
                    this.vibratoGain.connect(nodes.osc.frequency);
                    vibratoConnected = true;
                } catch (_) {}
            }

            if (!this._scheduledVoices) this._scheduledVoices = new Map();
            this._scheduledVoices.set(note, {
                source: nodes.osc,
                subSource: nodes.subOsc,
                osc2: nodes.osc2,
                gain: nodes.envGain,
                subGain: nodes.subGain,
                osc2Gain: nodes.osc2Gain,
                osc2Panner: nodes.osc2Panner,
                noteFilter: nodes.noteFilter,
                stopTime: nodes.stopTime,
                _lastFreq: freq * Math.pow(2, Math.round(this.params.octaveOffset || 0)),
                _lastTime: now,
                _vibratoConnected: vibratoConnected,
            });
        } catch (err) {
            console.warn('playNoteScheduled failed:', note, err);
        }
    }

    setupVibrato() {
        if (!this.ctx) return;
        this.vibratoLFO = this.ctx.createOscillator();
        this.vibratoGain = this.ctx.createGain();
        this.vibratoLFO.type = 'sine';
        this.vibratoLFO.frequency.value = this.params.vibratoRate;
        this.vibratoGain.gain.value = 0;
        this.vibratoLFO.connect(this.vibratoGain);
        this.vibratoLFO.start();
    }

    setVolume(val) {
        this.params.masterVolume = val;
        if (this.masterGain) this.masterGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.1);
        const statVol = document.getElementById('stat-master-vol');
        if (statVol) statVol.innerText = Math.round(val * 100) + '%';
    }

    setPan(val) {
        this.params.masterPan = val;
        if (this.panner) this.panner.pan.setTargetAtTime(val, this.ctx.currentTime, 0.1);
    }

    toggleEffect(type, isActive) {
        this.activeEffects[type] = isActive;
        this.rebuildFXChain();
        app.updateStatusDisplay();
    }

    rebuildFXChain() {
        if (!this.fxProcessor) return;
        this.fxProcessor.reset();
        const order = ['equalizer', 'distortion', 'bitcrusher', 'phaser', 'compressor', 'echo', 'reverb', 'chorus', 'flanger'];
        order.forEach(type => {
            if (this.activeEffects[type]) this.activateFXInternal(type);
        });
        if (this.activeEffects['vibrato']) {
            this.vibratoGain.gain.setTargetAtTime(this.params.vibratoDepth || 10, this.ctx.currentTime, 0.1);
        } else {
            this.vibratoGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
        }
    }

    activateFXInternal(type) {
        const params = this.effectStates[type];
        if (!params || !this.fxProcessor) return;
        const nodes = this.fxProcessor.activeNodes;

        switch (type) {
            case 'echo':
                if (!nodes.echoDelayL) this.fxProcessor.createEcho(params);
                break;
            case 'reverb':
                if (!nodes.convolver) this.fxProcessor.createReverb(params);
                break;
            case 'chorus':
                if (!nodes.delay) this.fxProcessor.createChorus(params);
                break;
            case 'flanger':
                if (!nodes.delay) this.fxProcessor.createChorus(params);
                break;
            case 'equalizer':
                if (!nodes.filters) this.fxProcessor.createEqualizer(params);
                break;
            case 'distortion':
                if (!nodes.shaper) this.fxProcessor.createDistortion(params);
                break;
            case 'compressor':
                if (!nodes.comp) this.fxProcessor.createCompressor(params);
                break;
            case 'bitcrusher':
                if (!nodes.bitShaper) this.fxProcessor.createBitcrusher(params);
                break;
            case 'phaser':
                if (!nodes.phaserAP1) this.fxProcessor.createPhaser(params);
                break;
            case 'vibrato':
            case 'adsr':
                break;
        }
    }

    updateVibrato(rate, depth) {
        this.params.vibratoRate = rate;
        this.params.vibratoDepth = depth;
        this.effectStates.vibrato.rate = rate;
        this.effectStates.vibrato.depth = depth;
        if (this.vibratoLFO) {
            this.vibratoLFO.frequency.setTargetAtTime(rate, this.ctx.currentTime, 0.1);
            if (this.activeEffects['vibrato']) {
                this.vibratoGain.gain.setTargetAtTime(depth, this.ctx.currentTime, 0.1);
            }
        }
        if (app.displayMode === 'status') app.updateStatusDisplay();
    }

    setWaveform(type) {
        this.params.waveform = type;
        const sel1 = document.getElementById('waveform-selector');
        const sel2 = document.getElementById('synthseq-waveform');
        if (sel1 && sel1.value !== type) sel1.value = type;
        if (sel2 && sel2.value !== type) sel2.value = type;

        if (type === 'sample') {
            const fileInput = document.getElementById('file-input-sample');
            if (fileInput) {
                fileInput.value = '';
                fileInput.click();
            }
        }
        app.updateStatusDisplay();
    }

    renderCurrentToneSample(midi = 60, durationSec = 2.0) {
        if (!window.audioCache || !window.OfflineRenderer) return;
        const voice = this.params || {};
        const effects = {
            active: Object.assign({}, this.activeEffects),
            states: JSON.parse(JSON.stringify(this.effectStates || {})),
        };
        const key = window.audioCache.keyForToneSample({ voice, effects, midi, durationSec });

        window.audioCache.getOrRender(key, () =>
            window.OfflineRenderer.renderToneSample({ voice, effects, midi, durationSec })
        ).then(buf => {
            if (buf) console.log('[AudioEngine] tone sample cached:', key);
        }).catch(err => {
            console.warn('[AudioEngine] tone sample render failed:', err);
        });
    }

    loadSample(buffer) {
        this.sampleBuffer = buffer;
        app.updateStatusDisplay();
    }

    setSubWaveform(type) {
        this.params.subWaveform = type;
    }

    toggleSubOsc(enabled) {
        this.params.subEnabled = enabled;
    }

    updateParams(newParams) {
        this.params = { ...this.params, ...newParams };
        if (window.Voice && Voice.validateInPlace) Voice.validateInPlace(this.params);
        this.updateFilterParams();

        if (newParams.attack !== undefined || newParams.decay !== undefined ||
            newParams.sustain !== undefined || newParams.release !== undefined) {
            const adsr = this.effectStates.adsr;
            if (newParams.attack !== undefined) adsr.attack = newParams.attack;
            if (newParams.decay !== undefined) adsr.decay = newParams.decay;
            if (newParams.sustain !== undefined) adsr.sustain = newParams.sustain;
            if (newParams.release !== undefined) adsr.release = newParams.release;
        }

        if (newParams.vibratoRate !== undefined || newParams.vibratoDepth !== undefined) {
            this.updateVibrato(
                newParams.vibratoRate !== undefined ? newParams.vibratoRate : this.params.vibratoRate,
                newParams.vibratoDepth !== undefined ? newParams.vibratoDepth : this.params.vibratoDepth
            );
        }
        if (newParams.masterVolume !== undefined) this.setVolume(newParams.masterVolume);
        if (newParams.masterPan !== undefined) this.setPan(newParams.masterPan);
                if (newParams.synthVolume !== undefined) this.setSynthVolume(newParams.synthVolume);
        if (newParams.drumVolume !== undefined) this.setDrumVolume(newParams.drumVolume);

        this.activeVoices.forEach(voice => {
            if (newParams.detune !== undefined && voice.osc) {
                try { voice.osc.detune.setTargetAtTime(newParams.detune, this.ctx.currentTime, 0.1); } catch (_) {}
            }
        });
        if (window.app?.synthSequencer?.renderMode === 'wav') {
            window.app.synthSequencer._scheduleWavRefresh();
        }
    }

    updateFilterParams() {
        if (this.filter) {
            try {
                this.filter.frequency.setTargetAtTime(20000, this.ctx.currentTime, 0.05);
                this.filter.Q.setTargetAtTime(1, this.ctx.currentTime, 0.05);
            } catch (_) {}
        }
    }

    setSynthVolume(val) {
        this.params.synthVolume = val;
        if (this.synthGain) this.synthGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }

    setDrumVolume(val) {
        this.params.drumVolume = val;
        if (this.drumGain) this.drumGain.gain.setTargetAtTime(val, this.ctx.currentTime, 0.05);
    }

    playNote(note, freq) {
        if (!this.ctx) this.init();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (this.activeVoices.has(note)) this.stopNote(note, 0.05);

        const now = this.ctx.currentTime;

        let glideFromFreq = null;
        if (this.params.glideEnabled && this.activeVoices.size > 0) {
            let lastFreq = null, lastTime = 0;
            this.activeVoices.forEach(v => {
                if (v && v._lastFreq && v._lastTime > lastTime) {
                    lastFreq = v._lastFreq;
                    lastTime = v._lastTime;
                }
            });
            if (lastFreq) glideFromFreq = lastFreq;
        }

        const nodes = window.VoiceScheduler.scheduleVoice(this.ctx, this.params, {
            note, freq, when: now, duration: null, velocity: 1, pan: 0,
            glideFromFreq,
            sampleBuffer: this.sampleBuffer,
            outputNode: this.filter,
        });

        if (!nodes) return;

        let vibratoConnected = false;
        if (nodes.osc && nodes.osc.frequency && this.activeEffects['vibrato'] && this.vibratoGain) {
            try {
                this.vibratoGain.connect(nodes.osc.frequency);
                vibratoConnected = true;
            } catch (_) {}
        }

        this.activeVoices.set(note, Object.assign(nodes, {
            _startTime: now,
            _vibratoConnected: vibratoConnected,
            _lastFreq: freq * Math.pow(2, Math.round(this.params.octaveOffset || 0)),
            _lastTime: now,
        }));
        app.updateStatusDisplay(note, freq);
    }

    playDrumSample(buffer, pad, customADSR = null, options = {}) {
        try {
            if (!this.ctx || !buffer || !pad) return;

            if (pad.muted === undefined) pad.muted = false;
            if (pad.solo === undefined) pad.solo = false;
            if (pad.volume === undefined) pad.volume = 1;
            if (pad.pitch === undefined) pad.pitch = 0;
            if (!pad.effects) pad.effects = {};
            if (!pad.effectStates) pad.effectStates = {};

            if (pad.muted) return;

            const soloActive = app.drumPads?.some(p => p?.solo);
            if (soloActive && !pad.solo) return;

            let adsr;
            if (customADSR) {
                adsr = {
                    attack: Math.max(0.001, customADSR.attack ?? 0.001),
                    decay: Math.max(0.01, customADSR.decay ?? 0.2),
                    sustain: Math.min(1, Math.max(0, customADSR.sustain ?? 1)),
                    release: Math.max(0.01, customADSR.release ?? 0.25)
                };
            } else if (pad.effects?.adsr && pad.effectStates?.adsr) {
                adsr = {
                    attack: Math.max(0.001, pad.effectStates.adsr.attack),
                    decay: Math.max(0.8, pad.effectStates.adsr.decay),
                    sustain: Math.min(1, Math.max(0, pad.effectStates.adsr.sustain)),
                    release: Math.max(0.3, pad.effectStates.adsr.release)
                };
            } else {
                adsr = {
                    attack: 0.001,
                    decay: 0.8,
                    sustain: 1.0,
                    release: 0.3
                };
            }

            const source = this.ctx.createBufferSource();
            source.buffer = buffer;

            const padPitch = pad.pitch || 0;
            const stepPitchRatio = (options && typeof options.pitchRatio === 'number')
                ? options.pitchRatio
                : 1;
            const padRatio = padPitch ? Math.pow(2, padPitch / 12) : 1;
            const totalRatio = padRatio * stepPitchRatio;
            if (Math.abs(totalRatio - 1) > 0.0001) {
                source.playbackRate.value = totalRatio;
            }

            const volumeGain = this.ctx.createGain();
            volumeGain.gain.value = pad.volume * 1.5;

            const envGain = this.ctx.createGain();
            const now = (options && typeof options.time === 'number') ? options.time : this.ctx.currentTime;

            envGain.gain.setValueAtTime(0.0001, now);
            envGain.gain.linearRampToValueAtTime(1, now + adsr.attack);

            const decayEnd = now + adsr.attack + adsr.decay;
            envGain.gain.exponentialRampToValueAtTime(
                Math.max(0.001, adsr.sustain),
                decayEnd
            );

            source.connect(volumeGain);
            volumeGain.connect(envGain);

            const otherEffects = Object.keys(pad.effects).filter(fx => fx !== 'adsr');
            const hasActiveEffects = otherEffects.some(fx => pad.effects[fx]);

            let outputNode = this.drumGain;
            const padPan = typeof pad.pan === 'number' ? pad.pan : 0;
            const stepPan = typeof options.pan === 'number' ? options.pan : 0;
            const totalPan = Math.max(-1, Math.min(1, padPan + stepPan));
            if (Math.abs(totalPan) > 0.001 && this.ctx.createStereoPanner) {
                outputNode = this.ctx.createStereoPanner();
                outputNode.pan.value = totalPan;
                outputNode.connect(this.drumGain);
            }

            const hasEffectProcessorClass = (typeof window.EffectProcessor === 'function');

            if (hasActiveEffects && hasEffectProcessorClass) {
                try {
                    if (!pad.fxProcessor) {
                        pad.fxProcessor = new EffectProcessor(this.ctx);
                    }

                    const fxKey = this._padFxKey(otherEffects, pad.effects, pad.effectStates);

                    if (pad.fxProcessor._lastFxKey !== fxKey) {
                        pad.fxProcessor.reset();

                        otherEffects.forEach(fx => {
                            if (pad.effects[fx]) {
                                const params = pad.effectStates[fx] || {};
                                switch (fx) {
                                    case 'echo':       pad.fxProcessor.createEcho(params); break;
                                    case 'reverb':     pad.fxProcessor.createReverb(params); break;
                                    case 'distortion': pad.fxProcessor.createDistortion(params); break;
                                    case 'compressor': pad.fxProcessor.createCompressor(params); break;
                                    case 'equalizer':  pad.fxProcessor.createEqualizer(params); break;
                                    case 'chorus':     pad.fxProcessor.createChorus(params); break;
                                    case 'bitcrusher': pad.fxProcessor.createBitcrusher(params); break;
                                    case 'phaser':     pad.fxProcessor.createPhaser(params); break;
                                }
                            }
                        });

                        pad.fxProcessor._lastFxKey = fxKey;
                    }

                    if (pad.fxProcessor.masterInput && pad.fxProcessor.masterOutput) {
                        envGain.connect(pad.fxProcessor.masterInput);
                        
                        if (typeof pad.fxProcessor.disconnectOutput === 'function') {
                            pad.fxProcessor.disconnectOutput();
                        }
                        pad.fxProcessor.masterOutput.connect(outputNode);
                    } else {
                        pad.fxProcessor = null;
                        envGain.connect(outputNode);
                    }
                } catch (err) {
                    console.warn('pad fx chain failed, bypassing:', err);
                    pad.fxProcessor = null;
                    envGain.connect(outputNode);
                }
            } else {
                envGain.connect(outputNode);
            }

            source.start(now);

            const releaseEnd = decayEnd + adsr.release;
            envGain.gain.setValueAtTime(Math.max(0.001, adsr.sustain), decayEnd);
            envGain.gain.exponentialRampToValueAtTime(0.0001, releaseEnd);
            try {
                source.stop(releaseEnd + 0.05);
            } catch (_) {}
        } catch (err) {
            console.warn('playDrumSample failed:', err);
        }
    }

    createFXChain(effectStates) {
        const input = this.ctx.createGain();
        let node = input;
        if (effectStates.distortion) {
            const dist = this.ctx.createWaveShaper();
            node.connect(dist);
            node = dist;
        }
        if (effectStates.compressor) {
            const comp = this.ctx.createDynamicsCompressor();
            comp.threshold.value = -24;
            comp.ratio.value = 10;
            node.connect(comp);
            node = comp;
        }
        node.connect(this.panner);
        return { input, output: node };
    }

    _padFxKey(otherEffects, effects, effectStates) {
        const parts = [];
        for (const fx of otherEffects) {
            if (!effects[fx]) continue;
            parts.push(fx);
            const params = effectStates[fx] || {};
            const keys = Object.keys(params).sort();
            for (const k of keys) {
                if (k === 'type') continue;
                const v = params[k];
                parts.push(k + '=' + (typeof v === 'number' ? v.toFixed(6) : String(v)));
            }
            parts.push('|');
        }
        return parts.join(';');
    }

    stopNote(note, overrideRelease = null) {
        const voice = this.activeVoices.get(note);
        if (!voice || !this.ctx) return;
        const now = this.ctx.currentTime;
        const releaseTime = overrideRelease !== null ? overrideRelease : this.params.release;

        voice.envGain.gain.cancelScheduledValues(now);
        voice.envGain.gain.setValueAtTime(voice.envGain.gain.value, now);
        voice.envGain.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);

        if (voice.subGain) {
            voice.subGain.gain.cancelScheduledValues(now);
            voice.subGain.gain.setValueAtTime(voice.subGain.gain.value, now);
            voice.subGain.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);
        }

        if (voice.osc2Gain) {
            voice.osc2Gain.gain.cancelScheduledValues(now);
            voice.osc2Gain.gain.setValueAtTime(voice.osc2Gain.gain.value, now);
            voice.osc2Gain.gain.exponentialRampToValueAtTime(0.001, now + releaseTime);
        }

        if (voice._vibratoConnected && this.vibratoGain && voice.osc && voice.osc.frequency) {
            try { this.vibratoGain.disconnect(voice.osc.frequency); } catch (_) {}
            voice._vibratoConnected = false;
        }

        const stopAt = now + releaseTime + 0.1;
        try { voice.osc.stop(stopAt); } catch (e) {}
        if (voice.subOsc) { try { voice.subOsc.stop(stopAt); } catch (e) {} }
        if (voice.osc2) { try { voice.osc2.stop(stopAt); } catch (e) {} }

        voice._stopTime = stopAt;

        setTimeout(() => {
            if (this.activeVoices.get(note) !== voice) return;
            try { voice.envGain.disconnect(); } catch (_) {}
            try { if (voice.subGain) voice.subGain.disconnect(); } catch (_) {}
            try { if (voice.osc2Gain) voice.osc2Gain.disconnect(); } catch (_) {}
            try { if (voice.osc2Panner) voice.osc2Panner.disconnect(); } catch (_) {}
            this.activeVoices.delete(note);
            if (this.app?.updateStatusDisplay) this.app.updateStatusDisplay();
        }, (releaseTime * 1000) + 150);
    }

    startVisualizer() {
        if (this.visualizerRunning) return;
        this.visualizerRunning = true;
        const canvas = document.getElementById('viz-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            requestAnimationFrame(draw);
            if (!this.analyser) return;

            if (canvas.classList.contains('hidden')) {
                this._visualizerHidden = true;
                return;
            }
            this._visualizerHidden = false;

            this.analyser.getByteFrequencyData(dataArray);

            const rect = canvas.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) return;
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, rect.width, rect.height);
            const barWidth = (rect.width / bufferLength) * 2.5;
            let x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = dataArray[i] / 255 * rect.height;
                const r = Math.floor((barHeight / rect.height) * 255);
                const g = Math.floor(255 - (barHeight / rect.height) * 255);
                ctx.fillStyle = `rgb(${r},${g},0)`;
                ctx.fillRect(x, rect.height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
            }
        };
        const resizeCanvas = () => {
            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            ctx.scale(dpr, dpr);
        };
        window.addEventListener('resize', resizeCanvas);
        setTimeout(resizeCanvas, 100);
        draw();
    }
}

window.AudioEngine = AudioEngine;