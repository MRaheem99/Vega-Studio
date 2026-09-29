
(function () {
    'use strict';

    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const num = (v, fallback) => (typeof v === 'number' && isFinite(v)) ? v : fallback;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    function buildSynthClipFxChain(ctx, synthVoice) {
        if (!synthVoice) return null;
        const effects = synthVoice.effects || {};
        const states = synthVoice.effectStates || {};

        const activeList = Object.keys(effects).filter(k => k !== 'adsr' && !!effects[k]);
        if (activeList.length === 0) return null;

        if (typeof EffectProcessor !== 'function') return null;

        const proc = new EffectProcessor(ctx);
        const order = (window.FX_ORDER || [
            'echo', 'reverb', 'distortion', 'compressor',
            'equalizer', 'chorus', 'bitcrusher', 'phaser',
        ]);

        order.forEach(fx => {
            if (!effects[fx]) return;
            const defaults = (window.FX_DEFAULTS && window.FX_DEFAULTS[fx]) || {};
            const userParams = (states[fx]) || {};
            const params = Object.assign({}, defaults, userParams);

            switch (fx) {
                case 'echo':        proc.createEcho(params); break;
                case 'reverb':      proc.createReverb(params); break;
                case 'distortion':  proc.createDistortion(params); break;
                case 'compressor':  proc.createCompressor(params); break;
                case 'equalizer':   proc.createEqualizer(params); break;
                case 'chorus':      proc.createChorus(params, 'chorus'); break;
                case 'flanger':     proc.createChorus(params, 'flanger'); break;
                case 'bitcrusher':  proc.createBitcrusher(params); break;
                case 'phaser':      proc.createPhaser(params); break;
            }
        });

        return { proc, input: proc.masterInput, output: proc.masterOutput };
    }

    function buildPadFxChain(ctx, padEffects, padEffectStates) {
        if (!padEffects) return null;
        const activeList = Object.keys(padEffects).filter(k => k !== 'adsr' && !!padEffects[k]);
        if (activeList.length === 0) return null;
        if (typeof EffectProcessor !== 'function') return null;

        const proc = new EffectProcessor(ctx);
        const order = (window.FX_ORDER || [
            'echo', 'reverb', 'distortion', 'compressor',
            'equalizer', 'chorus', 'bitcrusher', 'phaser',
        ]);

        order.forEach(fx => {
            if (!padEffects[fx]) return;
            const defaults = (window.FX_DEFAULTS && window.FX_DEFAULTS[fx]) || {};
            const userParams = (padEffectStates && padEffectStates[fx]) || {};
            const params = Object.assign({}, defaults, userParams);

            switch (fx) {
                case 'echo':        proc.createEcho(params); break;
                case 'reverb':      proc.createReverb(params); break;
                case 'distortion':  proc.createDistortion(params); break;
                case 'compressor':  proc.createCompressor(params); break;
                case 'equalizer':   proc.createEqualizer(params); break;
                case 'chorus':      proc.createChorus(params, 'chorus'); break;
                case 'flanger':     proc.createChorus(params, 'flanger'); break;
                case 'bitcrusher':  proc.createBitcrusher(params); break;
                case 'phaser':      proc.createPhaser(params); break;
            }
        });

        return { proc, input: proc.masterInput, output: proc.masterOutput };
    }

    function buildMasterFxChain(ctx, activeEffects, effectStates) {
        if (!activeEffects) return null;
        const activeList = Object.keys(activeEffects).filter(k =>
            k !== 'adsr' && k !== 'vibrato' && !!activeEffects[k]);
        if (activeList.length === 0) return null;
        if (typeof EffectProcessor !== 'function') return null;

        const proc = new EffectProcessor(ctx);
        const order = (window.FX_ORDER || [
            'equalizer', 'distortion', 'bitcrusher', 'phaser',
            'compressor', 'echo', 'reverb', 'chorus', 'flanger',
        ]);

        order.forEach(fx => {
            if (!activeEffects[fx]) return;
            const defaults = (window.FX_DEFAULTS && window.FX_DEFAULTS[fx]) || {};
            const userParams = (effectStates && effectStates[fx]) || {};
            const params = Object.assign({}, defaults, userParams);

            switch (fx) {
                case 'echo':        proc.createEcho(params); break;
                case 'reverb':      proc.createReverb(params); break;
                case 'distortion':  proc.createDistortion(params); break;
                case 'compressor':  proc.createCompressor(params); break;
                case 'equalizer':   proc.createEqualizer(params); break;
                case 'chorus':      proc.createChorus(params, 'chorus'); break;
                case 'flanger':     proc.createChorus(params, 'flanger'); break;
                case 'bitcrusher':  proc.createBitcrusher(params); break;
                case 'phaser':      proc.createPhaser(params); break;
            }
        });

        return { proc, input: proc.masterInput, output: proc.masterOutput };
    }

    function scheduleSynthNote(ctx, voice, note, freq, when, holdSec, velocity, destNode, opts) {
        if (!window.VoiceScheduler) return null;
        return window.VoiceScheduler.scheduleVoice(ctx, voice, {
            note, freq, when, duration: holdSec, velocity,
            pan: (opts && opts.pan) || 0,
            glideFromFreq: (opts && opts.glideFromFreq) || null,
            sampleBuffer: voice.sampleBuffer || null,
            outputNode: destNode,
            activeSources: (opts && opts.activeSources) || null,
            adsrOverride: (opts && opts.adsrOverride) || null,
        });
    }

    function scheduleDrumHit(ctx, buffer, pad, stepData, when, destNode, opts) {
        if (!buffer || !pad || !destNode) return null;
        if (when < ctx.currentTime - 0.01) return null;
        if (pad.muted) return null;

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const padPitch = num(pad.pitch, 0);
        const stepPitch = num(stepData.pitch, 0);
        const totalPitch = padPitch + stepPitch;
        if (totalPitch !== 0) {
            source.playbackRate.value = Math.pow(2, totalPitch / 12);
        }

        const velocityScale = num(stepData.velocity, 1);
        const volumeGain = ctx.createGain();
        volumeGain.gain.value = num(pad.volume, 1) * 1.5 * velocityScale;

        const padPan = num(pad.pan, 0);
        const stepPan = num(stepData.pan, 0);
        const totalPan = clamp(padPan + stepPan, -1, 1);

        const panner = ctx.createStereoPanner();
        panner.pan.value = totalPan;

        source.connect(volumeGain);
        volumeGain.connect(panner);

        const fxChain = opts && opts.padFxChain;
        if (fxChain) {
            panner.connect(fxChain.input);
            fxChain.output.connect(destNode);
        } else {
            panner.connect(destNode);
        }

        source.start(when);

        const dur = buffer.duration / Math.max(0.01, source.playbackRate.value);
        const stopAt = when + dur + 0.05;
        try { source.stop(stopAt); } catch (_) {}

        if (opts && opts.activeSources) {
            opts.activeSources.push({ source, stopAt });
        }

        return { source, stopAt };
    }

    function scheduleSynthPatternClip(ctx, clip, track, destNode, opts) {
        const o = opts || {};
        const now = num(o.now, ctx.currentTime);
        const startOffset = num(o.startOffset, 0);
        const bpm = num(o.bpm, 120);
        const activeSources = o.activeSources || null;

        const pattern = clip.pattern;
        if (!pattern || !pattern.grid) return;

        const stepSec = (60 / bpm) / 4;
        const steps = pattern.steps || 16;
        const loopLen = steps * stepSec;

        const baseMidiNote = num(pattern.baseMidiNote, 60);
        const noteNames = NOTE_NAMES;

        const playFrom = Math.max(0, startOffset - clip.startTime);
        const playDuration = Math.max(0, clip.duration - playFrom);

        const clipGain = ctx.createGain();
        const baseGain = num(clip.volume, 1);

        const fxChain = o.fxChain || null;
        if (fxChain) {
            clipGain.connect(fxChain.input);
            fxChain.output.connect(destNode);
        } else {
            clipGain.connect(destNode);
        }

        const clipStartDelay = Math.max(0, clip.startTime - startOffset);
        const envStartAt = now + clipStartDelay;
        applyClipEnvelope(clipGain, baseGain, clip, envStartAt, playFrom, playDuration, loopLen);

        const iterations = Math.max(1, Math.ceil(clip.duration / loopLen));
        const voice = clip.synthVoice || {};

        for (let iter = 0; iter < iterations; iter++) {
            const loopBase = iter * loopLen;
            if (loopBase >= clip.duration) break;

            for (let row = 0; row < pattern.grid.length; row++) {
                const baseMidi = baseMidiNote + row;

                for (let step = 0; step < steps; step++) {
                    const cell = pattern.grid[row][step];
                    const s = normalizeStep(cell);
                    if (!s.active) continue;

                    const clipLocal = loopBase + step * stepSec;
                    if (clipLocal < playFrom) continue;
                    if (clipLocal >= clip.duration) continue;

                    if (s.probability < 1 && Math.random() >= s.probability) continue;

                    const effectiveMidi = baseMidi + (s.pitch || 0);
                    const noteName = noteNames[((effectiveMidi % 12) + 12) % 12];
                    const noteOctave = Math.floor(effectiveMidi / 12) - 1;

                    const ctxTime = now + Math.max(0, clip.startTime + clipLocal - startOffset);
                    if (ctxTime < ctx.currentTime - 0.01) continue;

                    const freq = 440 * Math.pow(2, (effectiveMidi - 69) / 12);
                    const holdSec = stepSec * (s.length || 1);

                    if (s.attack != null || s.decay != null || s.sustain != null || s.release != null) {
                        console.warn('[TEST] ADSR cell found at row', row, 'step', step, '->', s.attack, s.decay, s.sustain, s.release);
                    }

                    const adsrOverride = {};
                    if (s.attack  != null) adsrOverride.attack  = s.attack;
                    if (s.decay   != null) adsrOverride.decay   = s.decay;
                    if (s.sustain != null) adsrOverride.sustain = s.sustain;
                    if (s.release != null) adsrOverride.release = s.release;

                    scheduleSynthNote(
                        ctx, voice, noteName + noteOctave, freq,
                        ctxTime, holdSec, num(s.velocity, 1),
                        clipGain,
                        {
                            activeSources,
                            adsrOverride: Object.keys(adsrOverride).length ? adsrOverride : null,
                        }
                    );
                }
            }
        }
    }

    function schedulePatternClip(ctx, clip, track, destNode, opts) {
        const o = opts || {};
        const now = num(o.now, ctx.currentTime);
        const startOffset = num(o.startOffset, 0);
        const bpm = num(o.bpm, 120);
        const activeSources = o.activeSources || null;
        const padFxChains = o.padFxChains || null;
        const soloActive = !!o.soloActive;

        const pattern = clip.pattern;
        if (!pattern || !pattern.grid) return;

        const stepSec = (60 / bpm) / 4;
        const steps = pattern.steps || 16;
        const loopLen = steps * stepSec;

        const playFrom = Math.max(0, startOffset - clip.startTime);
        const playDuration = Math.max(0, clip.duration - playFrom);

        const clipGain = ctx.createGain();
        const baseGain = num(clip.volume, 1);
        clipGain.connect(destNode);

        const clipStartDelay = Math.max(0, clip.startTime - startOffset);
        const envStartAt = now + clipStartDelay;
        applyClipEnvelope(clipGain, baseGain, clip, envStartAt, playFrom, playDuration, loopLen);

        const iterations = Math.max(1, Math.ceil(clip.duration / loopLen));

        for (let iter = 0; iter < iterations; iter++) {
            const loopBase = iter * loopLen;
            if (loopBase >= clip.duration) break;

            for (let padIndex = 0; padIndex < pattern.grid.length; padIndex++) {
                const snap = clip.padSnapshots && clip.padSnapshots[padIndex];
                const livePad = (typeof app !== 'undefined' && app.drumPads && app.drumPads[padIndex]) || {};

                const sample = snap && snap.sample ? snap.sample : livePad.sample;
                if (!sample) continue;

                const pad = {
                    volume: snap ? num(snap.volume, 1) : num(livePad.volume, 1),
                    pitch: snap ? num(snap.pitch, 0) : num(livePad.pitch, 0),
                    pan: snap ? num(snap.pan, 0) : num(livePad.pan, 0),
                    muted: snap ? !!snap.muted : !!livePad.muted,
                    solo: snap ? !!snap.solo : !!livePad.solo,
                };

                if (pad.muted) continue;
                if (soloActive && !pad.solo) continue;

                const fxChain = padFxChains ? padFxChains[padIndex] : null;

                for (let step = 0; step < steps; step++) {
                    const cell = pattern.grid[padIndex][step];
                    const s = normalizeStep(cell);
                    if (!s.active) continue;

                    const ratchet = clamp(num(s.ratchet, 1), 1, 8);
                    const subGap = stepSec / ratchet;
                    const stepBase = loopBase + step * stepSec;

                    for (let r = 0; r < ratchet; r++) {
                        const clipLocal = stepBase + r * subGap;
                        if (clipLocal < playFrom) continue;
                        if (clipLocal >= clip.duration) continue;

                        if (s.probability < 1 && Math.random() >= s.probability) continue;

                        const ctxTime = now + Math.max(0, clip.startTime + clipLocal - startOffset);
                        if (ctxTime < ctx.currentTime - 0.01) continue;

                        const velocityScale = num(s.velocity, 1) * (r === 0 ? 1 : 0.6);

                        scheduleDrumHit(
                            ctx, sample, pad, { ...s, velocity: velocityScale },
                            ctxTime, clipGain,
                            { activeSources, padFxChain: fxChain }
                        );
                    }
                }
            }
        }
    }

    function normalizeStep(step) {
        if (step && typeof step === 'object') {
            return {
                active: !!step.active,
                velocity: typeof step.velocity === 'number' ? step.velocity : 1,
                probability: typeof step.probability === 'number' ? step.probability : 1,
                ratchet: typeof step.ratchet === 'number' ? step.ratchet : 1,
                pan: typeof step.pan === 'number' ? step.pan : 0,
                pitch: typeof step.pitch === 'number' ? Math.round(step.pitch) : 0,
                length: typeof step.length === 'number' && step.length >= 1
                    ? Math.round(step.length) : 1,
                attack:  (typeof step.attack  === 'number' && isFinite(step.attack))  ? step.attack  : null,
                decay:   (typeof step.decay   === 'number' && isFinite(step.decay))   ? step.decay   : null,
                sustain: (typeof step.sustain === 'number' && isFinite(step.sustain)) ? step.sustain : null,
                release: (typeof step.release === 'number' && isFinite(step.release)) ? step.release : null,
            };
        }
        return {
            active: !!step, velocity: 1, probability: 1,
            ratchet: 1, pan: 0, pitch: 0, length: 1,
            attack: null, decay: null, sustain: null, release: null,
        };
    }

    function applyClipEnvelope(gainNode, baseGain, clip, startAt, playFrom, playDuration, loopLen) {
        const env = clip.envelope;
        const speed = num(clip.speed, 1);
        const endClipTime = playFrom + playDuration * speed;

        gainNode.gain.cancelScheduledValues(startAt);

        if (!env || env.length < 2) {
            gainNode.gain.setValueAtTime(baseGain, startAt);
            return;
        }

        const sorted = [...env].sort((a, b) => a.time - b.time);
        const v0 = envelopeValueAt(sorted, playFrom);
        gainNode.gain.setValueAtTime(baseGain * v0, startAt);

        for (const pt of sorted) {
            if (pt.time <= playFrom) continue;
            if (pt.time > endClipTime + 1e-6) break;
            const t = startAt + (pt.time - playFrom) / speed;
            if (t <= startAt) continue;
            gainNode.gain.linearRampToValueAtTime(baseGain * pt.value, t);
        }

        const lastPt = sorted[sorted.length - 1];
        if (lastPt.time < endClipTime - 1e-6) {
            const t = startAt + playDuration;
            gainNode.gain.linearRampToValueAtTime(baseGain * lastPt.value, t);
        }
    }

    function envelopeValueAt(env, time) {
        if (!env || env.length === 0) return 1;
        if (time <= env[0].time) return env[0].value;
        if (time >= env[env.length - 1].time) return env[env.length - 1].value;
        for (let i = 0; i < env.length - 1; i++) {
            const a = env[i], b = env[i + 1];
            if (time >= a.time && time <= b.time) {
                const t = (time - a.time) / (b.time - a.time);
                return a.value + (b.value - a.value) * t;
            }
        }
        return 1;
    }

    window.Scheduler = {
        buildSynthClipFxChain,
        buildPadFxChain,
        buildMasterFxChain,

        scheduleSynthNote,
        scheduleDrumHit,

        scheduleSynthPatternClip,
        schedulePatternClip,

        normalizeStep,
        applyClipEnvelope,
        envelopeValueAt,
    };
})();