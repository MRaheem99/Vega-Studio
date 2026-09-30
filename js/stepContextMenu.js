class StepContextMenu {
        constructor(app) {
        this.app = app;
        this.menuEl = null;
        this.padIndex = -1;
        this.stepIndex = -1;
        this._openedAt = 0;
        this._stepClipboard = null;
        this._build();
        this._wireGlobalClose();
    }

    _build() {
        const el = document.createElement('div');
        el.className = 'step-context-menu';
        el.id = 'step-context-menu';
        document.body.appendChild(el);
        this.menuEl = el;
    }

    _wireGlobalClose() {
        document.addEventListener('pointerdown', (e) => {
            if (!this.menuEl.classList.contains('show')) return;
            if (Date.now() - this._openedAt < 200) return;
            if (this.menuEl.contains(e.target)) return;
            this.hide();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.hide();
        });
    }

    show(clientX, clientY, padIndex, stepIndex, mode = 'drums') {
        this.mode = mode;
        this.padIndex = padIndex;
        this.stepIndex = stepIndex;
        this._openedAt = Date.now();

        const seq = this._getSequencer();
        const step = seq._normStep(seq.pattern[padIndex][stepIndex]);

        const pad = (mode === 'synth') ? {} : (this.app.drumPads[padIndex] || {});

        const header = mode === 'synth'
            ? `Step ${stepIndex + 1} · Row ${padIndex + 1}`
            : `Step ${stepIndex + 1} · Pad ${padIndex + 1}`;

        const hasRowClipboard = !!seq._rowClipboard;
        const hasStepClipboard = !!this._stepClipboard;

        const items = [
            {
                id: 'toggle', icon: step.active ? 'fa-toggle-off' : 'fa-toggle-on',
                label: step.active ? 'Deactivate' : 'Activate',
                action: () => this._toggleStep(),
            },
            {
                id: 'manage-pad',
                icon: 'fa-gear',
                label: 'Manage Pad…',
                action: () => this._managePad(),
                disabled: this.mode === 'synth',
            },
            {
                id: 'edit', icon: 'fa-sliders',
                label: 'Edit Step…',
                action: () => this._openEditor(),
            },
            { divider: true },
            {
                id: 'copy-step', icon: 'fa-copy',
                label: 'Copy Step',
                action: () => this._copyStep(),
            },
            {
                id: 'cut-step', icon: 'fa-scissors',
                label: 'Cut Step',
                action: () => this._cutStep(),
            },
            {
                id: 'paste-step', icon: 'fa-paste',
                label: 'Paste Step',
                action: () => this._pasteStep(),
                disabled: !hasStepClipboard,
            },
            { divider: true },
            {
                id: 'clear-step', icon: 'fa-eraser',
                label: 'Clear Step',
                action: () => this._clearStep(),
            },
            {
                id: 'clear-row', icon: 'fa-broom',
                label: 'Clear Row',
                action: () => this._clearRow(),
            },
            {
                id: 'fill-row', icon: 'fa-fill',
                label: 'Fill Row',
                action: () => this._fillRow(),
            },
            { divider: true },
            {
                id: 'shift-left', icon: 'fa-arrow-left',
                label: 'Shift Row Left',
                action: () => this._shiftRow(-1),
            },
            {
                id: 'shift-right', icon: 'fa-arrow-right',
                label: 'Shift Row Right',
                action: () => this._shiftRow(1),
            },
            { divider: true },
            {
                id: 'copy-row', icon: 'fa-copy',
                label: 'Copy Row',
                action: () => this._copyRow(),
            },
            {
                id: 'paste-row', icon: 'fa-paste',
                label: 'Paste Row',
                action: () => this._pasteRow(),
                disabled: !hasRowClipboard,
            },
            { divider: true },
            {
                id: 'mute-pad',
                icon: 'fa-volume-xmark',
                label: pad.muted ? 'Unmute Pad' : 'Mute Pad',
                action: () => this._togglePadMute(),
                disabled: this.mode === 'synth',
            },
            {
                id: 'solo-pad',
                icon: 'fa-headphones',
                label: pad.solo ? 'Unsolo Pad' : 'Solo Pad',
                action: () => this._togglePadSolo(),
                disabled: this.mode === 'synth',
            },
            { divider: true },
            {
                id: 'copy-pattern', icon: 'fa-clone',
                label: 'Copy Pattern',
                action: () => this._copyPattern(),
            },
            {
                id: 'paste-pattern', icon: 'fa-paste',
                label: 'Paste Pattern',
                action: () => this._pastePattern(),
                disabled: !this.app.currentSequencer._patternClipboard,
            },
            {
                id: 'clear-pattern', icon: 'fa-trash',
                label: 'Clear Pattern',
                action: () => this._clearPattern(),
                danger: true,
            },
        ];

        this._render(items, header);
        this._position(clientX, clientY);
    }

    _getSequencer() {
        if (this.mode === 'selection') return null;
        if (this.mode === 'synth') return this.app.synthSequencer;
        return this.app.sequencer;
    }

    _getStep() {
        const seq = this._getSequencer();
        return seq._normStep(seq.pattern[this.padIndex][this.stepIndex]);
    }

    _setStep(step) {
        const seq = this._getSequencer();
        seq.pattern[this.padIndex][this.stepIndex] = step;
        this._refreshStepVisual();
        this._refreshPadInfo();
    }

    _render(items, headerText) {
        let html = '';
        if (headerText) html += `<div class="step-context-header">${headerText}</div>`;
        html += items.map(it => {
            if (it.divider) return '<div class="step-context-divider"></div>';
            const cls = `step-context-item${it.disabled ? ' disabled' : ''}${it.danger ? ' danger' : ''}`;
            return `<div class="${cls}" data-action="${it.id}">
                <i class="fa-solid ${it.icon}"></i>
                <span>${it.label}</span>
            </div>`;
        }).join('');
        this.menuEl.innerHTML = html;

        this.menuEl.querySelectorAll('.step-context-item').forEach(el => {
            if (el.classList.contains('disabled')) return;
            const id = el.dataset.action;
            const item = items.find(i => i.id === id);
            if (!item) return;

            let startX = 0, startY = 0;
            el.addEventListener('touchstart', (e) => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }, { passive: true });
            el.addEventListener('touchend', (e) => {
                const dx = e.changedTouches[0].clientX - startX;
                const dy = e.changedTouches[0].clientY - startY;
                if (Math.hypot(dx, dy) > 10) return;
                e.preventDefault();
                e.stopPropagation();
                this.hide();
                setTimeout(() => item.action(), 0);
            }, { passive: false });
            el.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hide();
                setTimeout(() => item.action(), 0);
            });
        });
    }

    _position(x, y) {
        this.menuEl.classList.add('show');
        this.menuEl.style.left = '0px';
        this.menuEl.style.top = '0px';
        const rect = this.menuEl.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        let mx = x, my = y;
        if (mx + rect.width > vw - 8) mx = vw - rect.width - 8;
        if (my + rect.height > vh - 8) my = vh - rect.height - 8;
        if (mx < 8) mx = 8;
        if (my < 8) my = 8;
        this.menuEl.style.left = `${mx}px`;
        this.menuEl.style.top = `${my}px`;
    }

    hide() {
        this.menuEl.classList.remove('show');
    }

   _refreshStepVisual() {
        const seq = this._getSequencer();
        let el;
        if (this.mode === 'synth') {
            el = document.querySelector(
                `.ss-steps[data-row="${this.padIndex}"] .ss-step[data-step="${this.stepIndex}"]`
            );
        } else {
            el = document.querySelector(
                `.seq-steps[data-pad="${this.padIndex}"] .seq-step[data-step="${this.stepIndex + 1}"]`
            );
        }
        if (!el) return;
        const step = this._getStep();
        seq._applyStepVisuals(el, step);
    }

    _refreshPadInfo() {
        if (this.app.patterns) this.app.patterns.updatePatternInfo();
    }

    _toggleStep() {
        const step = this._getStep();
        step.active = !step.active;
        if (!step.active) {
            step.length = 1;
            step.attack = null;
            step.decay = null;
            step.sustain = null;
            step.release = null;
            step.velocity = 1;
            step.probability = 1;
            step.ratchet = 1;
            step.pan = 0;
            step.pitch = 0;
        }
        this._setStep(step);
        if (this.mode === 'synth') this._getSequencer()._refreshRow(this.padIndex);
    }

    _copyFocusedStep(seq) {
        const focus = seq._lastFocusedStep || seq.selection?.lastMouseCell;
        if (!focus) return;
        const cell = seq._normStep(seq.pattern[focus.r]?.[focus.s]);
        this._stepClipboard = { cell: { ...cell }, mode: seq === this.app.synthSequencer ? 'synth' : 'drums' };
        window.app?.showToast?.('Step copied');
    }

    _pasteFocusedStep(seq) {
        if (!this._stepClipboard) return;
        const focus = seq._lastFocusedStep || seq.selection?.lastMouseCell;
        if (!focus) return;
        const before = seq._normStep(seq.pattern[focus.r][focus.s]);
        const after = seq._normStep(this._stepClipboard.cell);
        const apply = (state) => {
            seq.pattern[focus.r][focus.s] = { ...state };
            if (seq === this.app.synthSequencer) seq._refreshRow(focus.r);
            else seq.render();
            this.app.patterns?.updatePatternInfo?.();
        };
        if (window.app?.history) {
            window.app.history.push({
                label: 'Paste Step',
                do: () => apply(after),
                undo: () => apply(before),
            });
        } else apply(after);
        window.app?.showToast?.('Step pasted');
    }

    _copyStep() {
        const step = this._getStep();
        this._stepClipboard = {
            cell: { ...step },
            mode: this.mode,
        };
        if (window.app?.showToast) window.app.showToast('Step copied');
    }

    _cutStep() {
        const step = this._getStep();
        this._stepClipboard = {
            cell: { ...step },
            mode: this.mode,
        };
        const seq = this._getSequencer();
        seq.pattern[this.padIndex][this.stepIndex] = seq._blankCell
            ? seq._blankCell()
            : { active: false, velocity: 1, probability: 1, ratchet: 1, pan: 0, pitch: 0, length: 1, attack: null, decay: null, sustain: null, release: null };
        this._refreshStepVisual();
        this._refreshPadInfo();
        if (this.mode === 'synth') seq._refreshRow(this.padIndex);
        if (window.app?.showToast) window.app.showToast('Step cut');
    }

    _pasteStep() {
        if (!this._stepClipboard) return;
        if (this._stepClipboard.mode !== this.mode) {
            console.info('[paste] Cross-mode step paste');
        }
        const seq = this._getSequencer();
        const cell = { ...this._stepClipboard.cell };

        const before = seq._normStep(seq.pattern[this.padIndex][this.stepIndex]);
        const after = seq._normStep(cell);

        const applyVisual = (state) => {
            seq.pattern[this.padIndex][this.stepIndex] = { ...state };
            if (this.mode === 'synth') seq._refreshRow(this.padIndex);
            else this._refreshStepVisual();
            this._refreshPadInfo();
        };

        if (window.app?.history) {
            window.app.history.push({
                label: 'Paste Step',
                do: () => applyVisual(after),
                undo: () => applyVisual(before),
            });
        } else {
            applyVisual(after);
        }
    }

    _clearStep() {
        if (this.mode === 'selection') return;
        const seq = this._getSequencer();
        seq.pattern[this.padIndex][this.stepIndex] = false;
        this._refreshStepVisual();
        this._refreshPadInfo();
        if (this.mode === 'synth') seq._refreshRow(this.padIndex);
    }

    _clearRow() {
        const seq = this._getSequencer();
        for (let s = 0; s < seq.steps; s++) seq.pattern[this.padIndex][s] = false;
        seq._refreshRow(this.padIndex);
        this._refreshPadInfo();
    }

    _fillRow() {
        if (this.mode === 'selection') return;
        const seq = this._getSequencer();
        for (let s = 0; s < seq.steps; s++) {
            seq.pattern[this.padIndex][s] = {
                active: true, velocity: 1, probability: 1, ratchet: 1, pan: 0, length: 1,
            };
        }
        seq._refreshRow(this.padIndex);
        this._refreshPadInfo();
    }

    _shiftRow(dir) {
        const seq = this._getSequencer();
        const row = seq.pattern[this.padIndex];
        const n = row.length;
        const shifted = new Array(n);
        for (let i = 0; i < n; i++) {
            const j = ((i - dir) % n + n) % n;
            shifted[i] = row[j];
        }
        seq.pattern[this.padIndex] = shifted;
        seq._refreshRow(this.padIndex);
        this._refreshPadInfo();
    }

    _copyRow() {
        if (this.mode === 'selection') return;
        const seq = this._getSequencer();
        seq._rowClipboard = seq.pattern[this.padIndex].map(s => seq._normStep(s));
    }

    _pasteRow() {
        if (this.mode === 'selection') return;
        const seq = this._getSequencer();
        if (!seq._rowClipboard) return;
        const targetLen = seq.steps;
        const src = seq._rowClipboard;
        const out = new Array(targetLen);
        for (let i = 0; i < targetLen; i++) {
            out[i] = i < src.length ? { ...src[i] } : false;
        }
        seq.pattern[this.padIndex] = out;
        seq._refreshRow(this.padIndex);
        this._refreshPadInfo();
    }

    _togglePadMute() {
        if (this.mode === 'selection') return;
        if (this.mode === 'synth') return;
        const pad = this.app.drumPads[this.padIndex];
        if (!pad) return;
        pad.muted = !pad.muted;
    }

    _togglePadSolo() {
        if (this.mode === 'selection') return;
        if (this.mode === 'synth') return;
        const pad = this.app.drumPads[this.padIndex];
        if (!pad) return;
        pad.solo = !pad.solo;
    }

    _managePad() {
        if (this.mode === 'selection') return;
        if (this.mode === 'synth') return;
        if (this.app.openPadManager) this.app.openPadManager(this.padIndex);
    }

    _copyPattern() {
        if (this.mode === 'selection') return;
        const seq = this._getSequencer();
        seq._patternClipboard = seq.pattern.map(row => row.map(s => seq._normStep(s)));
    }

    _pastePattern() {
        if (this.mode === 'selection') return;
        const seq = this._getSequencer();
        if (!seq._patternClipboard) return;
        const cb = seq._patternClipboard;
        seq.pattern = seq.pattern.map((row, padIdx) => {
            const src = cb[padIdx] || [];
            return row.map((_, s) => s < src.length ? { ...src[s] } : false);
        });
        seq._refreshRow(this.padIndex);
        this._refreshPadInfo();
    }

    _clearPattern() {
        if (this.mode === 'selection') return;
        if (!confirm('Clear the entire pattern?')) return;
        const seq = this._getSequencer();
        seq.pattern = new Array(seq.pattern.length)
            .fill(null)
            .map(() => new Array(seq.steps).fill(false));
        seq._refreshRow(this.padIndex);
        this._refreshPadInfo();
    }

    _openEditor() {
        if (this.mode === 'selection') return;
        const step = this._getStep();
        const pad = (this.mode === 'synth') ? {} : (this.app.drumPads[this.padIndex] || {});
        const bpm = this.app.project?.bpm || 120;
        const stepSec = (60 / bpm) / 4;

        let modal = document.getElementById('step-editor-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'step-editor-modal';
            modal.className = 'fx-card step-editor-card';
            modal.innerHTML = `
                <div class="fx-card-header" data-role="header">
                    <span class="fx-card-title" data-role="title">Step</span>
                    <button class="fx-card-close" data-role="close" aria-label="Close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="fx-card-body">
                    <div class="step-editor-grid">
                        <div class="step-editor-field">
                            <label>Velocity <span class="value-display" data-role="vel-val">100%</span></label>
                            <div class="step-editor-slider-host" data-role="vel-slider"></div>
                        </div>
                        <div class="step-editor-field">
                            <label>Probability <span class="value-display" data-role="prob-val">100%</span></label>
                            <div class="step-editor-slider-host" data-role="prob-slider"></div>
                        </div>
                        <div class="step-editor-field">
                            <label>Pan <span class="value-display" data-role="pan-val">C</span></label>
                            <div class="step-editor-slider-host" data-role="pan-slider"></div>
                        </div>
                        <div class="step-editor-field">
                            <label>Pitch <span class="value-display" data-role="pitch-val">0 st</span></label>
                            <div class="step-editor-slider-host" data-role="pitch-slider"></div>
                        </div>
                        <div class="step-editor-field">
                            <label>Length <span class="value-display" data-role="length-val">1</span></label>
                            <div class="step-editor-toggle-row" data-role="length-row">
                                <button data-l="1">1</button>
                                <button data-l="2">2</button>
                                <button data-l="3">3</button>
                                <button data-l="4">4</button>
                                <button data-l="6">6</button>
                                <button data-l="8">8</button>
                                <button data-l="12">12</button>
                                <button data-l="16">16</button>
                            </div>
                        </div>
                        <div class="step-editor-field">
                            <label>Ratchet</label>
                            <div class="step-editor-toggle-row" data-role="ratchet-row">
                                <button data-r="1">1×</button>
                                <button data-r="2">2×</button>
                                <button data-r="3">3×</button>
                                <button data-r="4">4×</button>
                            </div>
                        </div>
                                                <div class="step-editor-field" data-role="chord-field" style="display:none;">
                            <label>Insert Chord <span class="value-display" style="font-size:10px;color:var(--text-dim);">(adds notes to this step)</span></label>
                            <div class="step-editor-chord-row" data-role="chord-row"></div>
                        </div>

                        <!-- ADSR override section — only shown in synth mode -->
                        <div class="step-editor-field" data-role="adsr-field" style="display:none;">
                            <div class="adsr-header">
                                <label>Envelope Override</label>
                                <button class="adsr-master-toggle" data-role="adsr-master-toggle">
                                    <i class="fa-solid fa-power-off"></i>
                                    <span data-role="adsr-master-label">OFF</span>
                                </button>
                            </div>
                            <div class="adsr-rows" data-role="adsr-rows">
                                <div class="adsr-row">
                                    <button class="adsr-toggle" data-role="adsr-toggle" data-p="attack">
                                        <i class="fa-regular fa-circle"></i>
                                    </button>
                                    <span class="adsr-label">Attack</span>
                                    <span class="adsr-value" data-role="adsr-attack-val">—</span>
                                </div>
                                <div class="adsr-slider-host" data-role="adsr-attack-slider"></div>

                                <div class="adsr-row">
                                    <button class="adsr-toggle" data-role="adsr-toggle" data-p="decay">
                                        <i class="fa-regular fa-circle"></i>
                                    </button>
                                    <span class="adsr-label">Decay</span>
                                    <span class="adsr-value" data-role="adsr-decay-val">—</span>
                                </div>
                                <div class="adsr-slider-host" data-role="adsr-decay-slider"></div>

                                <div class="adsr-row">
                                    <button class="adsr-toggle" data-role="adsr-toggle" data-p="sustain">
                                        <i class="fa-regular fa-circle"></i>
                                    </button>
                                    <span class="adsr-label">Sustain</span>
                                    <span class="adsr-value" data-role="adsr-sustain-val">—</span>
                                </div>
                                <div class="adsr-slider-host" data-role="adsr-sustain-slider"></div>

                                <div class="adsr-row">
                                    <button class="adsr-toggle" data-role="adsr-toggle" data-p="release">
                                        <i class="fa-regular fa-circle"></i>
                                    </button>
                                    <span class="adsr-label">Release</span>
                                    <span class="adsr-value" data-role="adsr-release-val">—</span>
                                </div>
                                <div class="adsr-slider-host" data-role="adsr-release-slider"></div>
                            </div>
                        </div>
                    </div>
                    <div class="clip-manager-actions">
                        <button class="clip-manager-btn" data-role="reset">
                            <i class="fa-solid fa-rotate-left"></i> Reset
                        </button>
                        <button class="clip-manager-btn" data-role="clear">
                            <i class="fa-solid fa-eraser"></i> Clear
                        </button>
                        <button class="clip-manager-btn" data-role="done">
                            <i class="fa-solid fa-check"></i> Done
                        </button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            modal.querySelector('[data-role="close"]').onclick = () => this._closeEditor();
            modal.querySelector('[data-role="done"]').onclick = () => this._closeEditor();
            modal.querySelector('[data-role="clear"]').onclick = () => {
                this._clearStep();
                this._closeEditor();
            };

            this._bindEditorDrag(
                modal.querySelector('[data-role="header"]'),
                modal
            );

            modal.style.top = '120px';
            modal.style.left = '40px';
        }

        const title = modal.querySelector('[data-role="title"]');
        if (title) {
            const modeLabel = this.mode === 'synth' ? 'Synth' : 'Pad ' + (this.padIndex + 1);
            title.textContent = `Step ${this.stepIndex + 1} · ${modeLabel}`;
        }

        ['vel', 'prob', 'pan', 'pitch'].forEach(k => {
            const host = modal.querySelector(`[data-role="${k}-slider"]`);
            if (host) host.innerHTML = '';
        });

        const stepSecDisplay = `${(stepSec * 1000).toFixed(0)} ms`;

        requestAnimationFrame(() => {
            if (typeof createRNSlider === 'undefined') return;

            const hostWidth = Math.max(220, Math.min(340,
                (modal.querySelector('.fx-card-body')?.clientWidth || 360) - 40));

            const velHost = modal.querySelector('[data-role="vel-slider"]');
            velHost.appendChild(createRNSlider({
                label: 'Velocity',
                min: 0, max: 1, value: step.velocity, step: 0.01,
                orientation: 'horizontal',
                width: hostWidth, height: 56,
                theme: { accent: '#00e676', bg: ['#222','#111'], rail: ['#444','#333'] },
                onChange: (v) => {
                    const s = this._getStep();
                    s.velocity = v;
                    this._setStep(s);
                    modal.querySelector('[data-role="vel-val"]').textContent = Math.round(v * 100) + '%';
                },
            }));

            const probHost = modal.querySelector('[data-role="prob-slider"]');
            probHost.appendChild(createRNSlider({
                label: 'Probability',
                min: 0, max: 1, value: step.probability, step: 0.01,
                orientation: 'horizontal',
                width: hostWidth, height: 56,
                theme: { accent: '#ffcc00', bg: ['#222','#111'], rail: ['#444','#333'] },
                onChange: (v) => {
                    const s = this._getStep();
                    s.probability = v;
                    this._setStep(s);
                    modal.querySelector('[data-role="prob-val"]').textContent = Math.round(v * 100) + '%';
                },
            }));

            const panHost = modal.querySelector('[data-role="pan-slider"]');
            panHost.appendChild(createRNSlider({
                label: 'Pan',
                min: -1, max: 1, value: step.pan, step: 0.01,
                orientation: 'horizontal',
                width: hostWidth, height: 56,
                theme: { accent: '#00bcd4', bg: ['#222','#111'], rail: ['#444','#333'] },
                onChange: (v) => {
                    const s = this._getStep();
                    s.pan = v;
                    this._setStep(s);
                    const display = Math.abs(v) < 0.02 ? 'C'
                        : (v < 0 ? `L${Math.round(-v * 100)}` : `R${Math.round(v * 100)}`);
                    modal.querySelector('[data-role="pan-val"]').textContent = display;
                },
            }));

            const pitchHost = modal.querySelector('[data-role="pitch-slider"]');
            pitchHost.appendChild(createRNSlider({
                label: 'Pitch',
                min: -12, max: 12, value: step.pitch || 0, step: 1,
                orientation: 'horizontal',
                width: hostWidth, height: 56,
                theme: { accent: '#ff9800', bg: ['#222','#111'], rail: ['#444','#333'] },
                onChange: (v) => {
                    const s = this._getStep();
                    s.pitch = Math.round(v);
                    this._setStep(s);
                    const p = s.pitch;
                    modal.querySelector('[data-role="pitch-val"]').textContent =
                        p === 0 ? '0 st' : (p > 0 ? `+${p} st` : `${p} st`);
                },
            }));
        });

        const lrow = modal.querySelector('[data-role="length-row"]');
        const currentLength = step.length || 1;
        lrow.querySelectorAll('button').forEach(btn => {
            const l = parseInt(btn.dataset.l, 10);
            btn.classList.toggle('active', currentLength === l);
            btn.onclick = () => {
                const s = this._getStep();
                s.length = l;
                this._setStep(s);
                lrow.querySelectorAll('button').forEach(b =>
                    b.classList.toggle('active', parseInt(b.dataset.l, 10) === l));
                modal.querySelector('[data-role="length-val"]').textContent = String(l);
                if (this.mode === 'synth') this._getSequencer()._refreshRow(this.padIndex);
            };
        });

        const rrow = modal.querySelector('[data-role="ratchet-row"]');
        rrow.querySelectorAll('button').forEach(btn => {
            const r = parseInt(btn.dataset.r, 10);
            btn.classList.toggle('active', step.ratchet === r);
            btn.onclick = () => {
                const s = this._getStep();
                s.ratchet = r;
                this._setStep(s);
                rrow.querySelectorAll('button').forEach(b =>
                    b.classList.toggle('active', parseInt(b.dataset.r, 10) === r));
            };
        });

        modal.querySelector('[data-role="reset"]').onclick = () => {
            const s = this._getStep();
            s.velocity = 1;
            s.probability = 1;
            s.ratchet = 1;
            s.pan = 0;
            s.pitch = 0;
            s.length = 1;
            s.attack = null;
            s.decay = null;
            s.sustain = null;
            s.release = null;
            this._setStep(s);
            if (this.mode === 'synth') this._getSequencer()._refreshRow(this.padIndex);
            this._openEditor();
        };

        const chordField = modal.querySelector('[data-role="chord-field"]');
        const chordRow = modal.querySelector('[data-role="chord-row"]');
        if (chordField && chordRow) {
            chordRow.innerHTML = '';
            if (this.mode === 'synth') {
                const seq = this._getSequencer();
                const types = seq?.chordTypes || {};
                Object.keys(types).forEach(name => {
                    const btn = document.createElement('button');
                    btn.className = 'chord-picker-btn';
                    btn.textContent = name;
                    btn.onclick = () => {
                        const added = seq.insertChord(this.padIndex, this.stepIndex, types[name]);
                        if (added === 0) {
                            console.info('Chord had no effect — notes already present or out of range.');
                        }
                    };
                    chordRow.appendChild(btn);
                });
                chordField.style.display = 'block';
            } else {
                chordField.style.display = 'none';
            }
        }

        const adsrField = modal.querySelector('[data-role="adsr-field"]');
        const adsrRows = modal.querySelector('[data-role="adsr-rows"]');
        const adsrMasterToggle = modal.querySelector('[data-role="adsr-master-toggle"]');
        const adsrMasterLabel = modal.querySelector('[data-role="adsr-master-label"]');

        if (this.mode === 'synth' && adsrField) {
            adsrField.style.display = 'block';

            const adsrRows = modal.querySelector('[data-role="adsr-rows"]');
            const adsrMasterToggle = modal.querySelector('[data-role="adsr-master-toggle"]');
            const adsrMasterLabel = modal.querySelector('[data-role="adsr-master-label"]');
            const adsrToggles = modal.querySelectorAll('[data-role="adsr-toggle"]');

            const presetValue = (param) => {
                const p = this.app.audioEngine?.params || {};
                return p[param] ?? (
                    param === 'attack'  ? 0.01 :
                    param === 'decay'   ? 0.2  :
                    param === 'sustain' ? 0.8  : 0.3
                );
            };

            const ranges = {
                attack:  { min: 0.001, max: 5, step: 0.001 },
                decay:   { min: 0.01,  max: 5, step: 0.01  },
                sustain: { min: 0,     max: 1, step: 0.01  },
                release: { min: 0.01,  max: 8, step: 0.01  },
            };

            const formatValue = (param, v) => {
                if (v === null || v === undefined) return '—';
                if (param === 'sustain') return Math.round(v * 100) + '%';
                return v.toFixed(3) + 's';
            };

            const isMasterOn = () => {
                const s = this._getStep();
                return s.attack !== null || s.decay !== null
                    || s.sustain !== null || s.release !== null;
            };

            const buildAdsrSliders = () => {
                const step = this._getStep();

                adsrToggles.forEach(btn => {
                    const p = btn.dataset.p;
                    const isOverridden = step[p] !== null;
                    btn.classList.toggle('active', isOverridden);
                    btn.innerHTML = isOverridden
                        ? '<i class="fa-solid fa-circle"></i>'
                        : '<i class="fa-regular fa-circle"></i>';
                });

                const masterOn = isMasterOn();
                adsrMasterToggle.classList.toggle('active', masterOn);
                adsrMasterLabel.textContent = masterOn ? 'ON' : 'OFF';

                const hostWidth = Math.max(200, Math.min(320,
                    (modal.querySelector('.fx-card-body')?.clientWidth || 360) - 40));

                ['attack', 'decay', 'sustain', 'release'].forEach(param => {
                    const host = modal.querySelector(`[data-role="adsr-${param}-slider"]`);
                    if (!host) return;
                    host.innerHTML = '';

                    const isOverridden = step[param] !== null;
                    const displayEl = modal.querySelector(`[data-role="adsr-${param}-val"]`);

                    if (!isOverridden) {
                        host.innerHTML = `<div class="adsr-hint">Using preset: ${formatValue(param, presetValue(param))}</div>`;
                        if (displayEl) displayEl.textContent = '—';
                        return;
                    }

                    const range = ranges[param];
                    const initialValue = step[param];
                    if (displayEl) displayEl.textContent = formatValue(param, initialValue);

                    const slider = createRNSlider({
                        label: '',
                        min: range.min, max: range.max,
                        value: initialValue, step: range.step,
                        orientation: 'horizontal',
                        width: hostWidth, height: 50,
                        theme: {
                            accent: param === 'attack'  ? '#ff9800' :
                                    param === 'decay'   ? '#ffcc00' :
                                    param === 'sustain' ? '#00bcd4' : '#e040fb',
                            bg: ['#222', '#111'],
                            rail: ['#444', '#333'],
                        },
                        onChange: (v) => {
                            const s = this._getStep();
                            s[param] = parseFloat(v);
                            this._setStep(s);
                            if (displayEl) displayEl.textContent = formatValue(param, s[param]);
                        },
                    });
                    host.appendChild(slider);
                });
            };

            adsrMasterToggle.onclick = () => {
                const currentlyOn = isMasterOn();
                const s = this._getStep();

                if (currentlyOn) {
                    s.attack = null; s.decay = null; s.sustain = null; s.release = null;
                } else {
                    s.attack  = presetValue('attack');
                    s.decay   = presetValue('decay');
                    s.sustain = presetValue('sustain');
                    s.release = presetValue('release');
                }
                this._setStep(s);
                buildAdsrSliders();
            };

            adsrToggles.forEach(btn => {
                btn.onclick = () => {
                    const p = btn.dataset.p;
                    const s = this._getStep();
                    if (s[p] === null) s[p] = presetValue(p);
                    else s[p] = null;
                    this._setStep(s);
                    buildAdsrSliders();
                };
            });

            requestAnimationFrame(() => {
                requestAnimationFrame(() => buildAdsrSliders());
            });
        }

        modal.querySelector('[data-role="vel-val"]').textContent = Math.round(step.velocity * 100) + '%';
        modal.querySelector('[data-role="prob-val"]').textContent = Math.round(step.probability * 100) + '%';
        modal.querySelector('[data-role="pan-val"]').textContent =
            Math.abs(step.pan) < 0.02 ? 'C'
            : (step.pan < 0 ? `L${Math.round(-step.pan * 100)}` : `R${Math.round(step.pan * 100)}`);
        const p0 = step.pitch || 0;
        modal.querySelector('[data-role="pitch-val"]').textContent =
            p0 === 0 ? '0 st' : (p0 > 0 ? `+${p0} st` : `${p0} st`);
        modal.querySelector('[data-role="length-val"]').textContent = String(step.length || 1);

        modal.style.display = 'flex';
        requestAnimationFrame(() => modal.classList.add('show'));
    }

    _bindEditorDrag(handle, card) {
        if (handle.dataset.dragBound === '1') return;
        handle.dataset.dragBound = '1';

        let dragging = false;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0;

        const onDown = (e) => {
            if (e.target.closest('button, input, select')) return;
            const p = e.touches ? e.touches[0] : e;
            dragging = true;
            startX = p.clientX; startY = p.clientY;
            const rect = card.getBoundingClientRect();
            startLeft = rect.left; startTop = rect.top;
            card.style.right = 'auto';
            card.style.bottom = 'auto';
            card.style.left = startLeft + 'px';
            card.style.top = startTop + 'px';
            if (e.cancelable) e.preventDefault();
        };

        const onMove = (e) => {
            if (!dragging) return;
            const p = e.touches ? e.touches[0] : e;
            const dx = p.clientX - startX;
            const dy = p.clientY - startY;
            const vw = window.innerWidth, vh = window.innerHeight;
            const w = card.offsetWidth, h = card.offsetHeight;
            card.style.left = Math.max(0, Math.min(vw - w, startLeft + dx)) + 'px';
            card.style.top = Math.max(0, Math.min(vh - 40, startTop + dy)) + 'px';
            if (e.cancelable) e.preventDefault();
        };

        const onUp = () => { dragging = false; };

        handle.addEventListener('pointerdown', onDown);
        window.addEventListener('pointermove', onMove, { passive: false });
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        handle.addEventListener('touchstart', onDown, { passive: false });
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onUp);
    }

    _openChordPicker() {
        if (this.mode !== 'synth') return;
        const seq = this._getSequencer();
        if (!seq || !seq.chordTypes) return;

        let modal = document.getElementById('chord-picker-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'chord-picker-modal';
            modal.className = 'modal-overlay';
            modal.innerHTML = `
                <div class="modal-content" style="max-width: 420px;">
                    <div class="modal-header">
                        <h3 id="chord-picker-title">Insert Chord</h3>
                        <button class="menu-btn" id="chord-picker-close" style="color:var(--danger)">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                    <div class="modal-body">
                        <div id="chord-picker-grid" class="chord-picker-grid"></div>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            modal.querySelector('#chord-picker-close').onclick = () => modal.classList.remove('show');
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.remove('show');
            });
        }

        const grid = document.getElementById('chord-picker-grid');
        grid.innerHTML = '';

        Object.keys(seq.chordTypes).forEach(name => {
            const btn = document.createElement('button');
            btn.className = 'chord-picker-btn';
            btn.textContent = name;
            btn.onclick = () => {
                const offsets = seq.chordTypes[name];
                const added = seq.insertChord(this.padIndex, this.stepIndex, offsets);
                modal.classList.remove('show');
                if (added === 0) {
                    console.info('Chord not inserted — all target rows already had notes or were out of range.');
                }
            };
            grid.appendChild(btn);
        });

        const titleEl = document.getElementById('chord-picker-title');
        if (titleEl) {
            const noteName = seq.noteNameForRow
                ? seq.noteNameForRow(this.padIndex)
                : `Row ${this.padIndex + 1}`;
            titleEl.textContent = `Insert Chord · ${noteName}`;
        }

        modal.classList.add('show');
    }

    _closeEditor() {
        const modal = document.getElementById('step-editor-modal');
        if (!modal) return;
        modal.classList.remove('show');
        setTimeout(() => {
            if (modal.classList.contains('show')) return;
            modal.style.display = 'none';
        }, 200);
    }

        /**
     * Show the context menu for a multi-step selection.
     */
    showSelectionMenu(clientX, clientY, seq) {
        this.mode = 'selection';
        this._openedAt = Date.now();
        const sel = seq.selection;
        const count = sel.selected.size;
        const hasClipboard = !!sel.clipboard;

        const header = `${count} step${count === 1 ? '' : 's'} selected`;

        const items = [
            { id: 'copy',  icon: 'fa-copy',        label: 'Copy',   action: () => sel.copy() },
            { id: 'cut',   icon: 'fa-scissors',    label: 'Cut',    action: () => sel.cut() },
            { id: 'paste', icon: 'fa-paste',       label: 'Paste',  action: () => sel.paste(),
              disabled: !hasClipboard },
            { divider: true },
            { id: 'selall', icon: 'fa-vector-square', label: 'Select All', action: () => sel.selectAll() },
            { id: 'desel',  icon: 'fa-xmark',         label: 'Deselect',   action: () => sel.clear() },
            { divider: true },
            { id: 'del',   icon: 'fa-trash',       label: 'Delete',       action: () => sel.delete(), danger: true },
        ];

        this._render(items, header);
        this._position(clientX, clientY);
    }
}

window.StepContextMenu = StepContextMenu;