class SynthSequencer {
    constructor(app) {
        this.app = app;
        this.steps = 16;
        this.minSteps = 4;
        this.maxSteps = 64;
        this.currentStep = 0;
        this._playingStep = 0;
        this._lastStepTime = 0;
        this.isPlaying = false;
        this.recordMode = false;
        this._recordingNotes = new Map();
        this.rows = 81;
        this.baseMidiNote = 36;
        this.minBaseMidi = 36;
        this.maxBaseMidi = 36;
        this.noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
        this.pattern = new Array(this.rows).fill(null).map(() => new Array(this.steps).fill(null).map(() => this._blankCell()));
        this._patternClipboard = null;
        this._rowClipboard = null;
        this._lastPlayEls = [];

        this.renderMode = 'native';
        this._wavBuffer = null;
        this._wavKey = null;
        this._wavSource = null;
        this._wavRenderPromise = null;
        this._wavRendering = false;
        this.chordTypes = {
            'Major':      [0, 4, 7],
            'Minor':      [0, 3, 7],
            'Major 7':    [0, 4, 7, 11],
            'Minor 7':    [0, 3, 7, 10],
            'Dominant 7': [0, 4, 7, 10],
            'Major 9':    [0, 4, 7, 11, 14],
            'Minor 9':    [0, 3, 7, 10, 14],
            'Sus2':       [0, 2, 7],
            'Sus4':       [0, 5, 7],
            'Diminished': [0, 3, 6],
            'Augmented':  [0, 4, 8],
            'Power':      [0, 7],
            'Octave':     [0, 12],
        };
    }

    _blankCell() {
        return {
            active: false,
            velocity: 1,
            probability: 1,
            ratchet: 1,
            pan: 0,
            pitch: 0,
            length: 1,
            attack: null,
            decay: null,
            sustain: null,
            release: null,
        };
    }

    midiToNoteName(midi) {
        const name = this.noteNames[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        return name + octave;
    }

    noteNameForRow(rowIndex) {
        return this.midiToNoteName(this.baseMidiNote + rowIndex);
    }

    isBlackRow(rowIndex) {
        const midi = this.baseMidiNote + rowIndex;
        return this.noteNames[midi % 12].includes('#');
    }

    isC(rowIndex) {
        const midi = this.baseMidiNote + rowIndex;
        return this.noteNames[midi % 12] === 'C';
    }

    toggleRecord() {
        this.recordMode = !this.recordMode;
        const btn = document.getElementById('ss-record-btn');
        if (btn) btn.classList.toggle('recording', this.recordMode);
    }

    recordNote(midi) {
        if (!this.recordMode) return;
        if (!this.isPlaying) return;

        const bpm = this.app.project?.bpm || 120;
        const stepMs = (60 / bpm) / 4 * 1000;
        const elapsed = performance.now() - (this._lastStepTime || 0);
        const pastHalf = elapsed > stepMs / 2;

        let step = this._playingStep ?? 0;
        if (pastHalf) step = (step + 1) % this.steps;

        let row = midi - this.baseMidiNote;
        if (row < 0 || row >= this.rows) {
            if (row < 0) {
                const newBase = Math.max(this.minBaseMidi, this.baseMidiNote - 12);
                if (newBase !== this.baseMidiNote) {
                    this.baseMidiNote = newBase;
                    this.render();
                }
            } else {
                const newBase = Math.min(this.maxBaseMidi, this.baseMidiNote + 12);
                if (newBase !== this.baseMidiNote) {
                    this.baseMidiNote = newBase;
                    this.render();
                }
            }
            row = midi - this.baseMidiNote;
            if (row < 0 || row >= this.rows) return;
        }

        const cur = this._normStep(this.pattern[row][step]);
        cur.active = true;
        cur.length = 1;
        cur.velocity = 1;
        this.pattern[row][step] = cur;

        this._recordingNotes.set(midi, {
            row,
            step,
            startTime: performance.now(),
        });

        if (typeof this._refreshRow === 'function') {
            this._refreshRow(row);
        } else {
            this.render();
        }
    }

    releaseNote(midi) {
        if (!this._recordingNotes.has(midi)) return;
        const info = this._recordingNotes.get(midi);
        this._recordingNotes.delete(midi);

        if (!this.recordMode) return;
        if (!this.isPlaying) return;

        const bpm = this.app.project?.bpm || 120;
        const stepMs = (60 / bpm) / 4 * 1000;
        const heldMs = performance.now() - info.startTime;
        let heldSteps = Math.max(1, Math.round(heldMs / stepMs));

        let nextActive = this.steps;
        for (let s2 = info.step + 1; s2 < this.steps; s2++) {
            const other = this._normStep(this.pattern[info.row][s2]);
            if (other.active) { nextActive = s2; break; }
        }
        const maxLen = nextActive - info.step;
        if (heldSteps > maxLen) heldSteps = maxLen;

        const cur = this._normStep(this.pattern[info.row][info.step]);
        if (cur.active) {
            cur.length = heldSteps;
            this.pattern[info.row][info.step] = cur;
            if (typeof this._refreshRow === 'function') {
                this._refreshRow(info.row);
            } else {
                this.render();
            }
        }
    }

    _computeWavKey() {
        if (!window.ClipFreezer) return null;
        const p = this.app.project?.bpm || 120;
        const voice = this.app.audioEngine?.params || {};

        const fakeClip = {
            pattern: {
                grid: this.pattern,
                steps: this.steps,
                kind: 'synth',
                baseMidiNote: this.baseMidiNote,
                bpm: p,
            },
            synthVoice: voice,
            duration: (this.steps / 4) * (60 / p),
        };
        return window.ClipFreezer.computeFreezeKey(fakeClip, p);
    }

    destroy() {
        this.stopWavPlayback();
        if (this._wavRenderPromise) {
            this._wavRenderPromise = null;
        }
        if (this._wavRefreshTimer) {
            clearTimeout(this._wavRefreshTimer);
            this._wavRefreshTimer = null;
        }
        this._wavBuffer = null;
        this._wavKey = null;
    }

    _ensureWavBuffer() {
        if (this.renderMode !== 'wav') return;
        if (!window.ClipFreezer) {
            console.warn('ClipFreezer not available — WAV mode disabled');
            this.renderMode = 'native';
            return;
        }

        const key = this._computeWavKey();
        if (this._wavBuffer && this._wavKey === key) return;

        if (this._wavRenderPromise) return;

        const bpm = this.app.project?.bpm || 120;
        const voice = this.app.audioEngine?.params || {};

        this._wavRendering = true;
        this._updateRenderToggleUI();

        const renderFn = () => window.ClipFreezer.renderPatternGrid({
            grid: this.pattern,
            voice,
            bpm,
            steps: this.steps,
            kind: 'synth',
            baseMidiNote: this.baseMidiNote,
            sourceName: this.currentPatternName || null,
            tailSec: 0,
        });

        this._wavRenderPromise = (
            window.ClipFreezer.queueRender
                ? window.ClipFreezer.queueRender(renderFn)
                : renderFn()
        ).then(buffer => {
            this._wavRenderPromise = null;
            this._wavRendering = false;
            this._updateRenderToggleUI();

            if (buffer) {
                const wasPlaying = !!this._wavSource;
                const oldKey = this._wavKey;

                this._wavBuffer = buffer;
                this._wavKey = key;

                if (wasPlaying && this.isPlaying && this.renderMode === 'wav') {
                    this.stopWavPlayback({ keepUI: true });
                    this.startWavPlayback();
                }
                console.log('[synthseq] WAV render ready for pattern', this.currentPatternName || '(unnamed)');
            } else {
                console.warn('[synthseq] WAV render returned null');
            }
        }).catch(err => {
            this._wavRenderPromise = null;
            this._wavRendering = false;
            this._updateRenderToggleUI();
            console.warn('[synthseq] WAV render failed:', err);
        });
    }

    startWavPlayback() {
        if (this.renderMode !== 'wav') return;
        if (!this._wavBuffer) {
            this._ensureWavBuffer();
            return;
        }

        const ae = this.app.audioEngine;
        if (!ae || !ae.ctx) return;

        this.stopWavPlayback({ keepUI: true });

        const source = ae.ctx.createBufferSource();
        source.buffer = this._wavBuffer;
        source.loop = true;
        source.loopStart = 0;
        source.loopEnd = this._wavBuffer.duration;

        source.connect(ae.filter);

        source.start();

        this._wavSource = source;
        console.log('[synthseq] WAV playback started');
    }

    stopWavPlayback(opts = {}) {
        if (this._wavSource) {
            try { this._wavSource.stop(); } catch (_) {}
            try { this._wavSource.disconnect(); } catch (_) {}
            this._wavSource = null;
        }
    }

    _normStep(step) {
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
            active: !!step,
            velocity: 1, probability: 1, ratchet: 1, pan: 0, pitch: 0, length: 1,
            attack: null, decay: null, sustain: null, release: null,
        };
    }

    render() {
        const container = document.getElementById('synthseq');
        if (!container) return;

        const prevScroll = container.querySelector('.ss-container');
        const savedScrollLeft = prevScroll ? prevScroll.scrollLeft : 0;
        const savedScrollTop  = prevScroll ? prevScroll.scrollTop  : 0;
        const bpm = this.app.project?.bpm || 120;

        const rowsHtml = [];
        for (let rowIdx = 0; rowIdx < this.rows; rowIdx++) {
            const fromTop = this.rows - 1 - rowIdx;
            rowsHtml.push(this._buildRowHtml(fromTop));
        }

        const controlsHtml =
            `<div class="ss-controls">` +
                `<div class="ss-controls-left">` +
                    `<button class="seq-btn" id="ss-play-btn" onclick="app.synthSequencer.togglePlay()" title="Play/Stop">` +
                        `<i class="fa-solid fa-play"></i>` +
                    `</button>` +
                    `<button class="seq-btn ${this.recordMode ? 'recording' : ''}" id="ss-record-btn" onclick="app.synthSequencer.toggleRecord()" title="Record Mode">` +
                        `<i class="fa-solid fa-circle"></i>` +
                    `</button>` +
                    `<button class="seq-btn" onclick="app.synthSequencer.clear()" title="Clear">` +
                        `<i class="fa-solid fa-eraser"></i>` +
                    `</button>` +
                    `<button class="seq-btn" onclick="app.synthSequencer.randomize()" title="Randomize">` +
                        `<i class="fa-solid fa-dice"></i>` +
                    `</button>` +
                    `<div class="seq-steps-control">` +
                        `<input type="number" id="ss-steps-input" value="${this.steps}" ` +
                            `min="${this.minSteps}" max="${this.maxSteps}" class="seq-steps-input" ` +
                            `title="Number of steps (4-64)">` +
                        `<button class="seq-btn" onclick="app.synthSequencer.setSteps(document.getElementById('ss-steps-input').value)">` +
                            `<i class="fa-solid fa-check"></i>` +
                        `</button>` +
                    `</div>` +
                `</div>` +
                `<div class="ss-controls-right">` +
                    `<div class="ss-render-toggle" id="ss-render-toggle">` +
                        `<button class="ss-render-btn ${this.renderMode === 'native' ? 'active' : ''}" ` +
                                `data-mode="native" ` +
                                `onclick="app.synthSequencer.setRenderMode('native')" ` +
                                `title="Live synthesis — full quality, CPU-heavy">` +
                            `<i class="fa-solid fa-microchip"></i>` +
                            `<span>Native</span>` +
                        `</button>` +
                        `<button class="ss-render-btn ${this.renderMode === 'wav' ? 'active' : ''} ${this._wavRendering ? 'rendering' : ''}" ` +
                                `data-mode="wav" ` +
                                `id="ss-render-btn" ` +
                                `onclick="app.synthSequencer.setRenderMode('wav')" ` +
                                `title="Rendered audio — CPU-cheap, mobile-safe">` +
                            `<i class="fa-solid fa-wave-square"></i>` +
                            `<span>WAV</span>` +
                        `</button>` +
                    `</div>` +
                    `<button class="seq-btn" id="ss-tones-btn" ` +
                            `onclick="app.toggleTonePicker()" ` +
                            `title="Tone presets">` +
                        `<i class="fa-solid fa-guitar"></i>` +
                    `</button>` +
                    `<button class="seq-btn" id="ss-params-btn" ` +
                            `onclick="app.togglePresetParams()" ` +
                            `title="Edit voice parameters">` +
                        `<i class="fa-solid fa-sliders"></i>` +
                    `</button>` +
                    `<button class="seq-btn" id="ss-autoscroll-btn" ` +
                            `onclick="app.toggleAutoScroll()" ` +
                            `title="Auto-scroll: On (click to disable)">` +
                        `<i class="fa-solid fa-crosshairs"></i>` +
                    `</button>` +
                `</div>` +
            `</div>`;

        container.innerHTML = controlsHtml + `<div class="ss-container">` + rowsHtml.join('') + `</div>`;

        const newGrid = container.querySelector('.ss-container');
        if (newGrid) {
            newGrid.scrollLeft = savedScrollLeft;
            newGrid.scrollTop  = savedScrollTop;
        }

        if (!this._initialScrollDone) {
            this._initialScrollDone = true;
            requestAnimationFrame(() => {
                const grid = container.querySelector('.ss-container');
                const rowEl = container.querySelector('.ss-row[data-row="24"]');
                if (!grid || !rowEl) return;

                let scroller = grid;
                if (scroller.scrollHeight <= scroller.clientHeight + 1) {
                    scroller = container.closest('.panel') || grid;
                }

                const rowRect = rowEl.getBoundingClientRect();
                const scrollerRect = scroller.getBoundingClientRect();
                const delta = (rowRect.top + rowRect.height / 2)
                            - (scrollerRect.top + scrollerRect.height / 2);
                scroller.scrollTop += delta;
            });
        }

        if (this.app?._updateAutoScrollButton) {
            this.app._updateAutoScrollButton();
        }

        container.querySelectorAll('.ss-step').forEach(el => {
            const row = parseInt(el.dataset.row, 10);
            const step = parseInt(el.dataset.step, 10);
            this._applyStepVisuals(el, this.pattern[row][step]);
            this._wireStepContextMenu(el, row, step);
        });

        container.querySelectorAll('.ss-key').forEach(keyEl => {
            const row = parseInt(keyEl.dataset.row, 10);

            keyEl.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 && e.pointerType === 'mouse') return;
                e.preventDefault();
                try { keyEl.setPointerCapture(e.pointerId); } catch (_) {}
                keyEl.classList.add('active');
                this.previewRow(row);

                const midi = this.baseMidiNote + row;
                if (this.app?.highlightForMidi) {
                    this.app.highlightForMidi(midi, { scrollPiano: true });
                }
            });

                const stopPreview = (e) => {
                    if (keyEl.classList.contains('active')) {
                        keyEl.classList.remove('active');
                        try { keyEl.releasePointerCapture(e.pointerId); } catch (_) {}
                        this.stopRowPreview(row);
                    }
                };

                keyEl.addEventListener('pointerup', stopPreview);
                keyEl.addEventListener('pointercancel', stopPreview);
                keyEl.addEventListener('pointerleave', (e) => {
                    if (!keyEl.hasPointerCapture?.(e.pointerId)) {
                        stopPreview(e);
                    }
                });
        });

        if (this.app?.tracks && this.currentPatternName) {
            this.app.tracks._notifyPatternEdited(
                this.currentPatternName,
                this.app.project?.bpm || 120
            );
        }
    }

    setRenderMode(mode) {
        if (mode !== 'native' && mode !== 'wav') return;
        if (this.renderMode === mode) return;

        const wasPlaying = this.isPlaying;

        if (wasPlaying) {
            if (this.renderMode === 'wav') this.stopWavPlayback();
        }

        this.renderMode = mode;

        if (mode === 'wav') {
            this._wavKey = null;
            this._ensureWavBuffer();
        }

        const container = document.getElementById('ss-render-toggle');
        if (container) {
            container.querySelectorAll('.ss-render-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === mode);
            });
        }
        this._updateRenderToggleUI();

        if (wasPlaying) {
            if (mode === 'wav') {
                this.startWavPlayback();
            }
        }

        if (this.currentPatternName && this.app.patterns) {
            const p = this.app.patterns.patterns[this.currentPatternName];
            if (p) {
                p.renderMode = mode;
                this.app.patterns.saveAll();
            }
        }
    }

    _computeRenderKey() {
        const bpm = this.app.project?.bpm || 120;
        return `${this.steps}|${this.rows}|${this.baseMidiNote}|${bpm}|${this.recordMode ? 1 : 0}`;
    }

    _buildRowHtml(fromTop) {
        const name = this.noteNameForRow(fromTop);
        const isBlack = this.isBlackRow(fromTop);
        const isC = this.isC(fromTop);

        const cellsHtml = [];
        let col = 1;
        for (let stepIdx = 0; stepIdx < this.steps; stepIdx++) {
            const s = this._normStep(this.pattern[fromTop][stepIdx]);
            if (s.active) {
                const span = Math.max(1, Math.min(this.steps - stepIdx, s.length || 1));
                cellsHtml.push(
                    `<div class="ss-step ss-note"` +
                    ` data-row="${fromTop}"` +
                    ` data-step="${stepIdx}"` +
                    ` data-length="${span}"` +
                    ` style="grid-column: ${col} / span ${span};">` +
                    `</div>`
                );
                col += span;
                stepIdx += span - 1;
            } else {
                cellsHtml.push(
                    `<div class="ss-step ss-empty"` +
                    ` data-row="${fromTop}"` +
                    ` data-step="${stepIdx}"` +
                    ` style="grid-column: ${col} / span 1;">` +
                    `</div>`
                );
                col += 1;
            }
        }

        return (
            `<div class="ss-row ${isBlack ? 'is-black' : 'is-white'} ${isC ? 'is-c' : ''}" data-row="${fromTop}">` +
                `<div class="ss-key ${isBlack ? 'black' : 'white'}" data-row="${fromTop}">` +
                    `${name}` +
                `</div>` +
                `<div class="ss-steps" data-row="${fromTop}" ` +
                    `style="grid-template-columns: repeat(${this.steps}, 1fr); min-width: ${this.steps * 26}px;">` +
                    cellsHtml.join('') +
                `</div>` +
            `</div>`
        );
    }

    _refreshRow(fromTop) {
        const container = document.getElementById('synthseq');
        if (!container) return;

        const oldRow = container.querySelector(`.ss-row[data-row="${fromTop}"]`);
        if (!oldRow) {
            this.render();
            return;
        }

        const tmp = document.createElement('div');
        tmp.innerHTML = this._buildRowHtml(fromTop).trim();
        const newRow = tmp.firstChild;

        oldRow.replaceWith(newRow);

        newRow.querySelectorAll('.ss-step').forEach(el => {
            const row = parseInt(el.dataset.row, 10);
            const step = parseInt(el.dataset.step, 10);
            this._applyStepVisuals(el, this.pattern[row][step]);
            this._wireStepContextMenu(el, row, step);
        });

        const keyEl = newRow.querySelector('.ss-key');
        if (keyEl) {
            const row = parseInt(keyEl.dataset.row, 10);

            keyEl.addEventListener('pointerdown', (e) => {
                if (e.button !== 0 && e.pointerType === 'mouse') return;
                e.preventDefault();
                try { keyEl.setPointerCapture(e.pointerId); } catch (_) {}
                keyEl.classList.add('active');
                this.previewRow(row);

                const midi = this.baseMidiNote + row;
                if (this.app?.highlightForMidi) {
                    this.app.highlightForMidi(midi, { scrollPiano: true });
                }
            });

            const stopPreview = (e) => {
                if (keyEl.classList.contains('active')) {
                    keyEl.classList.remove('active');
                    try { keyEl.releasePointerCapture(e.pointerId); } catch (_) {}
                    this.stopRowPreview(row);
                }
            };

            keyEl.addEventListener('pointerup', stopPreview);
            keyEl.addEventListener('pointercancel', stopPreview);
            keyEl.addEventListener('pointerleave', (e) => {
                if (!keyEl.hasPointerCapture?.(e.pointerId)) {
                    stopPreview(e);
                }
            });
        }

        if (this.app?.tracks && this.currentPatternName) {
            this.app.tracks._notifyPatternEdited(
                this.currentPatternName,
                this.app.project?.bpm || 120
            );
        }

        if (this.renderMode === 'wav') {
            this._wavKey = null;
            this._ensureWavBuffer();
        }
    }

    _wireStepContextMenu(el, row, step) {
        let pressTimer = null;
        let fired = false;
        let dragState = null;
        
        if (typeof this._suppressClickUntil !== 'number') this._suppressClickUntil = 0;

        const openMenu = (clientX, clientY) => {
            fired = true;
            if (this.app.stepContextMenu) {
                this.app.stepContextMenu.show(clientX, clientY, row, step, 'synth');
            }
        };

        const clearPress = () => {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        };

        const cleanupDragListeners = () => {
            window.removeEventListener('pointermove', onWindowMove);
            window.removeEventListener('pointerup', onWindowUp);
            window.removeEventListener('pointercancel', onWindowUp);
        };

        const onWindowMove = (e) => {
            if (!dragState) return;
            if (e.pointerId !== dragState.pointerId) return;

            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            const dist = Math.hypot(dx, dy);

            if (!dragState.thresholdPassed) {
                if (dist < 10) return;
                dragState.thresholdPassed = true;
                clearPress();

                const gridContainer = dragState.cellEl.closest('.ss-container');
                if (gridContainer) {
                    if (gridContainer.dataset.prevTouchAction === undefined) {
                        gridContainer.dataset.prevTouchAction = gridContainer.style.touchAction || '';
                    }
                    if (gridContainer.dataset.prevOverflow === undefined) {
                        gridContainer.dataset.prevOverflow = gridContainer.style.overflow || '';
                    }
                    gridContainer.style.touchAction = 'none';
                    gridContainer.style.overflow = 'hidden';
                    dragState.lockedContainer = gridContainer;
                }
            }

            if (e.cancelable) e.preventDefault();

            dragState.pendingX = e.clientX;
            if (dragState.raf) return;
            dragState.raf = requestAnimationFrame(() => {
                dragState.raf = null;
                const px = dragState.pendingX - dragState.startX;
                const deltaSteps = Math.round(px / dragState.stepPx);
                const newLength = Math.max(
                    1,
                    Math.min(dragState.maxLength, dragState.startLength + deltaSteps)
                );
                if (newLength === dragState.lastLength) return;
                dragState.lastLength = newLength;

                const cellEl = dragState.cellEl;
                const col = parseInt(cellEl.style.gridColumn.split('/')[0].trim() || '1', 10);
                const boundedLength = Math.min(newLength, this.steps - col + 1);
                const spanEnd = col + boundedLength;

                cellEl.style.gridColumn = `${col} / span ${boundedLength}`;

                dragState.otherCells.forEach(c => {
                    const cCol = parseInt(c.style.gridColumn.split('/')[0].trim() || '1', 10);
                    const covered = cCol > col && cCol < spanEnd;
                    c.style.display = covered ? 'none' : '';
                });
            });
        };

        const onWindowUp = (e) => {
            if (!dragState) return;
            if (e && e.pointerId !== undefined && e.pointerId !== dragState.pointerId) return;

            cleanupDragListeners();

            if (dragState.raf) { cancelAnimationFrame(dragState.raf); dragState.raf = null; }

            if (dragState.lockedContainer) {
                const g = dragState.lockedContainer;
                if (g.dataset.prevTouchAction !== undefined) {
                    g.style.touchAction = g.dataset.prevTouchAction;
                    delete g.dataset.prevTouchAction;
                }
                if (g.dataset.prevOverflow !== undefined) {
                    g.style.overflow = g.dataset.prevOverflow;
                    delete g.dataset.prevOverflow;
                }
            }

            dragState.otherCells.forEach(c => {
                c.style.visibility = '';
                c.style.display = '';
            });

            if (dragState.thresholdPassed) {
                const cur = this._normStep(this.pattern[dragState.row][dragState.step]);
                if (cur.active && dragState.lastLength !== cur.length) {
                    cur.length = dragState.lastLength;
                    this.pattern[dragState.row][dragState.step] = cur;
                }
                fired = true;
                this.render();
                this._suppressClickUntil = Date.now() + 400;
            }

            dragState = null;
        };

        el.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            fired = false;

            const midi = this.baseMidiNote + row;
            if (this.app?.highlightForMidi) {
                this.app.highlightForMidi(midi, { scrollPiano: true });
            }

            const s = this._normStep(this.pattern[row][step]);

            if (s.active) {
                let nextActive = this.steps;
                for (let s2 = step + 1; s2 < this.steps; s2++) {
                    if (this._normStep(this.pattern[row][s2]).active) {
                        nextActive = s2;
                        break;
                    }
                }
                const rect = el.getBoundingClientRect();
                const startLength = s.length || 1;

                dragState = {
                    pointerId: e.pointerId,
                    startX: e.clientX,
                    startY: e.clientY,
                    cellEl: el,
                    row,
                    step,
                    startLength,
                    maxLength: nextActive - step,
                    stepPx: rect.width / startLength,
                    lastLength: startLength,
                    thresholdPassed: false,
                    otherCells: Array.from(el.parentElement.querySelectorAll('.ss-step'))
                        .filter(c => c !== el),
                    raf: null,
                    pendingX: e.clientX,
                    lockedContainer: null,
                };

                window.addEventListener('pointermove', onWindowMove, { passive: false });
                window.addEventListener('pointerup', onWindowUp);
                window.addEventListener('pointercancel', onWindowUp);
            }

            if (e.pointerType === 'mouse') return;

            const clientX = e.clientX;
            const clientY = e.clientY;
            pressTimer = setTimeout(() => {
                pressTimer = null;
                
                if (dragState && dragState.thresholdPassed) return;

                if (dragState) {
                    cleanupDragListeners();
                    dragState = null;
                }
                openMenu(clientX, clientY);
                if (navigator.vibrate) navigator.vibrate(15);
            }, 450);
        });

        el.addEventListener('pointerup', clearPress);
        el.addEventListener('pointercancel', clearPress);

        el.addEventListener('click', (e) => {
            if (Date.now() < this._suppressClickUntil) {
                e.stopPropagation();
                e.preventDefault();
                return;
            }
            if (fired) {
                e.stopPropagation();
                e.preventDefault();
                fired = false;
                return;
            }
            e.stopPropagation();
            this.toggleStep(row, step);
        });

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openMenu(e.clientX, e.clientY);
        });
    }

    _applyStepVisuals(stepEl, stepData) {
        const s = this._normStep(stepData);
        stepEl.classList.toggle('active', s.active);
        stepEl.classList.toggle('has-velocity', s.velocity < 0.999);
        stepEl.classList.toggle('has-probability', s.probability < 0.999);
        stepEl.classList.toggle('has-ratchet', s.ratchet > 1);
        stepEl.classList.toggle('has-pitch', s.pitch !== 0);
        stepEl.classList.toggle('panned-left', s.pan < -0.02);
        stepEl.classList.toggle('panned-right', s.pan > 0.02);

        const hasADSR = s.attack !== null || s.decay !== null
                     || s.sustain !== null || s.release !== null;
        stepEl.classList.toggle('has-adsr', hasADSR);

        if (s.ratchet > 1) stepEl.dataset.ratchet = s.ratchet;
        else delete stepEl.dataset.ratchet;
        if (s.pitch !== 0) stepEl.dataset.pitch = (s.pitch > 0 ? '+' : '') + s.pitch;
        else delete stepEl.dataset.pitch;
    }

    toggleStep(row, step) {
        if (!this.pattern[row]) return;

        const current = this._normStep(this.pattern[row][step]);
        current.active = !current.active;
        this.pattern[row][step] = current;
        this._refreshRow(row);

        const midi = this.baseMidiNote + row;
        if (this.app?.highlightForMidi) {
            this.app.highlightForMidi(midi, { scrollPiano: true, scrollSynth: true });
        }

        if (current.active && this.app?.audioEngine) {
            const note = this.noteNameForRow(row);
            const freq = this.app.getFrequency(
                note.replace(/\d+$/, ''),
                parseInt(note.match(/\d+$/)[0], 10)
            );

            const bpm = this.app.project?.bpm || 120;
            const stepSec = (60 / bpm) * 0.25;
            const duration = stepSec * (current.length || 1);
            const now = this.app.audioEngine.ctx ? this.app.audioEngine.ctx.currentTime : 0;

            this.app.audioEngine.playNoteScheduled(
                note,
                freq,
                now,
                duration,
                current.velocity ?? 1
            );
        }

        if (this.app?.project) this.app.project.isDirty = true;
    }

    previewRow(row) {
        if (!this.app?.audioEngine) return;

        const note = this.noteNameForRow(row);
        const freq = this.app.getFrequency(
            note.replace(/\d+$/, ''),
            parseInt(note.match(/\d+$/)[0], 10)
        );

        const bpm = this.app.project?.bpm || 120;
        const stepSec = (60 / bpm) * 0.25;
        const ctx = this.app.audioEngine.ctx;
        const now = ctx ? ctx.currentTime : 0;

        this.app.audioEngine.playNoteScheduled(
            note,
            freq,
            now,
            stepSec,
            1.0
        );

        const keyEl = document.querySelector(`.ss-key[data-row="${row}"]`);
        if (keyEl) {
            keyEl.classList.add('active');
            setTimeout(() => keyEl.classList.remove('active'), 150);
        }
    }

    stopRowPreview(row) {
        if (!this.app?.audioEngine) return;
        const note = this.noteNameForRow(row);
        if (typeof this.app.audioEngine.stopNote === 'function') {
            this.app.audioEngine.stopNote(note);
        }
    }

    setSteps(newSteps) {
        const steps = Math.max(this.minSteps, Math.min(this.maxSteps, parseInt(newSteps) || 16));
        if (steps === this.steps) return;
        const newPattern = this.pattern.map(row => {
            const newRow = new Array(steps).fill(null).map(() => this._blankCell());
            for (let s = 0; s < Math.min(this.steps, steps); s++) {
                newRow[s] = this._normStep(row[s]);
            }
            return newRow;
        });
        this.steps = steps;
        this.pattern = newPattern;
        this.currentStep = 0;
        this.render();
        if (this.app?.tracks && this.currentPatternName) {
            this.app.tracks._notifyPatternEdited(
                this.currentPatternName,
                this.app.project?.bpm || 120
            );
        }
        if (this.renderMode === 'wav') {
            this._wavKey = null;
            this._ensureWavBuffer();
        }
    }

    clear() {
        if (!confirm('Clear all steps in synth sequencer?')) return;
        this.pattern = new Array(this.rows)
            .fill(null)
            .map(() => new Array(this.steps).fill(null).map(() => this._blankCell()));
        this.render();
        if (this.app?.tracks && this.currentPatternName) {
            this.app.tracks._notifyPatternEdited(
                this.currentPatternName,
                this.app.project?.bpm || 120
            );
        }
        if (this.renderMode === 'wav') {
            this._wavKey = null;
            this._ensureWavBuffer();
        }
    }

    randomize() {
        const project = this.app.project || {};
        const key = project.key || 'C';
        const scale = project.scale || 'major';
        const MT = window.MusicTheory;

        if (!MT) {
            console.warn('MusicTheory not loaded — falling back to chromatic randomize');
            this._randomizeChromatic();
            return;
        }

        const rowIsInScale = new Array(this.rows);
        const rowDegree = new Array(this.rows);
        for (let r = 0; r < this.rows; r++) {
            const midi = this.baseMidiNote + r;
            rowIsInScale[r] = MT.isNoteInScale(midi, key, scale);
            rowDegree[r] = MT.scaleDegree(midi, key, scale);
        }

        const anchorLow = Math.min(this.rows - 1, 12);
        const anchorHigh = Math.min(this.rows - 1, 40);
        const anchorRow = anchorLow + Math.floor(Math.random() * (anchorHigh - anchorLow + 1));

        const candidates = [];
        for (let r = 0; r < this.rows; r++) {
            if (!rowIsInScale[r]) continue;
            const degreeDist = Math.abs(rowDegree[r] - rowDegree[anchorRow]);
            if (degreeDist <= 8) candidates.push(r);
        }

        if (candidates.length === 0) {
            for (let r = anchorLow; r <= anchorHigh; r++) candidates.push(r);
        }

        const newPattern = new Array(this.rows)
            .fill(null)
            .map(() => new Array(this.steps).fill(null).map(() => this._blankCell()));

        let lastRow = anchorRow;
        const totalSteps = this.steps;

        for (let s = 0; s < totalSteps; s++) {
            const isBeat = (s % 4) === 0;
            const isEighth = (s % 2) === 0;

            let fireChance;
            if (isBeat) fireChance = 0.75;
            else if (isEighth) fireChance = 0.35;
            else fireChance = 0.15;

            if (Math.random() > fireChance) continue;

            let row;
            const roll = Math.random();
            if (roll < 0.60) {
                const delta = Math.random() < 0.5 ? 1 : -1;
                row = this._nearestCandidate(candidates, lastRow + delta);
            } else if (roll < 0.85) {
                const delta = (Math.random() < 0.5 ? 1 : -1) *
                              (2 + Math.floor(Math.random() * 4));
                row = this._nearestCandidate(candidates, lastRow + delta);
            } else {
                row = candidates[Math.floor(Math.random() * candidates.length)];
            }
            if (row == null) row = anchorRow;

            const vel = 0.7 + Math.random() * 0.3;
            const allowNote = Math.random() > 0.10;

            if (allowNote) {
                newPattern[row][s] = {
                    active: true,
                    velocity: vel,
                    probability: 1,
                    ratchet: 1,
                    pan: 0,
                    pitch: 0,
                    length: 1,
                    attack: null, decay: null, sustain: null, release: null,
                };
                lastRow = row;
            }
        }

        this.pattern = newPattern;
        this._wavKey = null;
        if (this.renderMode === 'wav') this._ensureWavBuffer();
        this.render();
    }

    _nearestCandidate(candidates, targetRow) {
        if (!candidates || candidates.length === 0) return null;
        let best = candidates[0];
        let bestDist = Math.abs(best - targetRow);
        for (const c of candidates) {
            const d = Math.abs(c - targetRow);
            if (d < bestDist) {
                bestDist = d;
                best = c;
            }
        }
        return best;
    }

    _randomizeChromatic() {
        this.pattern = this.pattern.map((row, rowIdx) => {
            const newRow = new Array(this.steps).fill(null).map(() => this._blankCell());
            const scaleDegrees = [0, 2, 4, 5, 7, 9, 11, 12];
            const allowed = scaleDegrees.includes(rowIdx);
            for (let s = 0; s < this.steps; s++) {
                const density = allowed ? 0.22 : 0.05;
                if (Math.random() < density) {
                    newRow[s] = {
                        active: true, velocity: 1, probability: 1,
                        ratchet: 1, pan: 0, pitch: 0, length: 1,
                        attack: null, decay: null, sustain: null, release: null,
                    };
                }
            }
            return newRow;
        });
        this.render();
    }

    shiftOctave(dir) {
        return;
    }

    togglePlay() {
        const btn = document.getElementById('ss-play-btn');
        if (!btn) return;
        if (this.isPlaying) {
            this.stop();
            btn.innerHTML = '<i class="fa-solid fa-play"></i>';
            btn.classList.remove('playing');
        } else {
            this.start();
            btn.innerHTML = '<i class="fa-solid fa-stop"></i>';
            btn.classList.add('playing');
        }
    }

    start() {
        if (this.isPlaying) return;
        this.isPlaying = true;
        this._activeNotes = new Set();

        this.app.transport.setLoopLength(this.steps);
        this._subscribeToTransport();

        if (this.renderMode === 'wav') {
            this._ensureWavBuffer();
            this.startWavPlayback();
        }

        if (!this.app.transport.isPlaying) {
            this.app.transport.start();
        }
    }

    stop() {
        this.isPlaying = false;
        document.querySelectorAll('.ss-step').forEach(el => el.classList.remove('play'));
        const el = document.getElementById('ss-step');
        if (el) el.innerText = '1';

        if (this._activeNotes) {
            this._activeNotes.forEach(note => this.app.audioEngine.stopNote(note));
            this._activeNotes.clear();
        }

        this.stopWavPlayback();

        if (!this.app.sequencer?.isPlaying) {
            this.app.transport.stop();
        }
    }

    _subscribeToTransport() {
        if (this._transportSubscribed) return;
        this._transportSubscribed = true;
        this.app.transport.subscribe((masterStep, audioTime) => {
            if (this.isPlaying) {
                const localStep = masterStep % this.steps;
                this.step(localStep, audioTime);
            }
        });
    }

    step(stepIndex, audioTime) {
        this.currentStep = stepIndex;
        this._playingStep = stepIndex;
        this._lastStepTime = performance.now();

        const bpm = this.app.project?.bpm || 120;
        const stepSec = (60 / bpm) * 0.25;

        requestAnimationFrame(() => {
            if (this._lastPlayEls) {
                this._lastPlayEls.forEach(el => el.classList.remove('play'));
            }
            this._lastPlayEls = [];

            const container = document.getElementById('synthseq');
            if (container) {
                const stepsInColumn = container.querySelectorAll(`.ss-step[data-step="${stepIndex}"]`);
                stepsInColumn.forEach(el => {
                    el.classList.add('play');
                    this._lastPlayEls.push(el);
                });
            }

            const counterEl = document.getElementById('ss-step');
            if (counterEl) counterEl.innerText = stepIndex + 1;
        });

        if (this.renderMode === 'wav') return;

        for (let row = 0; row < this.rows; row++) {
            const s = this._normStep(this.pattern[row][stepIndex]);
            if (!s.active) continue;
            if (s.probability < 1 && Math.random() >= s.probability) continue;

            const baseMidi = this.baseMidiNote + row;
            const effectiveMidi = baseMidi + (s.pitch || 0);
            const noteName = this.noteNames[((effectiveMidi % 12) + 12) % 12];
            const noteOct = Math.floor(effectiveMidi / 12) - 1;
            const note = noteName + noteOct;
            const freq = this.app.getFrequency(noteName, noteOct);

            const ratchet = Math.max(1, Math.min(8, s.ratchet || 1));
            const subGap = stepSec / ratchet;
            const holdPerHit = subGap * (s.length || 1) * 0.95;
            const baseVel = s.velocity ?? 1;
            const pan = typeof s.pan === 'number' ? s.pan : 0;

            const adsrOverride = {};
            if (s.attack  !== null) adsrOverride.attack  = s.attack;
            if (s.decay   !== null) adsrOverride.decay   = s.decay;
            if (s.sustain !== null) adsrOverride.sustain = s.sustain;
            if (s.release !== null) adsrOverride.release = s.release;
            const hasOverride = Object.keys(adsrOverride).length > 0;

            const opts = { pan };
            if (hasOverride) opts.adsrOverride = adsrOverride;

            for (let r = 0; r < ratchet; r++) {
                const hitTime = audioTime + r * subGap;
                const hitVel = r === 0 ? baseVel : baseVel * 0.6;

                this.app.audioEngine.playNoteScheduled(
                    note,
                    freq,
                    hitTime,
                    holdPerHit,
                    hitVel,
                    opts
                );
            }
        }
    }

    _findNoteAt(row, step) {
        for (let s = step; s >= 0; s--) {
            const cell = this._normStep(this.pattern[row][s]);
            if (!cell.active) continue;
            const len = cell.length || 1;
            if (s + len > step) {
                return document.querySelector(`.ss-steps[data-row="${row}"] .ss-step[data-step="${s}"]`);
            }
            break;
        }
        return null;
    }

    toSnapshot() {
        const app = this.app;
        const current = (app?.getCurrentTone)
            ? app.getCurrentTone()
            : { voice: {}, effects: { active: {}, states: {} } };

        const soundProfile = Object.assign({}, current.voice, {
            effects: Object.assign({}, current.effects.active),
            effectStates: JSON.parse(JSON.stringify(current.effects.states || {})),
        });

        return {
            kind: 'synth',
            name: this.currentPatternName || 'Synth Pattern',
            steps: this.steps,
            rows: this.rows,
            baseMidiNote: this.baseMidiNote,
            bpm: this.app?.project?.bpm || 120,
            octave: Math.floor(this.baseMidiNote / 12) - 1,
            grid: this.pattern.map(row => row.map(cell => this._normStep(cell))),
            soundProfile,
            renderMode: this.renderMode,
        };
    }

    applySnapshot(snapshot) {
        if (!snapshot) return;
        this._lastRenderKey = null;

        this._initialScrollDone = false;

        if (Number.isFinite(snapshot.steps)) {
            const steps = Math.max(this.minSteps, Math.min(this.maxSteps, snapshot.steps));
            this.steps = steps;
        }

        if (Array.isArray(snapshot.grid)) {
            this.pattern = snapshot.grid.map(row => {
                const newRow = new Array(this.steps).fill(null).map(() => this._blankCell());
                const n = Math.min(row.length, this.steps);
                for (let s = 0; s < n; s++) newRow[s] = this._normStep(row[s]);
                return newRow;
            });
        }

        while (this.pattern.length < this.rows) {
            this.pattern.push(new Array(this.steps).fill(null).map(() => this._blankCell()));
        }
        while (this.pattern.length > this.rows) {
            this.pattern.pop();
        }

        if (Number.isFinite(snapshot.baseMidiNote)) {
            this.baseMidiNote = Math.max(
                this.minBaseMidi,
                Math.min(this.maxBaseMidi, snapshot.baseMidiNote)
            );
        }

        if (snapshot.soundProfile && this.app) {
            const sp = snapshot.soundProfile;
            const voice = {};
            Object.keys(sp).forEach(k => {
                if (k === 'effects' || k === 'effectStates') return;
                voice[k] = sp[k];
            });

            if (this.app.loadTone) {
                this.app.loadTone({
                    voice,
                    effects: {
                        active: sp.effects || {},
                        states: sp.effectStates || {},
                    },
                });
            } else if (this.app.applySynthFXSnapshot) {
                this.app.applySynthFXSnapshot(sp);
            }
        }

        const sp = snapshot.soundProfile;
        if (sp?.waveform === 'sample' && !this.app?.audioEngine?.sampleBuffer) {
            setTimeout(() => {
                alert('This pattern uses a sample. Please re-upload a sample via the Synth panel.');
            }, 100);
        }

        if (snapshot.renderMode === 'wav' || snapshot.renderMode === 'native') {
            this.renderMode = snapshot.renderMode;
            this._wavKey = null;
        }

        this.render();
        if (this.app?.tracks && this.currentPatternName) {
            this.app.tracks._notifyPatternEdited(
                this.currentPatternName,
                this.app.project?.bpm || 120
            );
        }
        if (this.renderMode === 'wav') {
            this._wavKey = null;
            this._ensureWavBuffer();
        }
    }

    _scheduleWavRefresh() {
        if (this.renderMode !== 'wav') return;
        if (this._wavRefreshTimer) clearTimeout(this._wavRefreshTimer);
        this._wavRefreshTimer = setTimeout(() => {
            this._wavRefreshTimer = null;
            this._wavKey = null;
            this._ensureWavBuffer();
        }, 500);
    }

    _updateRenderToggleUI() {
        const container = document.getElementById('ss-render-toggle');
        if (!container) return;

        container.querySelectorAll('.ss-render-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === this.renderMode);
        });

        const wavBtn = document.getElementById('ss-render-btn');
        if (wavBtn) {
            wavBtn.classList.toggle('rendering', !!this._wavRendering);
            if (this._wavRendering) {
                wavBtn.title = 'Rendering WAV…';
            } else if (this.renderMode === 'wav') {
                wavBtn.title = 'WAV mode (click to switch to Native)';
            } else {
                wavBtn.title = 'Switch to WAV mode (rendered audio)';
            }
        }

        const nativeBtn = container.querySelector('.ss-render-btn[data-mode="native"]');
        if (nativeBtn) {
            nativeBtn.title = this.renderMode === 'native'
                ? 'Native mode (click to switch to WAV)'
                : 'Switch to Native mode (live synthesis)';
        }
    }

    insertChord(rootRow, step, offsets) {
        if (!Array.isArray(offsets) || offsets.length === 0) return 0;
        if (rootRow < 0 || rootRow >= this.rows) return 0;

        const project = this.app.project || {};
        const key = project.key || 'C';
        const scale = project.scale || 'major';
        const MT = window.MusicTheory;

        let added = 0;
        const touchedRows = new Set();

        offsets.forEach(offset => {
            let targetRow = rootRow + offset;

            if (MT) {
                const targetMidi = this.baseMidiNote + targetRow;
                const snappedMidi = MT.snapToScale(targetMidi, key, scale);
                targetRow = snappedMidi - this.baseMidiNote;
            }

            if (targetRow < 0 || targetRow >= this.rows) return;

            const cell = this._normStep(this.pattern[targetRow][step]);
            if (cell.active) return;

            cell.active = true;
            cell.length = 1;
            cell.velocity = 1;
            this.pattern[targetRow][step] = cell;
            touchedRows.add(targetRow);
            added++;
        });

        touchedRows.forEach(r => this._refreshRow(r));

        if (this.app?.patterns) this.app.patterns.updatePatternInfo?.();
        if (this.app?.project) this.app.project.isDirty = true;

        return added;
    }

    loadSnapshot(snapshot) {
        this.applySnapshot(snapshot);
    }
}

window.SynthSequencer = SynthSequencer;