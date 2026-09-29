// js/offlineRenderer.js
// Renders patterns and tone samples offline using OfflineAudioContext.
// Mirrors the live VoiceScheduler path so WAV output matches live playback.
(function () {
    'use strict';

    const TAIL_SEC = 1.5;   // extra time for reverb/delay tails

    /**
     * Render a synth pattern to an AudioBuffer.
     * @param {Object} opts
     *   grid: Array<Array<cell>>
     *   steps: int
     *   bpm: int
     *   kind: 'synth'
     *   baseMidiNote: int
     *   voice: VoiceParams
     *   effects: { active, states }
     *   duration: float (seconds) — how long the pattern is
     */
    async function renderSynthPattern(opts) {
        const { grid, steps, bpm, baseMidiNote, voice, effects } = opts;

        const stepSec = (60 / bpm) * 0.25;
        const patternSec = steps * stepSec;
        const totalSec = patternSec + TAIL_SEC;

        const sampleRate = 44100;
        const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalSec), sampleRate);

        // Master chain: filter → fx → destination
        const masterFilter = ctx.createBiquadFilter();
        masterFilter.type = voice.filterType || 'lowpass';
        masterFilter.frequency.value = voice.cutoff || 8000;
        masterFilter.Q.value = voice.resonance ?? 1;

        let fxChain = null;
        if (effects && window.EffectProcessor) {
            const anyActive = Object.keys(effects.active || {}).some(k => effects.active[k]);
            if (anyActive) {
                const proc = new EffectProcessor(ctx);
                const order = ['equalizer','distortion','bitcrusher','phaser','compressor','echo','reverb','chorus','flanger'];
                order.forEach(fx => {
                    if (!effects.active[fx]) return;
                    const params = (effects.states && effects.states[fx]) || {};
                    switch (fx) {
                        case 'echo':       proc.createEcho(params); break;
                        case 'reverb':     proc.createReverb(params); break;
                        case 'distortion': proc.createDistortion(params); break;
                        case 'compressor': proc.createCompressor(params); break;
                        case 'equalizer':  proc.createEqualizer(params); break;
                        case 'chorus':     proc.createChorus(params); break;
                        case 'bitcrusher': proc.createBitcrusher(params); break;
                        case 'phaser':     proc.createPhaser(params); break;
                    }
                });
                masterFilter.connect(proc.masterInput);
                proc.masterOutput.connect(ctx.destination);
                fxChain = proc;
            }
        }
        if (!fxChain) masterFilter.connect(ctx.destination);

        // Schedule voices
        const V = window.VoiceScheduler;
        if (!V || !V.scheduleVoice) {
            console.warn('[offlineRenderer] VoiceScheduler missing');
            return await ctx.startRendering();
        }

        for (let r = 0; r < grid.length; r++) {
            for (let s = 0; s < steps; s++) {
                const raw = grid[r][s];
                if (!raw) continue;
                const cell = (typeof raw === 'object')
                    ? raw
                    : { active: !!raw, velocity: 1, probability: 1, ratchet: 1, pan: 0, pitch: 0, length: 1 };
                if (!cell.active) continue;
                if (cell.probability < 1 && Math.random() >= cell.probability) continue;

                const baseMidi = baseMidiNote + r;
                const midi = baseMidi + (cell.pitch || 0);
                const noteName = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][((midi % 12) + 12) % 12];
                const octave = Math.floor(midi / 12) - 1;
                const note = noteName + octave;
                const freq = 440 * Math.pow(2, (midi - 69) / 12);

                const time = s * stepSec;
                const ratchet = Math.max(1, Math.min(8, cell.ratchet || 1));
                const subGap = stepSec / ratchet;
                const hold = subGap * (cell.length || 1) * 0.95;
                const vel = cell.velocity ?? 1;
                const pan = cell.pan ?? 0;

                const adsrOverride = {};
                ['attack','decay','sustain','release'].forEach(k => {
                    if (cell[k] !== null && cell[k] !== undefined) adsrOverride[k] = cell[k];
                });

                for (let h = 0; h < ratchet; h++) {
                    const when = time + h * subGap;
                    const v = h === 0 ? vel : vel * 0.6;
                    V.scheduleVoice(ctx, voice || {}, {
                        note, freq, when, duration: hold, velocity: v, pan,
                        sampleBuffer: null,
                        outputNode: masterFilter,
                        adsrOverride: Object.keys(adsrOverride).length ? adsrOverride : null,
                    });
                }
            }
        }

        return await ctx.startRendering();
    }

    async function renderDrumPattern(opts) {
        const { grid, steps, bpm, drumPads } = opts;

        const stepSec = (60 / bpm) * 0.25;
        const patternSec = steps * stepSec;

        // FIX: drums get a shorter tail — just enough for the longest hit to decay
        // Compute based on the longest pad sample duration × 1.15 for safety.
        let maxSampleSec = 0.5;
        for (let i = 0; i < drumPads.length; i++) {
            const p = drumPads[i];
            if (p?.sample?.duration) {
                maxSampleSec = Math.max(maxSampleSec, p.sample.duration);
            }
        }
        const tailSec = Math.min(2.0, maxSampleSec * 1.15);
        const totalSec = patternSec + tailSec;

        const sampleRate = 44100;
        const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalSec), sampleRate);

        const masterGain = ctx.createGain();
        masterGain.gain.value = 1.0;
        masterGain.connect(ctx.destination);

        for (let padIdx = 0; padIdx < 8; padIdx++) {
            const pad = drumPads[padIdx];
            if (!pad || !pad.sample) continue;
            const buf = pad.sample;

            for (let s = 0; s < steps; s++) {
                const raw = grid[padIdx]?.[s];
                if (!raw) continue;
                const cell = (typeof raw === 'object')
                    ? raw
                    : { active: !!raw, velocity: 1, ratchet: 1, pan: 0, pitch: 0 };
                if (!cell.active) continue;
                if (cell.probability != null && cell.probability < 1 && Math.random() >= cell.probability) continue;

                const basePan = pad.pan || 0;
                const stepPan = cell.pan || 0;
                const totalPan = Math.max(-1, Math.min(1, basePan + stepPan));

                const stepPitch = cell.pitch || 0;
                const padPitch = pad.pitch || 0;
                const totalRatio = Math.pow(2, (stepPitch + padPitch) / 12);

                const hits = Math.max(1, Math.min(8, cell.ratchet || 1));
                const subGap = stepSec / hits;

                for (let h = 0; h < hits; h++) {
                    const when = s * stepSec + h * subGap;
                    const vel = (cell.velocity ?? 1) * (h === 0 ? 1 : 0.6);

                    // FIX: skip scheduling if the hit would exceed total duration
                    if (when >= totalSec) continue;

                    const src = ctx.createBufferSource();
                    src.buffer = buf;
                    src.playbackRate.value = totalRatio;

                    const g = ctx.createGain();
                    g.gain.value = (pad.volume ?? 1) * 1.5 * vel;

                    const panner = ctx.createStereoPanner();
                    panner.pan.value = totalPan;

                    src.connect(g); g.connect(panner); panner.connect(masterGain);
                    src.start(when);
                }
            }
        }

        return await ctx.startRendering();
    }
    
    async function renderToneSample(opts) {
        const { voice, effects, midi = 60, durationSec = 2.0 } = opts;

        const sampleRate = 44100;
        const totalSec = durationSec + TAIL_SEC;
        const ctx = new OfflineAudioContext(2, Math.ceil(sampleRate * totalSec), sampleRate);

        const filter = ctx.createBiquadFilter();
        filter.type = voice.filterType || 'lowpass';
        filter.frequency.value = voice.cutoff || 8000;
        filter.Q.value = voice.resonance ?? 1;

        let fxChain = null;
        if (effects && window.EffectProcessor) {
            const anyActive = Object.keys(effects.active || {}).some(k => effects.active[k]);
            if (anyActive) {
                const proc = new EffectProcessor(ctx);
                const order = ['equalizer','distortion','bitcrusher','phaser','compressor','echo','reverb','chorus','flanger'];
                order.forEach(fx => {
                    if (!effects.active[fx]) return;
                    const params = (effects.states && effects.states[fx]) || {};
                    switch (fx) {
                        case 'echo':       proc.createEcho(params); break;
                        case 'reverb':     proc.createReverb(params); break;
                        case 'distortion': proc.createDistortion(params); break;
                        case 'compressor': proc.createCompressor(params); break;
                        case 'equalizer':  proc.createEqualizer(params); break;
                        case 'chorus':     proc.createChorus(params); break;
                        case 'bitcrusher': proc.createBitcrusher(params); break;
                        case 'phaser':     proc.createPhaser(params); break;
                    }
                });
                filter.connect(proc.masterInput);
                proc.masterOutput.connect(ctx.destination);
                fxChain = proc;
            }
        }
        if (!fxChain) filter.connect(ctx.destination);

        const noteName = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][((midi % 12) + 12) % 12];
        const octave = Math.floor(midi / 12) - 1;
        const freq = 440 * Math.pow(2, (midi - 69) / 12);

        if (window.VoiceScheduler && window.VoiceScheduler.scheduleVoice) {
            window.VoiceScheduler.scheduleVoice(ctx, voice || {}, {
                note: noteName + octave,
                freq,
                when: 0.02,
                duration: durationSec,
                velocity: 1,
                pan: 0,
                sampleBuffer: null,
                outputNode: filter,
                adsrOverride: null,
            });
        }

        return await ctx.startRendering();
    }

    window.OfflineRenderer = {
        renderSynthPattern,
        renderDrumPattern,
        renderToneSample,
        TAIL_SEC,
    };
})();