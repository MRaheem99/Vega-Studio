
(function () {
    'use strict';

    function fnv1a(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h * 0x01000193) >>> 0;
        }
        return h.toString(16);
    }

    function serializeCell(cell) {
        if (!cell || typeof cell !== 'object') return cell ? '1' : '0';
        const order = [
            'active', 'velocity', 'probability', 'ratchet',
            'pan', 'pitch', 'length',
            'attack', 'decay', 'sustain', 'release',
        ];
        const parts = [];
        for (const k of order) {
            const v = cell[k];
            if (k === 'active') parts.push(v ? 'a' : '-');
            else if (typeof v === 'number') parts.push(v.toFixed(4));
            else parts.push(v == null ? 'n' : String(v));
        }
        return parts.join(',');
    }

    function serializeGrid(grid) {
        if (!Array.isArray(grid)) return '';
        const rows = [];
        for (let r = 0; r < grid.length; r++) {
            const row = grid[r];
            if (!Array.isArray(row)) { rows.push(''); continue; }
            const cells = [];
            for (let s = 0; s < row.length; s++) {
                cells.push(serializeCell(row[s]));
            }
            rows.push(cells.join('|'));
        }
        return rows.join('/');
    }

    function serializeVoice(voice) {
        if (!voice || typeof voice !== 'object') return '';
        const keys = [
            'waveform', 'detune', 'pulseWidth', 'octaveOffset',
            'unisonVoices', 'unisonSpread', 'unisonPanSpread',
            'subEnabled', 'subWaveform', 'subVolume',
            'osc2Enabled', 'osc2Waveform', 'osc2Detune', 'osc2Octave',
            'osc2Semitone', 'osc2Level', 'osc2Pan',
            'noiseEnabled', 'noiseLevel', 'noiseColor', 'noiseMode',
            'filterType', 'filterSlope', 'cutoff', 'resonance', 'filterKeytrack',
            'filterEnvEnabled', 'filterEnvAmount', 'filterEnvAttack',
            'filterEnvDecay', 'filterEnvSustain', 'filterEnvRelease',
            'lfoEnabled', 'lfoShape', 'lfoRate', 'lfoDepth', 'lfoTarget',
            'attack', 'decay', 'sustain', 'release',
            'glideEnabled', 'glideTime',
        ];
        const parts = [];
        for (const k of keys) {
            const v = voice[k];
            if (typeof v === 'number') parts.push(k + '=' + v.toFixed(4));
            else if (typeof v === 'boolean') parts.push(k + '=' + (v ? '1' : '0'));
            else parts.push(k + '=' + (v == null ? 'n' : String(v)));
        }
        const fx = voice.effects || {};
        const fxKeys = Object.keys(fx).sort();
        for (const k of fxKeys) parts.push('fx:' + k + '=' + (fx[k] ? '1' : '0'));
        const states = voice.effectStates || {};
        const stateKeys = Object.keys(states).sort();
        for (const fxName of stateKeys) {
            const st = states[fxName];
            if (!st || typeof st !== 'object') continue;
            const inner = Object.keys(st).sort().map(k => {
                const v = st[k];
                return typeof v === 'number' ? k + ':' + v.toFixed(4) : k + ':' + String(v);
            }).join(',');
            parts.push('fxs:' + fxName + '{' + inner + '}');
        }
        return parts.join(';');
    }

    function computeFreezeKey(clip, projectBpm) {
        if (!clip || !clip.pattern) return '';
        const p = clip.pattern;
        const v = clip.synthVoice || {};
        const bpm = projectBpm || 120;

        const parts = [
            'v1',
            'kind=' + (p.kind || 'drums'),
            'steps=' + (p.steps || 16),
            'bpm=' + bpm.toFixed(4),
            'baseMidi=' + (p.baseMidiNote != null ? p.baseMidiNote : 60),
            'grid=' + serializeGrid(p.grid),
            'voice=' + serializeVoice(v),
            'duration=' + (clip.duration || 0).toFixed(4),
        ];

        const ctx = window.app?.audioEngine?.ctx;
        if (ctx) parts.push('sr=' + ctx.sampleRate);

        return fnv1a(parts.join('||'));
    }

    async function renderPatternGrid(opts) {
        if (!opts || !opts.grid) return null;

        const bpm = opts.bpm || 120;
        const steps = opts.steps || opts.grid[0]?.length || 16;
        const kind = opts.kind || 'synth';
        const tailSec = opts.tailSec ?? 0;

        const liveCtx = window.app?.audioEngine?.ctx;
        const sampleRate = opts.sampleRate || liveCtx?.sampleRate || 44100;

        const loopSec = (steps / 4) * (60 / bpm);
        const totalSec = loopSec + tailSec;
        const length = Math.max(1, Math.ceil(sampleRate * totalSec));

        const offline = new OfflineAudioContext(2, length, sampleRate);

        const masterGain = offline.createGain();
        masterGain.gain.value = 0.6;
        const masterPanner = offline.createStereoPanner();
        masterPanner.pan.value = 0;
        masterGain.connect(masterPanner);
        masterPanner.connect(offline.destination);

        let destNode = masterGain;
        const fxChain = (kind === 'synth' && typeof Scheduler !== 'undefined' && Scheduler.buildSynthClipFxChain)
            ? Scheduler.buildSynthClipFxChain(offline, opts.voice)
            : null;
        if (fxChain) {
            fxChain.output.connect(masterGain);
            destNode = fxChain.input;
        }

        const fakeClip = {
            id: 'render_' + Date.now(),
            type: 'pattern',
            mode: 'wav',
            name: 'Render',
            startTime: 0,
            duration: loopSec,
            offset: 0,
            loop: false,
            loopStart: 0,
            loopEnd: loopSec,
            volume: 1,
            pan: 0,
            speed: 1,
            muted: false,
            envelope: null,
            pattern: {
                grid: opts.grid,
                steps,
                bpm,
                kind,
                baseMidiNote: opts.baseMidiNote ?? 60,
                octave: opts.octave ?? 4,
                sourceName: opts.sourceName || null,
            },
            synthVoice: opts.voice || {},
            padSnapshots: opts.padSnapshots || null,
        };

        if (kind === 'synth') {
            Scheduler.scheduleSynthPatternClip(
                offline,
                fakeClip,
                null,
                destNode,
                {
                    startOffset: 0,
                    now: 0,
                    bpm,
                    fxChain: null,
                }
            );
        } else {
            const padFxChains = [];
            if (Array.isArray(opts.grid)) {
                for (let padIndex = 0; padIndex < opts.grid.length; padIndex++) {
                    const snap = opts.padSnapshots?.[padIndex];
                    const effects = snap?.effects || {};
                    const states = snap?.effectStates || {};
                    const chain = (typeof Scheduler !== 'undefined' && Scheduler.buildPadFxChain)
                        ? Scheduler.buildPadFxChain(offline, effects, states)
                        : null;
                    padFxChains[padIndex] = chain;
                }
            }
            Scheduler.schedulePatternClip(
                offline,
                fakeClip,
                null,
                destNode,
                {
                    startOffset: 0,
                    now: 0,
                    bpm,
                    padFxChains,
                    soloActive: false,
                }
            );
        }

        try {
            const rendered = await offline.startRendering();
            return rendered;
        } catch (err) {
            console.warn('renderPatternGrid failed:', err);
            return null;
        }
    }

    async function renderClip(clip, projectBpm, opts = {}) {
        if (!clip || !clip.pattern) return null;

        const liveCtx = window.app?.audioEngine?.ctx;
        const sampleRate = liveCtx?.sampleRate || 44100;
        const bpm = projectBpm || 120;

        const steps = clip.pattern.steps || 16;
        const patternSec = (steps / 4) * (60 / bpm);
        const coreDuration = patternSec;
        const tailSec = opts.tailSec ?? 0;
        const totalSec = coreDuration + tailSec;

        const channels = 2;
        const length = Math.max(1, Math.ceil(sampleRate * totalSec));

        const offline = new OfflineAudioContext(channels, length, sampleRate);

        const masterGain = offline.createGain();
        masterGain.gain.value = 1.0;
        const masterPanner = offline.createStereoPanner();
        masterPanner.pan.value = 0;
        masterGain.connect(masterPanner);
        masterPanner.connect(offline.destination);

        let destNode = masterGain;
        const fxChain = (typeof Scheduler !== 'undefined' && Scheduler.buildSynthClipFxChain)
            ? Scheduler.buildSynthClipFxChain(offline, clip.synthVoice)
            : null;
        if (fxChain) {
            fxChain.output.connect(masterGain);
            destNode = fxChain.input;
        }

        const kind = clip.pattern.kind || 'drums';

        if (kind === 'synth') {
            Scheduler.scheduleSynthPatternClip(
                offline,
                {
                    ...clip,
                    startTime: 0,
                    duration: coreDuration,
                    envelope: null,
                },
                null,
                destNode,
                {
                    startOffset: 0,
                    now: 0,
                    bpm,
                    fxChain: null,
                }
            );
        } else {
            const padFxChains = [];
            if (clip.pattern.grid) {
                for (let padIndex = 0; padIndex < clip.pattern.grid.length; padIndex++) {
                    const snap = clip.padSnapshots?.[padIndex];
                    const effects = snap?.effects || {};
                    const states = snap?.effectStates || {};
                    const chain = (typeof Scheduler !== 'undefined' && Scheduler.buildPadFxChain)
                        ? Scheduler.buildPadFxChain(offline, effects, states)
                        : null;
                    padFxChains[padIndex] = chain;
                }
            }
            Scheduler.schedulePatternClip(
                offline,
                {
                    ...clip,
                    startTime: 0,
                    duration: coreDuration,
                    envelope: null,
                },
                null,
                destNode,
                {
                    startOffset: 0,
                    now: 0,
                    bpm,
                    padFxChains,
                    soloActive: false,
                }
            );
        }

        try {
            const rendered = await offline.startRendering();
            return rendered;
        } catch (err) {
            console.warn('Freeze render failed for clip', clip.id, err);
            return null;
        }
    }

    async function freeze(clip, projectBpm, opts = {}) {
        if (!clip || clip.mode !== 'wav' || !clip.pattern) return null;

        const key = computeFreezeKey(clip, projectBpm);

        // 1. In-clip cache hit
        if (clip._frozen && clip._frozen.key === key && clip._frozen.buffer) {
            return clip._frozen.buffer;
        }

        // 2. Already rendering
        if (clip._freezePromise) {
            return clip._freezePromise;
        }

        // 3. Persistent cache hit (audioCache)
        if (window.audioCache) {
            clip._freezePromise = (async () => {
                try {
                    const buffer = await window.audioCache.getOrRender(key, () =>
                        queueRender(() => renderClip(clip, projectBpm, opts))
                    );
                    if (buffer) {
                        clip._frozen = { key, buffer, renderedAt: Date.now() };
                        return buffer;
                    }
                    return null;
                } finally {
                    clip._freezePromise = null;
                }
            })();
            return clip._freezePromise;
        }

        // 4. Fallback: no audioCache (shouldn't happen, but safe)
        clip._freezePromise = (async () => {
            try {
                const buffer = await queueRender(() => renderClip(clip, projectBpm, opts));
                if (buffer) {
                    clip._frozen = { key, buffer, renderedAt: Date.now() };
                    return buffer;
                }
                return null;
            } finally {
                clip._freezePromise = null;
            }
        })();
        return clip._freezePromise;
    }

    function invalidate(clip, projectBpm, opts = {}) {
        if (!clip || clip.mode !== 'wav') return;
        clip._frozen = null;
        scheduleRefresh(clip, projectBpm, opts);
    }

    function scheduleRefresh(clip, projectBpm, opts = {}) {
        if (!clip || clip.mode !== 'wav') return;
        if (clip._freezeTimer) clearTimeout(clip._freezeTimer);
        clip._freezeTimer = setTimeout(() => {
            clip._freezeTimer = null;
            freeze(clip, projectBpm, opts).catch(err => {
                console.warn('Freeze refresh failed for clip', clip.id, err);
            });
        }, opts.debounceMs ?? 500);
    }

    function invalidateByPatternName(patternName, projectBpm, kind = null) {
        if (!window.app || !window.app.tracks) return;
        const tracks = window.app.tracks.tracks || [];
        let invalidated = 0;
        for (const track of tracks) {
            for (const clip of track.clips) {
                if (clip.mode !== 'wav') continue;
                if (!clip.pattern) continue;
                const srcName = clip.pattern.sourceName;
                if (srcName !== patternName) continue;
                if (kind && (clip.pattern.kind || 'drums') !== kind) continue;
                invalidate(clip, projectBpm);
                invalidated++;
            }
        }
        if (invalidated > 0) {
            console.log(`[freezer] Invalidated ${invalidated} WAV clip(s) for "${patternName}"`);
        }
    }

    function dispose(clip) {
        if (!clip) return;
        if (clip._freezeTimer) {
            clearTimeout(clip._freezeTimer);
            clip._freezeTimer = null;
        }
        clip._freezePromise = null;
        clip._frozen = null;
    }

    const _renderQueue = [];
    let _renderBusy = false;

    function _drainQueue() {
        if (_renderBusy) return;
        const next = _renderQueue.shift();
        if (!next) return;

        _renderBusy = true;
        Promise.resolve()
            .then(() => next())
            .catch(err => console.warn('Render queue task failed:', err))
            .finally(() => {
                _renderBusy = false;
                _drainQueue();
            });
    }

    function queueRender(taskFn) {
        return new Promise((resolve, reject) => {
            _renderQueue.push(() => {
                try {
                    const result = taskFn();
                    Promise.resolve(result).then(resolve, reject);
                } catch (err) {
                    reject(err);
                }
            });
            _drainQueue();
        });
    }

    window.ClipFreezer = {
        computeFreezeKey,
        renderClip,
        renderPatternGrid,
        freeze,
        invalidate,
        scheduleRefresh,
        invalidateByPatternName,
        dispose,
        queueRender,
    };
})();