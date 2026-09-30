// js/sequencerSelection.js
// Step selection engine — desktop + mobile.
(function () {
    'use strict';

    const LONG_PRESS_MS = 400;
    const DRAG_THRESHOLD_PX = 5;
    const MARQUEE_THRESHOLD_PX = 6;

    class SequencerSelection {
        constructor(seq, opts) {
            this.seq = seq;
            this.mode = 'edit';                  // 'edit' | 'transform' (transform affects touch only)
            this.selected = new Set();           // "row,step"
            this.anchor = null;                  // { r, s }
            this.clipboard = null;               // { width, height, cells }
            this.lastMouseCell = null;           // for Ctrl+V paste position

            this._marqueeEl = null;
            this._transformState = null;
            this._pressTimer = null;
            this.onChange = null;

            this.opts = Object.assign({
                cellSelector: '.seq-step, .ss-step',
                rowDataAttr: 'data-pad',
                stepDataAttr: 'data-step',
                stepIndexBase: 1,
                gridEl: () => document.getElementById('sequencer'),
            }, opts || {});

            this._bindGlobalDeselect();
        }

        // ------------------------------------------------------------
        // Selection model
        // ------------------------------------------------------------

        _key(r, s) { return r + ',' + s; }
        isSelected(r, s) { return this.selected.has(this._key(r, s)); }
        hasSelection() { return this.selected.size > 0; }

        toggle(r, s) {
            const k = this._key(r, s);
            if (this.selected.has(k)) this.selected.delete(k);
            else this.selected.add(k);
            this.anchor = { r, s };
            this._fireChange();
        }

        select(r, s) {
            this.selected.clear();
            this.selected.add(this._key(r, s));
            this.anchor = { r, s };
            this._fireChange();
        }

        selectRange(r1, s1, r2, s2, additive = false) {
            if (!additive) this.selected.clear();
            const rA = Math.min(r1, r2), rB = Math.max(r1, r2);
            const sA = Math.min(s1, s2), sB = Math.max(s1, s2);
            for (let r = rA; r <= rB; r++)
                for (let s = sA; s <= sB; s++)
                    this.selected.add(this._key(r, s));
            this._fireChange();
        }

        clear() {
            if (this.selected.size === 0) return;
            this.selected.clear();
            this.anchor = null;
            this._fireChange();
        }

        selectAll() {
            const grid = this.seq.pattern;
            for (let r = 0; r < grid.length; r++)
                for (let s = 0; s < this.seq.steps; s++)
                    this.selected.add(this._key(r, s));
            this._fireChange();
        }

        getBounds() {
            if (this.selected.size === 0) return null;
            let rMin = Infinity, rMax = -Infinity, sMin = Infinity, sMax = -Infinity;
            this.selected.forEach(k => {
                const [r, s] = k.split(',').map(Number);
                rMin = Math.min(rMin, r); rMax = Math.max(rMax, r);
                sMin = Math.min(sMin, s); sMax = Math.max(sMax, s);
            });
            return { rMin, rMax, sMin, sMax,
                     height: rMax - rMin + 1,
                     width:  sMax - sMin + 1 };
        }

        moveBy(dR, dS, duplicate = false) {
            if (this.selected.size === 0) return false;

            const seq = this.seq;
            const before = seq.pattern.map(row => row.map(c => seq._normStep(c)));
            const selBefore = new Set(this.selected);

            const ok = this._applyMove(dR, dS, duplicate);
            if (!ok) return false;

            const after = seq.pattern.map(row => row.map(c => seq._normStep(c)));
            const selAfter = new Set(this.selected);

            if (window.app?.history) {
                const self = this;
                const coalesceKey = 'seq-arrow-move';
                window.app.history.push({
                    label: duplicate ? 'Duplicate Steps' : 'Move Steps',
                    coalesceKey,
                    do: () => {
                        seq.pattern = after.map(row => row.map(c => ({ ...c })));
                        self.selected = new Set(selAfter);
                        self._refreshDOM();
                    },
                    undo: () => {
                        seq.pattern = before.map(row => row.map(c => ({ ...c })));
                        self.selected = new Set(selBefore);
                        self._refreshDOM();
                    },
                });
                clearTimeout(this._arrowCoalesceTimer);
                this._arrowCoalesceTimer = setTimeout(() => {
                    // Force next arrow to make a fresh history entry
                    if (window.app.history) window.app.history._lastCoalesceKey = null;
                }, 500);
            }
            return true;
        }

        // ------------------------------------------------------------
        // Copy / cut / paste / delete
        // ------------------------------------------------------------

        copy() {
            const b = this.getBounds();
            if (!b) return false;
            const grid = this.seq.pattern;
            const cells = [];
            for (let r = b.rMin; r <= b.rMax; r++) {
                const row = [];
                for (let s = b.sMin; s <= b.sMax; s++) {
                    row.push(this.isSelected(r, s)
                        ? { ...this.seq._normStep(grid[r][s]) }
                        : null);
                }
                cells.push(row);
            }
            this.clipboard = { width: b.width, height: b.height, cells };
            window.app?.showToast?.(`Copied ${this.selected.size} step(s)`);
            return true;
        }

        cut() {
            if (!this.copy()) return false;

            const seq = this.seq;
            const grid = seq.pattern;
            const before = grid.map(row => row.map(c => seq._normStep(c)));
            const beforeSel = new Set(this.selected);   // preserve selection

            beforeSel.forEach(k => {
                const [r, s] = k.split(',').map(Number);
                grid[r][s] = seq._blankCell();
            });

            const after = grid.map(row => row.map(c => seq._normStep(c)));

            if (window.app?.history) {
                const self = this;
                window.app.history.push({
                    label: 'Cut Steps',
                    do: () => {
                        seq.pattern = after.map(row => row.map(c => ({ ...c })));
                        self.selected = new Set(beforeSel);   // keep selection
                        self._refreshDOM();
                    },
                    undo: () => {
                        seq.pattern = before.map(row => row.map(c => ({ ...c })));
                        self.selected = new Set(beforeSel);
                        self._refreshDOM();
                    },
                });
            }

            // Keep the selection alive so user can immediately Ctrl+V at the same spot
            this.selected = new Set(beforeSel);
            this._refreshDOM();
            window.app?.showToast?.(`Cut ${this.selected.size} step(s) — press Ctrl+V to paste`);

            return true;
        }

        paste(atR = null, atS = null) {
            if (!this.clipboard) return false;
            const b = this.getBounds();
            const mouse = this.lastMouseCell;
            const anchorR = atR ?? (b ? b.rMin : (mouse?.r ?? this.anchor?.r ?? 0));
            const anchorS = atS ?? (b ? b.sMin : (mouse?.s ?? this.anchor?.s ?? 0));

            const seq = this.seq;
            const grid = seq.pattern;
            const cp = this.clipboard;
            const before = grid.map(row => row.map(c => seq._normStep(c)));

            const newSel = new Set();
            for (let rOff = 0; rOff < cp.height; rOff++) {
                for (let sOff = 0; sOff < cp.width; sOff++) {
                    const cell = cp.cells[rOff][sOff];
                    if (cell === null) continue;
                    const r = anchorR + rOff;
                    const s = anchorS + sOff;
                    if (r < 0 || r >= grid.length) continue;
                    if (s < 0 || s >= seq.steps) continue;
                    grid[r][s] = { ...cell };
                    newSel.add(this._key(r, s));
                }
            }

            const after = grid.map(row => row.map(c => seq._normStep(c)));

            if (window.app?.history) {
                const self = this;
                window.app.history.push({
                    label: 'Paste Steps',
                    do: () => {
                        seq.pattern = after.map(row => row.map(c => ({ ...c })));
                        self.selected = new Set(newSel);
                        self._refreshDOM();
                    },
                    undo: () => {
                        seq.pattern = before.map(row => row.map(c => ({ ...c })));
                        self.selected = new Set();
                        self._refreshDOM();
                    },
                });
            }

            this.selected = newSel;
            this.anchor = { r: anchorR, s: anchorS };
            this._refreshDOM();
            return true;
        }

        delete() {
            if (this.selected.size === 0) return false;
            const seq = this.seq;
            const grid = seq.pattern;
            const before = grid.map(row => row.map(c => seq._normStep(c)));
            const beforeSel = new Set(this.selected);

            beforeSel.forEach(k => {
                const [r, s] = k.split(',').map(Number);
                grid[r][s] = seq._blankCell();
            });

            const after = grid.map(row => row.map(c => seq._normStep(c)));

            if (window.app?.history) {
                const self = this;
                window.app.history.push({
                    label: 'Delete Steps',
                    do: () => {
                        seq.pattern = after.map(row => row.map(c => ({ ...c })));
                        self.selected = new Set();
                        self._refreshDOM();
                    },
                    undo: () => {
                        seq.pattern = before.map(row => row.map(c => ({ ...c })));
                        self.selected = new Set(beforeSel);
                        self._refreshDOM();
                    },
                });
            }

            this.selected = new Set();
            this._refreshDOM();
            return true;
        }

        // ------------------------------------------------------------
        // Cell wiring — called from parent's render()
        // ------------------------------------------------------------

        wireCell(el, r, s) {
            if (el._seqSelWired) return;
            el._seqSelWired = true;
            const self = this;

            el.addEventListener('pointerdown', (e) => {
                // Only left button / touch
                if (e.pointerType === 'mouse' && e.button !== 0) return;

                const isTouch = e.pointerType === 'touch' || matchMedia('(pointer: coarse)').matches;
                const mod = e.ctrlKey || e.metaKey;

                // Update last mouse cell
                self.lastMouseCell = { r, s };

                // ---- Touch path ----
                if (isTouch) {
                    self._onTouchStart(el, r, s, e);
                    return;
                }

                // ---- Ctrl/Cmd + click → toggle selection ----
                if (mod) {
                    e.preventDefault();
                    e.stopPropagation();
                    self.toggle(r, s);
                    // Also consider marquee: if user drags far, start marquee
                    self._maybeStartMarquee(e, r, s);
                    return;
                }

                // ---- Plain click on a selected cell → prepare drag-move ----
                if (self.isSelected(r, s)) {
                    e.preventDefault();
                    e.stopPropagation();
                    self._beginMoveDrag(r, s, e);
                    return;
                }

                // ---- Plain click on unselected cell → let existing handler run ----
                // (existing per-step toggle is triggered by click listener in parent)
                // But we need to clear selection and re-anchor
                if (self.selected.size > 0) {
                    // Keep selection but update anchor (so arrow keys work from here)
                    self.anchor = { r, s };
                    self.lastMouseCell = { r, s };
                }
            }, { passive: false });

            // Track hover position for Ctrl+V paste-at-cursor
            el.addEventListener('pointerenter', () => {
                self.lastMouseCell = { r, s };
            });
        }

        // ------------------------------------------------------------
        // Ctrl+drag marquee
        // ------------------------------------------------------------

        _maybeStartMarquee(e, r, s) {
            const self = this;
            const startX = e.clientX, startY = e.clientY;
            let moved = false;
            let marqueeEl = null;

            const onMove = (ev) => {
                if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < MARQUEE_THRESHOLD_PX) return;
                if (!moved) {
                    moved = true;
                    marqueeEl = document.createElement('div');
                    marqueeEl.className = 'seq-marquee';
                    document.body.appendChild(marqueeEl);
                }
                ev.preventDefault();
                const x = Math.min(startX, ev.clientX);
                const y = Math.min(startY, ev.clientY);
                marqueeEl.style.left = x + 'px';
                marqueeEl.style.top = y + 'px';
                marqueeEl.style.width = Math.abs(ev.clientX - startX) + 'px';
                marqueeEl.style.height = Math.abs(ev.clientY - startY) + 'px';
                marqueeEl._rect = { x1: startX, y1: startY, x2: ev.clientX, y2: ev.clientY };
            };

            const onUp = (ev) => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onUp);

                if (marqueeEl) {
                    const rect = marqueeEl._rect;
                    marqueeEl.remove();

                    // Compute cell range from pixel rect
                    const grid = self.opts.gridEl();
                    if (!grid || !rect) return;
                    const cells = grid.querySelectorAll(self.opts.cellSelector);
                    let rMin = Infinity, rMax = -Infinity, sMin = Infinity, sMax = -Infinity;
                    let hit = false;
                    const [x1, x2] = [Math.min(rect.x1, rect.x2), Math.max(rect.x1, rect.x2)];
                    const [y1, y2] = [Math.min(rect.y1, rect.y2), Math.max(rect.y1, rect.y2)];
                    cells.forEach(cell => {
                        const cRect = cell.getBoundingClientRect();
                        const cx = cRect.left + cRect.width / 2;
                        const cy = cRect.top + cRect.height / 2;
                        if (cx < x1 || cx > x2) return;
                        if (cy < y1 || cy > y2) return;
                        const cellR = parseInt(cell.dataset[self.opts.rowDataAttr === 'data-pad' ? 'pad' : 'row'], 10);
                        const cellS = parseInt(cell.dataset.step, 10) - self.opts.stepIndexBase;
                        rMin = Math.min(rMin, cellR); rMax = Math.max(rMax, cellR);
                        sMin = Math.min(sMin, cellS); sMax = Math.max(sMax, cellS);
                        hit = true;
                    });
                    if (hit) {
                        // Additive with Ctrl; the initial Ctrl+click already selected one cell
                        self.selectRange(rMin, sMin, rMax, sMax, /*additive*/ true);
                    }
                }
            };

            window.addEventListener('pointermove', onMove, { passive: false });
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
        }

        _beginMoveDrag(r, s, e) {
            const self = this;
            const seq = this.seq;
            const startX = e.clientX, startY = e.clientY;
            const duplicate = e.altKey === true;

            const grid = this.opts.gridEl();
            const sample = grid?.querySelector(this.opts.cellSelector);
            const cw = sample ? sample.getBoundingClientRect().width : 26;
            const ch = sample ? sample.getBoundingClientRect().height : 20;

            // ---- Snapshot for a single undo entry ----
            const snapshotBefore = seq.pattern.map(row => row.map(c => seq._normStep(c)));
            const snapshotSelBefore = new Set(this.selected);

            let started = false;
            let lastDR = 0, lastDS = 0;

            const onMove = (ev) => {
                const dx = ev.clientX - startX;
                const dy = ev.clientY - startY;
                if (!started && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
                if (!started) started = true;

                const dS = Math.round(dx / cw);
                const invertY = this.seq.constructor.name === 'SynthSequencer';
                const dR = invertY ? -Math.round(dy / ch) : Math.round(dy / ch);
                if (dS === lastDS && dR === lastDR) return;

                const stepDS = dS - lastDS;
                const stepDR = dR - lastDR;
                lastDS = dS; lastDR = dR;

                if (stepDS || stepDR) {
                    // Move without history (we'll push one entry at the end)
                    this._applyMove(stepDR, stepDS, duplicate);
                }
            };

            const onUp = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onUp);

                if (!started) return;

                const snapshotAfter = seq.pattern.map(row => row.map(c => seq._normStep(c)));
                const snapshotSelAfter = new Set(this.selected);

                if (window.app?.history) {
                    window.app.history.push({
                        label: duplicate ? 'Duplicate Steps' : 'Move Steps',
                        do: () => {
                            seq.pattern = snapshotAfter.map(row => row.map(c => ({ ...c })));
                            this.selected = new Set(snapshotSelAfter);
                            this._refreshDOM();
                        },
                        undo: () => {
                            seq.pattern = snapshotBefore.map(row => row.map(c => ({ ...c })));
                            this.selected = new Set(snapshotSelBefore);
                            this._refreshDOM();
                        },
                    });
                }
            };

            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
        }

        _applyMove(dR, dS, duplicate = false) {
            if (this.selected.size === 0) return false;
            const seq = this.seq;
            const grid = seq.pattern;

            const before = grid.map(row => row.map(c => seq._normStep(c)));
            const selBefore = new Set(this.selected);

            const dst = new Set();
            let valid = true;
            selBefore.forEach(k => {
                const [r, s] = k.split(',').map(Number);
                const nr = r + dR, ns = s + dS;
                if (nr < 0 || nr >= grid.length) { valid = false; return; }
                if (ns < 0 || ns >= seq.steps) { valid = false; return; }
                dst.add(this._key(nr, ns));
            });
            if (!valid) return false;

            if (!duplicate) {
                selBefore.forEach(k => {
                    const [r, s] = k.split(',').map(Number);
                    grid[r][s] = seq._blankCell();
                });
            }
            selBefore.forEach(k => {
                const [r, s] = k.split(',').map(Number);
                const nr = r + dR, ns = s + dS;
                grid[nr][ns] = { ...before[r][s] };
            });

            this.selected = dst;
            if (this.anchor) this.anchor = { r: this.anchor.r + dR, s: this.anchor.s + dS };

            this._refreshDOM();
            return true;
        }

        // ------------------------------------------------------------
        // Touch: long-press enters selection mode
        // ------------------------------------------------------------

        _onTouchStart(el, r, s, e) {
            const self = this;
            const startX = e.clientX, startY = e.clientY;
            let longPressed = false;

            this._pressTimer = setTimeout(() => {
                this._pressTimer = null;
                longPressed = true;
                this.seq._touchSelectionActive = true;
                this.toggle(r, s);
                if (navigator.vibrate) navigator.vibrate(15);
            }, LONG_PRESS_MS);

            const onMove = (ev) => {
                const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
                if (dist > DRAG_THRESHOLD_PX) {
                    if (this._pressTimer) { clearTimeout(this._pressTimer); this._pressTimer = null; }

                    // If transform mode + this cell is selected → drag-move
                    if (this.mode === 'transform' && this.isSelected(r, s)) {
                        this._beginMoveDrag(r, s, ev);
                        cleanup();
                    } else if (this.seq._touchSelectionActive) {
                        // Cancel touch gesture — let user scroll
                    }
                }
            };

            const onUp = () => {
                if (this._pressTimer) { clearTimeout(this._pressTimer); this._pressTimer = null; }
                cleanup();
                if (!longPressed) {
                    // Tap
                    if (this.seq._touchSelectionActive) {
                        this.toggle(r, s);
                    } else {
                        // Normal step toggle (existing behavior)
                        if (this.seq.toggleStep) this.seq.toggleStep(r, s);
                        else if (this.seq.selection === this) {
                            // synth: call toggleStep if exists
                        }
                    }
                }
            };

            const cleanup = () => {
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onUp);
                window.removeEventListener('pointercancel', onUp);
            };

            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
        }

        // ------------------------------------------------------------
        // Mode toggle (mobile + accessibility)
        // ------------------------------------------------------------

        setMode(mode) {
            if (mode !== 'edit' && mode !== 'transform') return;
            this.mode = mode;
            this._updateModeUI();
            this._fireChange();
        }
        toggleMode() { this.setMode(this.mode === 'edit' ? 'transform' : 'edit'); }

        _updateModeUI() {
            const isDrum = this.seq === window.app?.sequencer;
            const btn = document.getElementById(isDrum ? 'seq-mode-btn' : 'ss-mode-btn');
            if (btn) {
                btn.classList.toggle('active', this.mode === 'transform');
                const icon = btn.querySelector('i');
                if (icon) icon.className = this.mode === 'transform'
                    ? 'fa-solid fa-arrows-up-down-left-right'
                    : 'fa-solid fa-pen';
                btn.title = this.mode === 'transform'
                    ? 'Transform mode (drag selection to move)'
                    : 'Edit mode (tap to toggle steps)';
            }
            document.body.classList.toggle('seq-transform-mode', this.mode === 'transform');
        }

        // ------------------------------------------------------------
        // Visuals + change event
        // ------------------------------------------------------------

        applyVisuals() {
            const grid = this.opts.gridEl();
            if (!grid) return;
            const rowKey = this.opts.rowDataAttr === 'data-pad' ? 'pad' : 'row';
            grid.querySelectorAll(this.opts.cellSelector).forEach(cell => {
                const r = parseInt(cell.dataset[rowKey], 10);
                const s = parseInt(cell.dataset.step, 10) - this.opts.stepIndexBase;
                cell.classList.toggle('selected', this.isSelected(r, s));
            });
        }

        _refreshDOM() {
            const seq = this.seq;

            if (seq.constructor.name === 'SynthSequencer' && typeof seq._refreshRow === 'function') {
                const rowsToRefresh = new Set();

                // Rows with active cells now
                for (let r = 0; r < seq.pattern.length; r++) {
                    for (let s = 0; s < seq.steps; s++) {
                        const c = seq._normStep(seq.pattern[r][s]);
                        if (c.active) { rowsToRefresh.add(r); break; }
                    }
                }

                // Rows that currently show notes in the DOM (source of moved notes)
                const grid = this.opts.gridEl();
                if (grid) {
                    grid.querySelectorAll('.ss-row').forEach(rowEl => {
                        const r = parseInt(rowEl.dataset.row, 10);
                        if (rowEl.querySelector('.ss-note')) rowsToRefresh.add(r);
                    });
                }

                rowsToRefresh.forEach(r => {
                    try {
                        seq._refreshRow(r);
                        const g = this.opts.gridEl();
                        if (g) {
                            const rowEl = g.querySelector(`.ss-row[data-row="${r}"]`);
                            if (rowEl) {
                                rowEl.querySelectorAll('.ss-step').forEach(cell => {
                                    const s = parseInt(cell.dataset.step, 10);
                                    this.wireCell(cell, r, s);
                                });
                            }
                        }
                    } catch (err) {
                        console.warn('[selection] _refreshRow failed for row', r, err);
                    }
                });
            } else {
                // Drum: just re-apply per-cell visuals
                this._refreshStepVisuals();
            }

            this.applyVisuals();
            if (seq.app?.patterns) seq.app.patterns.updatePatternInfo?.();
        }

        _refreshStepVisuals() {
            const grid = this.opts.gridEl();
            if (!grid) return;

            const rowKey = this.opts.rowDataAttr === 'data-pad' ? 'pad' : 'row';
            const seq = this.seq;

            grid.querySelectorAll(this.opts.cellSelector).forEach(cell => {
                const r = parseInt(cell.dataset[rowKey], 10);
                const s = parseInt(cell.dataset.step, 10) - this.opts.stepIndexBase;
                if (!seq.pattern[r] || seq.pattern[r][s] === undefined) return;

                if (typeof seq._applyStepVisuals === 'function') {
                    seq._applyStepVisuals(cell, seq.pattern[r][s]);
                }
            });
        }

        _fireChange() {
            this._refreshDOM();
            if (typeof this.onChange === 'function') {
                try { this.onChange(this); } catch (_) {}
            }
        }

        // ------------------------------------------------------------
        // Global deselect on click-outside / Escape
        // ------------------------------------------------------------

        _bindGlobalDeselect() {
            // Preserve list: any click inside these elements keeps the selection
            const PRESERVE_SELECTORS = [
                '#sequencer',           // drum root
                '#synthseq',            // synth root
                '.seq-context-menu',
                '.step-context-menu',
                '.fx-editor-modal',
                '.fx-dropdown',
                '.modal-overlay',
                '.modal-content',
                '.tone-picker',
                '.preset-params',
            ];

            const shouldPreserve = (target) => {
                if (!target || !target.closest) return false;
                return PRESERVE_SELECTORS.some(sel => {
                    try { return !!target.closest(sel); } catch (_) { return false; }
                });
            };

            document.addEventListener('pointerdown', (e) => {
                if (this.selected.size === 0) return;
                if (e.button !== 0 && e.pointerType === 'mouse') return;   // left-click only
                if (shouldPreserve(e.target)) return;

                // Everything else → clear
                this.clear();
            }, { capture: true });
        }
    }

    window.SequencerSelection = SequencerSelection;
})();