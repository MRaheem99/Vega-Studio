// js/audioCache.js
// Persistent (IndexedDB) cache of rendered AudioBuffers keyed by content hash.
// Self-contained — does NOT depend on ClipFreezer.
class AudioCache {
    constructor() {
        this.db = null;
        this.memCache = new Map();     // fast in-session layer
        this.pending = new Map();      // in-flight renders keyed by cache key
        this.stats = { hits: 0, misses: 0, renders: 0, errors: 0 };
        this.maxMemoryEntries = 64;    // LRU cap on in-memory Map
        this._memOrder = [];
        this._ready = null;
    }

    // ---------------------------------------------------------
    // IndexedDB setup
    // ---------------------------------------------------------

    _openDB() {
        if (this._ready) return this._ready;
        this._ready = new Promise((resolve) => {
            if (!window.indexedDB) {
                console.warn('[AudioCache] IndexedDB unavailable — memory-only');
                resolve(null);
                return;
            }
            const req = indexedDB.open('vega_audio_cache', 1);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('buffers')) {
                    const store = db.createObjectStore('buffers', { keyPath: 'key' });
                    store.createIndex('created', 'created');
                }
            };
            req.onsuccess = () => {
                this.db = req.result;
                resolve(this.db);
            };
            req.onerror = () => {
                console.warn('[AudioCache] IndexedDB open failed:', req.error);
                resolve(null);
            };
        });
        return this._ready;
    }

    async _idbGet(key) {
        const db = await this._openDB();
        if (!db) return null;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction('buffers', 'readonly');
                const req = tx.objectStore('buffers').get(key);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => resolve(null);
            } catch (_) { resolve(null); }
        });
    }

    async _idbPut(key, data, meta = {}) {
        const db = await this._openDB();
        if (!db) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction('buffers', 'readwrite');
                tx.objectStore('buffers').put({
                    key,
                    data,
                    meta,
                    created: Date.now(),
                });
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (_) { resolve(false); }
        });
    }

    async _idbDelete(key) {
        const db = await this._openDB();
        if (!db) return false;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction('buffers', 'readwrite');
                tx.objectStore('buffers').delete(key);
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (_) { resolve(false); }
        });
    }

    async clearAll() {
        this.memCache.clear();
        this._memOrder = [];
        const db = await this._openDB();
        if (!db) return;
        return new Promise((resolve) => {
            try {
                const tx = db.transaction('buffers', 'readwrite');
                tx.objectStore('buffers').clear();
                tx.oncomplete = () => resolve(true);
                tx.onerror = () => resolve(false);
            } catch (_) { resolve(false); }
        });
    }

    async stats_from_idb() {
        const db = await this._openDB();
        if (!db) return { count: 0, bytes: 0 };
        return new Promise((resolve) => {
            try {
                const tx = db.transaction('buffers', 'readonly');
                const store = tx.objectStore('buffers');
                let count = 0, bytes = 0;
                const cursorReq = store.openCursor();
                cursorReq.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (!cursor) { resolve({ count, bytes }); return; }
                    count++;
                    const d = cursor.value.data;
                    if (d) bytes += (d.byteLength || d.length || 0);
                    cursor.continue();
                };
                cursorReq.onerror = () => resolve({ count: 0, bytes: 0 });
            } catch (_) { resolve({ count: 0, bytes: 0 }); }
        });
    }

    // ---------------------------------------------------------
    // Hashing / key generation
    // ---------------------------------------------------------

    _hash(str) {
        // FNV-1a — fast, good enough for cache keys
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('00000000' + h.toString(16)).slice(-8);
    }

    /**
     * Compute cache key for a pattern render.
     * Pattern = { grid, steps, kind, baseMidiNote }
     * Voice   = { waveform, attack, ... }
     * Effects = { active: {...}, states: {...} }
     */
    keyForPattern(opts) {
        const { grid, steps, bpm, kind, baseMidiNote, voice, effects } = opts;

        // Compact grid serialization — only active cells
        const parts = [];
        for (let r = 0; r < grid.length; r++) {
            for (let s = 0; s < steps; s++) {
                const c = grid[r][s];
                if (c && (c.active ?? c)) {
                    parts.push(r + ',' + s + ',' +
                        Math.round((c.velocity ?? 1) * 100) + ',' +
                        (c.length ?? 1) + ',' +
                        (c.ratchet ?? 1) + ',' +
                        Math.round((c.pan ?? 0) * 100) + ',' +
                        (c.pitch ?? 0));
                }
            }
        }
        const gridSig = parts.join('|');

        const voiceSig = voice ? JSON.stringify({
            w: voice.waveform, o: voice.octaveOffset,
            a: voice.attack, d: voice.decay, s: voice.sustain, r: voice.release,
            f: voice.filterType, c: voice.cutoff, res: voice.resonance,
            o2e: voice.osc2Enabled, o2w: voice.osc2Waveform,
        }) : 'default';

        const fxSig = effects ? JSON.stringify({
            active: effects.active,
            states: effects.states,
        }) : 'none';

        const key = `pat_${this._hash(gridSig + '|' + voiceSig + '|' + fxSig + '|' + bpm + '|' + kind + '|' + baseMidiNote)}`;
        return key;
    }

    /**
     * Cache key for a tone-preset sample render (one note).
     */
    keyForToneSample(opts) {
        const { voice, effects, midi, durationSec } = opts;
        const voiceSig = JSON.stringify(voice || {});
        const fxSig = JSON.stringify(effects || {});
        return `tone_${this._hash(voiceSig + '|' + fxSig + '|' + midi + '|' + durationSec.toFixed(3))}`;
    }

    // ---------------------------------------------------------
    // Public: get or render
    // ---------------------------------------------------------

    async getOrRender(key, renderFn) {
        // 1. Memory hit
        if (this.memCache.has(key)) {
            this.stats.hits++;
            this._touchMem(key);
            return this.memCache.get(key);
        }

        // 2. Already in-flight?
        if (this.pending.has(key)) {
            return this.pending.get(key);
        }

        // 3. IDB lookup
        this.stats.misses++;
        const record = await this._idbGet(key);
        if (record && record.data) {
            // Rehydrate AudioBuffer
            const buf = await this._deserializeBuffer(record.data);
            if (buf) {
                this._addMem(key, buf);
                return buf;
            }
        }

        // 4. Render — guard against duplicates
        this.stats.renders++;
        const p = Promise.resolve()
            .then(renderFn)
            .then(async (buffer) => {
                this.pending.delete(key);
                if (!buffer) return null;
                this._addMem(key, buffer);
                // Persist to IDB (async, doesn't block)
                this._persistBuffer(key, buffer).catch(() => {});
                return buffer;
            })
            .catch((err) => {
                this.pending.delete(key);
                this.stats.errors++;
                console.warn('[AudioCache] render error:', err);
                return null;
            });

        this.pending.set(key, p);
        return p;
    }

    // ---------------------------------------------------------
    // Memory LRU
    // ---------------------------------------------------------

    _addMem(key, buf) {
        this.memCache.set(key, buf);
        this._memOrder.push(key);
        while (this._memOrder.length > this.maxMemoryEntries) {
            const old = this._memOrder.shift();
            if (old && old !== key) this.memCache.delete(old);
        }
    }

    _touchMem(key) {
        const idx = this._memOrder.indexOf(key);
        if (idx >= 0) {
            this._memOrder.splice(idx, 1);
            this._memOrder.push(key);
        }
    }

    // ---------------------------------------------------------
    // Buffer serialization (for IDB)
    // ---------------------------------------------------------

    async _persistBuffer(key, audioBuffer) {
        // Serialize each channel's Float32Array
        const channels = [];
        for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
            channels.push(audioBuffer.getChannelData(c).slice()); // copy
        }
        const payload = {
            sampleRate: audioBuffer.sampleRate,
            length: audioBuffer.length,
            numberOfChannels: audioBuffer.numberOfChannels,
            channels,   // Array of Float32Array — structured clone handles these
        };
        await this._idbPut(key, payload);
    }

    async _deserializeBuffer(payload) {
        try {
            const ctx = this._getAudioContext();
            if (!ctx) return null;
            const buf = ctx.createBuffer(
                payload.numberOfChannels,
                payload.length,
                payload.sampleRate
            );
            for (let c = 0; c < payload.numberOfChannels; c++) {
                buf.copyToChannel(payload.channels[c], c);
            }
            return buf;
        } catch (err) {
            console.warn('[AudioCache] deserialize failed:', err);
            return null;
        }
    }

    _getAudioContext() {
        return (window.app?.audioEngine?.ctx) || null;
    }

    // ---------------------------------------------------------
    // Stats
    // ---------------------------------------------------------

    async fullStats() {
        const idb = await this.stats_from_idb();
        return {
            hits: this.stats.hits,
            misses: this.stats.misses,
            renders: this.stats.renders,
            errors: this.stats.errors,
            memEntries: this.memCache.size,
            idbEntries: idb.count,
            idbBytes: idb.bytes,
            idbMB: (idb.bytes / (1024 * 1024)).toFixed(2),
        };
    }
}

window.audioCache = new AudioCache();
window.AudioCache = AudioCache;