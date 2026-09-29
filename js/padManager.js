
(function () {
    'use strict';

    let _cascade = 0;
    const CASCADE_STEP = 28;
    const BASE_X = 40;
    const BASE_Y = 140;

    class PadManager {
        constructor(app) {
            this.app = app;
            this.cards = new Map();
            this._injectRoot();
            window.addEventListener('resize', () => this._reflow());
        }

        _injectRoot() {
            let root = document.getElementById('pad-cards-root');
            if (root) { this.root = root; return; }
            root = document.createElement('div');
            root.id = 'pad-cards-root';
            root.className = 'fx-cards-root';
            root.style.zIndex = '2050';
            document.body.appendChild(root);
            this.root = root;
        }

        isOpen(padIndex) {
            return this.cards.has(padIndex);
        }

        open(padIndex, padName) {
            const app = this.app;
            const pad = app.drumPads[padIndex];
            if (!pad) return;

            let entry = this.cards.get(padIndex);
            if (entry) {
                this._refresh(entry, pad, padIndex, padName);
                this._bringToFront(entry);
                return;
            }

            const el = this._buildCard(padIndex, padName);
            this.root.appendChild(el);
            entry = { el };
            this.cards.set(padIndex, entry);
            this._position(el);
            this._bindDrag(entry);

            requestAnimationFrame(() => {
                el.classList.add('show');
                this._refresh(entry, pad, padIndex, padName);
                this._buildSliders(entry, pad, padIndex);
            });
        }

        close(padIndex) {
            const entry = this.cards.get(padIndex);
            if (!entry) return;
            entry.el.classList.remove('show');
            const el = entry.el;
            setTimeout(() => { try { el.remove(); } catch (_) {} }, 180);
            this.cards.delete(padIndex);
        }

        closeAll() {
            for (const idx of Array.from(this.cards.keys())) this.close(idx);
        }


        _buildCard(padIndex, padName) {
            const el = document.createElement('div');
            el.className = 'fx-card pad-manager-card';
            el.dataset.padIndex = String(padIndex);

            el.innerHTML = `
                <div class="fx-card-header" data-role="header">
                    <span class="fx-card-title" data-role="title">${padName}</span>
                    <button class="fx-card-close" data-role="close" aria-label="Close">
                        <i class="fa-solid fa-xmark"></i>
                    </button>
                </div>
                <div class="fx-card-body">
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                        <button class="fx-toggle-btn" data-role="solo" title="Solo">
                            <i class="fa-solid fa-headphones"></i><br>Solo
                        </button>
                        <button class="fx-toggle-btn" data-role="mute" title="Mute">
                            <i class="fa-solid fa-volume-xmark"></i><br>Mute
                        </button>
                        <button class="fx-toggle-btn" data-role="reset" title="Reset Pad">
                            <i class="fa-solid fa-rotate-left"></i><br>Reset
                        </button>
                    </div>

                    <div class="pad-fx-launchers" data-role="fx-launchers"></div>

                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        <div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                <span style="font-size:11px; color:var(--text-dim);">Volume</span>
                                <span data-role="vol-val" style="font-size:11px; color:var(--primary);">100%</span>
                            </div>
                            <div data-role="vol-slider"></div>
                        </div>
                        <div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:5px;">
                                <span style="font-size:11px; color:var(--text-dim);">Pitch</span>
                                <span data-role="pitch-val" style="font-size:11px; color:var(--primary);">0 st</span>
                            </div>
                            <div data-role="pitch-slider"></div>
                        </div>
                    </div>
                </div>
            `;

            const $ = (sel) => el.querySelector(`[data-role="${sel}"]`);

            $('close').addEventListener('click', () => this.close(padIndex));
            $('solo').addEventListener('click', () => this.app.togglePadSolo(padIndex));
            $('mute').addEventListener('click', () => this.app.togglePadMute(padIndex));
            $('reset').addEventListener('click', () => this.app.resetPad(padIndex));

            return el;
        }


        _refresh(entry, pad, padIndex, padName) {
            const el = entry.el;
            const $ = (sel) => el.querySelector(`[data-role="${sel}"]`);
            const title = padName || 'PAD ' + (padIndex+1);

            $('title').textContent = `${title}`;
            $('solo').classList.toggle('active', !!pad.solo);
            $('mute').classList.toggle('active', !!pad.muted);
            $('vol-val').textContent = Math.round((pad.volume || 1) * 100) + '%';
            $('pitch-val').textContent = (pad.pitch || 0) + ' st';

            this._buildFxLaunchers(el, padIndex);
        }

        _buildFxLaunchers(cardEl, padIndex) {
            const host = cardEl.querySelector('[data-role="fx-launchers"]');
            if (!host) return;
            const pad = this.app.drumPads[padIndex];
            if (!pad) return;

            host.innerHTML = '';

            if (!pad.effects) pad.effects = {};
            if (!pad.effectStates) pad.effectStates = {};

            const fxTypes = window.FX_TYPES || [];
            fxTypes.forEach(fxName => {
                if (pad.effects[fxName] === undefined) pad.effects[fxName] = false;
                if (!pad.effectStates[fxName]) {
                    const def = this.app.audioEngine?.effectStates?.[fxName];
                    pad.effectStates[fxName] = def ? JSON.parse(JSON.stringify(def)) : {};
                }

                const btn = document.createElement('button');
                btn.className = 'pad-fx-btn';
                btn.classList.toggle('active', !!pad.effects[fxName]);
                btn.textContent = fxName.charAt(0).toUpperCase() + fxName.slice(1);
                btn.addEventListener('click', () => {
                    this.app.openPadFx(padIndex, fxName);
                    requestAnimationFrame(() =>
                        btn.classList.toggle('active', !!pad.effects[fxName]));
                });
                host.appendChild(btn);
            });
        }

        _buildSliders(entry, pad, padIndex) {
            if (typeof createRNSlider === 'undefined') return;
            const el = entry.el;
            const $ = (sel) => el.querySelector(`[data-role="${sel}"]`);

            const makeSlider = (hostSel, param, min, max, step, onUpdate) => {
                const host = $(hostSel);
                if (!host) return;
                host.innerHTML = '';
                const s = createRNSlider({
                    label: '', min, max,
                    value: pad[param] !== undefined ? pad[param] : 0,
                    step, orientation: 'horizontal', width: 280, height: 40,
                    fitToParent: true,
                    theme: { accent: '#00e676', bg: ['#222', '#111'], rail: ['#444', '#333'] },
                    onChange: (v) => onUpdate(v),
                });
                host.appendChild(s);
            };

            makeSlider('vol-slider', 'volume', 0, 1, 0.01,
                (v) => this.app.updatePadVolume(padIndex, v));
            makeSlider('pitch-slider', 'pitch', -24, 24, 1,
                (v) => this.app.updatePadPitch(padIndex, v));
        }


        _position(el) {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            let x = BASE_X + (_cascade * CASCADE_STEP);
            let y = BASE_Y + (_cascade * CASCADE_STEP);
            if (x + 340 > vw - 12 || y + 300 > vh - 12) {
                _cascade = 0;
                x = BASE_X;
                y = BASE_Y;
            }
            _cascade++;
            el.style.left = x + 'px';
            el.style.top = y + 'px';
        }

        _bindDrag(entry) {
            const el = entry.el;
            const header = el.querySelector('[data-role="header"]');
            let dragging = false;
            let sx = 0, sy = 0, sl = 0, st = 0;

            const onDown = (e) => {
                if (e.target.closest('button')) return;
                const p = e.touches ? e.touches[0] : e;
                dragging = true;
                sx = p.clientX; sy = p.clientY;
                const rect = el.getBoundingClientRect();
                sl = rect.left; st = rect.top;
                el.style.right = 'auto';
                el.style.bottom = 'auto';
                this._bringToFront(entry);
                if (e.cancelable) e.preventDefault();
            };
            const onMove = (e) => {
                if (!dragging) return;
                const p = e.touches ? e.touches[0] : e;
                const dx = p.clientX - sx;
                const dy = p.clientY - sy;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const w = el.offsetWidth, h = el.offsetHeight;
                el.style.left = Math.max(0, Math.min(vw - w, sl + dx)) + 'px';
                el.style.top = Math.max(0, Math.min(vh - 40, st + dy)) + 'px';
                if (e.cancelable) e.preventDefault();
            };
            const onUp = () => { dragging = false; };

            header.addEventListener('pointerdown', onDown);
            window.addEventListener('pointermove', onMove, { passive: false });
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
        }

        _bringToFront(entry) {
            if (!this._z) this._z = 2050;
            this._z++;
            entry.el.style.zIndex = String(this._z);
        }

        _reflow() {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            this.cards.forEach(entry => {
                const r = entry.el.getBoundingClientRect();
                if (r.right > vw) entry.el.style.left = Math.max(0, vw - r.width - 8) + 'px';
                if (r.bottom > vh) entry.el.style.top = Math.max(0, vh - r.height - 8) + 'px';
            });
        }
    }

    window.PadManager = PadManager;
})();