
(function () {
    'use strict';

    let _cascadeIndex = 0;
    const CASCADE_STEP = 24;
    const BASE_X = 24;
    const BASE_Y = 80;

    class FXEditor {
        constructor() {
            this.cards = new Map();
            this._injectRoot();
            window.addEventListener('resize', () => this._reflowAll());
        }

        _injectRoot() {
            let root = document.getElementById('fx-cards-root');
            if (root) { this.root = root; return; }
            root = document.createElement('div');
            root.id = 'fx-cards-root';
            root.className = 'fx-cards-root';
            document.body.appendChild(root);
            this.root = root;
        }

        open(opts) {
            const { cardId, fxName } = opts;
            if (!cardId || !fxName) return;

            let card = this.cards.get(cardId);
            if (card) {
                this._refreshCard(card, opts);
                this._bringToFront(card);
                return;
            }

            card = this._buildCard(opts);
            this.cards.set(cardId, card);
            this.root.appendChild(card.el);
            this._position(card.el);
            this._bindDrag(card);
            requestAnimationFrame(() => card.el.classList.add('show'));
        }

        close(cardId) {
            const card = this.cards.get(cardId);
            if (!card) return;
            card.el.classList.remove('show');
            setTimeout(() => {
                try { card.el.remove(); } catch (_) {}
            }, 180);
            this.cards.delete(cardId);
            if (card.opts && typeof card.opts.onClose === 'function') {
                try { card.opts.onClose(); } catch (_) {}
            }
        }

        closeByPrefix(prefix) {
            for (const id of Array.from(this.cards.keys())) {
                if (id.startsWith(prefix)) this.close(id);
            }
        }

        isOpen(cardId) { return this.cards.has(cardId); }


        _buildCard(opts) {
            const { fxName, title, state, onParamChange, onToggle, onReset,
                    isOn, hidePower } = opts;

            const cfg = window.FX_CONFIG[fxName] || {};
            const labels = cfg.labels || {};
            const ranges = cfg.ranges || {};
            const layout = cfg.layout || 'stack';

            const el = document.createElement('div');
            el.className = 'fx-card';
            el.dataset.fxName = fxName;
            el.dataset.cardId = opts.cardId;

            const header = document.createElement('div');
            header.className = 'fx-card-header';
            header.innerHTML =
                `<span class="fx-card-title">${title || fxName}</span>` +
                `<button class="fx-card-close" aria-label="Close">` +
                    `<i class="fa-solid fa-xmark"></i>` +
                `</button>`;
            el.appendChild(header);

            const body = document.createElement('div');
            body.className = 'fx-card-body';
            el.appendChild(body);

            if (!hidePower) {
                const row = document.createElement('div');
                row.className = 'fx-card-actions';

                const powerBtn = document.createElement('button');
                powerBtn.className = 'fx-card-btn fx-card-power';
                powerBtn.classList.toggle('active', !!isOn);
                powerBtn.innerHTML =
                    `<i class="fa-solid fa-power-off"></i>` +
                    `<span>${isOn ? 'ON' : 'OFF'}</span>`;
                powerBtn.addEventListener('click', () => {
                    const nowOn = !powerBtn.classList.contains('active');
                    powerBtn.classList.toggle('active', nowOn);
                    powerBtn.querySelector('span').textContent = nowOn ? 'ON' : 'OFF';
                    if (typeof onToggle === 'function') onToggle(nowOn);
                });
                row.appendChild(powerBtn);

                const resetBtn = document.createElement('button');
                resetBtn.className = 'fx-card-btn';
                resetBtn.innerHTML =
                    `<i class="fa-solid fa-rotate-left"></i><span>Reset</span>`;
                resetBtn.addEventListener('click', () => {
                    if (typeof onReset === 'function') onReset();
                });
                row.appendChild(resetBtn);

                body.appendChild(row);
            }

            const slidersHost = document.createElement('div');
            slidersHost.className = `fx-card-sliders fx-card-layout-${layout}`;
            body.appendChild(slidersHost);

            Object.keys(state).forEach(key => {
                if (key === 'type') return;
                const [min, max, step] = ranges[key] || [0, 100, 1];
                const isEq = layout === 'row-compact-vertical';

                const wrapper = document.createElement('div');
                wrapper.className = isEq
                    ? 'fx-card-slider-eq'
                    : 'fx-card-slider-stack';

                if (isEq) {
                    const labelEl = document.createElement('span');
                    labelEl.className = 'fx-card-slider-label';
                    labelEl.textContent = labels[key] || key;
                    wrapper.appendChild(labelEl);
                }

                const sliderHost = document.createElement('div');
                sliderHost.className = 'fx-card-slider-host';
                wrapper.appendChild(sliderHost);

                const slider = createRNSlider({
                    label: isEq ? '' : (labels[key] || key),
                    min, max, value: state[key], step,
                    orientation: isEq ? 'vertical' : 'horizontal',
                    width: isEq ? 50 : 300,
                    height: isEq ? 260 : 50,
                    fitToParent: true,
                    theme: {
                        accent: '#00e676',
                        bg: ['#222', '#111'],
                        rail: ['#444', '#333'],
                    },
                    onChange: (v) => {
                        state[key] = v;
                        if (typeof onParamChange === 'function') onParamChange(key, v);
                    },
                });
                sliderHost.appendChild(slider);
                slidersHost.appendChild(wrapper);
            });

            header.querySelector('.fx-card-close').addEventListener('click', () => {
                this.close(opts.cardId);
            });

            return {
                el,
                body,
                header,
                opts,
                cardId: opts.cardId,
                fxName,
            };
        }

        _refreshCard(card, opts) {
            card.opts = opts;
            const power = card.el.querySelector('.fx-card-power');
            if (power) {
                power.classList.toggle('active', !!opts.isOn);
                const span = power.querySelector('span');
                if (span) span.textContent = opts.isOn ? 'ON' : 'OFF';
            }
            const slidersHost = card.el.querySelector('.fx-card-sliders');
            if (!slidersHost) return;
            const inputs = slidersHost.querySelectorAll('.rn-slider-wrapper');
            const keys = Object.keys(opts.state).filter(k => k !== 'type');
            inputs.forEach((wrapper, i) => {
                const key = keys[i];
                if (key === undefined) return;
                if (typeof wrapper.setValue === 'function') {
                    wrapper.setValue(opts.state[key]);
                }
            });
        }

        _position(el) {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const w = 320;
            const h = 200;

            let x = BASE_X + (_cascadeIndex * CASCADE_STEP);
            let y = BASE_Y + (_cascadeIndex * CASCADE_STEP);

            if (x + w > vw - 12 || y + h > vh - 12) {
                _cascadeIndex = 0;
                x = BASE_X;
                y = BASE_Y;
            }
            _cascadeIndex++;

            el.style.left = x + 'px';
            el.style.top = y + 'px';
        }

        _bindDrag(card) {
            const el = card.el;
            const header = card.header;
            let dragging = false;
            let startX = 0, startY = 0, startLeft = 0, startTop = 0;

            const onDown = (e) => {
                if (e.target.closest('button')) return;
                const p = e.touches ? e.touches[0] : e;
                dragging = true;
                startX = p.clientX;
                startY = p.clientY;
                const rect = el.getBoundingClientRect();
                startLeft = rect.left;
                startTop = rect.top;
                el.style.right = 'auto';
                el.style.bottom = 'auto';
                this._bringToFront(card);
                if (e.cancelable) e.preventDefault();
            };

            const onMove = (e) => {
                if (!dragging) return;
                const p = e.touches ? e.touches[0] : e;
                const dx = p.clientX - startX;
                const dy = p.clientY - startY;
                const vw = window.innerWidth;
                const vh = window.innerHeight;
                const w = el.offsetWidth;
                const h = el.offsetHeight;
                const newLeft = Math.max(0, Math.min(vw - w, startLeft + dx));
                const newTop = Math.max(0, Math.min(vh - 40, startTop + dy));
                el.style.left = newLeft + 'px';
                el.style.top = newTop + 'px';
                if (e.cancelable) e.preventDefault();
            };

            const onUp = () => { dragging = false; };

            header.addEventListener('pointerdown', onDown);
            window.addEventListener('pointermove', onMove, { passive: false });
            window.addEventListener('pointerup', onUp);
            window.addEventListener('pointercancel', onUp);
        }

        _bringToFront(card) {
            if (!this._zCounter) this._zCounter = 100;
            this._zCounter++;
            card.el.style.zIndex = String(this._zCounter);
        }

        _reflowAll() {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            this.cards.forEach(card => {
                const rect = card.el.getBoundingClientRect();
                if (rect.right > vw) {
                    card.el.style.left = Math.max(0, vw - rect.width - 8) + 'px';
                }
                if (rect.bottom > vh) {
                    card.el.style.top = Math.max(0, vh - rect.height - 8) + 'px';
                }
            });
        }
    }

    window.FXEditor = FXEditor;
    window.fxEditor = new FXEditor();
})();