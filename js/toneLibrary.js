
(function () {
    'use strict';

    const FACTORY_URL = './tones.json';
    const USER_STORAGE_KEY = 'mrsm_tones_v1';
    const STORAGE_VERSION = 1;

    class ToneLibrary {
        constructor() {
            this.factory = [];
            this.user = [];
            this.loaded = false;
            this._loadPromise = null;

            this._indexByName = new Map();
            this._indexByCategory = new Map();

            this._listeners = new Set();
        }


        async load() {
            if (this._loadPromise) return this._loadPromise;

            this._loadPromise = (async () => {
                this._loadUserFromStorage();

                try {
                    const res = await fetch(FACTORY_URL, { cache: 'no-cache' });
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const data = await res.json();
                    if (data && Array.isArray(data.presets)) {
                        this.factory = data.presets
                            .map(p => this._normalizePreset(p, 'factory'))
                            .filter(p => p !== null);
                    } else {
                        console.warn('tones.json: missing "presets" array');
                        this.factory = [];
                    }
                } catch (err) {
                    console.warn('Could not load tones.json:', err);
                    this.factory = [];
                }

                this.loaded = true;
                this._rebuildIndexes();
                this._emit();
            })();

            return this._loadPromise;
        }

        _loadUserFromStorage() {
            try {
                const raw = localStorage.getItem(USER_STORAGE_KEY);
                if (!raw) { this.user = []; return; }
                const data = JSON.parse(raw);
                if (!data || !Array.isArray(data.presets)) { this.user = []; return; }
                this.user = data.presets
                    .map(p => this._normalizePreset(p, 'user'))
                    .filter(p => p !== null);
            } catch (err) {
                console.warn('Could not load user presets:', err);
                this.user = [];
            }
        }

        _saveUserToStorage() {
            try {
                const payload = {
                    format: 'mrsm-tones',
                    version: STORAGE_VERSION,
                    presets: this.user,
                };
                localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(payload));
            } catch (err) {
                console.error('Could not save user presets:', err);
                if (err && err.name === 'QuotaExceededError') {
                    alert('Storage full. Delete some presets and try again.');
                }
            }
        }


        _normalizePreset(p, forcedAuthor) {
            if (!p || typeof p !== 'object') return null;
            if (!p.name || typeof p.name !== 'string') return null;

            const author = p.author === 'factory' ? 'factory' : (forcedAuthor || 'user');

            const voice = (window.Voice && Voice.applyDefaults)
                ? Voice.applyDefaults(p.voice || {})
                : (p.voice || {});

            const effectsIn = (p.effects && typeof p.effects === 'object') ? p.effects : {};
            const active = {};
            const states = {};
            const fxTypes = window.FX_TYPES || Object.keys(window.FX_CONFIG || {});
            fxTypes.forEach(fx => {
                active[fx] = !!(effectsIn.active && effectsIn.active[fx]);
                if (effectsIn.states && effectsIn.states[fx]) {
                    states[fx] = JSON.parse(JSON.stringify(effectsIn.states[fx]));
                }
            });

            return {
                name: p.name.trim(),
                category: (p.category && String(p.category).trim()) || 'Other',
                author,
                tags: Array.isArray(p.tags) ? p.tags.slice(0, 8) : [],
                voice,
                effects: { active, states },
                created: p.created || new Date().toISOString(),
                modified: p.modified || p.created || new Date().toISOString(),
            };
        }


        _rebuildIndexes() {
            this._indexByName.clear();
            this._indexByCategory.clear();

            const all = [...this.factory, ...this.user];
            all.forEach(p => {
                this._indexByName.set(p.name, p);

                if (!this._indexByCategory.has(p.category)) {
                    this._indexByCategory.set(p.category, []);
                }
                this._indexByCategory.get(p.category).push(p);
            });

            this._indexByCategory.forEach(list => {
                list.sort((a, b) => a.name.localeCompare(b.name));
            });
        }


        all() {
            const out = [];
            const seen = new Set();
            this.factory.forEach(p => {
                if (seen.has(p.name)) return;
                seen.add(p.name);
                out.push(p);
            });
            this.user.forEach(p => {
                if (seen.has(p.name)) {
                    const idx = out.findIndex(x => x.name === p.name);
                    if (idx >= 0) out[idx] = p;
                    return;
                }
                seen.add(p.name);
                out.push(p);
            });
            return out;
        }

        byCategory(category) {
            if (!category || category === 'All') return this.all();
            return this._indexByCategory.get(category) || [];
        }

        categories() {
            const cats = Array.from(this._indexByCategory.keys());
            cats.sort((a, b) => {
                if (a === 'User') return 1;
                if (b === 'User') return -1;
                return a.localeCompare(b);
            });
            return ['All', ...cats];
        }

        get(name) {
            return this._indexByName.get(name) || null;
        }

        search(query) {
            const q = (query || '').trim().toLowerCase();
            if (!q) return this.all();
            return this.all().filter(p => {
                if (p.name.toLowerCase().includes(q)) return true;
                if (p.category.toLowerCase().includes(q)) return true;
                if (p.tags.some(t => t.toLowerCase().includes(q))) return true;
                if (p.author.toLowerCase().includes(q)) return true;
                return false;
            });
        }


        save(name, category, voice, effects, meta) {
            if (!name || !name.trim()) {
                alert('Preset name is required.');
                return null;
            }
            const trimmed = name.trim();
            const existing = this.user.find(p => p.name === trimmed);
            if (existing) {
                if (!confirm(`A preset named "${trimmed}" already exists. Overwrite?`)) {
                    return null;
                }
            }

            const preset = this._normalizePreset({
                name: trimmed,
                category: category || 'User',
                author: 'user',
                tags: (meta && meta.tags) || [],
                voice,
                effects,
                created: existing ? existing.created : new Date().toISOString(),
                modified: new Date().toISOString(),
            }, 'user');

            if (!preset) {
                alert('Preset data is invalid.');
                return null;
            }

            const idx = this.user.findIndex(p => p.name === trimmed);
            if (idx >= 0) this.user[idx] = preset;
            else this.user.push(preset);

            this._saveUserToStorage();
            this._rebuildIndexes();
            this._emit();
            return preset;
        }

        delete(name) {
            const idx = this.user.findIndex(p => p.name === name);
            if (idx < 0) return false;
            this.user.splice(idx, 1);
            this._saveUserToStorage();
            this._rebuildIndexes();
            this._emit();
            return true;
        }

        rename(oldName, newName) {
            if (!newName || !newName.trim()) return false;
            const trimmed = newName.trim();
            if (oldName === trimmed) return true;
            if (this._indexByName.has(trimmed)) {
                alert(`A preset named "${trimmed}" already exists.`);
                return false;
            }
            const preset = this.user.find(p => p.name === oldName);
            if (!preset) return false;
            preset.name = trimmed;
            preset.modified = new Date().toISOString();
            this._saveUserToStorage();
            this._rebuildIndexes();
            this._emit();
            return true;
        }


        exportPreset(name) {
            const preset = this.get(name);
            if (!preset) { alert('Preset not found.'); return; }
            const payload = {
                format: 'mrsm-tones',
                version: STORAGE_VERSION,
                presets: [preset],
            };
            this._downloadJson(payload, `${this._safeName(preset.name)}.json`);
        }

        exportAllUserPresets() {
            if (this.user.length === 0) {
                alert('No user presets to export.');
                return;
            }
            const payload = {
                format: 'mrsm-tones',
                version: STORAGE_VERSION,
                presets: this.user,
            };
            this._downloadJson(payload, `mrsm-tones-${Date.now()}.json`);
        }

        async importFromFile(file) {
            if (!file) return false;
            try {
                const text = await file.text();
                return this.importFromJson(text);
            } catch (err) {
                alert('Could not read file: ' + err.message);
                return false;
            }
        }

        importFromJson(text) {
            let data;
            try {
                data = JSON.parse(text);
            } catch (err) {
                alert('Invalid JSON: ' + err.message);
                return false;
            }

            let incoming = [];
            if (Array.isArray(data.presets)) incoming = data.presets;
            else if (data.name && data.voice) incoming = [data];
            else {
                alert('File does not contain any presets.');
                return false;
            }

            let imported = 0;
            let overwritten = 0;
            let skipped = 0;

            incoming.forEach(raw => {
                const preset = this._normalizePreset(raw, 'user');
                if (!preset) { skipped++; return; }

                const existing = this.user.find(p => p.name === preset.name);
                if (existing) {
                    if (!confirm(`Overwrite existing user preset "${preset.name}"?`)) {
                        skipped++;
                        return;
                    }
                    const idx = this.user.indexOf(existing);
                    this.user[idx] = preset;
                    overwritten++;
                } else {
                    this.user.push(preset);
                    imported++;
                }
            });

            if (imported + overwritten > 0) {
                this._saveUserToStorage();
                this._rebuildIndexes();
                this._emit();
            }

            alert(`Import complete.\nImported: ${imported}\nOverwritten: ${overwritten}\nSkipped: ${skipped}`);
            return imported + overwritten > 0;
        }

        _downloadJson(obj, filename) {
            const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        _safeName(name) {
            return (name || 'preset').replace(/[^a-z0-9_\-]+/gi, '_');
        }


        subscribe(fn) {
            if (typeof fn === 'function') this._listeners.add(fn);
            return () => this._listeners.delete(fn);
        }

        _emit() {
            this._listeners.forEach(fn => {
                try { fn(this); } catch (err) { console.warn('tone listener error:', err); }
            });
        }
    }

    window.ToneLibrary = ToneLibrary;
    window.toneLibrary = new ToneLibrary();
})();