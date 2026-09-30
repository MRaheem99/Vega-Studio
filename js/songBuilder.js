class SongBuilder {
    constructor(app) {
        this.app = app;
        this.sections = [];
        this.previewPlaying = false;
        this.previewIndex = -1;
        this._previewTimer = null;

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const modal = document.getElementById('song-panel-modal');
                if (modal && modal.classList.contains('show')) {
                    this.closePanel();
                }
            }
        });
    }


    generateSong() {
        const project = this.app.project;
        const genreId = project?.genre;
        if (!genreId) {
            alert('Pick a genre in Settings first.');
            return false;
        }

        const seq = this.app.synthSequencer;
        const sections = window.GenreGenerator.generateSong(genreId, project, {
            steps: 32,
            rows: seq.rows,
            baseMidiNote: seq.baseMidiNote,
            drumPads: this.app.drumPads,
        });

        if (!sections || sections.length === 0) {
            alert('Could not generate song — check genre settings.');
            return false;
        }

        this.sections = sections.map((sec, i) => ({
            id: 'sec_' + Date.now() + '_' + i,
            index: i,
            type: sec.type,
            steps: sec.steps,
            template: sec.template,
            drums:  sec.drums,
            bass:   sec.bass,
            chords: sec.chords,
            melody: sec.melody,
            synth:  sec.synth,
        }));

        const instruments = window.Genres?.getGenre?.(genreId)?.song?.instruments || {};
        this.sections.forEach(sec => {
            sec.presets = {
                bass:   window.GenreGenerator.pickPresetForTrack(genreId, 'bass'),
                chords: window.GenreGenerator.pickPresetForTrack(genreId, 'chords'),
                melody: window.GenreGenerator.pickPresetForTrack(genreId, 'melody'),
            };
        });

        console.log('[SongBuilder] Generated', this.sections.length, 'sections');
        return true;
    }

    regenerateSection(sectionId) {
        const section = this.sections.find(s => s.id === sectionId);
        if (!section) return;

        const project = this.app.project;
        const genreId = project?.genre;
        const seq = this.app.synthSequencer;

        const fresh = window.GenreGenerator.generateSection(genreId, section.type, project, {
            steps: section.steps,
            rows: seq.rows,
            baseMidiNote: seq.baseMidiNote,
            drumPads: this.app.drumPads,
        });

        section.drums  = fresh.drums;
        section.bass   = fresh.bass;
        section.chords = fresh.chords;
        section.melody = fresh.melody;
        section.synth  = fresh.synth;

        this.renderSongPanel();
    }

    clearSong() {
        if (this.sections.length === 0) return;
        if (!confirm('Clear all generated sections?')) return;
        this.sections = [];
        this.stopPreview();
        this.renderSongPanel();
    }

    _regenAllFromUI() {
        if (this.generateSong()) this.renderSongPanel();
    }


    _mergeGrids(...grids) {
        const rows = grids[0].length;
        const steps = grids[0][0].length;
        const out = Array.from({ length: rows }, () =>
            Array.from({ length: steps }, () => ({
                active: false, velocity: 1, probability: 1,
                ratchet: 1, pan: 0, pitch: 0, length: 1,
                attack: null, decay: null, sustain: null, release: null,
            }))
        );
        grids.forEach(grid => {
            for (let r = 0; r < rows; r++) {
                for (let s = 0; s < steps; s++) {
                    const c = grid[r]?.[s];
                    if (c && c.active) out[r][s] = { ...out[r][s], ...c };
                }
            }
        });
        return out;
    }

    previewSection(sectionId) {
        const section = this.sections.find(s => s.id === sectionId);
        if (!section) return;

        if (this.previewPlaying && this.previewIndex === section.index) {
            this.stopPreview();
            return;
        }

        this.stopPreview();

        const drumSeq = this.app.sequencer;
        const synthSeq = this.app.synthSequencer;
        const ae = this.app.audioEngine;

        this._savedDrums = drumSeq.pattern.map(r => r.map(c => drumSeq._normStep(c)));
        this._savedSynth = synthSeq.pattern.map(r => r.map(c => synthSeq._normStep(c)));
        this._savedTone = (this.app.getCurrentTone)
            ? JSON.parse(JSON.stringify(this.app.getCurrentTone()))
            : null;
        this._savedSynthVol = ae?.params?.synthVolume ?? 1;

        if (section.presets?.chords && typeof this.app.loadTone === 'function') {
            const p = section.presets.chords;
            try {
                this.app.loadTone({ voice: p.voice, effects: p.effects });
            } catch (err) {
                console.warn('[SongBuilder] loadTone chords failed:', err);
            }
        }

        const sectionVol = {
            intro: 0.55, build: 0.65, main: 0.55, verse: 0.55,
            chorus: 0.6, break: 0.6, bridge: 0.55, climax: 0.6, outro: 0.5,
        }[section.type] ?? 0.55;

        if (ae && typeof ae.setSynthVolume === 'function') {
            ae.setSynthVolume(sectionVol);
        }

        const merged = this._mergeGrids(section.bass, section.chords, section.melody);

        drumSeq.pattern = section.drums.map(r => r.map(c => drumSeq._normStep(c)));
        synthSeq.pattern = merged.map(r => r.map(c => synthSeq._normStep(c)));
        drumSeq.render();
        synthSeq.render();
        if (synthSeq.renderMode === 'wav') synthSeq._ensureWavBuffer();

        this.previewPlaying = true;
        this.previewIndex = section.index;

        const bpm = this.app.project?.bpm || 120;
        const durationMs = (section.steps / 4) * (60 / bpm) * 1000;

        drumSeq.start();
        synthSeq.start();

        this._previewTimer = setTimeout(() => {
            this.stopPreview();
        }, durationMs);

        this.renderSongPanel();
    }

    stopPreview() {
        if (this._previewTimer) {
            clearTimeout(this._previewTimer);
            this._previewTimer = null;
        }

        const drumSeq = this.app.sequencer;
        const synthSeq = this.app.synthSequencer;
        const ae = this.app.audioEngine;

        try { drumSeq.stop(); } catch (_) {}
        try { synthSeq.stop(); } catch (_) {}

        if (this._savedDrums) {
            drumSeq.pattern = this._savedDrums;
            drumSeq.render();
            this._savedDrums = null;
        }
        if (this._savedSynth) {
            synthSeq.pattern = this._savedSynth;
            synthSeq.render();
            if (synthSeq.renderMode === 'wav') synthSeq._ensureWavBuffer();
            this._savedSynth = null;
        }

        if (this._savedTone && typeof this.app.loadTone === 'function') {
            try { this.app.loadTone(this._savedTone); } catch (_) {}
        }
        this._savedTone = null;

        if (ae && typeof ae.setSynthVolume === 'function' && this._savedSynthVol != null) {
            try { ae.setSynthVolume(this._savedSynthVol); } catch (_) {}
        }
        this._savedSynthVol = null;

        this.previewPlaying = false;
        this.previewIndex = -1;
        this.renderSongPanel();
    }

    stopPreview() {
        if (this._previewTimer) {
            clearTimeout(this._previewTimer);
            this._previewTimer = null;
        }

        const drumSeq = this.app.sequencer;
        const synthSeq = this.app.synthSequencer;
        const ae = this.app.audioEngine;

        if (this._savedDrums) {
            drumSeq.pattern = this._savedDrums;
            drumSeq.render();
            this._savedDrums = null;
        }
        if (this._savedSynth) {
            synthSeq.pattern = this._savedSynth;
            synthSeq.render();
            if (synthSeq.renderMode === 'wav') synthSeq._ensureWavBuffer();
            this._savedSynth = null;
        }
        if (this._savedTone && typeof this.app.loadTone === 'function') {
            try { this.app.loadTone(this._savedTone); } catch (_) {}
        }
        this._savedTone = null;

        if (ae && typeof ae.setSynthVolume === 'function' && this._savedSynthVol != null) {
            try { ae.setSynthVolume(this._savedSynthVol); } catch (_) {}
        }
        this._savedSynthVol = null;

        drumSeq.stop();
        synthSeq.stop();

        this.previewPlaying = false;
        this.previewIndex = -1;
        this.renderSongPanel();
    }


    editSectionDrums(sectionId) {
        const section = this.sections.find(s => s.id === sectionId);
        if (!section) return;
        const seq = this.app.sequencer;
        const before = seq.pattern.map(r => r.map(c => ({ ...seq._normStep(c) })));
        const after = section.drums.map(r => r.map(c => seq._normStep(c)));
        this.app.history.push({
            label: 'Load section drums',
            do: () => { seq.pattern = after.map(r => r.map(c => ({ ...c }))); seq.render(); },
            undo: () => { seq.pattern = before.map(r => r.map(c => ({ ...c }))); seq.render(); },
        });
        this.app.setMode('sequencer', document.querySelector('.menu-btn[title="Drum Sequencer"]'));
        document.getElementById('song-panel-modal')?.classList.remove('show');
    }

    editSectionSynth(sectionId) {
        const section = this.sections.find(s => s.id === sectionId);
        if (!section) return;
        const seq = this.app.synthSequencer;
        const before = seq.pattern.map(r => r.map(c => ({ ...seq._normStep(c) })));
        const merged = this._mergeGrids(section.bass, section.chords, section.melody);
        const after = merged.map(r => r.map(c => seq._normStep(c)));
        this.app.history.push({
            label: 'Load section synth',
            do: () => {
                seq.pattern = after.map(r => r.map(c => ({ ...c })));
                seq.render();
                if (seq.renderMode === 'wav') seq._ensureWavBuffer();
            },
            undo: () => {
                seq.pattern = before.map(r => r.map(c => ({ ...c })));
                seq.render();
                if (seq.renderMode === 'wav') seq._ensureWavBuffer();
            },
        });
        this.app.setMode('synthseq', document.querySelector('.menu-btn[title="Synth Sequencer"]'));
        document.getElementById('song-panel-modal')?.classList.remove('show');
    }

    async pushToTracks() {
        if (this.sections.length === 0) {
            alert('No song generated yet.');
            return;
        }

        const tracks = this.app.tracks;
        if (!tracks) { alert('Track system not ready.'); return; }

        const bpm = this.app.project?.bpm || 120;

        const findOrCreate = (name, color, type) => {
            let t = tracks.tracks.find(x => x.name === name);
            if (!t) t = tracks._addTrackSilent(name, color, type);
            return t;
        };

        const drumTrack   = findOrCreate('Song Drums',  '#1e88e5', 'drums');
        const bassTrack   = findOrCreate('Song Bass',   '#43a047', 'synth');
        const chordTrack  = findOrCreate('Song Chords', '#fb8c00', 'synth');
        const melodyTrack = findOrCreate('Song Melody', '#e53935', 'synth');

        const synthSeq = this.app.synthSequencer;
        const totalJobs = this.sections.length * 4;

        const overlay = this._showRenderProgress('Preparing render…', 0, totalJobs);
        let done = 0;

        try {
            let cursorSec = 0;

            for (let i = 0; i < this.sections.length; i++) {
                const section = this.sections[i];
                const sectionSec = (section.steps / 4) * (60 / bpm);
                const name = `${i + 1}. ${section.type.toUpperCase()}`;

                const drumData = {
                    kind: 'drums', name: name + ' (Drums)',
                    steps: section.steps, rows: 8, bpm,
                    grid: section.drums.map(r => r.map(c => this.app.sequencer._normStep(c))),
                    padSnapshots: this.app.drumPads.map(pad => ({
                        effects: Object.assign({}, pad.effects || {}),
                        effectStates: JSON.parse(JSON.stringify(pad.effectStates || {})),
                        volume: pad.volume ?? 1, pitch: pad.pitch ?? 0,
                        pan: pad.pan ?? 0, muted: pad.muted ?? false, solo: pad.solo ?? false,
                    })),
                };

                this._updateRenderProgress(overlay, `Rendering ${name} · Drums…`, ++done, totalJobs);
                await this._pushOneWavClip(drumTrack.id, drumData, cursorSec, true);

                const tracksToPush = [
                    { grid: section.bass,   preset: section.presets?.bass,   label: 'Bass',   track: bassTrack },
                    { grid: section.chords, preset: section.presets?.chords, label: 'Chords', track: chordTrack },
                    { grid: section.melody, preset: section.presets?.melody, label: 'Melody', track: melodyTrack },
                ];

                for (const { grid, preset, label, track } of tracksToPush) {
                    const voice = preset?.voice || {};
                    const fx = preset?.effects || { active: {}, states: {} };
                    const soundProfile = Object.assign({}, voice, {
                        effects: Object.assign({}, fx.active),
                        effectStates: JSON.parse(JSON.stringify(fx.states || {})),
                    });

                    const synthData = {
                        kind: 'synth', name: name + ' (' + label + ')',
                        steps: section.steps, rows: synthSeq.rows, bpm,
                        baseMidiNote: synthSeq.baseMidiNote,
                        octave: Math.floor(synthSeq.baseMidiNote / 12) - 1,
                        grid: grid.map(r => r.map(c => synthSeq._normStep(c))),
                        soundProfile,
                        renderMode: 'wav',
                    };

                    this._updateRenderProgress(overlay, `Rendering ${name} · ${label}…`, ++done, totalJobs);
                    await this._pushOneWavClip(track.id, synthData, cursorSec, false);
                }

                cursorSec += sectionSec;
            }

            if (this.app.patterns) {
                this.app.patterns.saveAll();
                this.app.patterns.updatePatternList();
            }

            this._hideRenderProgress(overlay, true);

            const tracksBtn = document.querySelector('.menu-btn[title="Tracks"]');
            this.app.showPanel('tracks', tracksBtn);
            tracks.playheadPosition = 0;
            tracks.renderTracks();

            setTimeout(() => {
                alert(`✅ Pushed ${this.sections.length} sections across 4 tracks.\nDuration: ~${cursorSec.toFixed(1)}s.`);
            }, 200);

        } catch (err) {
            console.error('[SongBuilder] pushToTracks failed:', err);
            this._hideRenderProgress(overlay, false);
            alert('Push to tracks failed: ' + (err.message || err));
        }
    }

    /**
     * Push a single pattern as a WAV clip.
     * Rendering is done by ClipFreezer (with audioCache persistent layer).
     */
    async _pushOneWavClip(trackId, patternData, timeSec, fromDrums) {
        const tracks = this.app.tracks;
        const bpm = patternData.bpm || this.app.project?.bpm || 120;
        const steps = patternData.steps || 16;
        const duration = (steps / 4) * (60 / bpm);

        const normUniversal = (cell) => {
            if (cell && typeof cell === 'object') {
                return {
                    active: !!cell.active,
                    velocity: typeof cell.velocity === 'number' ? cell.velocity : 1,
                    probability: typeof cell.probability === 'number' ? cell.probability : 1,
                    ratchet: typeof cell.ratchet === 'number' ? cell.ratchet : 1,
                    pan: typeof cell.pan === 'number' ? cell.pan : 0,
                    pitch: typeof cell.pitch === 'number' ? Math.round(cell.pitch) : 0,
                    length: typeof cell.length === 'number' && cell.length >= 1
                        ? Math.round(cell.length) : 1,
                    attack: (typeof cell.attack === 'number' && isFinite(cell.attack)) ? cell.attack : null,
                    decay: (typeof cell.decay === 'number' && isFinite(cell.decay)) ? cell.decay : null,
                    sustain: (typeof cell.sustain === 'number' && isFinite(cell.sustain)) ? cell.sustain : null,
                    release: (typeof cell.release === 'number' && isFinite(cell.release)) ? cell.release : null,
                };
            }
            return {
                active: !!cell, velocity: 1, probability: 1,
                ratchet: 1, pan: 0, pitch: 0, length: 1,
                attack: null, decay: null, sustain: null, release: null,
            };
        };
        const frozenGrid = patternData.grid.map(row => row.map(normUniversal));

        const clip = {
            id: Date.now() + Math.random(),
            type: 'pattern',
            mode: 'wav',
            name: patternData.name,
            pattern: {
                grid: frozenGrid,
                steps,
                bpm,
                kind: patternData.kind || 'drums',
                baseMidiNote: Number.isFinite(patternData.baseMidiNote)
                    ? patternData.baseMidiNote
                    : (patternData.octave != null ? (patternData.octave + 1) * 12 : 60),
                octave: patternData.octave ?? 4,
                sourceName: patternData.name || null,
            },
            padSnapshots: fromDrums ? this.app.drumPads.map(pad => ({
                effects: Object.assign({}, pad.effects || {}),
                effectStates: JSON.parse(JSON.stringify(pad.effectStates || {})),
                volume: pad.volume ?? 1,
                pitch: pad.pitch ?? 0,
                pan: pad.pan ?? 0,
                muted: pad.muted ?? false,
                solo: pad.solo ?? false,
                sample: pad.sample,
            })) : null,
            startTime: Math.max(0, timeSec),
            duration,
            offset: 0,
            loop: true,
            loopStart: 0,
            loopEnd: duration,
            volume: fromDrums ? 1.0 : 0.75,
            pan: 0,
            speed: 1,
            muted: false,
            envelope: [
                { time: 0, value: 1 },
                { time: duration, value: 1 },
            ],
            _frozen: null,
        };

        if (!fromDrums && patternData.soundProfile) {
            const prof = patternData.soundProfile;
            const voiceEffects = prof.effects || {};
            const voiceEffectStates = prof.effectStates || {};
            const voiceOnly = {};
            Object.keys(prof).forEach(k => {
                if (k === 'effects' || k === 'effectStates') return;
                voiceOnly[k] = prof[k];
            });
            const completeVoice = (window.Voice && Voice.applyDefaults)
                ? Voice.applyDefaults(voiceOnly)
                : Object.assign({}, voiceOnly);

            clip.synthVoice = Object.assign({}, completeVoice, {
                sampleBuffer: null,
                effects: Object.assign({}, voiceEffects),
                effectStates: JSON.parse(JSON.stringify(voiceEffectStates)),
                _shapeVersion: 3,
            });
        }

        const self = this;
        const track = tracks.getTrack(trackId);
        if (!track) return;

        this.app.history.push({
            label: 'Add Pattern WAV Clip',
            do: () => {
                if (!track.clips.find(c => c.id === clip.id)) {
                    track.clips.push(clip);
                    tracks.sortClips(track);
                    tracks.renderTracks({ trackId });
                }
                if (window.ClipFreezer) {
                    window.ClipFreezer.freeze(clip, bpm).then(() => {
                        tracks.renderTracks({ trackId });
                    }).catch(err => console.warn('[SongBuilder] freeze failed:', err));
                }
            },
            undo: () => {
                track.clips = track.clips.filter(c => c.id !== clip.id);
                if (window.ClipFreezer) window.ClipFreezer.dispose(clip);
                tracks.renderTracks({ trackId });
            },
        });

        track.clips.push(clip);
        tracks.sortClips(track);
        tracks.renderTracks({ trackId });

        if (window.ClipFreezer) {
            try {
                const buf = await window.ClipFreezer.freeze(clip, bpm);
                if (buf) tracks.renderTracks({ trackId });
            } catch (err) {
                console.warn('[SongBuilder] freeze failed for', patternData.name, err);
            }
        }
    }
    
    _showRenderProgress(label, current, total) {
        let el = document.getElementById('render-progress-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'render-progress-overlay';
            el.style.cssText = `
                position: fixed; top: 60px; right: 16px; z-index: 9999;
                background: rgba(20,20,20,0.95); border: 1px solid #00e676;
                border-radius: 8px; padding: 12px 16px; color: #fff;
                font-size: 12px; min-width: 220px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            `;
            el.innerHTML = `
                <div id="rp-label" style="margin-bottom:6px;">Rendering…</div>
                <div style="background:#333;height:5px;border-radius:3px;overflow:hidden;">
                    <div id="rp-bar" style="background:#00e676;height:100%;width:0%;transition:width 0.2s;"></div>
                </div>
                <div id="rp-count" style="margin-top:6px;font-size:10px;color:#888;"></div>
            `;
            document.body.appendChild(el);
        }
        this._updateRenderProgress(el, label, current, total);
        return el;
    }

    _updateRenderProgress(el, label, current, total) {
        if (!el) return;
        const lbl = el.querySelector('#rp-label');
        const bar = el.querySelector('#rp-bar');
        const cnt = el.querySelector('#rp-count');
        if (lbl) lbl.textContent = label;
        if (bar) bar.style.width = Math.round((current / total) * 100) + '%';
        if (cnt) cnt.textContent = `${current} / ${total}`;
    }

    _hideRenderProgress(el, success) {
        if (!el) return;
        if (success) {
            el.querySelector('#rp-label').textContent = '✓ Done';
            el.querySelector('#rp-bar').style.background = '#00e676';
        }
        setTimeout(() => { try { el.remove(); } catch (_) {} }, 600);
    }


    openPanel() {
        const modal = document.getElementById('song-panel-modal');
        if (!modal) return;
        modal.classList.add('show');
        this.renderSongPanel();
    }

    closePanel() {
        const modal = document.getElementById('song-panel-modal');
        if (modal) modal.classList.remove('show');
        this.stopPreview();
    }

    renderSongPanel() {
        const container = document.getElementById('song-sections-list');
        if (!container) return;

        if (this.sections.length === 0) {
            container.innerHTML = `
                <div class="song-empty">
                    <i class="fa-solid fa-music"></i>
                    <p>No song yet. Click <strong>🎲 Regenerate All</strong> to build sections.</p>
                </div>`;
            return;
        }

        const bpm = this.app.project?.bpm || 120;

        container.innerHTML = this.sections.map((sec, i) => {
            const secSec = ((sec.steps / 4) * (60 / bpm)).toFixed(1);
            const isPlaying = this.previewPlaying && this.previewIndex === i;

            const presetName = (p) => p ? p.name : '—';

            return `
                <div class="song-section ${isPlaying ? 'playing' : ''}" data-id="${sec.id}">
                    <div class="song-section-header">
                        <span class="song-section-index">${i + 1}</span>
                        <span class="song-section-type">${sec.type.toUpperCase()}</span>
                        <span class="song-section-info">${sec.steps} steps · ~${secSec}s</span>
                    </div>
                    <div class="song-section-tracks">
                        <div class="song-track-row">
                            <span class="song-track-label"><i class="fa-solid fa-drum"></i> Drums</span>
                            <span class="song-track-preset">Default Kit</span>
                        </div>
                        <div class="song-track-row">
                            <span class="song-track-label"><i class="fa-solid fa-wave-square"></i> Bass</span>
                            <span class="song-track-preset">${presetName(sec.presets?.bass)}</span>
                        </div>
                        <div class="song-track-row">
                            <span class="song-track-label"><i class="fa-solid fa-piano"></i> Chords</span>
                            <span class="song-track-preset">${presetName(sec.presets?.chords)}</span>
                        </div>
                        <div class="song-track-row">
                            <span class="song-track-label"><i class="fa-solid fa-music"></i> Melody</span>
                            <span class="song-track-preset">${presetName(sec.presets?.melody)}</span>
                        </div>
                    </div>
                    <div class="song-section-actions">
                        <button class="song-btn play" data-action="play" data-id="${sec.id}" title="Preview">
                            <i class="fa-solid ${isPlaying ? 'fa-stop' : 'fa-play'}"></i>
                        </button>
                        <button class="song-btn" data-action="edit-drums" data-id="${sec.id}" title="Edit Drums">
                            <i class="fa-solid fa-drum"></i>
                        </button>
                        <button class="song-btn" data-action="edit-synth" data-id="${sec.id}" title="Edit Synth">
                            <i class="fa-solid fa-wave-square"></i>
                        </button>
                        <button class="song-btn" data-action="regen" data-id="${sec.id}" title="Regenerate">
                            <i class="fa-solid fa-dice"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        container.querySelectorAll('.song-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const id = btn.dataset.id;
                switch (action) {
                    case 'play':
                        if (this.previewPlaying && this.previewIndex === this.sections.findIndex(s => s.id === id)) {
                            this.stopPreview();
                        } else {
                            this.previewSection(id);
                        }
                        break;
                    case 'edit-drums': this.editSectionDrums(id); break;
                    case 'edit-synth': this.editSectionSynth(id); break;
                    case 'regen':      this.regenerateSection(id); break;
                }
            });
        });
    }
}

window.SongBuilder = SongBuilder;