
(function () {
    'use strict';

    class PresetParams {
        constructor(app) {
            this.app = app;
            this.el = null;
            this.bodyEl = null;
            this._built = false;
            this._rowRefs = new Map();
            this._headerHandler = null;
            this._escHandler = null;
        }


        _build() {
            if (this._built) return;

            const el = document.createElement('div');
            el.id = 'preset-params-card';
            el.className = 'preset-params-card';
            el.innerHTML = `
                <div class="preset-params-header" data-role="header">
                    <span class="preset-params-title">Preset Parameters</span>
                    <div class="preset-params-header-actions">
                        <button class="preset-params-mini-btn" data-role="reset" title="Reset to defaults">
                            <i class="fa-solid fa-rotate-left"></i>
                        </button>
                        <button class="preset-params-close" data-role="close" aria-label="Close">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>
                </div>
                <div class="preset-params-body" data-role="body"></div>
            `;
            document.body.appendChild(el);

            this.el = el;
            this.bodyEl = el.querySelector('[data-role="body"]');

            el.querySelector('[data-role="close"]').addEventListener('click', () => this.close());

            el.querySelector('[data-role="reset"]').addEventListener('click', () => this._resetAll());

            this._bindDrag(el.querySelector('[data-role="header"]'), el);

            this._escHandler = (e) => {
                if (e.key === 'Escape' && this.el && this.el.classList.contains('show')) {
                    this.close();
                }
            };
            document.addEventListener('keydown', this._escHandler);

            this._buildRows();
            this._built = true;
        }

        _bindDrag(handle, modal) {
            let dragging = false;
            let startX = 0, startY = 0, startLeft = 0, startTop = 0;

            const onDown = (e) => {
                if (e.target.closest('button, input, select')) return;
                const p = e.touches ? e.touches[0] : e;
                dragging = true;
                startX = p.clientX; startY = p.clientY;
                const rect = modal.getBoundingClientRect();
                startLeft = rect.left; startTop = rect.top;
                modal.style.right = 'auto';
                modal.style.bottom = 'auto';
                modal.style.left = startLeft + 'px';
                modal.style.top = startTop + 'px';
                if (e.cancelable) e.preventDefault();
            };
            const onMove = (e) => {
                if (!dragging) return;
                const p = e.touches ? e.touches[0] : e;
                const dx = p.clientX - startX;
                const dy = p.clientY - startY;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const w = modal.offsetWidth;
                const h = modal.offsetHeight;
                modal.style.left = Math.max(0, Math.min(vw - w, startLeft + dx)) + 'px';
                modal.style.top = Math.max(0, Math.min(vh - 40, startTop + dy)) + 'px';
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


        _buildRows() {
            const schema = window.VOICE_SCHEMA;
            const groupLabels = window.VOICE_GROUP_LABELS || {};
            const keysInGroup = window.Voice ? Voice.keysInGroup : null;
            if (!schema || !keysInGroup) {
                console.warn('PresetParams: VOICE_SCHEMA not loaded');
                return;
            }

            this.bodyEl.innerHTML = '';
            this._rowRefs.clear();

            const groupOrder = ['osc1', 'unison', 'sub', 'osc2', 'noise', 'amp', 'filter', 'filterEnv', 'lfo', 'glide'];

            groupOrder.forEach(groupId => {
                const keys = keysInGroup(groupId);
                if (!keys || keys.length === 0) return;

                const section = document.createElement('div');
                section.className = 'preset-params-section';
                section.innerHTML = `<div class="preset-params-section-header">${groupLabels[groupId] || groupId}</div>`;

                keys.forEach(key => {
                    const spec = schema[key];
                    if (!spec) return;
                    const row = this._buildRow(key, spec);
                    if (row) section.appendChild(row);
                });

                this.bodyEl.appendChild(section);
            });

            this.syncFromEngine();
        }

        _buildRow(key, spec) {
            const row = document.createElement('div');
            row.className = 'preset-params-row';

            const label = document.createElement('span');
            label.className = 'preset-params-label';
            label.textContent = spec.label || key;
            row.appendChild(label);

            if (spec.type === 'bool') {
                const toggle = document.createElement('button');
                toggle.className = 'preset-params-toggle';
                toggle.dataset.key = key;
                toggle.innerHTML = '<span>OFF</span>';
                toggle.addEventListener('click', () => {
                    const cur = !!this.app.audioEngine.params[key];
                    const next = !cur;
                    toggle.classList.toggle('active', next);
                    toggle.querySelector('span').textContent = next ? 'ON' : 'OFF';
                    this._setParam(key, next);
                });
                row.appendChild(toggle);

                this._rowRefs.set(key, {
                    type: 'bool',
                    setValue: (v) => {
                        const on = !!v;
                        toggle.classList.toggle('active', on);
                        toggle.querySelector('span').textContent = on ? 'ON' : 'OFF';
                    },
                });
                return row;
            }

            if (spec.type === 'enum') {
                const select = document.createElement('select');
                select.className = 'preset-params-select';
                select.dataset.key = key;
                (spec.values || []).forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v;
                    opt.textContent = v.charAt(0).toUpperCase() + v.slice(1);
                    select.appendChild(opt);
                });
                select.addEventListener('change', () => {
                    this._setParam(key, select.value);
                });
                row.appendChild(select);

                this._rowRefs.set(key, {
                    type: 'enum',
                    setValue: (v) => { select.value = v; },
                });
                return row;
            }

            if (spec.type === 'num') {
                const valueEl = document.createElement('span');
                valueEl.className = 'preset-params-value';
                valueEl.textContent = '';

                const sliderHost = document.createElement('div');
                sliderHost.className = 'preset-params-slider-host';

                const wrap = document.createElement('div');
                wrap.className = 'preset-params-slider-wrap';
                wrap.appendChild(sliderHost);
                wrap.appendChild(valueEl);

                row.appendChild(wrap);

                const step = spec.step ?? 0.01;
                const min = spec.min ?? 0;
                const max = spec.max ?? 100;
                const initial = this.app.audioEngine.params[key] ?? spec.default ?? 0;

                const slider = createRNSlider({
                    label: '',
                    min, max,
                    value: initial,
                    step,
                    orientation: 'horizontal',
                    width: 260,
                    height: 40,
                    fitToParent: true,
                    theme: {
                        accent: '#00e676',
                        bg: ['#222', '#111'],
                        rail: ['#444', '#333'],
                    },
                    onChange: (v) => {
                        const num = parseFloat(v);
                        this._setParam(key, num);
                        this._updateValueText(valueEl, num, spec);
                    },
                });
                sliderHost.appendChild(slider);
                this._updateValueText(valueEl, initial, spec);

                this._rowRefs.set(key, {
                    type: 'num',
                    setValue: (v) => {
                        if (typeof slider.setValue === 'function') slider.setValue(v);
                        this._updateValueText(valueEl, v, spec);
                    },
                });
                return row;
            }

            return null;
        }

        _updateValueText(el, v, spec) {
            if (typeof v !== 'number') { el.textContent = String(v); return; }
            const decimals = (spec.step && spec.step < 1)
                ? String(spec.step).split('.')[1]?.length || 2
                : 0;
            let txt = v.toFixed(Math.min(decimals, 3));
            if (spec.max >= 1000 && v >= 1000) {
                txt = Math.round(v).toString();
            }
            if (spec.unit) txt += ' ' + spec.unit;
            el.textContent = txt;
        }


        _setParam(key, value) {
            const ae = this.app.audioEngine;
            if (!ae) return;

            ae.updateParams({ [key]: value });

            if (key === 'attack' || key === 'decay' || key === 'sustain' || key === 'release') {
                if (!ae.effectStates.adsr) ae.effectStates.adsr = {};
                ae.effectStates.adsr[key] = value;
            }
        }

        _resetAll() {
            if (!confirm('Reset all voice parameters to defaults?')) return;
            const ae = this.app.audioEngine;
            const defaults = (window.Voice && Voice.defaults) ? Voice.defaults() : null;
            if (!defaults) return;

            Object.keys(defaults).forEach(key => {
                this._setParam(key, defaults[key]);
            });

            this._rowRefs.forEach((ref, key) => {
                const v = defaults[key];
                try { ref.setValue(v); } catch (_) {}
            });
        }


        syncFromEngine() {
            if (!this._built) return;
            const ae = this.app.audioEngine;
            if (!ae) return;
            const p = ae.params;

            this._rowRefs.forEach((ref, key) => {
                const v = p[key];
                if (v === undefined) return;
                try { ref.setValue(v); } catch (_) {}
            });
        }


        open() {
            this._build();
            this.el.style.display = 'flex';
            this.syncFromEngine();
            requestAnimationFrame(() => this.el.classList.add('show'));
        }

        close() {
            if (!this.el) return;
            this.el.classList.remove('show');
            setTimeout(() => {
                if (this.el && !this.el.classList.contains('show')) {
                    this.el.style.display = 'none';
                }
            }, 200);
        }

        toggle() {
            if (this.el && this.el.classList.contains('show')) this.close();
            else this.open();
        }

        destroy() {
            if (this._escHandler) document.removeEventListener('keydown', this._escHandler);
            if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
            this.el = null;
            this._built = false;
        }
    }

    window.PresetParams = PresetParams;
})();