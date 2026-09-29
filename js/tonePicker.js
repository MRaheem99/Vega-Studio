
(function () {
    'use strict';

    class TonePicker {
        constructor(app) {
            this.app = app;
            this.el = null;
            this.bodyEl = null;
            this.searchInput = null;
            this.categorySelect = null;
            this._currentCategory = 'All';
            this._currentSearch = '';
            this._built = false;
            this._unsubscribe = null;
        }


        _build() {
            if (this._built) return;

            const el = document.createElement('div');
            el.id = 'tone-picker-modal';
            el.className = 'tone-picker-overlay';
            el.innerHTML = `
                <div class="tone-picker">
                    <div class="tone-picker-header" data-role="header">
                        <span class="tone-picker-title">TONES</span>
                        <button class="tone-picker-close" data-role="close" aria-label="Close">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>

                    <div class="tone-picker-filters">
                        <input type="text" data-role="search" class="tone-picker-search"
                               placeholder="Search presets…" autocomplete="off">
                        <select data-role="category" class="tone-picker-category"></select>
                    </div>

                    <div class="tone-picker-list" data-role="list"></div>

                    <div class="tone-picker-actions">
                        <button class="tone-picker-btn" data-role="save-current">
                            <i class="fa-solid fa-floppy-disk"></i> Save Current
                        </button>
                        <button class="tone-picker-btn" data-role="import">
                            <i class="fa-solid fa-file-import"></i> Import
                        </button>
                        <button class="tone-picker-btn" data-role="export-all">
                            <i class="fa-solid fa-file-export"></i> Export
                        </button>
                    </div>

                    <input type="file" data-role="file" accept=".json,application/json" style="display:none;">
                </div>
            `;
            document.body.appendChild(el);

            this.el = el;
            this.bodyEl = el.querySelector('[data-role="list"]');
            this.searchInput = el.querySelector('[data-role="search"]');
            this.categorySelect = el.querySelector('[data-role="category"]');

            el.querySelector('[data-role="close"]').addEventListener('click', () => this.close());
            el.addEventListener('click', (e) => {
                if (e.target === el) this.close();
            });
            this.searchInput.addEventListener('input', (e) => {
                this._currentSearch = e.target.value;
                this._renderList();
            });
            this.categorySelect.addEventListener('change', (e) => {
                this._currentCategory = e.target.value;
                this._renderList();
            });

            el.querySelector('[data-role="save-current"]').addEventListener('click', () => this._promptSaveCurrent());
            el.querySelector('[data-role="import"]').addEventListener('click', () => {
                el.querySelector('[data-role="file"]').click();
            });
            el.querySelector('[data-role="file"]').addEventListener('change', async (e) => {
                const file = e.target.files && e.target.files[0];
                e.target.value = '';
                if (!file) return;
                await window.toneLibrary.importFromFile(file);
                this._populateCategories();
                this._renderList();
            });
            el.querySelector('[data-role="export-all"]').addEventListener('click', () => {
                window.toneLibrary.exportAllUserPresets();
            });

            this._bindDrag(el.querySelector('[data-role="header"]'), el);

            this._escHandler = (e) => {
                if (e.key === 'Escape' && this.el && this.el.classList.contains('show')) {
                    this.close();
                }
            };
            document.addEventListener('keydown', this._escHandler);

            if (window.toneLibrary) {
                this._unsubscribe = window.toneLibrary.subscribe(() => {
                    this._populateCategories();
                    this._renderList();
                });
            }

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


        _populateCategories() {
            if (!this.categorySelect) return;
            const lib = window.toneLibrary;
            if (!lib) return;
            const cats = lib.categories();
            const current = this._currentCategory;

            this.categorySelect.innerHTML = '';
            cats.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c;
                opt.textContent = c;
                this.categorySelect.appendChild(opt);
            });

            if (cats.includes(current)) this.categorySelect.value = current;
            else {
                this.categorySelect.value = 'All';
                this._currentCategory = 'All';
            }
        }

        _renderList() {
            if (!this.bodyEl) return;
            const lib = window.toneLibrary;
            if (!lib) return;

            this.bodyEl.innerHTML = '';

            let presets = (this._currentCategory === 'All')
                ? lib.all()
                : lib.byCategory(this._currentCategory);

            if (this._currentSearch) {
                const q = this._currentSearch.trim().toLowerCase();
                presets = presets.filter(p => {
                    if (p.name.toLowerCase().includes(q)) return true;
                    if (p.category.toLowerCase().includes(q)) return true;
                    if (p.author.toLowerCase().includes(q)) return true;
                    if (p.tags.some(t => t.toLowerCase().includes(q))) return true;
                    return false;
                });
            }

            if (presets.length === 0) {
                const empty = document.createElement('div');
                empty.className = 'tone-picker-empty';
                empty.textContent = this._currentSearch
                    ? `No presets match "${this._currentSearch}"`
                    : 'No presets in this category';
                this.bodyEl.appendChild(empty);
                return;
            }

            let currentGroupHeader = null;
            const grouped = (this._currentCategory === 'All');

            presets.forEach(preset => {
                if (grouped && preset.category !== currentGroupHeader) {
                    currentGroupHeader = preset.category;
                    const hdr = document.createElement('div');
                    hdr.className = 'tone-picker-group';
                    hdr.textContent = currentGroupHeader;
                    this.bodyEl.appendChild(hdr);
                }

                const row = document.createElement('div');
                row.className = 'tone-picker-item';
                row.dataset.author = preset.author;

                const badges = [];
                if (preset.author === 'user') {
                    badges.push('<span class="tone-badge user">USER</span>');
                }
                row.innerHTML = `
                    <div class="tone-picker-item-main">
                        <div class="tone-picker-item-name">${this._esc(preset.name)}</div>
                        <div class="tone-picker-item-meta">
                            ${this._esc(preset.category)}${preset.tags.length ? ' · ' + preset.tags.slice(0,3).map(t => this._esc(t)).join(', ') : ''}
                        </div>
                    </div>
                    <div class="tone-picker-item-badges">${badges.join('')}</div>
                `;

                row.addEventListener('click', (e) => {
                    if (e.target.closest('[data-role="menu-btn"]')) return;
                    this._applyPreset(preset);
                });

                if (preset.author === 'user') {
                    row.addEventListener('contextmenu', (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this._showPresetMenu(preset, e.clientX, e.clientY);
                    });
                    let pressTimer = null;
                    let origin = null;
                    row.addEventListener('pointerdown', (e) => {
                        if (e.pointerType === 'mouse') return;
                        origin = { x: e.clientX, y: e.clientY };
                        pressTimer = setTimeout(() => {
                            pressTimer = null;
                            this._showPresetMenu(preset, origin.x, origin.y);
                            if (navigator.vibrate) navigator.vibrate(15);
                        }, 450);
                    });
                    row.addEventListener('pointermove', (e) => {
                        if (!pressTimer || !origin) return;
                        if (Math.hypot(e.clientX - origin.x, e.clientY - origin.y) > 8) {
                            clearTimeout(pressTimer);
                            pressTimer = null;
                        }
                    });
                    row.addEventListener('pointerup', () => {
                        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                    });
                    row.addEventListener('pointercancel', () => {
                        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
                    });
                }

                this.bodyEl.appendChild(row);
            });
        }

        _esc(s) {
            return String(s).replace(/[&<>"']/g, ch => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            })[ch]);
        }


        _applyPreset(preset) {
            if (!this.app || !this.app.loadTone) {
                console.warn('app.loadTone not available');
                return;
            }
            try {
                this.app.loadTone(preset);
                this._toast(`Loaded: ${preset.name}`);
            } catch (err) {
                console.error('Failed to load preset:', err);
                this._toast('Failed to load preset', true);
            }
        }

        _toast(msg, isError) {
            let el = document.getElementById('daw-toast');
            if (!el) {
                el = document.createElement('div');
                el.id = 'daw-toast';
                el.className = 'daw-toast';
                document.body.appendChild(el);
            }
            el.textContent = (isError ? '⚠ ' : '♪ ') + msg;
            el.classList.add('show');
            clearTimeout(this._toastTimer);
            this._toastTimer = setTimeout(() => el.classList.remove('show'), 2000);
        }


        _promptSaveCurrent() {
            const app = this.app;
            if (!app || !app.getCurrentTone) {
                alert('Cannot read current voice.');
                return;
            }

            let name = prompt('Preset name:', 'My Tone');
            if (!name || !name.trim()) return;
            name = name.trim();

            const lib = window.toneLibrary;
            const existingCats = lib ? lib.categories().filter(c => c !== 'All') : [];
            const defaultCat = 'User';
            const catInput = prompt(
                `Category (existing: ${existingCats.join(', ') || 'none'})`,
                defaultCat
            );
            const category = (catInput && catInput.trim()) || 'User';

            const snapshot = app.getCurrentTone();
            const saved = lib.save(name, category, snapshot.voice, snapshot.effects, { tags: [] });
            if (saved) {
                this._toast(`Saved: ${saved.name}`);
                this._populateCategories();
                this._renderList();
            }
        }


        _showPresetMenu(preset, clientX, clientY) {
            this._closeMenu();

            const menu = document.createElement('div');
            menu.className = 'tone-picker-menu';
            menu.innerHTML = `
                <div class="tone-picker-menu-item" data-act="apply">
                    <i class="fa-solid fa-play"></i> Apply
                </div>
                <div class="tone-picker-menu-item" data-act="rename">
                    <i class="fa-solid fa-pen"></i> Rename…
                </div>
                <div class="tone-picker-menu-item" data-act="export">
                    <i class="fa-solid fa-download"></i> Export
                </div>
                <div class="tone-picker-menu-divider"></div>
                <div class="tone-picker-menu-item danger" data-act="delete">
                    <i class="fa-solid fa-trash"></i> Delete
                </div>
            `;
            document.body.appendChild(menu);

            const rect = menu.getBoundingClientRect();
            const vw = window.innerWidth, vh = window.innerHeight;
            const x = Math.min(clientX, vw - rect.width - 8);
            const y = Math.min(clientY, vh - rect.height - 8);
            menu.style.left = Math.max(8, x) + 'px';
            menu.style.top = Math.max(8, y) + 'px';

            menu.querySelectorAll('.tone-picker-menu-item').forEach(el => {
                el.addEventListener('click', () => {
                    const act = el.dataset.act;
                    this._closeMenu();
                    if (act === 'apply') this._applyPreset(preset);
                    else if (act === 'rename') this._promptRename(preset);
                    else if (act === 'export') window.toneLibrary.exportPreset(preset.name);
                    else if (act === 'delete') this._promptDelete(preset);
                });
            });

            this._menuDismiss = (e) => {
                if (!menu.contains(e.target)) this._closeMenu();
            };
            setTimeout(() => document.addEventListener('pointerdown', this._menuDismiss, { once: true }), 0);
        }

        _closeMenu() {
            const old = document.querySelector('.tone-picker-menu');
            if (old) old.remove();
            if (this._menuDismiss) {
                document.removeEventListener('pointerdown', this._menuDismiss);
                this._menuDismiss = null;
            }
        }

        _promptRename(preset) {
            const newName = prompt('New name:', preset.name);
            if (!newName || !newName.trim()) return;
            const ok = window.toneLibrary.rename(preset.name, newName.trim());
            if (ok) {
                this._toast(`Renamed to ${newName.trim()}`);
                this._renderList();
            }
        }

        _promptDelete(preset) {
            if (!confirm(`Delete preset "${preset.name}"?`)) return;
            const ok = window.toneLibrary.delete(preset.name);
            if (ok) {
                this._toast(`Deleted: ${preset.name}`);
                this._renderList();
            }
        }


        open() {
            this._build();
            this._populateCategories();
            this._renderList();

            this.el.classList.add('show');
            setTimeout(() => { try { this.searchInput.focus(); } catch (_) {} }, 100);
        }

        close() {
            if (!this.el) return;
            this.el.classList.remove('show');
            this._closeMenu();
        }

        toggle() {
            if (this.el && this.el.classList.contains('show')) this.close();
            else this.open();
        }

        destroy() {
            if (this._escHandler) document.removeEventListener('keydown', this._escHandler);
            if (this._unsubscribe) this._unsubscribe();
            if (this.el && this.el.parentNode) this.el.parentNode.removeChild(this.el);
            this.el = null;
            this._built = false;
        }
    }

    window.TonePicker = TonePicker;
})();