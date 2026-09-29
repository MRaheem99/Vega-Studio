
(function () {
    'use strict';

    const _pwCache = new WeakMap();
    function buildPulseWave(ctx, pw) {
        let perCtx = _pwCache.get(ctx);
        if (!perCtx) { perCtx = new Map(); _pwCache.set(ctx, perCtx); }
        const key = pw.toFixed(3);
        if (perCtx.has(key)) return perCtx.get(key);

        const N = 64;
        const real = new Float32Array(N);
        const imag = new Float32Array(N);
        for (let k = 1; k < N; k++) {
            real[k] = Math.sin(2 * Math.PI * k * pw) / (Math.PI * k);
            imag[k] = (1 - Math.cos(2 * Math.PI * k * pw)) / (Math.PI * k);
        }
        real[0] = 2 * pw - 1;
        const wave = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
        perCtx.set(key, wave);
        return wave;
    }

    const _noiseCache = new WeakMap();
    function getNoiseBuffer(ctx, color, seconds = 3) {
        let perCtx = _noiseCache.get(ctx);
        if (!perCtx) { perCtx = new Map(); _noiseCache.set(ctx, perCtx); }
        const key = `${color}_${seconds}`;
        if (perCtx.has(key)) return perCtx.get(key);

        const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
        const buf = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = buf.getChannelData(0);

        if (color === 'white') {
            for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        } else if (color === 'pink') {
            let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
            for (let i = 0; i < len; i++) {
                const white = Math.random() * 2 - 1;
                b0 = 0.99886 * b0 + white * 0.0555179;
                b1 = 0.99332 * b1 + white * 0.0750759;
                b2 = 0.96900 * b2 + white * 0.1538520;
                b3 = 0.86650 * b3 + white * 0.3104856;
                b4 = 0.55000 * b4 + white * 0.5329522;
                b5 = -0.7616 * b5 - white * 0.0168980;
                data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
                b6 = white * 0.115926;
            }
        } else {
            let last = 0;
            for (let i = 0; i < len; i++) {
                const white = Math.random() * 2 - 1;
                last = (last + 0.02 * white) / 1.02;
                data[i] = last * 3.5;
            }
        }

        perCtx.set(key, buf);
        return buf;
    }

    function buildFilterChain(ctx, type, slope, when) {
        const f1 = ctx.createBiquadFilter();
        f1.type = type;
        f1.frequency.setValueAtTime(20000, when);
        f1.Q.setValueAtTime(1, when);

        if (slope === '24db') {
            const f2 = ctx.createBiquadFilter();
            f2.type = type;
            f2.frequency.setValueAtTime(20000, when);
            f2.Q.setValueAtTime(1, when);
            f1.connect(f2);
            return { input: f1, output: f2, filters: [f1, f2] };
        }
        return { input: f1, output: f1, filters: [f1] };
    }

    function scheduleVoice(ctx, voice, opts) {
        if (!ctx || !voice || !opts) return null;

        const when = Math.max(ctx.currentTime, opts.when || ctx.currentTime);
        const freq = opts.freq;
        if (!isFinite(freq) || freq <= 0) return null;

        const outputNode = opts.outputNode || ctx.destination;
        const sampleBuffer = opts.sampleBuffer || null;
        const activeSources = opts.activeSources || null;
        const duration = (opts.duration == null) ? null : Math.max(0.02, opts.duration);
        const velocity = Math.max(0.001, Math.min(1, opts.velocity ?? 1));
        const notePan = Math.max(-1, Math.min(1, opts.pan ?? 0));
        const glideFromFreq = (opts.glideFromFreq && opts.glideFromFreq > 0) ? opts.glideFromFreq : null;

        const V = (window.Voice && Voice.applyDefaults)
            ? Voice.applyDefaults(voice)
            : voice;

        const waveform      = V.waveform || 'sawtooth';
        const detuneCents   = V.detune || 0;
        const pulseWidth    = Math.max(0.1, Math.min(0.9, V.pulseWidth ?? 0.5));
        const octaveOffset  = Math.round(V.octaveOffset || 0);

        const unisonVoices  = Math.max(1, Math.min(7, Math.round(V.unisonVoices || 1)));
        const unisonSpread  = Math.max(0, Math.min(50, V.unisonSpread ?? 15));
        const unisonPanSpread = Math.max(0, Math.min(1, V.unisonPanSpread ?? 0.5));

        const subEnabled    = !!V.subEnabled;
        const subWaveform   = V.subWaveform || 'sine';
        const subVolume     = V.subVolume ?? 0.5;

        const osc2Enabled   = !!V.osc2Enabled;
        const osc2Waveform  = V.osc2Waveform || 'sawtooth';
        const osc2Detune    = V.osc2Detune || 0;
        const osc2Octave    = Math.round(V.osc2Octave || 0);
        const osc2Semitone  = Math.round(V.osc2Semitone || 0);
        const osc2Level     = V.osc2Level ?? 0.5;
        const osc2Pan       = Math.max(-1, Math.min(1, V.osc2Pan ?? 0));

        const noiseEnabled  = !!V.noiseEnabled;
        const noiseLevel    = Math.max(0, Math.min(1, V.noiseLevel ?? 0.15));
        const noiseColor    = V.noiseColor || 'white';
        const noiseMode     = V.noiseMode || 'amp';

        const glideEnabled  = !!V.glideEnabled;
        const glideTime     = Math.max(0.001, Math.min(2, V.glideTime || 0.15));

        const adsrOverride = opts.adsrOverride || null;
        const Vadsr = {
            attack:  (adsrOverride && adsrOverride.attack  != null) ? adsrOverride.attack  : V.attack,
            decay:   (adsrOverride && adsrOverride.decay   != null) ? adsrOverride.decay   : V.decay,
            sustain: (adsrOverride && adsrOverride.sustain != null) ? adsrOverride.sustain : V.sustain,
            release: (adsrOverride && adsrOverride.release != null) ? adsrOverride.release : V.release,
        };

        const attack  = Math.max(0.003, Vadsr.attack  || 0.01);
        const decay   = Math.max(0.01,  Vadsr.decay   || 0.2);
        const sustain = Math.min(1, Math.max(0.0001, Vadsr.sustain ?? 0.8));
        const release = Math.max(0.01,  Vadsr.release || 0.3);

        const filterType     = V.filterType || 'lowpass';
        const filterSlope    = V.filterSlope || '12db';
        const cutoffBase     = Math.max(20, V.cutoff ?? 8000);
        const resonance      = Math.max(0, V.resonance ?? 1);
        const filterKeytrack = Math.max(0, Math.min(100, V.filterKeytrack ?? 0)) / 100;

        const filtEnvOn   = !!V.filterEnvEnabled;
        const filtEnvAmt  = Math.max(-100, Math.min(100, V.filterEnvAmount || 0)) / 100;
        const fAttack = Math.max(0.001, V.filterEnvAttack || 0.05);
        const fDecay  = Math.max(0.01, V.filterEnvDecay || 0.3);
        const fSustain= Math.max(0, Math.min(1, V.filterEnvSustain ?? 0.6));
        const fRelease= Math.max(0.01, V.filterEnvRelease || 0.3);

        const lfoEnabled = !!V.lfoEnabled;
        const lfoShape   = V.lfoShape || 'sine';
        const lfoRate    = Math.max(0.01, Math.min(30, V.lfoRate || 5));
        const lfoDepth   = Math.max(0, Math.min(100, V.lfoDepth || 20));
        const lfoTarget  = V.lfoTarget || 'pitch';

        const baseFreq = freq * Math.pow(2, octaveOffset);
        const timeConstant = release / 3;
        const SILENCE_MARGIN = 0.05;

        const keytrackMul = filterKeytrack > 0
            ? Math.pow(baseFreq / 261.63, filterKeytrack)
            : 1;
        const cutoff = Math.max(20, Math.min(20000, cutoffBase * keytrackMul));

        if (waveform === 'sample' && sampleBuffer) {
            const source = ctx.createBufferSource();
            source.buffer = sampleBuffer;
            const rate = baseFreq / 261.63;
            source.playbackRate.setValueAtTime(rate, when);

            const gainNode = ctx.createGain();
            gainNode.gain.setValueAtTime(1.8 * velocity, when);
            source.connect(gainNode);
            gainNode.connect(outputNode);
            source.start(when);

            if (duration != null) {
                const naturalDur = sampleBuffer.duration / rate;
                const hold = Math.max(duration, naturalDur);
                const fadeStart = when + hold;
                gainNode.gain.setValueAtTime(1.8 * velocity, fadeStart);
                gainNode.gain.linearRampToValueAtTime(0.0001, fadeStart + 0.05);
                try { source.stop(fadeStart + 0.06); } catch (_) {}
                if (activeSources) activeSources.push({ source, stopAt: fadeStart + 0.1 });
                return { osc: source, envGain: gainNode, stopTime: fadeStart + 0.1 };
            }
            if (activeSources) activeSources.push({ source, stopAt: null });
            return { osc: source, envGain: gainNode, stopTime: null };
        }

        const envGain = ctx.createGain();
        envGain.gain.setValueAtTime(0.00001, when);

        const attackEnd = when + attack;
        const decayEnd = attackEnd + decay;
        const noteEnd = (duration != null) ? (when + duration) : null;

        if (noteEnd != null && noteEnd <= attackEnd) {
            const peak = velocity * ((noteEnd - when) / attack);
            envGain.gain.linearRampToValueAtTime(Math.max(0.0001, peak), noteEnd);
            envGain.gain.setTargetAtTime(0.00001, noteEnd, timeConstant);
        } else if (noteEnd != null && noteEnd < decayEnd) {
            envGain.gain.linearRampToValueAtTime(velocity, attackEnd);
            const frac = (noteEnd - attackEnd) / decay;
            const level = velocity - (velocity - sustain) * frac;
            envGain.gain.linearRampToValueAtTime(Math.max(0.0001, level), noteEnd);
            envGain.gain.setTargetAtTime(0.00001, noteEnd, timeConstant);
        } else {
            envGain.gain.linearRampToValueAtTime(velocity, attackEnd);
            envGain.gain.linearRampToValueAtTime(sustain, decayEnd);
            if (noteEnd != null) {
                envGain.gain.setValueAtTime(sustain, noteEnd);
                envGain.gain.setTargetAtTime(0.00001, noteEnd, timeConstant);
            }
        }

        const voiceOscs = [];
        const voicePans = [];

        const unison = (waveform === 'sample') ? 1 : unisonVoices;
        const unisonMid = (unison - 1) / 2;

        for (let i = 0; i < unison; i++) {
            const o = ctx.createOscillator();

            if (waveform === 'square' && pulseWidth !== 0.5 && ctx.createPeriodicWave) {
                o.setPeriodicWave(buildPulseWave(ctx, pulseWidth));
            } else {
                o.type = (waveform === 'sample') ? 'sawtooth' : waveform;
            }

            let voiceDetune = 0;
            if (unison > 1) {
                const offset = (i - unisonMid) / Math.max(1, unisonMid);
                voiceDetune = offset * unisonSpread;
            }

            const startFreq = glideFromFreq || baseFreq;
            if (glideFromFreq && glideEnabled && glideFromFreq !== baseFreq) {
                o.frequency.setValueAtTime(startFreq, when);
                o.frequency.linearRampToValueAtTime(baseFreq, when + glideTime);
            } else {
                o.frequency.setValueAtTime(baseFreq, when);
            }

            o.detune.setValueAtTime(detuneCents + voiceDetune, when);

            const vGain = ctx.createGain();
            vGain.gain.value = 1 / Math.sqrt(unison);

            o.connect(vGain);

            let vPan = 0;
            if (unison > 1 && unisonPanSpread > 0 && ctx.createStereoPanner) {
                const offset = (i - unisonMid) / Math.max(1, unisonMid);
                vPan = offset * unisonPanSpread;
            }

            if (Math.abs(vPan) > 0.001 || notePan !== 0) {
                if (ctx.createStereoPanner) {
                    const panner = ctx.createStereoPanner();
                    panner.pan.value = Math.max(-1, Math.min(1, notePan + vPan));
                    vGain.connect(panner);
                    panner.connect(envGain);
                    voicePans.push(panner);
                } else {
                    vGain.connect(envGain);
                }
            } else {
                vGain.connect(envGain);
            }

            o.start(when);
            voiceOscs.push(o);
        }

        let subOsc = null, subGain = null;
        if (subEnabled && subVolume > 0.001) {
            subOsc = ctx.createOscillator();
            subOsc.type = subWaveform;
            const subFreq = baseFreq / 2;
            if (glideFromFreq && glideEnabled) {
                subOsc.frequency.setValueAtTime(glideFromFreq / 2, when);
                subOsc.frequency.linearRampToValueAtTime(subFreq, when + glideTime);
            } else {
                subOsc.frequency.setValueAtTime(subFreq, when);
            }
            subGain = ctx.createGain();
            const subVol = subVolume * velocity;
            subGain.gain.setValueAtTime(0, when);
            subGain.gain.linearRampToValueAtTime(subVol, attackEnd);
            if (noteEnd != null) {
                subGain.gain.setTargetAtTime(0.00001, noteEnd, timeConstant);
            }
            subOsc.connect(subGain);
            subGain.connect(envGain);
            subOsc.start(when);
        }

        let osc2 = null, osc2Gain = null, osc2Panner = null;
        if (osc2Enabled && osc2Level > 0.001) {
            osc2 = ctx.createOscillator();
            osc2.type = osc2Waveform;
            const osc2Freq = baseFreq * Math.pow(2, osc2Octave + osc2Semitone / 12);
            if (glideFromFreq && glideEnabled) {
                const start = glideFromFreq * Math.pow(2, osc2Octave + osc2Semitone / 12);
                osc2.frequency.setValueAtTime(start, when);
                osc2.frequency.linearRampToValueAtTime(osc2Freq, when + glideTime);
            } else {
                osc2.frequency.setValueAtTime(osc2Freq, when);
            }
            osc2.detune.setValueAtTime(osc2Detune, when);

            osc2Gain = ctx.createGain();
            osc2Gain.gain.setValueAtTime(0, when);
            osc2Gain.gain.linearRampToValueAtTime(osc2Level * velocity, attackEnd);

            if (Math.abs(osc2Pan) > 0.01 && ctx.createStereoPanner) {
                osc2Panner = ctx.createStereoPanner();
                osc2Panner.pan.value = osc2Pan;
                osc2.connect(osc2Gain);
                osc2Gain.connect(osc2Panner);
                osc2Panner.connect(envGain);
            } else {
                osc2.connect(osc2Gain);
                osc2Gain.connect(envGain);
            }
            osc2.start(when);
        }

        let noiseSrc = null, noiseGain = null;
        if (noiseEnabled && noiseLevel > 0.001 && ctx.createBufferSource) {
            const buf = getNoiseBuffer(ctx, noiseColor, 3);
            noiseSrc = ctx.createBufferSource();
            noiseSrc.buffer = buf;
            noiseSrc.loop = true;

            noiseGain = ctx.createGain();
            const peak = noiseLevel * velocity;

            if (noiseMode === 'transient') {
                const burstDur = Math.min(0.12, Math.max(0.02, attack + 0.03));
                noiseGain.gain.setValueAtTime(0, when);
                noiseGain.gain.linearRampToValueAtTime(peak, when + 0.003);
                noiseGain.gain.exponentialRampToValueAtTime(0.0001, when + burstDur);
            } else {
                noiseGain.gain.setValueAtTime(0, when);
                noiseGain.gain.linearRampToValueAtTime(peak, attackEnd);
                if (noteEnd != null) {
                    noiseGain.gain.setTargetAtTime(0.00001, noteEnd, timeConstant);
                }
            }

            noiseSrc.connect(noiseGain);
            noiseGain.connect(envGain);
            noiseSrc.start(when);
        }

        const filterIsOpen = !filtEnvOn && !lfoEnabled && cutoff >= 18000
            && filterType === 'lowpass' && Math.abs(resonance - 1) < 0.05;

        let filterChain = null;
        if (!filterIsOpen) {
            filterChain = buildFilterChain(ctx, filterType, filterSlope, when);

            filterChain.filters.forEach((f, idx) => {
                const q = (idx === 0) ? resonance : 0.7;
                f.frequency.cancelScheduledValues(when);
                f.frequency.setValueAtTime(cutoff, when);
                f.Q.setValueAtTime(q, when);
            });

            envGain.connect(filterChain.input);
            filterChain.output.connect(outputNode);
        } else {
            envGain.connect(outputNode);
        }

        if (filtEnvOn && filterChain) {
            const nyquist = ctx.sampleRate / 2;
            const rangeHigh = Math.min(nyquist - 100, 20000);
            const rangeLow = 20;
            const targetPeak = filtEnvAmt >= 0
                ? cutoff + (rangeHigh - cutoff) * filtEnvAmt
                : cutoff + (cutoff - rangeLow) * filtEnvAmt;
            const targetSustain = cutoff + (targetPeak - cutoff) * fSustain;

            const fAttackEnd = when + fAttack;
            const fDecayEnd = fAttackEnd + fDecay;

            filterChain.filters.forEach((f, idx) => {
                f.frequency.cancelScheduledValues(when);
                f.frequency.setValueAtTime(cutoff, when);

                if (noteEnd != null && noteEnd <= fAttackEnd) {
                    const frac = (noteEnd - when) / fAttack;
                    f.frequency.linearRampToValueAtTime(
                        Math.max(20, cutoff + (targetPeak - cutoff) * frac), noteEnd);
                } else if (noteEnd != null && noteEnd < fDecayEnd) {
                    f.frequency.linearRampToValueAtTime(Math.max(20, targetPeak), fAttackEnd);
                    const frac = (noteEnd - fAttackEnd) / fDecay;
                    f.frequency.linearRampToValueAtTime(
                        Math.max(20, targetPeak + (targetSustain - targetPeak) * frac), noteEnd);
                } else {
                    f.frequency.linearRampToValueAtTime(Math.max(20, targetPeak), fAttackEnd);
                    f.frequency.linearRampToValueAtTime(Math.max(20, targetSustain), fDecayEnd);
                    if (noteEnd != null) {
                        f.frequency.setValueAtTime(Math.max(20, targetSustain), noteEnd);
                        f.frequency.setTargetAtTime(
                            Math.max(20, cutoff), noteEnd, Math.max(0.02, fRelease / 3));
                    }
                }
            });
        }

        let lfo = null, lfoGain = null;
        if (lfoEnabled && lfoDepth > 0) {
            lfo = ctx.createOscillator();
            lfo.type = lfoShape;
            lfo.frequency.setValueAtTime(lfoRate, when);

            lfoGain = ctx.createGain();

            if (lfoTarget === 'pitch') {
                const depthCents = lfoDepth;
                lfoGain.gain.value = depthCents;
                voiceOscs.forEach(o => {
                    try { lfoGain.connect(o.detune); } catch (_) {}
                });
                if (osc2) {
                    try { lfoGain.connect(osc2.detune); } catch (_) {}
                }
            } else if (lfoTarget === 'filter' && filterChain) {
                const depthAbs = (lfoDepth / 100) * Math.min(cutoff * 0.8, 8000);
                lfoGain.gain.value = depthAbs;
                filterChain.filters.forEach(f => {
                    try { lfoGain.connect(f.frequency); } catch (_) {}
                });
            } else if (lfoTarget === 'amp') {
                const depthAbs = (lfoDepth / 100) * 0.5;
                lfoGain.gain.value = depthAbs;
                try { lfoGain.connect(envGain.gain); } catch (_) {}
            }

            lfo.connect(lfoGain);
            lfo.start(when);
        }

        const stopTime = (noteEnd != null) ? (noteEnd + release * 2 + 0.05) : null;
        if (stopTime != null) {
            voiceOscs.forEach(o => { try { o.stop(stopTime); } catch (_) {} });
            if (subOsc) try { subOsc.stop(stopTime); } catch (_) {}
            if (osc2) try { osc2.stop(stopTime); } catch (_) {}
            if (noiseSrc) try { noiseSrc.stop(stopTime); } catch (_) {}
            if (lfo) try { lfo.stop(stopTime); } catch (_) {}
        }

        if (activeSources) {
            voiceOscs.forEach(o => activeSources.push({ source: o, stopAt: stopTime }));
            if (subOsc) activeSources.push({ source: subOsc, stopAt: stopTime });
            if (osc2) activeSources.push({ source: osc2, stopAt: stopTime });
            if (noiseSrc) activeSources.push({ source: noiseSrc, stopAt: stopTime });
            if (lfo) activeSources.push({ source: lfo, stopAt: stopTime });
        }

        return {
            osc: voiceOscs[0],
            voiceOscs,
            subOsc,
            osc2,
            noiseSrc,
            lfo,
            envGain,
            subGain,
            osc2Gain,
            osc2Panner,
            noiseGain,
            lfoGain,
            noteFilter: filterChain ? filterChain.input : null,
            filterFilters: filterChain ? filterChain.filters : null,
            stopTime,
        };
    }

    window.VoiceScheduler = { scheduleVoice, buildPulseWave, getNoiseBuffer };
})();