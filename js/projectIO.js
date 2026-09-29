class ProjectIO {
    constructor(app) {
        this.app = app;
    }

    async exportProjectJSON() {
        const project = this.app.project || {};
        const tracks = this.app.tracks?.tracks || [];
        const drumPads = this.app.drumPads || [];
        const patterns = this.app.patterns?.patterns || {};
        const ae = this.app.audioEngine;

        const tracksData = [];
        for (const track of tracks) {
            const clipsData = [];
            for (const clip of track.clips) {
                clipsData.push(await this._serializeClip(clip));
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

        const drumPadsData = [];
        for (let i = 0; i < drumPads.length; i++) {
            const pad = drumPads[i] || {};
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

        const p = ae?.params || {};
        const synthVoice = {
            waveform: p.waveform,
            detune: p.detune,
            subEnabled: p.subEnabled,
            subWaveform: p.subWaveform,
            subVolume: p.subVolume,
            cutoff: p.cutoff,
            resonance: p.resonance,
            attack: p.attack,
            decay: p.decay,
            sustain: p.sustain,
            release: p.release,
            masterVolume: p.masterVolume,
            masterPan: p.masterPan,
            synthVolume: p.synthVolume,
            drumVolume: p.drumVolume,
        };

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
            version: 3,
            exportedAt: new Date().toISOString(),
            project: {
                name: project.name,
                bpm: project.bpm,
                bars: project.bars,
                timeSignature: project.timeSignature,
                swing: project.swing,
                key: project.key,
                scale: project.scale,
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

        const json = JSON.stringify(out);
        const blob = new Blob([json], { type: 'application/json' });
        this._downloadBlob(blob, this._safeFileName(project.name || 'project') + '.json');
    }

    async _serializeClip(clip) {
        const base = {
            id: clip.id,
            type: clip.type || 'audio',
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
            if (clip.synthVoice) {
                base.synthVoice = {
                    waveform: clip.synthVoice.waveform,
                    detune: clip.synthVoice.detune,
                    subEnabled: clip.synthVoice.subEnabled,
                    subWaveform: clip.synthVoice.subWaveform,
                    subVolume: clip.synthVoice.subVolume,
                    cutoff: clip.synthVoice.cutoff,
                    resonance: clip.synthVoice.resonance,
                    attack: clip.synthVoice.attack,
                    decay: clip.synthVoice.decay,
                    sustain: clip.synthVoice.sustain,
                    release: clip.synthVoice.release,
                    effects: { ...(clip.synthVoice.effects || {}) },
                    effectStates: JSON.parse(JSON.stringify(clip.synthVoice.effectStates || {})),
                    samplePadRef: clip.synthVoice._samplePadRef ?? null,
                };
            }
        } else if (clip.buffer) {
            base.wavBase64 = await this._audioBufferToBase64WavAsync(clip.buffer);
        }

        return base;
    }

    async importProjectJSON(file) {
        const text = await file.text();
        let data;
        try { data = JSON.parse(text); }
        catch (err) { alert('Invalid JSON: ' + err.message); return; }

        if (data.format !== 'mrsm-project') {
            alert('Not an MR Sound Machine project file.');
            return;
        }

        if (!confirm('This will replace the current project. Continue?')) return;

        if (this.app.history) this.app.history.clear();

        if (window.ClipFreezer && this.app.tracks) {
            this.app.tracks.tracks.forEach(track => {
                track.clips.forEach(clip => {
                    if (clip.mode === 'wav') {
                        window.ClipFreezer.dispose(clip);
                    }
                });
            });
        }

        const p = data.project || {};
        if (this.app.project) {
            if (p.name) this.app.project.name = p.name;
            if (typeof p.bpm === 'number') this.app.project.bpm = p.bpm;
            if (typeof p.bars === 'number') this.app.project.bars = p.bars;
            if (p.timeSignature) this.app.project.timeSignature = p.timeSignature;
            if (typeof p.swing === 'number') this.app.project.swing = p.swing;
            if (p.key) this.app.project.key = p.key;
            if (p.scale) this.app.project.scale = p.scale;
            if (typeof p.metronomeVolume === 'number') {
                this.app.project.metronomeVolume = p.metronomeVolume;
            }
            if (typeof p.wavQuality === 'number') {
                this.app.project.wavQuality = p.wavQuality;
            }

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
            setVal('proj-wav-quality', p.wavQuality);
            setVal('proj-metronome-vol', p.metronomeVolume);

            const nameDisplay = document.getElementById('project-name-display');
            if (nameDisplay && p.name) nameDisplay.textContent = p.name;
        }

        const ae = this.app.audioEngine;
        const audioCtx = ae?.ctx;
        if (!audioCtx) {
            alert('Audio context not ready. Tap the page once, then import.');
            return;
        }

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

        if (data.synthSequencerState && this.app.synthSequencer) {
            const st = data.synthSequencerState;
            if (st.renderMode === 'wav' || st.renderMode === 'native') {
                this.app.synthSequencer.renderMode = st.renderMode;
                this.app.synthSequencer._wavKey = null;
                if (st.renderMode === 'wav') {
                    this.app.synthSequencer._ensureWavBuffer();
                }
            }
            if (this.app.synthSequencer._updateRenderToggleUI) {
                this.app.synthSequencer._updateRenderToggleUI();
            }
        }

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

        for (let i = 0; i < (data.drumPads || []).length && i < this.app.drumPads.length; i++) {
            const src = data.drumPads[i];
            const pad = this.app.drumPads[i];
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
                    const buf = await this._base64WavToAudioBuffer(src.sampleWavBase64, audioCtx);
                    pad.sample = buf;
                } catch (err) {
                    console.warn('Failed to decode pad', i, err);
                }
            }
        }

        if (data.synthVoice && this.app.tracks) {
            const normVoice = (window.Voice && Voice.applyDefaults)
                ? Voice.applyDefaults(data.synthVoice)
                : { ...data.synthVoice };

            this.app.tracks.tracks.forEach(track => {
                track.clips.forEach(clip => {
                    if (clip.type !== 'pattern') return;
                    if (clip.pattern?.kind !== 'synth') return;

                    const existingFx = clip.synthVoice?.effects || {};
                    const existingFxStates = clip.synthVoice?.effectStates || {};

                    clip.synthVoice = Object.assign({}, normVoice, {
                        sampleBuffer: null,
                        effects: Object.assign({}, existingFx),
                        effectStates: JSON.parse(JSON.stringify(existingFxStates)),
                        _shapeVersion: 3,
                    });

                    clip._synthFxChain = null;
                });
            });
        }

        if (this.app.patterns) {
            this.app.patterns.patterns = JSON.parse(JSON.stringify(data.patterns || {}));
            this.app.patterns.saveAll();
            this.app.patterns.updatePatternList();
        }

        if (Array.isArray(data.userTones) && window.toneLibrary) {
            const tl = window.toneLibrary;

            const existingByName = new Map();
            (tl.user || []).forEach(p => existingByName.set(p.name, p));

            data.userTones.forEach(incoming => {
                if (!incoming || typeof incoming !== 'object') return;
                if (!incoming.name) return;
                existingByName.set(incoming.name, incoming);
            });

            tl.user = Array.from(existingByName.values());
            tl._saveUserToStorage();
            tl._rebuildIndexes();
            tl._emit();

            if (this.app.tonePicker && this.app.tonePicker.el && this.app.tonePicker.el.classList.contains('show')) {
                this.app.tonePicker._populateCategories();
                this.app.tonePicker._renderList();
            }

            console.log(`Restored ${data.userTones.length} user tone(s) from project.`);
        }

        if (this.app.tracks) {
            const tracks = this.app.tracks;
            tracks.tracks = [];
            tracks.nextTrackId = 1;
            tracks._trackNodes = new Map();

            for (const src of (data.tracks || [])) {
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
                    const clip = {
                        id: c.id,
                        type: c.type || 'audio',
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
                            grid: c.pattern.grid.map(row => row.map(cell => {
                                const base = {
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
                                };
                                return base;
                            })),
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
                                sample: this.app.drumPads[padRef]?.sample || null,
                            };
                        });
                        if (c.synthVoice) {
                            clip.synthVoice = {
                                ...c.synthVoice,
                                effects: { ...(c.synthVoice.effects || {}) },
                                effectStates: JSON.parse(JSON.stringify(c.synthVoice.effectStates || {})),
                                sampleBuffer: null,
                            };
                            if (clip.synthVoice.samplePadRef != null) {
                                clip.synthVoice.sampleBuffer =
                                    this.app.drumPads[clip.synthVoice.samplePadRef]?.sample || null;
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
        }

        if (window.ClipFreezer && this.app.tracks) {
            const bpm = this.app.project?.bpm || 120;
            const wavClips = [];
            this.app.tracks.tracks.forEach(track => {
                track.clips.forEach(clip => {
                    if (clip.type === 'pattern' && clip.mode === 'wav') {
                        wavClips.push(clip);
                    }
                });
            });
            if (wavClips.length) {
                console.log(`[import] Re-rendering ${wavClips.length} WAV clip(s)…`);
                wavClips.forEach(clip => {
                    window.ClipFreezer.scheduleRefresh(clip, bpm);
                });
            }
        }

        if (this.app.patterns) this.app.patterns.updatePatternInfo();
        if (this.app.updateStatusDisplay) this.app.updateStatusDisplay();
    }

    async exportProjectWAV() {
        const app = this.app;
        const notify = (msg) => {
            let el = document.getElementById('daw-toast');
            if (!el) {
                el = document.createElement('div');
                el.id = 'daw-toast';
                el.className = 'daw-toast';
                document.body.appendChild(el);
            }
            el.textContent = msg;
            el.classList.add('show');
        };
        const hideToast = () => {
            const el = document.getElementById('daw-toast');
            if (el) el.classList.remove('show');
        };

        notify('Rendering project…');

        const tracks = app.tracks?.tracks || [];
        if (!tracks.length) {
            alert('No tracks to export.');
            hideToast();
            return;
        }

        let maxEnd = 0;
        for (const track of tracks) {
            for (const clip of track.clips) {
                const end = clip.startTime + clip.duration;
                if (end > maxEnd) maxEnd = end;
            }
        }
        if (maxEnd <= 0) {
            alert('No clips to export.');
            hideToast();
            return;
        }
        const tailSeconds = 3.0;
        const totalDuration = maxEnd + tailSeconds;

        const liveCtx = app.audioEngine?.ctx;
        const sampleRate = liveCtx?.sampleRate || 44100;

        const wasPlaying = !!(app.tracks?.isPlaying);

        try {
            if (app.tracks?.isPlaying) app.tracks.stop();
            if (app.sequencer?.isPlaying) app.sequencer.stop();
            if (app.synthSequencer?.isPlaying) app.synthSequencer.stop();
            if (app.transport?.isPlaying) app.transport.stop();
            if (liveCtx && liveCtx.state === 'running') {
                await liveCtx.suspend();
            }
        } catch (err) {
            console.warn('Failed to suspend live context:', err);
        }

        try {
            const offlineCtx = new OfflineAudioContext(
                2,
                Math.max(1, Math.ceil(sampleRate * totalDuration)),
                sampleRate
            );

            const masterGain = offlineCtx.createGain();
            masterGain.gain.value = 1.0;

            const masterFx = (typeof Scheduler !== 'undefined' && Scheduler.buildMasterFxChain)
                ? Scheduler.buildMasterFxChain(offlineCtx, app.audioEngine.activeEffects, app.audioEngine.effectStates)
                : null;

            const masterPanner = offlineCtx.createStereoPanner();
            masterPanner.pan.value = app.audioEngine.params.masterPan || 0;

            if (masterFx) {
                masterGain.connect(masterFx.input);
                masterFx.output.connect(masterPanner);
            } else {
                masterGain.connect(masterPanner);
            }
            masterPanner.connect(offlineCtx.destination);

            const synthBusGain = offlineCtx.createGain();
            synthBusGain.gain.value = app.audioEngine.params.synthVolume ?? 1;
            synthBusGain.connect(masterGain);

            const drumBusGain = offlineCtx.createGain();
            drumBusGain.gain.value = app.audioEngine.params.drumVolume ?? 1;
            drumBusGain.connect(masterGain);

            masterGain.gain.value = app.audioEngine.params.masterVolume ?? 0.8;

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

                for (const clip of track.clips) {
                    if (clip.muted) continue;

                    try {
                        if (clip.type === 'pattern' && clip.pattern) {
                            const destNode = clip.pattern.kind === 'synth'
                                ? synthBusGain
                                : drumBusGain;
                            trackPanner.connect(destNode);

                            if (clip.pattern.kind === 'synth') {
                                const fxChain = (typeof Scheduler !== 'undefined' && Scheduler.buildSynthClipFxChain)
                                    ? Scheduler.buildSynthClipFxChain(offlineCtx, clip.synthVoice)
                                    : null;
                                Scheduler.scheduleSynthPatternClip(
                                    offlineCtx, clip, track, destNode,
                                    {
                                        startOffset: 0,
                                        now: 0,
                                        bpm: app.project?.bpm || 120,
                                        fxChain,
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
                                            ? Scheduler.buildPadFxChain(offlineCtx, effects, states)
                                            : null;
                                        padFxChains[padIndex] = chain;
                                    }
                                }
                                Scheduler.schedulePatternClip(
                                    offlineCtx, clip, track, destNode,
                                    {
                                        startOffset: 0,
                                        now: 0,
                                        bpm: app.project?.bpm || 120,
                                        padFxChains,
                                        soloActive: anySolo,
                                    }
                                );
                            }
                        } else {
                            trackPanner.connect(masterGain);
                            this._scheduleAudioClipOffline(offlineCtx, clip, trackPanner, 0);
                        }
                    } catch (err) {
                        console.warn('Failed to schedule clip for export:', clip.id, err);
                    }
                }
            }

            const rendered = await offlineCtx.startRendering();
            const quality = app.project?.wavQuality || 16;
            const wavBlob = this._audioBufferToWavBlob(rendered, quality);
            const suffix = quality === 32 ? '_studio_32f' : '';
            const filename = this._safeFileName(app.project?.name || 'project') + suffix + '.wav';
            this._downloadBlob(wavBlob, filename);
        } catch (err) {
            console.error('WAV export failed:', err);
            alert('WAV export failed: ' + err.message);
        } finally {
            try {
                if (liveCtx && liveCtx.state === 'suspended') {
                    await liveCtx.resume();
                }
                if (wasPlaying && app.tracks) {
                    app.tracks.playheadPosition = 0;
                    app.tracks.play();
                }
            } catch (err) {
                console.warn('Failed to restore playback:', err);
            }
            hideToast();
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

    async _audioBufferToBase64WavAsync(buffer, bitDepth = 16) {
        const wavBlob = this._audioBufferToWavBlob(buffer, bitDepth);
        return await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const dataUrl = reader.result;
                const base64 = dataUrl.split(',')[1];
                resolve(base64);
            };
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
            for (let i = 0; i < numFrames; i++) {
                for (let c = 0; c < numChannels; c++) {
                    view.setFloat32(offset, channels[c][i], true);
                    offset += 4;
                }
            }
        } else {
            for (let i = 0; i < numFrames; i++) {
                for (let c = 0; c < numChannels; c++) {
                    let s = channels[c][i];
                    s = Math.max(-1, Math.min(1, s));
                    const intSample = s < 0 ? s * 0x8000 : s * 0x7FFF;
                    view.setInt16(offset, intSample, true);
                    offset += 2;
                }
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