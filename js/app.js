const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

(function installSafetyNets() {
    let lastToast = 0;
    const THROTTLE_MS = 3000;

    const showError = (msg) => {
        const now = Date.now();
        if (now - lastToast < THROTTLE_MS) return;
        lastToast = now;
        try {
            let el = document.getElementById('daw-toast');
            if (!el) {
                el = document.createElement('div');
                el.id = 'daw-toast';
                el.className = 'daw-toast';
                document.body.appendChild(el);
            }
            el.textContent = '⚠ ' + msg;
            el.classList.add('show');
            setTimeout(() => el.classList.remove('show'), 4000);
        } catch (_) {}
    };

    window.addEventListener('error', (e) => {
        console.error('[uncaught]', e.error || e.message);
        showError(e.message || 'Unexpected error');
    });

    window.addEventListener('unhandledrejection', (e) => {
        console.error('[promise]', e.reason);
        showError((e.reason && e.reason.message) || 'Async error');
    });
})();

(function installSequencerShortcuts() {
    document.addEventListener('keydown', (e) => {
        const tag = (e.target?.tagName || '').toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
        if (e.target?.closest?.('.modal-overlay, .fx-editor-modal, .step-context-menu')) return;

        const seq = (window.app?.currentMode === 'synthseq')
            ? window.app?.synthSequencer
            : window.app?.sequencer;
        const sel = seq?.selection;
        if (!sel) return;

        const mod = e.ctrlKey || e.metaKey;

        if (mod && e.key.toLowerCase() === 'c') {
            if (sel.selected.size > 0) {
                sel.copy();
            } else {
                app.stepContextMenu?._copyFocusedStep?.(seq);
            }
            e.preventDefault();
            return;
        }
        if (mod && e.key.toLowerCase() === 'x') {
            if (sel.selected.size > 0) {
                sel.cut();
            } else {
                app.stepContextMenu?._cutFocusedStep?.(seq);
            }
            e.preventDefault();
            return;
        }
        if (mod && e.key.toLowerCase() === 'v') {
            if (sel.selected.size > 0) {
                const at = sel.lastMouseCell;
                sel.paste(at?.r, at?.s);
            } else {
                app.stepContextMenu?._pasteFocusedStep?.(seq);
            }
            e.preventDefault();
            return;
        }
        if (mod && e.key.toLowerCase() === 'a') { sel.selectAll(); e.preventDefault(); return; }
        if ((e.key === 'Delete' || e.key === 'Backspace') && sel.selected.size > 0) {
            sel.delete();
            e.preventDefault();
            return;
        }
        if (e.key === 'Escape') {
            if (sel.selected.size > 0) { sel.clear(); e.preventDefault(); }
            return;
        }

        if (sel.selected.size > 0) {
            const shift = e.shiftKey;
            const dup = e.altKey;
            let dR = 0, dS = 0;
            if (e.key === 'ArrowUp')    dR = -1;
            else if (e.key === 'ArrowDown')  dR = 1;
            else if (e.key === 'ArrowLeft')  dS = -1;
            else if (e.key === 'ArrowRight') dS = 1;
            else return;

            if (shift) {
                const b = sel.getBounds();
                if (b) {
                    if (dR < 0) sel.selectRange(b.rMin - 1, b.sMin, b.rMax, b.sMax, true);
                    else if (dR > 0) sel.selectRange(b.rMin, b.sMin, b.rMax + 1, b.sMax, true);
                    else if (dS < 0) sel.selectRange(b.rMin, b.sMin - 1, b.rMax, b.sMax, true);
                    else if (dS > 0) sel.selectRange(b.rMin, b.sMin, b.rMax, b.sMax + 1, true);
                }
            } else {
                sel.moveBy(dR, dS, dup);
            }
            e.preventDefault();
        }
    });
})();

const configMap = {
    adsr: {
        labels: {
            attack: 'Attack',
            decay: 'Decay',
            sustain: 'Sustain',
            release: 'Release'
        },
        ranges: {
            attack: [0.01, 2, 0.001],
            decay: [0.01, 2, 0.001],
            sustain: [0, 1, 0.01],
            release: [0.01, 5, 0.001]
        }
    },
    echo: {
        labels: {
            time: 'Time (s)',
            width: 'Width',
            feedback: 'Feedback',
            mix: 'Mix',
            filter: 'Damping',
            modulationRate: 'Wobble',
            modulationDepth: 'Tape',
            pingpong: 'PingPong'
        },
        ranges: {
            time: [0.05, 1.2, 0.005],
            width: [0, 0.2, 0.002],
            feedback: [0, 0.9, 0.01],
            mix: [0, 1, 0.01],
            filter: [200, 10000, 100],
            modulationRate: [0.05, 5, 0.05],
            modulationDepth: [0, 0.003, 0.0001],
            pingpong: [0, 1, 1]
        }
    },
    reverb: {
        labels: {
            decay: 'Decay',
            mix: 'Mix'
        },
        ranges: {
            decay: [0.1, 5, 0.1],
            mix: [0, 1, 0.01]
        }
    },
    chorus: {
        labels: {
            rate: 'Rate',
            depth: 'Depth',
            mix: 'Mix'
        },
        ranges: {
            rate: [0.1, 20, 0.1],
            depth: [0.0001, 0.01, 0.0001],
            mix: [0, 1, 0.01]
        }
    },
    flanger: {
        labels: {
            rate: 'Rate',
            depth: 'Depth',
            mix: 'Mix'
        },
        ranges: {
            rate: [0.1, 20, 0.1],
            depth: [0.0001, 0.01, 0.0001],
            mix: [0, 1, 0.01]
        }
    },
    equalizer: {
        labels: {
            band1: '60Hz',
            band2: '250Hz',
            band3: '1kHz',
            band4: '4kHz',
            band5: '16kHz'
        },
        ranges: {
            band1: [-20, 20, 1],
            band2: [-20, 20, 1],
            band3: [-20, 20, 1],
            band4: [-20, 20, 1],
            band5: [-20, 20, 1]
        },
        vertical: true
    },
    distortion: {
        labels: {
            drive: 'Drive',
            mix: 'Mix'
        },
        ranges: {
            drive: [0, 100, 1],
            mix: [0, 1, 0.01]
        }
    },
    compressor: {
        labels: {
            threshold: 'Thresh',
            ratio: 'Ratio',
            attack: 'Attack',
            release: 'Release'
        },
        ranges: {
            threshold: [-60, 0, 1],
            ratio: [1, 20, 1],
            attack: [0.001, 1, 0.001],
            release: [0.01, 2, 0.01]
        }
    },
    vibrato: {
        labels: {
            rate: 'Rate',
            depth: 'Depth'
        },
        ranges: {
            rate: [0.1, 20, 0.1],
            depth: [0, 100, 1]
        }
    },
    bitcrusher: {
        labels: {
            bits: 'Bits',
            normFreq: 'Freq',
            mix: 'Mix'
        },
        ranges: {
            bits: [1, 16, 1],
            normFreq: [0.01, 1, 0.01],
            mix: [0, 1, 0.01]
        }
    },
    phaser: {
        labels: {
            rate: 'Rate',
            depth: 'Depth',
            feedback: 'Feed',
            mix: 'Mix'
        },
        ranges: {
            rate: [0.1, 10, 0.1],
            depth: [0.1, 1, 0.01],
            feedback: [0, 0.9, 0.01],
            mix: [0, 1, 0.01]
        }
    }
};

const app = {
    tracks: null,
    songBuilder: null,
    pianoOffset: 0,
    pianoMaxScroll: 0,
    currentOctave: 4,
    minOctave: 1,
    maxOctave: 6,
    sliders: {},
    audioEngine: new AudioEngine(),
    activeKeys: new Set(),
    pointerKeys: new Map(),
    currentMode: 'synth',
    sequencerSubMode: 'synth',
    currentPadIndex: 0,
    currentPadName: null,
    displayMode: 'status',
    lastPressedKey: '-',
    samplesLoaded: false,

    autoScrollIntoView: (() => {
        const v = localStorage.getItem('mrsm_auto_scroll');
        return v === null ? true : v === '1';
    })(),

    openTrackManager(trackId) {
        this.tracks.openTrackManager(trackId);
    },

    closeTrackManager() {
        this.tracks.closeTrackManager();
    },

    updateTrackColor(trackId, color) {
        this.tracks.updateTrackColor(trackId, color);
    },

    updateTrackVolume(trackId, val) {
        this.tracks.updateTrackVolume(trackId, val);
    },

    updateTrackPan(trackId, val) {
        this.tracks.updateTrackPan(trackId, val);
    },

    async importPatternWavToTrack(patternName, wavBlob) {
        if (this.tracks) {
            return await this.tracks.importPatternWav(patternName, wavBlob);
        }
        return false;
    },

    importSampleToTrack(trackId = null) {
        if (this.tracks) {
            this.tracks.importSample(trackId);
        }
    },

    openClipManager(trackId, clipId) {
        if (this.tracks) {
            this.tracks.openClipManager(trackId, clipId);
        }
    },

    closeClipManager() {
        if (this.tracks) {
            this.tracks.closeClipManager();
        }
    },

    splitClip() {
        if (this.tracks) {
            this.tracks.splitClip();
        }
    },

    duplicateClip() {
        if (this.tracks) {
            this.tracks.duplicateClip();
        }
    },

    deleteClip() {
        if (this.tracks) {
            this.tracks.deleteClip();
        }
    },

    toggleTrackMute(trackId) {
        if (this.tracks) {
            this.tracks.toggleMute(trackId);
        }
    },

    toggleTrackSolo(trackId) {
        if (this.tracks) {
            this.tracks.toggleSolo(trackId);
        }
    },

    toggleClipLoop() {
        if (this.tracks) this.tracks.toggleClipLoop();
    },

    toggleClipMute() {
        if (this.tracks) this.tracks.toggleClipMute();
    },

    importAudioFile() {
        if (this.tracks) this.tracks.importAudioFile();
    },

    async exportPatternToWav(pattern, bpm, padSamples, padConfigs = []) {
        if (this.sequencer && typeof this.sequencer.exportPatternToWav === 'function') {
            return await this.sequencer.exportPatternToWav(pattern, bpm, padSamples, padConfigs);
        }
        console.warn('exportPatternToWav: sequencer not ready');
        return null;
    },

    exportTrack() {
        console.log('Export track not yet implemented');
    },

    _getGenreProfile() {
        const genreId = this.project?.genre || 'house';
        const g = window.Genres?.getGenre(genreId);
        return g || null;
    },

    _applyDrumGrid(grid) {
        const seq = this.sequencer;
        if (!seq) return;

        const before = seq.pattern.map(row => row.map(cell => seq._normStep(cell)));
        const after = grid.map(row => row.map(cell => seq._normStep(cell)));

        const apply = (snapshot) => {
            seq.pattern = snapshot.map(row => row.map(c => ({ ...c })));
            seq.render();
            if (this.patterns) this.patterns.updatePatternInfo();
        };

        this.history.push({
            label: 'Generate Drums',
            do: () => apply(after),
            undo: () => apply(before),
        });
    },

    _applySynthGrid(grid) {
        const seq = this.synthSequencer;
        if (!seq) return;

        const before = seq.pattern.map(row => row.map(cell => seq._normStep(cell)));
        const after = grid.map(row => row.map(cell => seq._normStep(cell)));

        const apply = (snapshot) => {
            seq.pattern = snapshot.map(row => row.map(c => ({ ...c })));
            seq.render();
            if (this.patterns) this.patterns.updatePatternInfo();
        };

        this.history.push({
            label: 'Generate Synth',
            do: () => apply(after),
            undo: () => apply(before),
        });
    },

    generateDrumsFromGenre() {
        if (!this.project) return;
        const genreId = this.project.genre;
        if (!genreId) { alert('Pick a genre in Settings first.'); return; }

        const grid = window.GenreGenerator.generateBeat(genreId, {
            steps: this.sequencer.steps,
            drumPads: this.drumPads,
            padCount: 8,
            variationAmount: 0.15,
        });
        this._applyDrumGrid(grid);
        this.setMode('sequencer', document.querySelector('.menu-btn[title="Drum Sequencer"]'));
    },

    generateMelodyFromGenre() {
        if (!this.project) return;
        const genreId = this.project.genre;
        if (!genreId) { alert('Pick a genre in Settings first.'); return; }

        const seq = this.synthSequencer;
        const grid = window.GenreGenerator.generateMelody(genreId, this.project, {
            steps: seq.steps,
            rows: seq.rows,
            baseMidiNote: seq.baseMidiNote,
            variation: 1,
        });
        this._applySynthGrid(grid);
        this.setMode('synthseq', document.querySelector('.menu-btn[title="Synth Sequencer"]'));
    },

    generateChordsFromGenre() {
        if (!this.project) return;
        const genreId = this.project.genre;
        if (!genreId) { alert('Pick a genre in Settings first.'); return; }

        const seq = this.synthSequencer;
        const grid = window.GenreGenerator.generateChords(genreId, this.project, {
            steps: seq.steps,
            rows: seq.rows,
            baseMidiNote: seq.baseMidiNote,
        });
        this._applySynthGrid(grid);
        this.setMode('synthseq', document.querySelector('.menu-btn[title="Synth Sequencer"]'));
    },

    generateFullSong() {
        if (!this.project) return;
        const genreId = this.project.genre;
        if (!genreId) { alert('Pick a genre in Settings first.'); return; }

        if (this.songBuilder) {
            if (this.songBuilder.generateSong()) {
                this.songBuilder.openPanel();
                return;
            }
        }

        const drumGrid = window.GenreGenerator.generateBeat(genreId, {
            steps: this.sequencer.steps,
            drumPads: this.drumPads,
            padCount: 8,
            variationAmount: 0.15,
        });
        this._applyDrumGrid(drumGrid);

        const synthSeq = this.synthSequencer;
        const synthGrid = window.GenreGenerator.generateFullSynth(genreId, this.project, {
            steps: synthSeq.steps,
            rows: synthSeq.rows,
            baseMidiNote: synthSeq.baseMidiNote,
        });
        this._applySynthGrid(synthGrid);

        const drumBtn = document.querySelector('.menu-btn[title="Drum Sequencer"]');
        this.setMode('sequencer', drumBtn);
    },

    drumPads: new Array(8).fill(null).map(() => ({
        sample: null,
        fileName: null,
        fxProcessor: null,
        volume: 1,
        pitch: 0,
        solo: false,
        muted: false,
        effects: {
            echo: false,
            reverb: false,
            chorus: false,
            flanger: false,
            equalizer: false,
            distortion: false,
            compressor: false,
            bitcrusher: false,
            phaser: false,
            adsr: false
        },
        effectStates: JSON.parse(JSON.stringify({
            echo: { time: 0.375, width: 0.05, feedback: 0.45, mix: 0.4, filter: 3500, modulationRate: 0.25, modulationDepth: 0.0008, pingpong: 1 },
            reverb: { decay: 2, mix: 0.4 },
            chorus: { rate: 1.5, depth: 0.003, mix: 0.6, type: "chorus" },
            flanger: { rate: 0.5, depth: 0.002, mix: 0.7, type: "flanger" },
            equalizer: { band1: 0, band2: 0, band3: 0, band4: 0, band5: 0 },
            distortion: { drive: 50, mix: 0.8 },
            compressor: { threshold: -24, ratio: 12, attack: 0.003, release: 0.25 },
            bitcrusher: { bits: 8, normFreq: 0.1, mix: 0.8 },
            phaser: { rate: 1, depth: 0.8, feedback: 0.5, mix: 0.7 },
            adsr: { attack: 0.001, decay: 0.2, sustain: 0.8, release: 2.5}
        }))
    })),

    openFxEditor(title, containerBuilder) {
        const modal = document.getElementById('fx-editor-modal');
        const titleEl = document.getElementById('fx-editor-title');
        const body = document.getElementById('fx-editor-body');
        if (!modal || !body) return;

        titleEl.innerText = title || 'FX';
        body.innerHTML = '';
        containerBuilder(body);
        modal.classList.add('show');
    },

    closeFxEditor() {
        const modal = document.getElementById('fx-editor-modal');
        if (modal) modal.classList.remove('show');
    },

    setMode(mode, btnElement) {
        document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
        if (btnElement) btnElement.classList.add('active');

        const toolbar = document.getElementById('pattern-toolbar-wrapper');
        if (toolbar) {
            const show = (mode === 'sequencer' || mode === 'synthseq');
            toolbar.style.display = show ? '' : 'none';
        }

        this.currentMode = mode;
        this.currentSequencer = (mode === 'synthseq') ? this.synthSequencer : this.sequencer;
        document.body.className = `mode-${mode}`;

        const piano = document.getElementById('piano-container');
        const pads = document.getElementById('drum-pad-container');

        if (mode === 'synth') {
            this.showPanel('synth', btnElement);
            if (piano) piano.style.display = 'block';
            if (pads) pads.style.display = 'none';
        }
        else if (mode === 'synthseq') {
            this.showPanel('synthseq', btnElement);
            if (piano) piano.style.display = 'block';
            if (pads) pads.style.display = 'none';
            if (this.synthSequencer) this.synthSequencer.render();
        }
        else if (mode === 'drum-pads') {
            if (piano) piano.style.display = 'none';
            if (pads) {
                pads.style.display = 'grid';
                if (pads.children.length === 0) this.createDrumPads();
            }
        }
        else if (mode === 'sequencer') {
            this.showPanel('sequencer', btnElement);
            this.sequencerSubMode = 'drum';
            if (piano) piano.style.display = 'none';
            if (pads) {
                pads.style.display = 'grid';
                if (pads.children.length === 0) this.createDrumPads();
            }
        }
        if (this.patterns) this.patterns.updatePatternInfo();
        this.updateStatusDisplay();
    },

    openOscillatorPanel(btn) {
        this.showPanel('synth', btn);
        document.getElementById('piano-container').style.display = 'block';
    },

    toggleKeyboardInSequencer() {
        if (this.currentMode !== 'sequencer') return;
        const piano = document.getElementById('piano-container');
        const pads = document.getElementById('drum-pad-container');

        if (this.sequencerSubMode === 'synth') {
            this.sequencerSubMode = 'drum';
            if (piano) piano.style.display = 'none';
            if (pads) pads.style.display = 'grid';
        } else {
            this.sequencerSubMode = 'synth';
            if (piano) piano.style.display = 'block';
            if (pads) pads.style.display = 'none';
        }
    },

    async loadDefaultSamples() {
        const kitPath = './samples/kit_1/';
        const defaultSamples = ['kick.wav', 'snare.wav', 'clap.wav', 'hihat_closed.wav', 'hihat_open.wav', 'ride.wav', 'tom.wav', 'crash.wav'];

        await Promise.allSettled(defaultSamples.slice(0, 8).map(async (name, i) => {
            try {
                const response = await fetch(kitPath + name);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.audioEngine.ctx.decodeAudioData(arrayBuffer);
                this.drumPads[i].sample = audioBuffer;
                this.drumPads[i].fileName = name;
                console.log(`Loaded ${name} to PAD ${i + 1}`);
            } catch (err) {
                console.warn(`Could not load ${name}:`, err);
                this.drumPads[i].sample = this.createFallbackSample(440 + i * 100, 0.1);
                this.drumPads[i].fileName = 'fallback.wav';
            }
        }));
    },

    createFallbackSample(frequency, duration) {
        const sampleRate = this.audioEngine.ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = this.audioEngine.ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * Math.exp(-i / (sampleRate * 0.05));
        }
        return buffer;
    },

    highlightForMidi(midi, opts = {}) {
        document.querySelectorAll('#piano-keys .key').forEach(el => el.classList.remove('related'));
        if (midi != null) {
            const keyEl = document.querySelector(`#piano-keys .key[data-midi="${midi}"]`);
            if (keyEl) {
                keyEl.classList.add('related');
                if (opts.scrollPiano && this.autoScrollIntoView) {
                    this._scrollPianoToKey(keyEl);
                }
            }
        }

        const seq = this.synthSequencer;
        if (seq) {
            const container = document.getElementById('synthseq');
            if (container) {
                container.querySelectorAll('.ss-row').forEach(el => el.classList.remove('related'));
                container.querySelectorAll('.ss-key').forEach(el => el.classList.remove('related'));
            }
            if (midi != null) {
                const row = midi - seq.baseMidiNote;
                if (row >= 0 && row < seq.rows) {
                    const rowEl = container
                        ? container.querySelector(`.ss-row[data-row="${row}"]`)
                        : null;
                    const keyEl = container
                        ? container.querySelector(`.ss-key[data-row="${row}"]`)
                        : null;
                    if (keyEl) keyEl.classList.add('related');
                    if (rowEl && opts.scrollSynth && this.autoScrollIntoView) {
                        this._scrollSynthToRow(rowEl);
                    }
                }
            }
        }
    },

    toggleAutoScroll() {
        this.autoScrollIntoView = !this.autoScrollIntoView;
        localStorage.setItem('mrsm_auto_scroll', this.autoScrollIntoView ? '1' : '0');
        this._updateAutoScrollButton();
    },

    _updateAutoScrollButton() {
        const btn = document.getElementById('ss-autoscroll-btn');
        if (!btn) return;
        btn.classList.toggle('active', this.autoScrollIntoView);
        btn.title = this.autoScrollIntoView
            ? 'Auto-scroll: On (click to disable)'
            : 'Auto-scroll: Off (click to enable)';
        btn.innerHTML = this.autoScrollIntoView
            ? '<i class="fa-solid fa-crosshairs"></i>'
            : '<i class="fa-solid fa-crosshairs" style="opacity:0.4;"></i>';
    },

    clearHighlights() {
        document.querySelectorAll('#piano-keys .key.related').forEach(el => el.classList.remove('related'));
        const container = document.getElementById('synthseq');
        if (container) {
            container.querySelectorAll('.ss-row.related, .ss-key.related').forEach(el =>
                el.classList.remove('related')
            );
        }
    },

    _scrollSynthToRow(rowEl) {
        if (!rowEl) return;
        const container = rowEl.closest('.ss-container');
        if (!container) return;

        const rowTop = rowEl.offsetTop;
        const rowHeight = rowEl.offsetHeight;
        const targetTop = isMobile ? rowTop - (container.clientHeight / 2) + (rowHeight / 2) + 200 : rowTop - (container.clientHeight / 2) + (rowHeight / 2);
        container.scrollTo({
            top: Math.max(0, targetTop),
            behavior: 'smooth'
        });

        rowEl.classList.remove('focus-flash');
        void rowEl.offsetWidth;
        rowEl.classList.add('focus-flash');
    },

    _scrollPianoToKey(keyEl) {
        const scroller = document.getElementById('piano-keys');
        if (!scroller) return;

        const keyLeft = parseInt(keyEl.style.left, 10) || keyEl.offsetLeft;
        const keyWidth = keyEl.offsetWidth;
        const viewWidth = scroller.parentElement?.clientWidth || scroller.clientWidth;
        const centerOffset = keyLeft - (viewWidth / 2) + (keyWidth / 2);
        const maxOffset = this.pianoMaxScroll || 0;
        const targetOffset = Math.max(0, Math.min(maxOffset, centerOffset));

        this.pianoOffset = targetOffset;
        scroller.style.transform = `translateX(${-targetOffset}px)`;
        this.updateOctaveDisplay();
    },

    init() {
        try {
            localStorage.removeItem('mrsm_tracks_v1');
            localStorage.removeItem('mrsm_session_v1');
        } catch (_) {}
        this.setupMenu();
        this.renderKeys();
        this.setupKeyRolling();
        this.setupPianoScroll();
        this.updateOctaveDisplay();
        this.initSliders();
        this.setupSampleLoader();
        this.history = new History(200);

        this.project = new Project();

        const projNameInput = document.getElementById('proj-name');
        const projNameDisplay = document.getElementById('project-name-display');
        if (projNameInput) {
            projNameInput.value = this.project.name || 'New Project';
            projNameInput.addEventListener('input', (e) => {
                const name = e.target.value.trim() || 'New Project';
                this.project.name = name;
                if (projNameDisplay) projNameDisplay.textContent = name;
            });
        }
        if (projNameDisplay) {
            projNameDisplay.textContent = this.project.name || 'New Project';
        }

        const genreSel = document.getElementById('proj-genre');
        if (genreSel && window.Genres) {
            window.Genres.populateGenreSelect(genreSel);
            genreSel.value = this.project?.genre || 'house';
        }

        const qualitySelect = document.getElementById('proj-wav-quality');
        if (qualitySelect) {
            this.project.wavQuality = parseInt(qualitySelect.value, 10) || 16;
            qualitySelect.addEventListener('change', (e) => {
                this.project.wavQuality = parseInt(e.target.value, 10) || 16;
            });
        }

        this.transport = new Transport(this.project, this);
        this.metronome = new Metronome(this);
        this.sequencer = new DrumSequencer(this);
        this.sequencer.render();
        this.patterns = new PatternManager(this);
        this.project.setupProjectSettings();

        this.tracks = new TrackSystem(this);
        this.songBuilder = new SongBuilder(this);
        this.stepContextMenu = new StepContextMenu(this);
        this.padManager = new PadManager(this);
        this.synthSequencer = new SynthSequencer(this);
        this.synthSequencer.render();
        this.currentSequencer = this.sequencer;
        this.projectIO = new ProjectIO(this);

        this.project.subscribe((type, data) => {
            if (type === 'bpm') {
                if (this.patterns?._suspendBpmRescale) return;
                if (this.tracks) {
                    this.tracks.tracks.forEach(track => {
                        let changed = false;
                        track.clips.forEach(clip => {
                            if (clip.type === 'pattern' && clip.pattern?.steps) {
                                const newDur = (clip.pattern.steps / 4) * (60 / data.bpm);
                                if (Math.abs(newDur - clip.duration) > 0.001) {
                                    clip.duration = newDur;
                                    clip.loopEnd = newDur;
                                    if (clip.envelope && clip.envelope.length === 2 &&
                                        clip.envelope[0].time === 0 && clip.envelope[1].value === 1) {
                                        clip.envelope[1].time = newDur;
                                    }
                                    changed = true;
                                }
                            }
                        });
                    });
                    this.tracks.renderTracks();
                }
            }
        });

        const initAudio = async () => {
            if (!this.audioEngine.ctx) this.audioEngine.init();
            if (!this.samplesLoaded) {
                try {
                    await this.loadDefaultSamples();
                    this.samplesLoaded = true;
                } catch (err) {
                    console.warn('Failed to load samples:', err);
                }
            }
        };

        document.body.addEventListener('pointerdown', initAudio, { once: true });

        setInterval(() => {
            const ctx = this.audioEngine?.ctx;
            if (!ctx) return;
            if (ctx.state === 'suspended' && this.audioEngine.visualizerRunning) {
                ctx.resume().catch(() => {});
            }
        }, 5000);

        document.addEventListener('keydown', (e) => {
            const tag = (e.target?.tagName || '').toUpperCase();
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;

            const mod = e.ctrlKey || e.metaKey;
            if (!mod) return;

            if (e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                this.history.undo();
            } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
                e.preventDefault();
                this.history.redo();
            }
        });

        document.addEventListener('click', (e) => {
            const fxMenu = document.getElementById('btn-fx-menu');
            const fxDropdown = document.getElementById('fx-dropdown');
            const settingsBtn = document.getElementById('btn-settings');
            const settingsModal = document.getElementById('settings-modal');

            if (fxDropdown && fxMenu && !fxMenu.contains(e.target) && !fxDropdown.contains(e.target)) {
                fxDropdown.classList.remove('show');
                document.querySelectorAll('.fx-submenu').forEach(sub => sub.classList.remove('show-sub'));
            }
            if (settingsModal && settingsModal.classList.contains('show') && !settingsModal.contains(e.target) && e.target !== settingsBtn) {
                this.toggleSettings('h');
            }
        });

        const displayModeSelect = document.getElementById('display-mode-select');
        if (displayModeSelect) displayModeSelect.value = 'status';
        this.setDisplayMode('status');

        const tracksBtn = document.querySelector('.menu-btn[title="Tracks"]');
        this.showPanel('tracks', tracksBtn);

        const piano = document.getElementById('piano-container');
        const pads = document.getElementById('drum-pad-container');
        if (piano) piano.style.display = 'none';
        if (pads) pads.style.display = 'none';

        const toolbar = document.getElementById('pattern-toolbar-wrapper');
        if (toolbar) toolbar.style.display = 'none';

        if (this.tracks && this.tracks.tracks.length === 0) {
            this.tracks._addTrackSilent('Drums', '#e53935', 'drums');
            this.tracks._addTrackSilent('Synth', '#1e88e5', 'synth');
            this.tracks.renderTracks({ full: true });
        }

        (() => {
            const header = document.getElementById('fx-editor-header');
            const modal = document.getElementById('fx-editor-modal');
            if (!header || !modal) return;

            let dragging = false;
            let startX = 0, startY = 0, startLeft = 0, startTop = 0;

            const onDown = (e) => {
                if (e.target.closest('button')) return;
                const p = e.touches ? e.touches[0] : e;
                dragging = true;
                startX = p.clientX;
                startY = p.clientY;
                const rect = modal.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
                modal.style.right = 'auto';
                modal.style.bottom = 'auto';
                modal.style.left = startLeft + 'px';
                modal.style.top = startTop + 'px';
                e.preventDefault();
            };
            const onMove = (e) => {
                if (!dragging) return;
                const p = e.touches ? e.touches[0] : e;
                const dx = p.clientX - startX;
                const dy = p.clientY - startY;
                modal.style.left = (startLeft + dx) + 'px';
                modal.style.top = Math.max(0, startTop + dy) + 'px';
                e.preventDefault();
            };
            const onUp = () => { dragging = false; };

            header.addEventListener('pointerdown', onDown);
            window.addEventListener('pointermove', onMove, { passive: false });
            window.addEventListener('pointerup', onUp);
            header.addEventListener('touchstart', onDown, { passive: false });
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('touchend', onUp);
        })();
        
        if (window.TonePicker) {
            this.tonePicker = new window.TonePicker(this);
            window.tonePicker = this.tonePicker;
        }
        if (window.PresetParams) {
            this.presetParams = new window.PresetParams(this);
            window.presetParams = this.presetParams;
        }
        if (window.toneLibrary) {
            window.toneLibrary.load().then(() => {
                console.log(`Tones loaded: ${window.toneLibrary.factory.length} factory, ${window.toneLibrary.user.length} user`);
            }).catch(err => {
                console.warn('Tone library failed to load:', err);
            });
        }

        this.updateStatusDisplay();
    },

    setupMenu() {
        this.showPanel = (panelName, btnElement) => {
            document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
            document.querySelectorAll('.menu-btn').forEach(b => b.classList.remove('active'));
            document.getElementById(`panel-${panelName}`).classList.add('active');
            if (btnElement) btnElement.classList.add('active');
            document.getElementById('fx-dropdown').classList.remove('show');

            const labels = {
                'tracks': 'Tracks',
                'synthseq': 'Synth Sequencer',
                'sequencer': 'Drum Sequencer',
                'synth': 'Synth',
                'fx-dynamic': 'Effects',
            };
            this.currentPanelLabel = labels[panelName] || panelName;

            if (panelName === 'tracks') {
                const piano = document.getElementById('piano-container');
                const pads = document.getElementById('drum-pad-container');
                if (piano) piano.style.display = 'none';
                if (pads) pads.style.display = 'none';
            }

            setTimeout(() => {
                if (this.displayMode === 'spectrum') window.dispatchEvent(new Event('resize'));
            }, 50);

            this.updateStatusDisplay();
        };
    },

    toggleMetronome() {
        if (this.metronome) this.metronome.toggle();
    },

    toggleSettings(forceState) {
        const modal = document.getElementById('settings-modal');
        if (!modal) return;
        if (forceState === 's') {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('show'), 10);
        } else {
            modal.classList.remove('show');
            setTimeout(() => modal.style.display = 'none', 200);
        }
        if (window.audioCache) {
            this.showAudioCacheStats();
        }
    },

    toggleSubmenu(event, element) {
        event.stopPropagation();
        element.classList.toggle('show-sub');
        document.querySelectorAll('.fx-submenu').forEach(sub => {
            if (sub !== element) sub.classList.remove('show-sub');
        });
    },
    openPadManager(padIndex, padName) {
        this.currentPadIndex = padIndex;
        this.currentPadName = padName;
        if (this.padManager) this.padManager.open(padIndex, padName);
    },
    closePadManager(padIndex = null) {
        if (!this.padManager) return;
        if (padIndex == null) this.padManager.closeAll();
        else this.padManager.close(padIndex);
    },
    populatePadFxButtons(padIndex) {
        const host = document.getElementById('pad-fx-launchers');
        if (!host) return;
        const pad = this.drumPads[padIndex];
        if (!pad) return;

        host.innerHTML = '';

        if (!pad.effects) pad.effects = {};
        if (!pad.effectStates) pad.effectStates = {};

        const fxTypes = window.FX_TYPES || [];

        fxTypes.forEach(fxName => {
            if (pad.effects[fxName] === undefined) pad.effects[fxName] = false;
            if (!pad.effectStates[fxName]) {
                const def = this.audioEngine?.effectStates?.[fxName];
                pad.effectStates[fxName] = def ? JSON.parse(JSON.stringify(def)) : {};
            }

            const btn = document.createElement('button');
            btn.className = 'pad-fx-btn';
            btn.classList.toggle('active', !!pad.effects[fxName]);
            btn.dataset.fx = fxName;

            const label = fxName.charAt(0).toUpperCase() + fxName.slice(1);
            btn.innerHTML = `<span>${label}</span>`;

            btn.addEventListener('click', () => {
                this.openPadFx(padIndex, fxName);
                requestAnimationFrame(() => {
                    btn.classList.toggle('active', !!pad.effects[fxName]);
                });
            });

            host.appendChild(btn);
        });
    },

    closePadManager() {
        document.getElementById('pad-manager-modal').classList.remove('show');
    },

    togglePadSolo(padIndex = this.currentPadIndex) {
        const pad = this.drumPads[padIndex];
        if (!pad) return;
        pad.solo = !pad.solo;

        if (pad.solo) {
            this.drumPads.forEach((p, i) => {
                if (i !== padIndex) {
                    if (p._wasMuted === undefined) p._wasMuted = p.muted;
                    p.muted = true;
                }
            });
        } else {
            this.drumPads.forEach(p => {
                if (p._wasMuted !== undefined) {
                    p.muted = p._wasMuted;
                    delete p._wasMuted;
                }
            });
        }

        if (this.padManager) {
            this.padManager.cards.forEach((entry, idx) => {
                const p = this.drumPads[idx];
                if (!p) return;
                entry.el.querySelector('[data-role="solo"]')?.classList.toggle('active', !!p.solo);
                entry.el.querySelector('[data-role="mute"]')?.classList.toggle('active', !!p.muted);
            });
        }
    },

    togglePadMute(padIndex = this.currentPadIndex) {
        const pad = this.drumPads[padIndex];
        if (!pad) return;
        pad.muted = !pad.muted;

        if (pad.muted && pad.solo) {
            pad.solo = false;
        }

        if (this.padManager) {
            this.padManager.cards.forEach((entry, idx) => {
                const p = this.drumPads[idx];
                if (!p) return;
                entry.el.querySelector('[data-role="solo"]')?.classList.toggle('active', !!p.solo);
                entry.el.querySelector('[data-role="mute"]')?.classList.toggle('active', !!p.muted);
            });
        }
    },

    updatePadVolume(padIndex, val) {
        const pad = this.drumPads[padIndex];
        if (!pad) return;
        pad.volume = parseFloat(val);
        const entry = this.padManager?.cards?.get(padIndex);
        if (entry) {
            const el = entry.el.querySelector('[data-role="vol-val"]');
            if (el) el.textContent = Math.round(pad.volume * 100) + '%';
        }
    },

    updatePadPitch(padIndex, val) {
        const pad = this.drumPads[padIndex];
        if (!pad) return;
        pad.pitch = parseInt(val, 10);
        const entry = this.padManager?.cards?.get(padIndex);
        if (entry) {
            const el = entry.el.querySelector('[data-role="pitch-val"]');
            if (el) el.textContent = pad.pitch + ' st';
        }
    },

    resetPad(padIndex = this.currentPadIndex) {
        if (!confirm('Reset ' + this.currentPadName + ' to defaults?')) return;
        const pad = this.drumPads[padIndex];
        pad.volume = 1;
        pad.pitch = 0;
        pad.solo = false;
        pad.muted = false;

        if (this.padManager) {
            this.padManager.close(padIndex);
            setTimeout(() => this.padManager.open(padIndex, this.currentPadName), 60);
        }
    },

    updatePadADSR(param, val) {
        const valEl = document.getElementById(`pad-${param}-val`);
        if (valEl) {
            if (param === 'sustain') valEl.innerText = Math.round(val * 100) + '%';
            else valEl.innerText = Math.round(val * 1000) + 'ms';
        }
    },

    setDisplayMode(mode) {
        this.displayMode = mode;
        const canvas = document.getElementById('viz-canvas');
        const status = document.getElementById('status-display');
        if (mode === 'spectrum') {
            canvas.classList.remove('hidden'); status.classList.remove('active');
            window.dispatchEvent(new Event('resize'));
        } else {
            canvas.classList.add('hidden'); status.classList.add('active');
            this.updateStatusDisplay();
        }
    },

    updateStatusDisplay(activeNote = null, freq = null) {
        if (this.displayMode !== 'status') return;
        if (activeNote) this.lastPressedKey = activeNote;

        const p = this.audioEngine.params;

        const srcVal = p.waveform === 'sample'
            ? (this.audioEngine.sampleBuffer ? 'Sample' : 'Load Sample')
            : p.waveform.charAt(0).toUpperCase() + p.waveform.slice(1);
        const srcEl = document.getElementById('stat-source');
        if (srcEl) srcEl.innerText = srcVal;

        const masterVol = Math.round(p.masterVolume * 100);
        const volEl = document.getElementById('stat-vol-val');
        if (volEl) volEl.innerText = masterVol + '%';

        const activeList = Object.keys(this.audioEngine.activeEffects)
            .filter(k => this.audioEngine.activeEffects[k])
            .map(k => k.charAt(0).toUpperCase() + k.slice(1))
            .join(', ');
        const fxEl = document.getElementById('stat-fx');
        if (fxEl) fxEl.innerText = activeList || 'None';

        const modeEl = document.getElementById('stat-mode');
        if (modeEl) modeEl.innerText = this.currentPanelLabel || 'Tracks';

        const tracksEl = document.getElementById('stat-tracks');
        if (tracksEl) {
            tracksEl.innerText = String(this.tracks?.tracks?.length ?? 0);
        }

        const playingEl = document.getElementById('stat-playing');
        if (playingEl) {
            const anyPlaying =
                (this.sequencer && this.sequencer.isPlaying) ||
                (this.synthSequencer && this.synthSequencer.isPlaying) ||
                (this.tracks && this.tracks.isPlaying);
            playingEl.innerText = anyPlaying ? '▶' : '▪';
            playingEl.style.color = anyPlaying ? 'var(--primary)' : 'var(--text-dim)';
        }
    },

    getSynthFXSnapshot() {
        const p = this.audioEngine?.params || {};
        const active = this.audioEngine?.activeEffects || {};
        const states = this.audioEngine?.effectStates || {};

        const adsr = {
            attack: p.attack ?? 0.01,
            decay: p.decay ?? 0.2,
            sustain: p.sustain ?? 0.8,
            release: p.release ?? 0.3
        };

        const effects = {};
        const effectStates = {};
        Object.keys(active).forEach(k => {
            effects[k] = !!active[k];
            if (states[k] != null) {
                effectStates[k] = JSON.parse(JSON.stringify(states[k]));
            }
        });
        effectStates.adsr = { ...adsr };
        effects.adsr = !!active.adsr;

        return {
            waveform: p.waveform || 'sawtooth',
            detune: p.detune ?? 0,
            subEnabled: !!p.subEnabled,
            subWaveform: p.subWaveform || 'sine',
            subVolume: p.subVolume ?? 0.3,
            cutoff: p.cutoff ?? 8000,
            resonance: p.resonance ?? 1,
            adsr,
            effects,
            effectStates
        };
    },

    applySynthFXSnapshot(snap) {
        if (!snap || !this.audioEngine) return;

        const p = this.audioEngine.params;
        const ae = this.audioEngine;

        if (snap.waveform) p.waveform = snap.waveform;
        if (snap.detune !== undefined) p.detune = snap.detune;
        if (snap.subEnabled !== undefined) p.subEnabled = !!snap.subEnabled;
        if (snap.subWaveform) p.subWaveform = snap.subWaveform;
        if (snap.subVolume !== undefined) p.subVolume = snap.subVolume;
        if (snap.cutoff !== undefined) p.cutoff = snap.cutoff;
        if (snap.resonance !== undefined) p.resonance = snap.resonance;

        if (snap.adsr) {
            p.attack = snap.adsr.attack ?? p.attack;
            p.decay = snap.adsr.decay ?? p.decay;
            p.sustain = snap.adsr.sustain ?? p.sustain;
            p.release = snap.adsr.release ?? p.release;

            if (!ae.effectStates.adsr) ae.effectStates.adsr = {};
            ae.effectStates.adsr.attack = p.attack;
            ae.effectStates.adsr.decay = p.decay;
            ae.effectStates.adsr.sustain = p.sustain;
            ae.effectStates.adsr.release = p.release;
        }

        if (snap.effects && typeof snap.effects === 'object') {
            Object.keys(snap.effects).forEach(k => {
                if (ae.activeEffects && k in ae.activeEffects) {
                    ae.activeEffects[k] = !!snap.effects[k];
                }
            });
        }
        if (snap.effectStates && typeof snap.effectStates === 'object') {
            Object.keys(snap.effectStates).forEach(k => {
                if (k === 'adsr') return;
                if (!ae.effectStates) ae.effectStates = {};
                ae.effectStates[k] = JSON.parse(JSON.stringify(snap.effectStates[k]));
            });
        }

        if (ae.rebuildFXChain) ae.rebuildFXChain();
        ae.updateFilterParams?.();

        if (p.waveform === 'sample' && !ae.sampleBuffer) {
            console.warn('[pattern] waveform=sample but no sample loaded — user must re-upload.');
        }
    },

    loadTone(preset) {
        if (!preset || typeof preset !== 'object') return;
        if (!preset.voice && !preset.effects) return;

        const ae = this.audioEngine;
        if (!ae) return;

        if (preset.voice) {
            Object.assign(ae.params, preset.voice);
            if (window.Voice && Voice.validateInPlace) Voice.validateInPlace(ae.params);
        }

        if (preset.effects) {
            const active = preset.effects.active || {};
            const states = preset.effects.states || {};

            Object.keys(active).forEach(k => {
                if (k in ae.activeEffects) ae.activeEffects[k] = !!active[k];
            });

            Object.keys(states).forEach(k => {
                if (!ae.effectStates[k]) ae.effectStates[k] = {};
                ae.effectStates[k] = JSON.parse(JSON.stringify(states[k]));
            });

            if (ae.rebuildFXChain) ae.rebuildFXChain();
            ae.updateFilterParams?.();
        }

        this._syncVoiceSliders();

        if (this.presetParams && this.presetParams._built) {
            this.presetParams.syncFromEngine();
        }

        this._syncRawHtmlControls();

        this._refreshOpenFxCadsFromEngine();

        this.updateStatusDisplay();

        if (this.project) this.project.isDirty = true;

        const p = this.audioEngine.params;

        const wf1 = document.getElementById('waveform-selector');
        const wf2 = document.getElementById('synthseq-waveform');
        if (wf1 && wf1.value !== p.waveform) wf1.value = p.waveform;
        if (wf2 && wf2.value !== p.waveform) wf2.value = p.waveform;

        const subToggle = document.getElementById('sub-osc-toggle');
        if (subToggle) subToggle.checked = !!p.subEnabled;

        const subSelect = document.querySelector('#panel-synth .fx-select');
        if (subSelect && p.subWaveform && subSelect.value !== p.subWaveform) {
            subSelect.value = p.subWaveform;
        }
        if (this.synthSequencer?.renderMode === 'wav') {
            this.synthSequencer._wavKey = null;
            this.synthSequencer._ensureWavBuffer();
        }
        try { this.renderCurrentToneSample(); } catch (_) {}
    },

    async showAudioCacheStats() {
        const el = document.getElementById('audio-cache-stats');
        if (!el) return;
        if (!window.audioCache) { el.textContent = 'unavailable'; return; }
        const s = await window.audioCache.fullStats();
        el.textContent = `${s.idbEntries} renders · ${s.idbMB} MB · hits ${s.hits}`;
    },

    async clearAudioCache() {
        if (!window.audioCache) return;
        if (!confirm('Clear all cached WAV renders? Next push will re-render.')) return;
        await window.audioCache.clearAll();
        alert('Cache cleared.');
        this.showAudioCacheStats();
    },

    getCurrentTone() {
        const ae = this.audioEngine;
        const voice = (window.Voice && Voice.extractVoice)
            ? Voice.extractVoice(ae.params)
            : { ...ae.params };

        const active = {};
        const states = {};
        Object.keys(ae.activeEffects).forEach(k => {
            active[k] = !!ae.activeEffects[k];
            if (ae.effectStates[k]) {
                states[k] = JSON.parse(JSON.stringify(ae.effectStates[k]));
            }
        });

        return {
            voice,
            effects: { active, states },
        };
    },

    _syncVoiceSliders() {
        if (!this.sliders) return;
        const p = this.audioEngine.params;
        Object.keys(this.sliders).forEach(key => {
            const wrapper = this.sliders[key];
            if (!wrapper || typeof wrapper.setValue !== 'function') return;
            if (typeof p[key] === 'number') {
                try { wrapper.setValue(p[key]); } catch (_) {}
            }
        });
    },

    _syncRawHtmlControls() {
        const p = this.audioEngine.params;
        const wf1 = document.getElementById('waveform-selector');
        const wf2 = document.getElementById('synthseq-waveform');
        if (wf1 && wf1.value !== p.waveform) wf1.value = p.waveform;
        if (wf2 && wf2.value !== p.waveform) wf2.value = p.waveform;
        const subToggle = document.getElementById('sub-osc-toggle');
        if (subToggle) subToggle.checked = !!p.subEnabled;
        const subSelect = document.getElementById('sub-waveform-select');
        if (subSelect && p.subWaveform && subSelect.value !== p.subWaveform) {
            subSelect.value = p.subWaveform;
        }
    },

    _refreshOpenFxCadsFromEngine() {
        if (!window.fxEditor || !window.fxEditor.cards) return;
        const ae = this.audioEngine;

        window.fxEditor.cards.forEach((card, cardId) => {
            const m = /^fx-card-(synth|pad(\d+))-(.+)$/.exec(cardId);
            if (!m) return;
            const scope = m[1];
            const padIndex = m[2] != null ? parseInt(m[2], 10) : null;
            const fxName = m[3];

            window.fxEditor.close(cardId);
            setTimeout(() => {
                if (scope === 'synth') {
                    this.openSynthFx(fxName);
                } else if (padIndex != null) {
                    this.openPadFx(padIndex, fxName);
                }
            }, 40);
        });
    },

    openTonePicker() {
        if (!window.tonePicker) {
            console.warn('TonePicker not loaded');
            return;
        }
        if (window.toneLibrary && !window.toneLibrary.loaded) {
            window.toneLibrary.load().then(() => window.tonePicker.open());
        } else {
            window.tonePicker.open();
        }
    },

    toggleTonePicker() {
        if (!window.tonePicker) return;
        if (window.tonePicker.el && window.tonePicker.el.classList.contains('show')) {
            window.tonePicker.close();
        } else {
            this.openTonePicker();
        }
    },

    openPresetParams() {
        if (!this.presetParams) {
            console.warn('PresetParams not loaded');
            return;
        }
        this.presetParams.open();
    },

    togglePresetParams() {
        if (!this.presetParams) return;
        this.presetParams.toggle();
    },

    closePresetParams() {
        if (!this.presetParams) return;
        this.presetParams.close();
    },

    toggleFxDropdown() { document.getElementById('fx-dropdown').classList.toggle('show'); },

    openSynthFx(fxName) {
        if (!window.fxEditor) return;
        if (!window.FX_CONFIG || !window.FX_CONFIG[fxName]) {
            console.warn('Unknown FX:', fxName);
            return;
        }
        const ae = this.audioEngine;

        if (!ae.activeEffects[fxName]) {
            ae.toggleEffect(fxName, true);
        }
        ae.currentFX = fxName;

        const state = ae.effectStates[fxName];
        const cardId = `fx-card-synth-${fxName}`;

        window.fxEditor.open({
            cardId,
            fxName,
            title: `${fxName} · Synth`,
            state,
            isOn: !!ae.activeEffects[fxName],
            hidePower: (fxName === 'vibrato'),
            onToggle: (on) => {
                ae.toggleEffect(fxName, on);
                this.updateStatusDisplay();
            },
            onParamChange: (key, value) => {
                switch (fxName) {
                    case 'adsr':
                        if (key === 'attack')  ae.params.attack  = value;
                        if (key === 'decay')   ae.params.decay   = value;
                        if (key === 'sustain') ae.params.sustain = value;
                        if (key === 'release') ae.params.release = value;
                        ae.updateParams({
                            attack: ae.params.attack,
                            decay: ae.params.decay,
                            sustain: ae.params.sustain,
                            release: ae.params.release,
                        });
                        break;
                    case 'echo':      ae.fxProcessor?.updateEcho(state); break;
                    case 'reverb':    ae.fxProcessor?.updateReverb(state); break;
                    case 'chorus':    ae.fxProcessor?.updateChorus(state); break;
                    case 'flanger':   ae.fxProcessor?.updateChorus(state); break;
                    case 'equalizer': ae.fxProcessor?.updateEqualizer(state); break;
                    case 'distortion':ae.fxProcessor?.updateDistortion(state); break;
                    case 'compressor':ae.fxProcessor?.updateCompressor(state); break;
                    case 'vibrato':   ae.updateVibrato(state.rate, state.depth); break;
                    case 'bitcrusher':ae.fxProcessor?.updateBitcrusher(state); break;
                    case 'phaser':    ae.fxProcessor?.updatePhaser(state); break;
                }
            },
            onReset: () => {
                this._resetFxToDefaults('synth', null, fxName);
                window.fxEditor.close(cardId);
                setTimeout(() => this.openSynthFx(fxName), 40);
            },
        });
    },

    openPadFx(padIndex, fxName) {
        if (!window.fxEditor) return;
        if (!window.FX_CONFIG || !window.FX_CONFIG[fxName]) return;
        const pad = this.drumPads[padIndex];
        if (!pad) return;

        if (!pad.effects) pad.effects = {};
        if (!pad.effectStates) pad.effectStates = {};
        if (!pad.effectStates[fxName]) {
            const defaults = this.audioEngine?.effectStates?.[fxName];
            pad.effectStates[fxName] = defaults ? JSON.parse(JSON.stringify(defaults)) : {};
        }

        pad.effects[fxName] = true;

        const state = pad.effectStates[fxName];
        const cardId = `fx-card-pad${padIndex}-${fxName}`;

        window.fxEditor.open({
            cardId,
            fxName,
            title: `${fxName} · ${this.currentPadName}`,
            state,
            isOn: !!pad.effects[fxName],
            hidePower: (fxName === 'vibrato'),
            onToggle: (on) => {
                pad.effects[fxName] = on;
            },
            onParamChange: (key, value) => {
                state[key] = value;
                const proc = pad.fxProcessor;
                if (!proc) return;
                switch (fxName) {
                    case 'echo':      proc.updateEcho(state); break;
                    case 'reverb':    proc.updateReverb(state); break;
                    case 'chorus':    proc.updateChorus(state); break;
                    case 'flanger':   proc.updateChorus(state); break;
                    case 'equalizer': proc.updateEqualizer(state); break;
                    case 'distortion':proc.updateDistortion(state); break;
                    case 'compressor':proc.updateCompressor(state); break;
                    case 'bitcrusher':proc.updateBitcrusher(state); break;
                    case 'phaser':    proc.updatePhaser(state); break;
                    case 'adsr':
                        break;
                }
            },
            onReset: () => {
                this._resetFxToDefaults('pad', padIndex, fxName);
                window.fxEditor.close(cardId);
                setTimeout(() => this.openPadFx(padIndex, fxName), 40);
            },
        });
    },

    _resetFxToDefaults(scope, padIndex, fxName) {
        if (!this._fxDefaults) {
            const tmp = new AudioEngine();
            this._fxDefaults = JSON.parse(JSON.stringify(tmp.effectStates));
        }
        const defaults = this._fxDefaults[fxName];
        if (!defaults) return;
        const copy = JSON.parse(JSON.stringify(defaults));

        if (scope === 'synth') {
            this.audioEngine.effectStates[fxName] = copy;
            const ae = this.audioEngine;
            switch (fxName) {
                case 'adsr':
                    ae.params.attack  = copy.attack;
                    ae.params.decay   = copy.decay;
                    ae.params.sustain = copy.sustain;
                    ae.params.release = copy.release;
                    ae.updateParams({
                        attack: copy.attack, decay: copy.decay,
                        sustain: copy.sustain, release: copy.release,
                    });
                    break;
                case 'echo':      ae.fxProcessor?.updateEcho(copy); break;
                case 'reverb':    ae.fxProcessor?.updateReverb(copy); break;
                case 'chorus':    ae.fxProcessor?.updateChorus(copy); break;
                case 'flanger':   ae.fxProcessor?.updateChorus(copy); break;
                case 'equalizer': ae.fxProcessor?.updateEqualizer(copy); break;
                case 'distortion':ae.fxProcessor?.updateDistortion(copy); break;
                case 'compressor':ae.fxProcessor?.updateCompressor(copy); break;
                case 'vibrato':   ae.updateVibrato(copy.rate, copy.depth); break;
                case 'bitcrusher':ae.fxProcessor?.updateBitcrusher(copy); break;
                case 'phaser':    ae.fxProcessor?.updatePhaser(copy); break;
            }
        } else if (scope === 'pad' && padIndex != null) {
            const pad = this.drumPads[padIndex];
            if (!pad) return;
            pad.effectStates[fxName] = copy;
            if (pad.fxProcessor) {
                switch (fxName) {
                    case 'echo':      pad.fxProcessor.updateEcho(copy); break;
                    case 'reverb':    pad.fxProcessor.updateReverb(copy); break;
                    case 'chorus':    pad.fxProcessor.updateChorus(copy); break;
                    case 'flanger':   pad.fxProcessor.updateChorus(copy); break;
                    case 'equalizer': pad.fxProcessor.updateEqualizer(copy); break;
                    case 'distortion':pad.fxProcessor.updateDistortion(copy); break;
                    case 'compressor':pad.fxProcessor.updateCompressor(copy); break;
                    case 'bitcrusher':pad.fxProcessor.updateBitcrusher(copy); break;
                    case 'phaser':    pad.fxProcessor.updatePhaser(copy); break;
                }
            }
        }
    },

    setupOctaveControls() {
        const display = document.getElementById('octave-display');
        const updateDisplay = () => { display.innerText = `Octave ${this.currentOctave}`; this.renderKeys(); };
        document.getElementById('btn-oct-down').addEventListener('click', () => { if (this.currentOctave > this.minOctave) { this.currentOctave--; updateDisplay(); } });
        document.getElementById('btn-oct-up').addEventListener('click', () => { if (this.currentOctave < this.maxOctave) { this.currentOctave++; updateDisplay(); } });
    },

    setupSampleLoader() {
        const fileInput = document.getElementById('file-input-sample');
        if (!fileInput) return;

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0]; if (!file) return;
            if (!this.audioEngine.ctx) this.audioEngine.init();
            const label = document.getElementById('sample-name');
            if (label) label.textContent = file.name;
            const reader = new FileReader();
            reader.onload = (ev) => {
                this.audioEngine.ctx.decodeAudioData(ev.target.result, (buffer) => {
                    this.audioEngine.loadSample(buffer);
                    document.getElementById('waveform-selector').value = 'sample';
                }, (err) => console.error(err));
            };
            reader.readAsArrayBuffer(file);
        });
    },

    renderKeys() {
        const container = document.getElementById("piano-keys");
        if (!container) return;
        container.innerHTML = "";
        const startMidi = 36, totalKeys = 81, whiteWidth = 60;
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        let whiteIndex = 0;
        const frag = document.createDocumentFragment();

        for (let i = 0; i < totalKeys; i++) {
            const midi = startMidi + i, noteIndex = midi % 12, octave = Math.floor(midi / 12) - 1;
            const note = notes[noteIndex] + octave, freq = 440 * Math.pow(2, (midi - 69) / 12);
            const isBlack = notes[noteIndex].includes("#");
            const key = document.createElement("div");
            key.className = "key " + (isBlack ? "black" : "white");
            key.dataset.note = note;
            key.dataset.freq = freq;

            if (isBlack) {
                const left = whiteIndex * whiteWidth - 18;
                key.style.left = left + "px";
            } else {
                const left = whiteIndex * whiteWidth;
                key.style.left = left + "px";
                if (notes[noteIndex] === "C") {
                    const divider = document.createElement("div");
                    divider.className = "octave-divider";
                    divider.style.left = left + "px";
                    frag.appendChild(divider);
                }
                whiteIndex++;
            }
            frag.appendChild(key);
            key.dataset.midi = midi;

            key.addEventListener("pointerdown", (e) => {
                e.preventDefault();
                this.pointerKeys.set(e.pointerId, key);
                key.classList.add("pressed");
                this.audioEngine.playNote(note, freq);
                try { key.setPointerCapture(e.pointerId); } catch (_) {}

                this.highlightForMidi(midi, { scrollSynth: true });

                if (this.synthSequencer) {
                    this.synthSequencer.recordNote(midi);
                }
            });
        }
        container.appendChild(frag);
        container.style.width = (whiteIndex * whiteWidth) + "px";
        const totalWidth = whiteIndex * whiteWidth, viewWidth = container.parentElement.clientWidth;
        this.pianoMaxScroll = Math.max(0, totalWidth - viewWidth);
        if (this.pianoOffset === 0) {
            const c4Index = 60 - startMidi, whiteKeyIndex = Math.floor(c4Index * 7 / 12);
            this.pianoOffset = Math.min(whiteKeyIndex * whiteWidth, this.pianoMaxScroll);
            container.style.transform = `translateX(${-this.pianoOffset}px)`;
        }
    },

    setupKeyRolling() {
        const keyboard = document.getElementById("piano-keys");
        keyboard.addEventListener("pointermove", (e) => {
            if (!this.pointerKeys.has(e.pointerId)) return;
            const el = document.elementFromPoint(e.clientX, e.clientY);
            if (!el || !el.classList.contains("key")) return;
            const prevKey = this.pointerKeys.get(e.pointerId);
            if (prevKey === el) return;
            if (prevKey) {
                prevKey.classList.remove("pressed");
                this.audioEngine.stopNote(prevKey.dataset.note);
                if (prevKey.dataset.midi && this.synthSequencer) {
                    this.synthSequencer.releaseNote(parseInt(prevKey.dataset.midi, 10));
                }
            }
            this.pointerKeys.set(e.pointerId, el);
            el.classList.add("pressed");
            this.audioEngine.playNote(el.dataset.note, parseFloat(el.dataset.freq));
            if (el.dataset.midi && this.synthSequencer) {
                this.synthSequencer.recordNote(parseInt(el.dataset.midi, 10));
            }
        });

        keyboard.addEventListener("pointerup", (e) => {
            const key = this.pointerKeys.get(e.pointerId);
            if (key) {
                key.classList.remove("pressed");
                this.audioEngine.stopNote(key.dataset.note);
                if (key.dataset.midi && this.synthSequencer) {
                    this.synthSequencer.releaseNote(parseInt(key.dataset.midi, 10));
                }
            }
            this.pointerKeys.delete(e.pointerId);
        });

        keyboard.addEventListener("pointercancel", (e) => {
            const key = this.pointerKeys.get(e.pointerId);
            if (key) {
                key.classList.remove("pressed");
                this.audioEngine.stopNote(key.dataset.note);
                if (key.dataset.midi && this.synthSequencer) {
                    this.synthSequencer.releaseNote(parseInt(key.dataset.midi, 10));
                }
            }
            this.pointerKeys.delete(e.pointerId);
        });
    },

    setupPianoScroll() {
        const bar = document.getElementById("piano-scrollbar"), keys = document.getElementById("piano-keys");
        let dragging = false, startX = 0, startOffset = 0;
        bar.addEventListener("pointerdown", (e) => { dragging = true; startX = e.clientX; startOffset = this.pianoOffset; bar.style.cursor = "grabbing"; });
        window.addEventListener("pointermove", (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            this.pianoOffset = Math.max(0, Math.min(this.pianoMaxScroll, startOffset - dx));
            keys.style.transform = `translateX(${-this.pianoOffset}px)`;
            this.updateOctaveDisplay();
        });
        window.addEventListener("pointerup", () => { dragging = false; bar.style.cursor = "grab"; });
    },

    updateOctaveDisplay() {
        const bar = document.getElementById("piano-scrollbar"), whiteWidth = 60;
        if (!bar) return;
        const keyIndex = Math.floor(this.pianoOffset / whiteWidth), octave = Math.floor((keyIndex + 3) / 7) + 2;
        bar.innerText = "Octave " + octave;
    },

    getFrequency(note, octave) {
        const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        return 440 * Math.pow(2, (12 * (octave + 1) + notes.indexOf(note) - 69) / 12);
    },

    createDrumPads() {
        const container = document.getElementById("drum-pad-container");
        if (!container || container.children.length) return;
        container.innerHTML = "";
        for (let i = 0; i < 8; i++) {
            const pad = document.createElement("div");
            pad.className = "drum-pad";
            pad.dataset.index = i;
            pad.innerHTML = `<div class="pad-label">PAD ${i+1}</div>`;
            pad.addEventListener("pointerdown", () => {
                pad.classList.add("active");
                const padData = this.drumPads[i];
                if (padData.sample) this.audioEngine.playDrumSample(padData.sample, padData);
            });
            pad.addEventListener("pointerup", () => pad.classList.remove("active"));
            container.appendChild(pad);
        }
    },

    debugWav() {
        const seq = this.synthSequencer;
        const clips = this.tracks?.tracks
            ?.flatMap(t => t.clips)
            ?.filter(c => c.mode === 'wav');

        console.group('[WAV debug]');
        console.log('Synth sequencer mode:', seq?.renderMode);
        console.log('Synth sequencer buffer:', seq?._wavBuffer
            ? `${seq._wavBuffer.duration.toFixed(2)}s @ ${seq._wavBuffer.sampleRate}Hz`
            : 'none');
        console.log('Synth sequencer key:', seq?._wavKey);
        console.log('Synth sequencer rendering:', seq?._wavRendering);
        console.log('WAV clips:', clips?.length || 0);

        clips?.forEach((c, i) => {
            console.group(`Clip ${i} — ${c.name} (id ${c.id})`);
            console.log('mode:', c.mode);
            console.log('pattern.sourceName:', c.pattern?.sourceName);
            console.log('frozen:', !!c._frozen);
            console.log('frozen key:', c._frozen?.key);
            console.log('frozen duration:', c._frozen?.buffer?.duration?.toFixed(2) + 's');
            console.log('rendering:', !!c._freezePromise);
            console.groupEnd();
        });
        console.groupEnd();
    },

    initSliders() {
        if (typeof createRNSlider === 'undefined') return;

        const addSlider = (containerId, id, label, min, max, value, step, orient, width, height) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            const wrapper = createRNSlider({
                label, min, max, value, step,
                orientation: orient ?? 'vertical',
                width: width ?? 50,
                height: height ?? 180,
                fitToParent: true,
                theme: {
                    bg: ['#1a1a1a', '#111111'],
                    rail: ['#333', '#222'],
                    handle: ['#444', '#666'],
                    accent: '#00e676',
                    text: '#888',
                },
                onChange: (val) => {
                    const params = {};
                    params[id] = val;
                    this.audioEngine.updateParams(params);
                },
            });
            container.appendChild(wrapper);
            this.sliders[id] = wrapper;
        };

        addSlider('master-sliders',  'masterVolume', 'Volume',  0,  1, 0.8, 0.01, 'horizontal', 260, 40);
        addSlider('master-sliders',  'masterPan',    'Pan',    -1,  1, 0,   0.01, 'horizontal', 260, 40);
        addSlider('bus-sliders',     'synthVolume',  'Synth',   0,  1, 1,   0.01, 'horizontal', 260, 40);
        addSlider('bus-sliders',     'drumVolume',   'Drums',   0,  1, 1,   0.01, 'horizontal', 260, 40);
        addSlider('osc-sliders',     'detune',       'Detune', -50, 50, 0,   1,    'horizontal', 260, 40);
        addSlider('osc-sliders',     'pulseWidth',   'P. Width', 0.1, 0.9, 0.5, 0.01, 'horizontal', 260, 40);
        addSlider('sub-osc-sliders', 'subVolume',    'Volume',  0,  1, 0.5,  0.01, 'horizontal', 260, 40);
        addSlider('filter-sliders',  'cutoff',       'Cutoff', 20, 20000, 2000, 10, 'horizontal', 260, 40);
        addSlider('filter-sliders',  'resonance',    'Res',     0, 20, 1,    0.1, 'horizontal', 260, 40);
        addSlider('env-sliders',     'attack',       'Attack',  0.001, 2, 0.01, 0.01, 'horizontal', 260, 40);
        addSlider('env-sliders',     'decay',        'Decay',   0.01,  2, 0.2,  0.01, 'horizontal', 260, 40);
        addSlider('env-sliders',     'sustain',      'Sustain', 0,     1, 0.6,  0.01, 'horizontal', 260, 40);
        addSlider('env-sliders',     'release',      'Release', 0.01,  5, 0.3,  0.01, 'horizontal', 260, 40);
    },
    showToast(msg) {
        let el = document.getElementById('daw-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'daw-toast';
            el.className = 'daw-toast';
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
    }
};

document.addEventListener('DOMContentLoaded', () => { app.init(); });