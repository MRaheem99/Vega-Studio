// js/projectIO.js
class ProjectIO {
    constructor(app) {
        this.app = app;
        this._exportOptions = {
            includeAudio: false,   // remember last choice for the session
        };
    }

    // ============================================================
    // EXPORT — JSON
    // ============================================================

    /**
     * Show export options dialog, then run the actual JSON export.
     */
    async exportProjectJSON() {
        const opts = await this._showExportOptionsDialog();
        if (!opts) return;
        this._exportOptions.includeAudio = opts.includeAudio;

        const overlay = this._showProgressModal('Preparing project…', 0, 1);
        try {
            await this._doExportProjectJSON(opts, overlay);
            this._updateProgressModal(overlay, 'Done', 1, 1);
            setTimeout(() => this._hideProgressModal(overlay), 500);
        } catch (err) {
            console.error('[export JSON] failed:', err);
            this._hideProgressModal(overlay);
            alert('Export failed: ' + (err.message || err));
        }
    }

    async _doExportProjectJSON(opts, overlay) {
        const project = this.app.project || {};
        const tracks = this.app.tracks?.tracks || [];
        const drumPads = this.app.drumPads || [];
        const patterns = this.app.patterns?.patterns || {};
        const ae = this.app.audioEngine;

        // -------- Count total work for progress --------
        let totalClips = 0;
        tracks.forEach(t => totalClips += t.clips.length);
        const totalJobs = totalClips + drumPads.length + 2;  // +1 for pads, +1 final
        let done = 0;

        // -------- Tracks + clips --------
        const tracksData = [];
        for (const track of tracks) {
            const clipsData = [];
            for (const clip of track.clips) {
                this._updateProgressModal(
                    overlay,
                    `Serializing clip: ${clip.name || 'clip'}`,
                    ++done, totalJobs
                );
                clipsData.push(await this._serializeClip(clip, opts));
            }
            tracksData.push({
                id: track.id,
                name: track.name,
                type: track.type || 'synth',
                color: track.color,
                volume: track.volume,
                pan: track.pan,
                muted: track.muted,
                solo: track.solo,
                clips: clipsData,
            });
        }

        // -------- Drum pads --------
        const drumPadsData = [];
        for (let i = 0; i < drumPads.length; i++) {
            const pad = drumPads[i] || {};
            this._updateProgressModal(
                overlay,
                `Serializing drum pad ${i + 1}…`,
                ++done, totalJobs
            );
            drumPadsData.push({
                fileName: pad.fileName || null,
                volume: pad.volume ?? 1,
                pitch: pad.pitch ?? 0,
                pan: pad.pan ?? 0,
                solo: !!pad.solo,
                muted: !!pad.muted,
                effects: { ...(pad.effects || {}) },
                effectStates: JSON.parse(JSON.stringify(pad.effectStates || {})),
                sampleWavBase64: pad.sample
                    ? await this._audioBufferToBase64WavAsync(pad.sample)
                    : null,
            });
        }

        // -------- Master voice + FX (FULL, not cherry-picked) --------
        const p = ae?.params || {};
        const synthVoice = Object.assign({}, p, {
            effects: ae ? { ...ae.activeEffects } : {},
            effectStates: ae ? JSON.parse(JSON.stringify(ae.effectStates || {})) : {},
            sampleBuffer: null,
        });

        const masterFx = {
            active: ae ? { ...ae.activeEffects } : {},
            states: ae ? JSON.parse(JSON.stringify(ae.effectStates || {})) : {},
        };

        const userTones = (window.toneLibrary && Array.isArray(window.toneLibrary.user))
            ? JSON.parse(JSON.stringify(window.toneLibrary.user))
            : [];

        const synthSeqState = (this.app.synthSequencer) ? {
            renderMode: this.app.synthSequencer.renderMode || 'native',
            currentPatternName: this.app.synthSequencer.currentPatternName || null,
        } : null;

        const out = {
            format: 'mrsm-project',
            version: 4,                          // bumped — includes optional frozenWavBase64
            exportedAt: new Date().toISOString(),
            includeAudio: !!opts.includeAudio,
            project: {
                name: project.name,
                bpm: project.bpm,
                bars: project.bars,
                timeSignature: project.timeSignature,
                swing: project.swing,
                key: project.key,
                scale: project.scale,
                genre: project.genre || 'house',
                songLengthBars: project.songLengthBars ?? 32,
                breakCount: project.breakCount ?? 2,
                metronomeVolume: project.metronomeVolume ?? 0.5,
                wavQuality: project.wavQuality ?? 16,
            },
            synthVoice,
            synthSequencerState: synthSeqState,
            masterFx,
            drumPads: drumPadsData,
            tracks: tracksData,
            patterns: JSON.parse(JSON.stringify(patterns)),
            userTones,
        };

        this._updateProgressModal(overlay, 'Writing file…', totalJobs, totalJobs);

        const json = JSON.stringify(out);
        const blob = new Blob([json], { type: 'application/json' });
        this._downloadBlob(blob, this._safeFileName(project.name || 'project') + '.json');
    }

    async _serializeClip(clip, opts = {}) {
        const includeAudio = !!opts.includeAudio;

        const base = {
            id: clip.id,
            type: clip.type || 'audio',
            mode: clip.mode || null,
            name: clip.name,
            startTime: clip.startTime,
            duration: clip.duration,
            offset: clip.offset || 0,
            loop: !!clip.loop,
            loopStart: clip.loopStart || 0,
            loopEnd: clip.loopEnd || 0,
            volume: clip.volume ?? 1,
            pan: clip.pan ?? 0,
            speed: clip.speed ?? 1,
            muted: !!clip.muted,
            envelope: (clip.envelope || []).map(pt => ({ ...pt })),
        };

        if (clip.type === 'pattern' && clip.pattern) {
            base.pattern = {
                grid: clip.pattern.grid.map(row => row.map(c => ({ ...c }))),
                steps: clip.pattern.steps,
                bpm: clip.pattern.bpm,
                kind: clip.pattern.kind || 'drums',
                octave: clip.pattern.octave ?? 4,
                baseMidiNote: clip.pattern.baseMidiNote ?? 60,
                sourceName: clip.pattern.sourceName || null,
            };

            base.padSnapshots = (clip.padSnapshots || []).map((snap, idx) => ({
                padRef: idx,
                volume: snap.volume ?? 1,
                pitch: snap.pitch ?? 0,
                pan: snap.pan ?? 0,
                muted: !!snap.muted,
                solo: !!snap.solo,
                effects: { ...(snap.effects || {}) },
                effectStates: JSON.parse(JSON.stringify(snap.effectStates || {})),
            }));

            // FULL voice serialization (no cherry-picking)
            if (clip.synthVoice) {
                const v = clip.synthVoice;
                base.synthVoice = Object.assign({}, v, {
                    effects: { ...(v.effects || {}) },
                    effectStates: JSON.parse(JSON.stringify(v.effectStates || {})),
                    sampleBuffer: null,
                    samplePadRef: v._samplePadRef ?? null,
                });
                delete base.synthVoice._shapeVersion;
            }

            // Optionally embed the frozen WAV
            if (includeAudio && clip.mode === 'wav' && clip._frozen?.buffer) {
                try {
                    base.frozenWavBase64 = await this._audioBufferToBase64WavAsync(clip._frozen.buffer);
                } catch (err) {
                    console.warn('[serializeClip] frozen WAV encode failed:', err);
                }
            }
        } else if (clip.buffer) {
            // Audio clips always embed their buffer
            base.wavBase64 = await this._audioBufferToBase64WavAsync(clip.buffer);
        }

        return base;
    }

    // ============================================================
    // IMPORT — JSON
    // ============================================================

    async importProjectJSON(file) {
        const text = await file.text();
        let data;
        try { data = JSON.parse(text); }
        catch (err) { alert('Invalid JSON: ' + err.message); return; }

        if (data.format !== 'mrsm-project') {
            alert('Not a Vega Studio project file.');
            return;
        }

        if (!confirm('This will replace the current project. Continue?')) return;

        const overlay = this._showProgressModal('Importing project…', 0, 1);

        try {
            await this._doImportProjectJSON(data, overlay);
            this._updateProgressModal(overlay, 'Done', 1, 1);
            setTimeout(() => this._hideProgressModal(overlay), 400);
        } catch (err) {
            console.error('[import JSON] failed:', err);
            this._hideProgressModal(overlay);
            alert('Import failed: ' + (err.message || err));
        }
    }

    async _doImportProjectJSON(data, overlay) {
        const app = this.app;

        this._updateProgressModal(overlay, 'Clearing current project…', 0, 1);

        if (app.history) app.history.clear();

        // Dispose old WAV clips
        if (window.ClipFreezer && app.tracks) {
            app.tracks.tracks.forEach(track => {
                track.clips.forEach(clip => {
                    if (clip.mode === 'wav') window.ClipFreezer.dispose(clip);
                });
            });
        }

        // -------- Project fields --------
        const p = data.project || {};
        if (app.project) {
            if (p.name) app.project.name = p.name;
            if (typeof p.bpm === 'number') app.project.bpm = p.bpm;
            if (typeof p.bars === 'number') app.project.bars = p.bars;
            if (p.timeSignature) app.project.timeSignature = p.timeSignature;
            if (typeof p.swing === 'number') app.project.swing = p.swing;
            if (p.key) app.project.key = p.key;
            if (p.scale) app.project.scale = p.scale;
            if (p.genre) app.project.genre = p.genre;
            if (typeof p.songLengthBars === 'number') app.project.songLengthBars = p.songLengthBars;
            if (typeof p.breakCount === 'number') app.project.breakCount = p.breakCount;
            if (typeof p.metronomeVolume === 'number') app.project.metronomeVolume = p.metronomeVolume;
            if (typeof p.wavQuality === 'number') app.project.wavQuality = p.wavQuality;

            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el && val !== undefined) el.value = val;
            };
            setVal('proj-name', p.name);
            setVal('proj-bpm', p.bpm);
            setVal('proj-bars', p.bars);
            setVal('proj-timesig', p.timeSignature);
            setVal('proj-swing', p.swing);
            setVal('proj-key', p.key);
            setVal('proj-scale', p.scale);
            setVal('proj-genre', p.genre);
            setVal('proj-song-length', p.songLengthBars);
            setVal('proj-break-count', p.breakCount);
            setVal('proj-wav-quality', p.wavQuality);
            setVal('proj-metronome-vol', p.metronomeVolume);

            const nameDisplay = document.getElementById('project-name-display');
            if (nameDisplay && p.name) nameDisplay.textContent = p.name;
        }

        const ae = app.audioEngine;
        const audioCtx = ae?.ctx;
        if (!audioCtx) {
            alert('Audio context not ready. Tap the page once, then import.');
            return;
        }

        // -------- Master voice (FULL) --------
        if (data.synthVoice && ae?.params) {
            Object.assign(ae.params, data.synthVoice);
            ae.updateFilterParams?.();
            ae.setVolume?.(ae.params.masterVolume);
            ae.setPan?.(ae.params.masterPan);
            if (typeof ae.params.synthVolume === 'number' && ae.setSynthVolume) {
                ae.setSynthVolume(ae.params.synthVolume);
            }
            if (typeof ae.params.drumVolume === 'number' && ae.setDrumVolume) {
                ae.setDrumVolume(ae.params.drumVolume);
            }
        }

        // -------- Synth seq state --------
        if (data.synthSequencerState && app.synthSequencer) {
            const st = data.synthSequencerState;
            if (st.renderMode === 'wav' || st.renderMode === 'native') {
                app.synthSequencer.renderMode = st.renderMode;
                app.synthSequencer._wavKey = null;
            }
            app.synthSequencer._updateRenderToggleUI?.();
        }

        // -------- Master FX --------
        if (data.masterFx && ae) {
            const active = data.masterFx.active || {};
            const states = data.masterFx.states || {};
            Object.keys(active).forEach(k => {
                if (k in ae.activeEffects) ae.activeEffects[k] = !!active[k];
            });
            Object.keys(states).forEach(k => {
                ae.effectStates[k] = JSON.parse(JSON.stringify(states[k]));
            });
            ae.rebuildFXChain?.();
        }

        // -------- Drum pads --------
        this._updateProgressModal(overlay, 'Restoring drum pads…', 0, 1);
        for (let i = 0; i < (data.drumPads || []).length && i < app.drumPads.length; i++) {
            const src = data.drumPads[i];
            const pad = app.drumPads[i];
            if (!pad) continue;
            pad.fileName = src.fileName;
            pad.volume = src.volume;
            pad.pitch = src.pitch;
            pad.pan = src.pan ?? 0;
            pad.solo = src.solo;
            pad.muted = src.muted;
            pad.effects = { ...(src.effects || {}) };
            pad.effectStates = JSON.parse(JSON.stringify(src.effectStates || {}));
            pad.sample = null;
            pad.fxProcessor = null;
            if (src.sampleWavBase64) {
                try {
                    pad.sample = await this._base64WavToAudioBuffer(src.sampleWavBase64, audioCtx);
                } catch (err) {
                    console.warn('Failed to decode pad', i, err);
                }
            }
        }

        // -------- Patterns registry --------
        if (app.patterns) {
            app.patterns.patterns = JSON.parse(JSON.stringify(data.patterns || {}));
            app.patterns.saveAll();
            app.patterns.updatePatternList();
        }

        // -------- User tones --------
        if (Array.isArray(data.userTones) && window.toneLibrary) {
            const tl = window.toneLibrary;
            const existingByName = new Map();
            (tl.user || []).forEach(preset => existingByName.set(preset.name, preset));
            data.userTones.forEach(incoming => {
                if (!incoming || typeof incoming !== 'object' || !incoming.name) return;
                existingByName.set(incoming.name, incoming);
            });
            tl.user = Array.from(existingByName.values());
            tl._saveUserToStorage();
            tl._rebuildIndexes();
            tl._emit();

            if (app.tonePicker && app.tonePicker.el && app.tonePicker.el.classList.contains('show')) {
                app.tonePicker._populateCategories();
                app.tonePicker._renderList();
            }
        }

        // -------- Tracks + clips --------
        if (!app.tracks) return;
        const tracks = app.tracks;
        tracks.tracks = [];
        tracks.nextTrackId = 1;
        tracks._trackNodes = new Map();

        const srcTracks = data.tracks || [];
        const totalClips = srcTracks.reduce((sum, t) => sum + (t.clips?.length || 0), 0);
        let processed = 0;

        for (const src of srcTracks) {
            let type = src.type;
            if (!type && window.TrackTypes) {
                const n = (src.name || '').toLowerCase();
                if (n.includes('drum')) type = 'drums';
                else if (n.includes('audio')) type = 'audio';
                else type = 'synth';
            }
            if (!type) type = 'synth';

            const track = {
                id: tracks.nextTrackId++,
                name: src.name,
                type,
                color: src.color,
                volume: src.volume ?? 1,
                pan: src.pan ?? 0,
                muted: !!src.muted,
                solo: !!src.solo,
                clips: [],
            };

            for (const c of (src.clips || [])) {
                processed++;
                this._updateProgressModal(
                    overlay,
                    `Restoring clip "${c.name || ''}"…`,
                    processed, totalClips
                );

                const clip = {
                    id: c.id,
                    type: c.type || 'audio',
                    mode: c.mode || (c.type === 'pattern' ? 'native' : null),
                    name: c.name,
                    startTime: c.startTime,
                    duration: c.duration,
                    offset: c.offset || 0,
                    loop: !!c.loop,
                    loopStart: c.loopStart || 0,
                    loopEnd: c.loopEnd || 0,
                    volume: c.volume ?? 1,
                    pan: c.pan ?? 0,
                    speed: c.speed ?? 1,
                    muted: !!c.muted,
                    envelope: (c.envelope || []).map(pt => ({ ...pt })),
                };

                if (clip.type === 'pattern' && c.pattern) {
                    clip.pattern = {
                        grid: c.pattern.grid.map(row => row.map(cell => ({
                            active: !!cell.active,
                            velocity: typeof cell.velocity === 'number' ? cell.velocity : 1,
                            probability: typeof cell.probability === 'number' ? cell.probability : 1,
                            ratchet: typeof cell.ratchet === 'number' ? cell.ratchet : 1,
                            pan: typeof cell.pan === 'number' ? cell.pan : 0,
                            pitch: typeof cell.pitch === 'number' ? Math.round(cell.pitch) : 0,
                            length: typeof cell.length === 'number' && cell.length >= 1 ? Math.round(cell.length) : 1,
                            attack:  (typeof cell.attack  === 'number' && isFinite(cell.attack))  ? cell.attack  : null,
                            decay:   (typeof cell.decay   === 'number' && isFinite(cell.decay))   ? cell.decay   : null,
                            sustain: (typeof cell.sustain === 'number' && isFinite(cell.sustain)) ? cell.sustain : null,
                            release: (typeof cell.release === 'number' && isFinite(cell.release)) ? cell.release : null,
                        }))),
                        steps: c.pattern.steps,
                        bpm: c.pattern.bpm,
                        kind: c.pattern.kind || 'drums',
                        octave: c.pattern.octave ?? 4,
                        baseMidiNote: c.pattern.baseMidiNote ?? 60,
                        sourceName: c.pattern.sourceName || null,
                    };

                    clip.padSnapshots = (c.padSnapshots || []).map(snap => {
                        const padRef = snap.padRef ?? 0;
                        return {
                            effects: { ...(snap.effects || {}) },
                            effectStates: JSON.parse(JSON.stringify(snap.effectStates || {})),
                            volume: snap.volume ?? 1,
                            pitch: snap.pitch ?? 0,
                            pan: snap.pan ?? 0,
                            muted: !!snap.muted,
                            solo: !!snap.solo,
                            sample: app.drumPads[padRef]?.sample || null,
                        };
                    });

                    // Restore per-clip voice (FULL, with defaults)
                    if (c.synthVoice) {
                        const incoming = c.synthVoice;
                        const withDefaults = (window.Voice && Voice.applyDefaults)
                            ? Voice.applyDefaults(incoming)
                            : { ...incoming };
                        clip.synthVoice = Object.assign({}, withDefaults, {
                            effects: { ...(incoming.effects || {}) },
                            effectStates: JSON.parse(JSON.stringify(incoming.effectStates || {})),
                            sampleBuffer: null,
                            _shapeVersion: 3,
                        });
                        if (clip.synthVoice.samplePadRef != null) {
                            clip.synthVoice.sampleBuffer =
                                app.drumPads[clip.synthVoice.samplePadRef]?.sample || null;
                        }
                        clip._synthFxChain = null;
                    }

                    // Restore embedded frozen WAV (fast path)
                    if (c.frozenWavBase64) {
                        try {
                            const buf = await this._base64WavToAudioBuffer(c.frozenWavBase64, audioCtx);
                            clip._frozen = { buffer: buf, key: null, renderedAt: Date.now() };
                        } catch (err) {
                            console.warn('[import] frozen WAV decode failed:', c.id, err);
                        }
                    }
                } else if (c.wavBase64) {
                    try {
                        clip.buffer = await this._base64WavToAudioBuffer(c.wavBase64, audioCtx);
                    } catch (err) {
                        console.warn('Failed to decode clip', c.id, err);
                        continue;
                    }
                } else {
                    continue;
                }

                track.clips.push(clip);
            }

            tracks.tracks.push(track);
            tracks._getTrackNodes(track.id);
            tracks._refreshTrackGain(track.id);
            tracks._refreshTrackPan(track.id);
        }

        tracks.renderTracks({ full: true });

        // -------- WAV re-render for clips without embedded buffer --------
        if (window.ClipFreezer && app.tracks) {
            const bpm = app.project?.bpm || 120;
            const wavClips = [];
            app.tracks.tracks.forEach(track => {
                track.clips.forEach(clip => {
                    if (clip.type === 'pattern' && clip.mode === 'wav') {
                        if (!clip._frozen || !clip._frozen.buffer) {
                            clip._frozen = null;
                            clip._freezePromise = null;
                            wavClips.push(clip);
                        }
                    }
                });
            });
            if (wavClips.length) {
                this._updateProgressModal(
                    overlay,
                    `Rendering ${wavClips.length} WAV clip(s)…`,
                    0, wavClips.length
                );
                let rendered = 0;
                await Promise.all(wavClips.map(clip =>
                    window.ClipFreezer.freeze(clip, bpm)
                        .then(() => {
                            rendered++;
                            this._updateProgressModal(
                                overlay,
                                `Rendering WAV clips…`,
                                rendered, wavClips.length
                            );
                        })
                        .catch(err => {
                            console.warn('[import] freeze failed:', clip.id, err);
                            return null;
                        })
                ));
                tracks.renderTracks({ full: true });
            }
        }

        if (app.patterns) app.patterns.updatePatternInfo();
        if (app.updateStatusDisplay) app.updateStatusDisplay();
    }

    // ============================================================
    // EXPORT — WAV
    // ============================================================

    async exportProjectWAV() {
        const app = this.app;
        const tracks = app.tracks?.tracks || [];
        if (!tracks.length) {
            alert('No tracks to export.');
            return;
        }

        // Compute total
        let maxEnd = 0;
        let totalClips = 0;
        for (const track of tracks) {
            for (const clip of track.clips) {
                const end = clip.startTime + clip.duration;
                if (end > maxEnd) maxEnd = end;
                totalClips++;
            }
        }
        if (maxEnd <= 0) {
            alert('No clips to export.');
            return;
        }
        const tailSeconds = 3.0;
        const totalDuration = maxEnd + tailSeconds;

        const liveCtx = app.audioEngine?.ctx;
        const sampleRate = liveCtx?.sampleRate || 44100;
        const wasPlaying = !!(app.tracks?.isPlaying);

        const overlay = this._showProgressModal('Preparing WAV export…', 0, totalClips + 2);
        let jobIdx = 0;

        try {
            if (app.tracks?.isPlaying) app.tracks.stop();
            if (app.sequencer?.isPlaying) app.sequencer.stop();
            if (app.synthSequencer?.isPlaying) app.synthSequencer.stop();
            if (app.transport?.isPlaying) app.transport.stop();
            if (liveCtx && liveCtx.state === 'running') await liveCtx.suspend();

            const offlineCtx = new OfflineAudioContext(
                2,
                Math.max(1, Math.ceil(sampleRate * totalDuration)),
                sampleRate
            );

            const masterGain = offlineCtx.createGain();
            masterGain.gain.value = app.audioEngine.params.masterVolume ?? 0.8;

            const masterPanner = offlineCtx.createStereoPanner();
            masterPanner.pan.value = app.audioEngine.params.masterPan || 0;

            masterGain.connect(masterPanner);
            masterPanner.connect(offlineCtx.destination);
            /*
            const synthBusGain = offlineCtx.createGain();
            synthBusGain.gain.value = app.audioEngine.params.synthVolume ?? 1;
            synthBusGain.connect(masterGain);

            const drumBusGain = offlineCtx.createGain();
            drumBusGain.gain.value = app.audioEngine.params.drumVolume ?? 1;
            drumBusGain.connect(masterGain);
            */
            const anySolo = tracks.some(t => t.solo);

            for (const track of tracks) {
                const effectiveGain =
                    (track.muted || (anySolo && !track.solo)) ? 0 : (track.volume ?? 1);
                if (effectiveGain === 0) continue;

                const trackGain = offlineCtx.createGain();
                trackGain.gain.value = effectiveGain;
                const trackPanner = offlineCtx.createStereoPanner();
                trackPanner.pan.value = track.pan ?? 0;
                trackGain.connect(trackPanner);

                /* Route to the correct bus based on track type
                const busNode = (track.type === 'drums') ? drumBusGain : synthBusGain;
                trackPanner.connect(busNode);
                */
               trackPanner.connect(masterGain);

                for (const clip of track.clips) {
                    if (clip.muted) continue;

                    this._updateProgressModal(
                        overlay,
                        `Rendering "${clip.name || 'clip'}"…`,
                        ++jobIdx, totalClips + 2
                    );

                    try {
                        if (clip.type === 'pattern' && clip.pattern) {
                            // WAV clips: pre-baked buffer — route through track chain
                            if (clip.mode === 'wav' && clip._frozen?.buffer) {
                                this._scheduleFrozenBufferOffline(
                                    offlineCtx, clip, clip._frozen.buffer, trackGain, 0     // ← trackGain
                                );
                                continue;
                            }
                            if (clip.mode === 'wav' && window.ClipFreezer) {
                                try {
                                    const buf = await window.ClipFreezer.freeze(clip, bpm);
                                    if (buf) {
                                        this._scheduleFrozenBufferOffline(
                                            offlineCtx, clip, buf, trackGain, 0     // ← trackGain
                                        );
                                        continue;
                                    }
                                } catch (err) {
                                    console.warn('[export] freeze failed, native fallback:', err);
                                }
                            }

                            if (clip.pattern.kind === 'synth') {
                                const fxChain = (typeof Scheduler !== 'undefined' && Scheduler.buildSynthClipFxChain)
                                    ? Scheduler.buildSynthClipFxChain(offlineCtx, clip.synthVoice)
                                    : null;
                                Scheduler.scheduleSynthPatternClip(
                                    offlineCtx, clip, track,
                                    trackGain,     // ← trackGain
                                    { startOffset: 0, now: 0, bpm: app.project?.bpm || 120, fxChain }
                                );
                            } else {
                                const padFxChains = [];
                                if (clip.pattern.grid) {
                                    for (let padIndex = 0; padIndex < clip.pattern.grid.length; padIndex++) {
                                        const snap = clip.padSnapshots?.[padIndex];
                                        const effects = snap?.effects || {};
                                        const states = snap?.effectStates || {};
                                        const chain = (typeof Scheduler !== 'undefined' && Scheduler.buildPadFxChain)
                                            ? Scheduler.buildPadFxChain(offlineCtx, effects, states)
                                            : null;
                                        padFxChains[padIndex] = chain;
                                    }
                                }
                                Scheduler.schedulePatternClip(
                                    offlineCtx, clip, track,
                                    trackGain,   // ← track chain (was: destNode)
                                    {
                                        startOffset: 0, now: 0,
                                        bpm: app.project?.bpm || 120,
                                        padFxChains,
                                        soloActive: anySolo,
                                    }
                                );
                            }
                        } else {
                            this._scheduleAudioClipOffline(offlineCtx, clip, trackPanner, 0);
                        }
                    } catch (err) {
                        console.warn('Failed to schedule clip for export:', clip.id, err);
                    }
                }
            }

            this._updateProgressModal(overlay, 'Rendering final mix…', totalClips + 1, totalClips + 2);

            const rendered = await offlineCtx.startRendering();
            const quality = app.project?.wavQuality || 16;
            const wavBlob = this._audioBufferToWavBlob(rendered, quality);
            const suffix = quality === 32 ? '_studio_32f' : '';
            const filename = this._safeFileName(app.project?.name || 'project') + suffix + '.wav';
            this._downloadBlob(wavBlob, filename);

            this._updateProgressModal(overlay, 'Done', totalClips + 2, totalClips + 2);
            setTimeout(() => this._hideProgressModal(overlay), 500);
        } catch (err) {
            console.error('WAV export failed:', err);
            this._hideProgressModal(overlay);
            alert('WAV export failed: ' + err.message);
        } finally {
            try {
                if (liveCtx && liveCtx.state === 'suspended') await liveCtx.resume();
                if (wasPlaying && app.tracks) {
                    app.tracks.playheadPosition = 0;
                    app.tracks.play();
                }
            } catch (err) {
                console.warn('Failed to restore playback:', err);
            }
        }
    }

    _scheduleAudioClipOffline(ctx, clip, destNode) {
        if (!clip.buffer) return;
        const when = clip.startTime;
        const source = ctx.createBufferSource();
        source.buffer = clip.buffer;
        source.playbackRate.value = clip.speed || 1;

        const clipGain = ctx.createGain();
        const baseGain = clip.volume ?? 1;
        clipGain.gain.value = baseGain;
        const clipPanner = ctx.createStereoPanner();
        clipPanner.pan.value = clip.pan ?? 0;

        source.connect(clipGain);
        clipGain.connect(clipPanner);
        clipPanner.connect(destNode);

        if (typeof Scheduler !== 'undefined' && Scheduler.applyClipEnvelope) {
            Scheduler.applyClipEnvelope(clipGain, baseGain, clip, when, 0, clip.duration);
        }

        const bufDur = clip.buffer.duration;
        const offsetInBuffer = Math.max(0, Math.min(bufDur - 0.001, clip.offset || 0));
        const available = bufDur - offsetInBuffer;
        const playDur = Math.min(clip.duration, available);
        if (playDur <= 0) return;
        source.start(when, offsetInBuffer, playDur);
    }

    _scheduleFrozenBufferOffline(ctx, clip, buffer, destNode, startOffset) {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        if (clipEnd <= startOffset) return;

        const playFrom = Math.max(0, startOffset - clipStart);
        const remaining = clip.duration - playFrom;
        if (remaining <= 0) return;

        const bufDur = buffer.duration;
        const shouldLoop = clip.loop && clip.duration > bufDur + 0.001;

        const source = ctx.createBufferSource();
        source.buffer = buffer;

        const gain = ctx.createGain();
        const baseGain = clip.volume ?? 1;

        const panner = ctx.createStereoPanner();
        panner.pan.value = clip.pan ?? 0;

        source.connect(gain);
        gain.connect(panner);
        panner.connect(destNode);

        const startAt = Math.max(0, clipStart - startOffset);

        let offset = playFrom;
        if (bufDur > 0) {
            if (shouldLoop) offset = offset % bufDur;
            else offset = Math.max(0, Math.min(bufDur - 0.001, offset));
        }

        const playDuration = shouldLoop ? remaining : Math.min(remaining, bufDur - offset);
        if (playDuration <= 0.001) return;

        if (shouldLoop) {
            source.loop = true;
            source.loopStart = clip.loopStart ?? 0;
            source.loopEnd = clip.loopEnd ?? bufDur;
            source.start(startAt, offset);
            try { source.stop(startAt + remaining); } catch (_) {}
        } else {
            source.start(startAt, offset, playDuration);
        }

        if (typeof Scheduler !== 'undefined' && Scheduler.applyClipEnvelope) {
            Scheduler.applyClipEnvelope(gain, baseGain, clip, startAt, playFrom, playDuration);
        } else {
            gain.gain.setValueAtTime(baseGain, startAt);
        }
    }

    // ============================================================
    // Export options dialog
    // ============================================================

    _showExportOptionsDialog() {
        return new Promise((resolve) => {
            let modal = document.getElementById('export-options-modal');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'export-options-modal';
                modal.className = 'modal-overlay';
                modal.innerHTML = `
                    <div class="modal-content export-options-content">
                        <div class="modal-header">
                            <h3><i class="fa-solid fa-file-export"></i> Export Project</h3>
                            <button class="menu-btn" id="export-options-close" style="color:var(--danger)">
                                <i class="fa-solid fa-xmark"></i>
                            </button>
                        </div>
                        <div class="modal-body">
                            <div class="setting-row" style="align-items:flex-start;">
                                <span class="setting-label" style="min-width:140px;">
                                    <i class="fa-solid fa-music"></i> Include audio
                                </span>
                                <div style="flex:1;">
                                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px;">
                                        <input type="checkbox" id="export-include-audio"
                                               style="width:16px; height:16px; accent-color:#00e676;">
                                        <span>Embed rendered WAV data <strong>(large file)</strong></span>
                                    </label>
                                    <p style="font-size:11px; color:var(--text-dim); margin:6px 0 0 24px;">
                                        OFF: small JSON (~100 KB), clips re-render on import (~2–5s).<br>
                                        ON: perfect fidelity, instant import, larger file (~20–100 MB).
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div class="clip-manager-actions">
                            <button class="clip-manager-btn" id="export-options-cancel">
                                <i class="fa-solid fa-xmark"></i> Cancel
                            </button>
                            <button class="clip-manager-btn primary" id="export-options-confirm">
                                <i class="fa-solid fa-download"></i> Export
                            </button>
                        </div>
                    </div>
                `;
                document.body.appendChild(modal);
            }

            const cb = modal.querySelector('#export-include-audio');
            cb.checked = !!this._exportOptions.includeAudio;

            const cleanup = () => {
                modal.classList.remove('show');
                modal.querySelector('#export-options-close').onclick = null;
                modal.querySelector('#export-options-cancel').onclick = null;
                modal.querySelector('#export-options-confirm').onclick = null;
            };

            modal.querySelector('#export-options-close').onclick = () => { cleanup(); resolve(null); };
            modal.querySelector('#export-options-cancel').onclick = () => { cleanup(); resolve(null); };
            modal.querySelector('#export-options-confirm').onclick = () => {
                const includeAudio = cb.checked;
                cleanup();
                resolve({ includeAudio });
            };

            modal.classList.add('show');
        });
    }

    // ============================================================
    // Progress modal
    // ============================================================

    _showProgressModal(label, current, total) {
        let el = document.getElementById('export-progress-modal');
        if (!el) {
            el = document.createElement('div');
            el.id = 'export-progress-modal';
            el.className = 'modal-overlay export-progress-overlay';
            el.innerHTML = `
                <div class="modal-content export-progress-content">
                    <div class="export-progress-header">
                        <i class="fa-solid fa-circle-notch fa-spin"></i>
                        <span class="export-progress-title">Working…</span>
                    </div>
                    <div class="export-progress-label" id="export-progress-label"></div>
                    <div class="export-progress-bar-wrap">
                        <div class="export-progress-bar" id="export-progress-bar"></div>
                    </div>
                    <div class="export-progress-count" id="export-progress-count"></div>
                </div>
            `;
            document.body.appendChild(el);
        }
        el.classList.add('show');
        this._updateProgressModal(el, label, current, total);
        return el;
    }

    _updateProgressModal(el, label, current, total) {
        if (!el) return;
        const lbl = el.querySelector('#export-progress-label');
        const bar = el.querySelector('#export-progress-bar');
        const cnt = el.querySelector('#export-progress-count');
        const title = el.querySelector('.export-progress-title');

        if (lbl) lbl.textContent = label || '';
        if (cnt) cnt.textContent = total > 1 ? `${current} / ${total}` : '';
        if (bar) {
            const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
            bar.style.width = pct + '%';
        }
        if (title) {
            title.textContent = current >= total ? 'Complete' : 'Working…';
        }
    }

    _hideProgressModal(el) {
        if (!el) return;
        el.classList.remove('show');
        setTimeout(() => {
            try { el.remove(); } catch (_) {}
        }, 400);
    }

    // ============================================================
    // Buffer helpers
    // ============================================================

    async _audioBufferToBase64WavAsync(buffer, bitDepth = 16) {
        const wavBlob = this._audioBufferToWavBlob(buffer, bitDepth);
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(wavBlob);
        });
    }

    async _base64WavToAudioBuffer(base64, ctx) {
        const binary = atob(base64);
        const len = binary.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
        return await ctx.decodeAudioData(bytes.buffer);
    }

    _audioBufferToWavBlob(buffer, bitDepth = 16) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;
        const numFrames = buffer.length;
        const dataSize = numFrames * blockAlign;
        const bufferSize = 44 + dataSize;

        const ab = new ArrayBuffer(bufferSize);
        const view = new DataView(ab);
        const formatCode = bitDepth === 32 ? 3 : 1;

        this._writeStr(view, 0, 'RIFF');
        view.setUint32(4, bufferSize - 8, true);
        this._writeStr(view, 8, 'WAVE');
        this._writeStr(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, formatCode, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        this._writeStr(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        const channels = [];
        for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

        let offset = 44;
        if (bitDepth === 32) {
            for (let i = 0; i < numFrames; i++)
                for (let c = 0; c < numChannels; c++) {
                    view.setFloat32(offset, channels[c][i], true);
                    offset += 4;
                }
        } else {
            for (let i = 0; i < numFrames; i++)
                for (let c = 0; c < numChannels; c++) {
                    let s = channels[c][i];
                    s = Math.max(-1, Math.min(1, s));
                    const intSample = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    view.setInt16(offset, intSample, true);
                    offset += 2;
                }
        }

        return new Blob([ab], { type: 'audio/wav' });
    }

    _writeStr(view, offset, str) {
        for (let i = 0; i < str.length; i++) {
            view.setUint8(offset + i, str.charCodeAt(i));
        }
    }

    _downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    _safeFileName(name) {
        return (name || 'project').replace(/[^a-z0-9_\-]+/gi, '_');
    }
}

window.ProjectIO = ProjectIO;