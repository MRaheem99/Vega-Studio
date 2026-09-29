class TrackSystem {
    constructor(app) {
        this.app = app;
        this.tracks = [];
        this._trackNodes = new Map();
        this.nextTrackId = 1;
        this.selectedTrack = null;
        this.selectedClip = null;
        this.contextClip = null;
        this.contextTrack = null;
        this.zoom = 100;
        this.isPlaying = false;
        this.playheadPosition = 0;
        this.playStartPosition = 0;
        this.playheadActive = false;
        this.animationFrame = null;
        this.audioContext = null;
        this.activeSources = [];
        this.autoScrollEnabled = true;

        this.mode = 'scroll';
        this.clipboard = null;

        this.modifierDown = false;

        this.waveformPeaksCache = new WeakMap();
        this.waveformCanvasCache = new WeakMap();

        this.dragState = {
            isDragging: false, isResizing: false,
            clip: null, track: null,
            startX: 0, startLeft: 0, startTime: 0,
            startWidth: 0, startDuration: 0,
            rafId: null, pendingEvent: null,
            snapTargets: null,
            snapHoldTime: null,
        };
        this.snapEnabled = (localStorage.getItem('mrsm_snap_enabled') ?? '1') === '1';
        this.snapHoldStart = 0;

        this.longPressThreshold = 500;
        this.longPressPosition = { trackId: null, time: 0 };
        this.pinch = null;
        this.scrubbing = false;
        this._menuOpenedAt = 0;

        this.envelopeDrag = { active: false, index: -1, clip: null };

        this.onDragMove = this.onDragMove.bind(this);
        this.onResizeMove = this.onResizeMove.bind(this);
        this.onDragEnd = this.onDragEnd.bind(this);

        this.initTimeline();
        this.setupGlobalInteractions();
        this.setupScrollSync();
        this.setupPinchZoom();
        this.setupRulerSeek();
        this.setupKeyboardShortcuts();
        this.setupDesktopModifier();
        this.setupAudio();
        this.setMode('scroll');
    }

    setupAudio() { this.audioContext = this.app.audioEngine.ctx; }

    setMode(mode) {
        this.mode = mode;
        const scroller = document.getElementById('tracks-scroll-area');
        if (scroller) scroller.classList.toggle('mode-drag', mode === 'drag');
        const btn = document.getElementById('tracks-mode-btn');
        if (btn) {
            const isDrag = mode === 'drag';
            btn.classList.toggle('active', isDrag);
            btn.innerHTML = isDrag
                ? '<i class="fa-solid fa-hand-pointer"></i>'
                : '<i class="fa-solid fa-hand"></i>';
        }
    }
    toggleMode() { this.setMode(this.mode === 'scroll' ? 'drag' : 'scroll'); }

    hexToRgb(hex) {
        const h = hex.replace('#', '');
        return { r: parseInt(h.substring(0,2),16), g: parseInt(h.substring(2,4),16), b: parseInt(h.substring(4,6),16) };
    }
    hexToRgba(hex, a) {
        const { r, g, b } = this.hexToRgb(hex);
        return `rgba(${r}, ${g}, ${b}, ${a})`;
    }
    mixWithDark(hex, amount = 0.5, base = 25) {
        const { r, g, b } = this.hexToRgb(hex);
        const nr = Math.round(base + (r - base) * amount);
        const ng = Math.round(base + (g - base) * amount);
        const nb = Math.round(base + (b - base) * amount);
        return `rgb(${nr}, ${ng}, ${nb})`;
    }

    setupDesktopModifier() {
        const update = (e) => {
            const down = e.shiftKey || e.altKey || e.metaKey;
            if (down !== this.modifierDown) {
                this.modifierDown = down;
                document.body.classList.toggle('daw-modifier', down);
            }
        };
        document.addEventListener('keydown', update);
        document.addEventListener('keyup', update);
        window.addEventListener('blur', () => {
            this.modifierDown = false;
            document.body.classList.remove('daw-modifier');
        });
    }

    setupScrollSync() {
        const scrollArea = document.getElementById('tracks-scroll-area');
        const ruler = document.getElementById('tracks-ruler');
        if (!scrollArea || !ruler) return;

        let ticking = false;
        let lastScrollLeft = -1;

        scrollArea.addEventListener('scroll', () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                const sl = scrollArea.scrollLeft;
                if (sl === lastScrollLeft) return;
                lastScrollLeft = sl;

                ruler.style.transform = `translate3d(${-sl}px, 0, 0)`;
                this.updatePlayhead();
            });
        }, { passive: true });
    }

    setupPinchZoom() {
        const scroller = document.getElementById('tracks-scroll-area');
        if (!scroller) return;
        scroller.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 2) return;
            const [a, b] = e.touches;
            this.pinch = {
                startDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
                startZoom: this.zoom,
                startScrollLeft: scroller.scrollLeft,
                anchorScreenX: (a.clientX + b.clientX) / 2,
            };
        }, { passive: true });
        scroller.addEventListener('touchmove', (e) => {
            if (e.touches.length !== 2 || !this.pinch) return;
            e.preventDefault();
            const [a, b] = e.touches;
            const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
            const scale = dist / this.pinch.startDist;
            const newZoom = Math.max(20, Math.min(400, this.pinch.startZoom * scale));
            if (Math.abs(newZoom - this.zoom) < 0.5) return;
            const rect = scroller.getBoundingClientRect();
            const offset = this.pinch.anchorScreenX - rect.left;
            const timeAtAnchor = (this.pinch.startScrollLeft + offset) / this.zoom;
            this.zoom = newZoom;
            this.renderRuler();
            this._debouncedZoomRender();
            scroller.scrollLeft = timeAtAnchor * this.zoom - offset;
        }, { passive: false });
        scroller.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) this.pinch = null;
        }, { passive: true });
    }

    _debouncedZoomRender() {
        if (this._zoomRenderTimer) clearTimeout(this._zoomRenderTimer);
        this._zoomRenderTimer = setTimeout(() => {
            this._zoomRenderTimer = null;
            this.renderTracks();
        }, 60);
    }

    setupRulerSeek() {
        const rulerContainer = document.querySelector('.tracks-ruler-container');
        const scrollArea = document.getElementById('tracks-scroll-area');
        if (!rulerContainer || !scrollArea) return;

        const seekTo = (clientX) => {
            const rect = rulerContainer.getBoundingClientRect();
            const labelWidth = window.innerWidth <= 768 ? 120 : 180;
            const x = clientX - rect.left;
            if (x < labelWidth) return;
            const time = (x - labelWidth + scrollArea.scrollLeft) / this.zoom;
            this.playheadPosition = Math.max(0, time);
            this.playheadActive = true;
            this.updatePlayhead(true);
            const timeEl = document.getElementById('tracks-time-value');
            if (timeEl) timeEl.innerText = this.formatTime(this.playheadPosition);
        };

        const startAltPan = (e) => {
            if (e.button !== 0 || !e.altKey) return false;
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX;
            const startY = e.clientY;
            const startScrollLeft = scrollArea.scrollLeft;
            const startScrollTop = scrollArea.scrollTop;

            document.body.classList.add('alt-pan');

            const onMove = (ev) => {
                ev.preventDefault();
                scrollArea.scrollLeft = startScrollLeft - (ev.clientX - startX);
                scrollArea.scrollTop = startScrollTop - (ev.clientY - startY);
            };
            const onUp = () => {
                document.body.classList.remove('alt-pan');
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            return true;
        };

        rulerContainer.addEventListener('mousedown', (e) => {
            if (startAltPan(e)) return;
            this.scrubbing = true;
            seekTo(e.clientX);
        });

        rulerContainer.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse') return;
            try { rulerContainer.setPointerCapture(e.pointerId); } catch (_) {}
            this.scrubbing = true;
            seekTo(e.clientX);
        });

        const moveHandler = (e) => {
            if (e.altKey && e.buttons === 1) return;
            if (!this.scrubbing) return;
            seekTo(e.clientX);
        };
        rulerContainer.addEventListener('pointermove', moveHandler);
        rulerContainer.addEventListener('mousemove', moveHandler);

        const end = () => { this.scrubbing = false; };
        rulerContainer.addEventListener('pointerup', end);
        rulerContainer.addEventListener('pointercancel', end);
        rulerContainer.addEventListener('pointerleave', end);
        rulerContainer.addEventListener('mouseup', end);
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            const tag = (e.target?.tagName || '').toUpperCase();
            if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable) return;
            const mod = e.ctrlKey || e.metaKey;
            if (mod && e.key.toLowerCase() === 'c') { this.copyClip(); e.preventDefault(); }
            else if (mod && e.key.toLowerCase() === 'v') { this.pasteClip(); e.preventDefault(); }
            else if (mod && e.key.toLowerCase() === 'd') { this.duplicateClip(); e.preventDefault(); }
            else if (e.key === 'Delete' || e.key === 'Backspace') { this.deleteClip(); e.preventDefault(); }
            else if (e.key === ' ') { this.isPlaying ? this.pause() : this.play(); e.preventDefault(); }
        });
    }

    initTimeline() {
        const container = document.getElementById('tracks-timeline');
        if (!container) return;
        container.innerHTML = `
            <div class="tracks-transport">
                <div class="transport-controls">
                    <button class="transport-btn" id="tracks-play-btn" title="Play">
                        <i class="fa-solid fa-play"></i>
                    </button>
                    <button class="transport-btn" id="tracks-pause-btn" style="display:none;" title="Pause">
                        <i class="fa-solid fa-pause"></i>
                    </button>
                    <button class="transport-btn" id="tracks-stop-btn" title="Stop">
                        <i class="fa-solid fa-stop"></i>
                    </button>
                    <button class="transport-btn" id="tracks-mode-btn" title="Scroll mode">
                        <i class="fa-solid fa-hand"></i>
                    </button>
                    <button class="transport-btn active" id="tracks-snap-btn" title="Snap: On">
                        <i class="fa-solid fa-magnet"></i>
                    </button>
                </div>
                <div class="transport-info">
                    <span>Time: <span id="tracks-time-value">0:00</span></span>
                </div>
                <button class="transport-add" onclick="app.tracks.addTrackWithMenu(this)" title="Add Track">
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>
            <div class="tracks-timeline-wrapper">
                <div class="tracks-ruler-container">
                    <div class="tracks-ruler" id="tracks-ruler"></div>
                </div>
                <div class="tracks-scroll-area" id="tracks-scroll-area">
                    <div class="tracks-container" id="tracks-container"></div>
                    <div class="snap-indicator" id="snap-indicator"></div>
                </div>
                <div class="playhead" id="playhead"></div>
            </div>
        `;
        
        if (!this._resizeHandlerInstalled) {
            this._resizeHandlerInstalled = true;
            window.addEventListener('resize', () => {
                this._cachedVW = null;
                this._cachedViewportW = null;
                this._cachedViewportHalf = null;
                this._cachedLabelWidth = null;
                this.renderRuler();
            }, { passive: true });
        }
        this.renderRuler();
        this.renderTracks();
        this.setupPlayControls();
    }

    renderRuler() {
        const ruler = document.getElementById('tracks-ruler');
        if (!ruler) return;

        const totalSeconds = 120;
        const pps = this.zoom;

        ruler.innerHTML = '';
        ruler.style.width = `${totalSeconds * pps}px`;

        let major, mid, minor;
        if (pps < 40) {
            major = 10; mid = 5; minor = 1;
        } else if (pps < 80) {
            major = 5;  mid = 1; minor = 0.5;
        } else if (pps < 160) {
            major = 1;  mid = 0.5; minor = 0.25;
        } else if (pps < 320) {
            major = 1;  mid = 0.25; minor = 0.125;
        } else {
            major = 1;  mid = 0.1; minor = 0.05;
        }

        const labelMid = pps >= 160;
        const labelMinor = pps >= 480;

        const fragment = document.createDocumentFragment();

        for (let t = 0; t <= totalSeconds; t += minor) {
            const roundedT = Math.round(t * 1000) / 1000;
            if (Math.abs(roundedT - Math.round(roundedT)) < 1e-6) {
                continue;
            }
            const isMid = Math.abs(roundedT - Math.round(roundedT / mid) * mid) < 1e-6;

            const m = document.createElement('div');
            m.className = isMid ? 'ruler-mark mid' : 'ruler-mark minor';
            m.style.left = `${roundedT * pps}px`;
            fragment.appendChild(m);

            if (labelMid && isMid) {
                const lbl = document.createElement('span');
                lbl.className = 'ruler-label mid-label';
                lbl.textContent = this.formatTimePrecise(roundedT);
                m.appendChild(lbl);
            } else if (labelMinor && !isMid) {
                const lbl = document.createElement('span');
                lbl.className = 'ruler-label minor-label';
                lbl.textContent = this.formatTimePrecise(roundedT);
                m.appendChild(lbl);
            }
        }

        for (let s = 0; s <= totalSeconds; s++) {
            const isMajor = s % major === 0;

            const m = document.createElement('div');
            m.className = isMajor ? 'ruler-mark major' : 'ruler-mark mid';
            m.style.left = `${s * pps}px`;
            fragment.appendChild(m);

            if (isMajor) {
                const lbl = document.createElement('span');
                lbl.className = 'ruler-label major-label';
                lbl.textContent = this.formatTime(s);
                m.appendChild(lbl);
            } else if (labelMid) {
                const lbl = document.createElement('span');
                lbl.className = 'ruler-label mid-label';
                lbl.textContent = this.formatTimePrecise(s);
                m.appendChild(lbl);
            }
        }

        ruler.appendChild(fragment);

        const container = document.getElementById('tracks-container');
        if (container) {
            const labelWidth = window.innerWidth <= 768 ? 120 : 180;
            container.style.width = `${labelWidth + totalSeconds * pps}px`;
        }
    }

    formatTimePrecise(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds - mins * 60;

        if (Math.abs(secs - Math.round(secs)) < 1e-6) {
            const s = Math.round(secs).toString().padStart(2, '0');
            return `${mins}:${s}`;
        }

        const whole = Math.floor(secs);
        const frac = secs - whole;
        let fracStr = frac.toFixed(2);
        if (fracStr.endsWith('0')) fracStr = fracStr.slice(0, -1);
        return `${mins}:${whole.toString().padStart(2, '0')}${fracStr.slice(1)}`;
    }

    renderTracks(opts = {}) {
        this._queueRender(opts);
    }

    _renderTracksNow(opts = {}) {
        const container = document.getElementById('tracks-container');
        if (!container) return;

        if (typeof app !== 'undefined' && app.updateStatusDisplay) {
            app.updateStatusDisplay();
        }

        if (!opts.full && opts.trackId !== undefined) {
            const track = this.getTrack(opts.trackId);
            if (!track) return;
            const existingRow = container.querySelector(`.track-row[data-track-id="${track.id}"]`);
            if (existingRow) {
                this._updateTrackRow(existingRow, track);
                this.updatePlayhead();
                if (this.audioContext) {
                    this._refreshTrackGain(track.id);
                    this._refreshTrackPan(track.id);
                }
                return;
            }
        }

        const fragment = document.createDocumentFragment();
        this.tracks.forEach(track => {
            fragment.appendChild(this._buildTrackRow(track));
        });

        while (container.firstChild) container.removeChild(container.firstChild);
        container.appendChild(fragment);

        this.updatePlayhead();

        if (this.audioContext) {
            this.tracks.forEach(t => {
                this._refreshTrackGain(t.id);
                this._refreshTrackPan(t.id);
            });
        }
    }

    _buildTrackRow(track) {
        const row = document.createElement('div');
        row.className = 'track-row';
        row.dataset.trackId = track.id;
        row.style.background = this.hexToRgba(track.color, 0.2);

        row.appendChild(this._buildTrackLabel(track));

        const lane = document.createElement('div');
        lane.className = 'track-lane';
        lane.dataset.trackId = track.id;
        this.setupLaneInteractions(lane, track.id);
        track.clips.forEach(clip => lane.appendChild(this.createClipElement(clip, track)));
        row.appendChild(lane);

        return row;
    }

        _buildTrackLabel(track) {
        const label = document.createElement('div');
        label.className = `track-label ${this.selectedTrack === track.id ? 'active' : ''}`;
        label.style.background = this.mixWithDark(track.color, 0.5, 25);

        const typeDef = window.TrackTypes
            ? TrackTypes.byId(track.type || 'synth')
            : { icon: 'fa-wave-square' };

        label.innerHTML = `
            <div class="track-label-color" style="background: ${track.color}; color: ${track.color}"></div>
            <div class="track-label-content">
                <div class="track-name">
                    <i class="fa-solid ${typeDef.icon} track-type-icon" title="${typeDef.label || ''}"></i>
                    <span>${track.name}</span>
                </div>
                <div class="track-controls">
                    <button class="track-control-btn ${track.muted ? 'active' : ''}"
                            onclick="event.stopPropagation(); app.tracks.toggleMute(${track.id})">
                        <i class="fa-solid fa-volume-xmark"></i>
                    </button>
                    <button class="track-control-btn ${track.solo ? 'active' : ''}"
                            onclick="event.stopPropagation(); app.tracks.toggleSolo(${track.id})">
                        <i class="fa-solid fa-headphones"></i>
                    </button>
                    <button class="track-control-btn"
                            onclick="event.stopPropagation(); app.tracks.openTrackManager(${track.id})">
                        <i class="fa-solid fa-gear"></i>
                    </button>
                </div>
            </div>
        `;
        label.onclick = (e) => { e.stopPropagation(); this.selectTrack(track.id); };
        return label;
    }

    _updateTrackRow(row, track) {
        row.style.background = this.hexToRgba(track.color, 0.2);

        const oldLabel = row.querySelector('.track-label');
        if (oldLabel) {
            row.replaceChild(this._buildTrackLabel(track), oldLabel);
        } else {
            row.insertBefore(this._buildTrackLabel(track), row.firstChild);
        }

        let lane = row.querySelector('.track-lane');
        if (!lane) {
            lane = document.createElement('div');
            lane.className = 'track-lane';
            lane.dataset.trackId = track.id;
            this.setupLaneInteractions(lane, track.id);
            row.appendChild(lane);
        }

        this._diffClipElements(lane, track);
    }

    _diffClipElements(lane, track) {
        const existing = new Map();
        lane.querySelectorAll('.timeline-clip').forEach(el => {
            existing.set(el.dataset.clipId, el);
        });

        const desiredIds = new Set();
        let lastInserted = null;

        track.clips.forEach(clip => {
            const idStr = String(clip.id);
            desiredIds.add(idStr);

            let el = existing.get(idStr);
            if (el) {
                this._updateClipElement(el, clip, track);
                existing.delete(idStr);
            } else {
                el = this.createClipElement(clip, track);
            }

            if (lastInserted) {
                if (lastInserted.nextSibling !== el) {
                    lane.insertBefore(el, lastInserted.nextSibling);
                }
            } else if (lane.firstChild !== el) {
                lane.insertBefore(el, lane.firstChild);
            }
            lastInserted = el;
        });

        existing.forEach(el => el.remove());
    }

    _updateClipElement(el, clip, track) {
        el.style.left = `${clip.startTime * this.zoom}px`;
        el.style.width = `${clip.duration * this.zoom}px`;
        el.style.backgroundColor = track.color + '60';
        el.style.borderColor = track.color;
        el.dataset.clipId = String(clip.id);
        el.dataset.trackId = String(track.id);

        if (clip.type === 'pattern') {
            if (clip.mode === 'wav' && clip._frozen && clip._frozen.buffer) {
                let canvas = el.querySelector('canvas.clip-waveform');
                if (!canvas) {
                    const old = el.querySelector('.clip-waveform');
                    if (old) old.remove();
                    canvas = document.createElement('canvas');
                    canvas.className = 'clip-waveform';
                    el.insertBefore(canvas, el.firstChild);
                }
                const targetW = Math.max(1, Math.round(clip.duration * this.zoom));
                if (canvas._lastW !== targetW || !canvas._drawn) {
                    canvas._lastW = targetW;
                    canvas._drawn = true;
                    this.drawWaveform(canvas, {
                        buffer: clip._frozen.buffer,
                        duration: clip.duration,
                        loop: clip.loop,
                    });
                }
            } else {
                const preview = el.querySelector('.clip-waveform');
                if (preview) {
                    const newW = Math.round(clip.duration * this.zoom);
                    if (preview._lastW !== newW) {
                        preview._lastW = newW;
                        this._renderClipPreview(preview, clip);
                    }
                }
            }
        } else if (clip.buffer) {
            const canvas = el.querySelector('.clip-waveform');
            if (canvas) {
                const targetW = Math.max(1, Math.round(clip.duration * this.zoom));
                if (canvas._lastW !== targetW) {
                    canvas._lastW = targetW;
                    this.drawWaveform(canvas, clip);
                }
            }
        }

        const envCanvas = el.querySelector('.clip-envelope-canvas');
        if (envCanvas) this.drawEnvelope(envCanvas, clip);

        if (clip.loop || clip.type === 'pattern') {
            this.refreshRepeatSegments(el, clip);
        } else {
            el.querySelectorAll('.clip-repeat-segment').forEach(s => s.remove());
        }

        const infoEl = el.querySelector('.clip-info span');
        if (infoEl) infoEl.textContent = `${clip.duration.toFixed(1)}s`;

        const nameEl = el.querySelector('.clip-name');
        if (nameEl) nameEl.textContent = clip.name;
    }

    getPeaks(buffer, resolution = 4096) {
        const cached = this.waveformPeaksCache.get(buffer);
        if (cached && cached.resolution === resolution) return cached.peaks;
        const data = buffer.getChannelData(0);
        const step = Math.max(1, Math.floor(data.length / resolution));
        const peaks = new Float32Array(resolution * 2);
        for (let i = 0; i < resolution; i++) {
            let min = 1, max = -1;
            const start = i * step;
            const end = Math.min(start + step, data.length);
            for (let j = start; j < end; j++) {
                const v = data[j];
                if (v < min) min = v;
                if (v > max) max = v;
            }
            peaks[i * 2] = min;
            peaks[i * 2 + 1] = max;
        }
        this.waveformPeaksCache.set(buffer, { resolution, peaks });
        return peaks;
    }

    getWaveformSourceCanvas(buffer, heightPx = 128) {
        const cacheKey = `${buffer.length}_${heightPx}`;
        let canvas = this.waveformCanvasCache.get(buffer);
        if (canvas && canvas.dataset?.key === cacheKey) return canvas;
        const w = 2048, h = heightPx;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        c.dataset.key = cacheKey;
        const ctx = c.getContext('2d');
        const peaks = this.getPeaks(buffer);
        const numPeaks = peaks.length / 2;
        const amp = h / 2;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        for (let i = 0; i < numPeaks; i++) {
            const x = (i / numPeaks) * w;
            const y = (1 + peaks[i * 2]) * amp;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        for (let i = numPeaks - 1; i >= 0; i--) {
            const x = (i / numPeaks) * w;
            const y = (1 + peaks[i * 2 + 1]) * amp;
            ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        this.waveformCanvasCache.set(buffer, c);
        return c;
    }

    drawWaveform(canvas, clip) {
        const buffer = clip.buffer;
        if (!buffer) return;
        const cssW = Math.max(1, Math.round(clip.duration * this.zoom));
        const cssH = 44;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const targetW = Math.round(cssW * dpr);
        const targetH = Math.round(cssH * dpr);
        if (canvas.width !== targetW) canvas.width = targetW;
        if (canvas.height !== targetH) canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);
        const bufDur = buffer.duration;
        if (!bufDur || bufDur <= 0) return;
        const src = this.getWaveformSourceCanvas(buffer, 128);
        const cycleW = bufDur * this.zoom;
        const loop = clip.loop && clip.duration > bufDur * 1.001;
        ctx.globalAlpha = 0.9;
        if (!loop) {
            const visibleW = Math.min(cssW, cycleW);
            const srcW = (visibleW / cycleW) * src.width;
            ctx.drawImage(src, 0, 0, srcW, src.height, 0, 0, visibleW, cssH);
        } else {
            const firstW = Math.min(cssW, cycleW);
            const firstSrcW = (firstW / cycleW) * src.width;
            ctx.drawImage(src, 0, 0, firstSrcW, src.height, 0, 0, firstW, cssH);
            for (let x = cycleW; x < cssW - 0.5; x += cycleW) {
                const w = Math.min(cycleW, cssW - x);
                const srcW = (w / cycleW) * src.width;
                ctx.globalAlpha = 0.7;
                ctx.drawImage(src, 0, 0, srcW, src.height, x, 0, w, cssH);
            }
            ctx.globalAlpha = 1;
        }
    }

    _invalidateClipPreview(clip) {
        clip._previewURL = null;
        clip._previewW = null;
        clip._previewKey = null;
    }

    _renderClipPreview(container, clip) {
        if (clip.type !== 'pattern' || !clip.pattern) {
            container.style.backgroundImage = '';
            return;
        }

        const pattern = clip.pattern;
        const steps = pattern.steps || 16;
        const rows = pattern.grid.length;
        const isSynth = pattern.kind === 'synth';

        const cacheKey = (() => {
            let h = steps + ':' + rows + ':' + (isSynth ? 's' : 'd') + ':';
            for (let r = 0; r < rows; r++) {
                const row = pattern.grid[r];
                for (let s = 0; s < steps; s++) {
                    const c = row[s];
                    if (!c) continue;
                    const active = (typeof c === 'object') ? (c.active ? 1 : 0) : (c ? 1 : 0);
                    if (!active) continue;
                    h += r + ',' + s + ';';
                }
            }
            return h;
        })();

        if (clip._previewKey === cacheKey && clip._previewURL) {
            container.style.backgroundImage = `url(${clip._previewURL})`;
            container.style.backgroundRepeat = 'repeat-x';
            container.style.backgroundSize = `${clip._previewW}px 44px`;
            container.style.backgroundPosition = 'left top';
            return;
        }

        const CELL_W = 16;
        const H = 44;
        const W = steps * CELL_W;
        const dpr = Math.min(2, window.devicePixelRatio || 1);

        const off = document.createElement('canvas');
        off.width = W * dpr;
        off.height = H * dpr;
        const ctx = off.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);

        for (let r = 0; r < rows; r++) {
            const y = H - (r + 1) * (H / rows);
            const rowH = H / rows;
            if (isSynth) {
                const isBlackKey = [1, 3, 6, 8, 10].includes(r % 12);
                ctx.fillStyle = isBlackKey
                    ? 'rgba(255, 255, 255, 0.03)'
                    : 'rgba(255, 255, 255, 0.06)';
            } else {
                ctx.fillStyle = r % 2
                    ? 'rgba(255, 255, 255, 0.03)'
                    : 'rgba(255, 255, 255, 0.05)';
            }
            ctx.fillRect(0, y, W, rowH);
        }

        for (let s = 0; s <= steps; s++) {
            const x = s * CELL_W;
            ctx.strokeStyle = (s % 4 === 0)
                ? 'rgba(255, 255, 255, 0.15)'
                : 'rgba(255, 255, 255, 0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + 0.5, 0);
            ctx.lineTo(x + 0.5, H);
            ctx.stroke();
        }

        const minRowH = 1.2;
        const rawRowH = H / rows;
        const rowH = Math.max(minRowH, rawRowH);

        for (let r = 0; r < rows; r++) {
            for (let s = 0; s < steps; s++) {
                const cell = pattern.grid[r][s];
                const active = cell && typeof cell === 'object'
                    ? !!cell.active
                    : !!cell;
                if (!active) continue;

                const velocity = (cell && typeof cell === 'object' && typeof cell.velocity === 'number')
                    ? cell.velocity : 1;

                const x = s * CELL_W;
                const y = Math.max(0, Math.min(H - rowH, H - (r + 1) * rowH));

                const alpha = 0.5 + 0.5 * velocity;

                if (isSynth) {
                    const barW = CELL_W * 0.85;
                    const barH = Math.max(minRowH, rowH * 0.9);
                    ctx.fillStyle = `rgba(0, 230, 118, ${alpha})`;
                    ctx.fillRect(x + CELL_W * 0.075, y + (rowH - barH) / 2, barW, barH);
                } else {
                    const barW = CELL_W * 0.65;
                    const barH = Math.max(minRowH, rowH * (0.5 + 0.5 * velocity));
                    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
                    ctx.fillRect(x + (CELL_W - barW) / 2, Math.max(0, H - barH), barW, barH);
                }
            }
        }

        const url = off.toDataURL('image/png');
        container.style.backgroundImage = `url(${url})`;
        container.style.backgroundRepeat = 'repeat-x';
        container.style.backgroundSize = `${W}px ${H}px`;
        container.style.backgroundPosition = 'left top';

        clip._previewURL = url;
        clip._previewW = W;
        clip._previewKey = cacheKey;
    }

    drawEnvelope(canvas, clip, highlightIndex = -1) {
        const cssW = Math.max(1, Math.round(clip.duration * this.zoom));
        const cssH = 44;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);

        const env = clip.envelope;
        if (!env || env.length < 2) return;

        const pad = 6;
        const h = cssH - pad * 2;
        const toXY = (pt) => [
            (pt.time / clip.duration) * cssW,
            pad + (1 - pt.value) * h,
        ];

        const sorted = [...env].sort((a, b) => a.time - b.time);
        const last = sorted[sorted.length - 1];
        const points = (last.time < clip.duration - 0.001)
            ? [...sorted, { time: clip.duration, value: last.value }]
            : sorted;

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        points.forEach((pt, i) => {
            const [x, y] = toXY(pt);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.stroke();

        points.forEach((pt, i) => {
            if (i >= sorted.length) return;
            const [x, y] = toXY(pt);
            const hot = i === highlightIndex;
            ctx.beginPath();
            ctx.arc(x, y, hot ? 7 : 3.5, 0, Math.PI * 2);
            ctx.fillStyle = hot ? '#00e676' : '#fff';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
            ctx.lineWidth = 1.5;
            ctx.stroke();
        });
    }

    startEnvelopeDragOnClip(clipEl, clip, index, initialEvent) {
    const pt = clip.envelope[index];
    if (!pt) return;
    if (!clip.envelope) return;

    if (this.envelopeDrag && this.envelopeDrag.active) return;

    let ownerTrack = null;
    for (const t of this.tracks) {
        if (t.clips.some(c => c.id === clip.id)) { ownerTrack = t; break; }
    }

    this._pendingEnvelopeEdit = ownerTrack
        ? {
            trackId: ownerTrack.id,
            clipId: clip.id,
            before: clip.envelope.map(p => ({ ...p })),
        }
        : null;

    this.lockScroll();
    const prevClipTouchAction = clipEl.style.touchAction;
    clipEl.style.touchAction = 'none';

    this.envelopeDrag = { active: true, index, clip };

    const rect = clipEl.getBoundingClientRect();
    const pad = 6;

    const update = (clientY) => {
        const y = clientY - rect.top;
        const v = 1 - (y - pad) / (rect.height - pad * 2);
        pt.value = Math.max(0, Math.min(1, v));

        if (this.isPlaying) {
            const live = this.activeSources.find(s => s.clip === clip);
            if (live && live.gain) {
                const trackVol = live.track?.volume ?? 1;
                const now = this.audioContext.currentTime;
                const clipElapsed = this.playheadPosition - clip.startTime;
                const val = this.getEnvelopeValueAt(clip.envelope, clipElapsed);
                const target = val * (live.clip.volume ?? 1) * trackVol;
                live.gain.gain.cancelScheduledValues(now);
                live.gain.gain.setValueAtTime(live.gain.gain.value, now);
                live.gain.gain.linearRampToValueAtTime(target, now + 0.03);
            }
        }
    };

    const redraw = () => {
        const envCanvas = clipEl.querySelector('.clip-envelope-canvas');
        if (envCanvas) this.drawEnvelope(envCanvas, clip, index);
    };

    const onMoveMouse = (ev) => { ev.preventDefault(); update(ev.clientY); redraw(); };
    const onMoveTouch = (ev) => {
        if (!ev.touches[0]) return;
        ev.preventDefault();
        update(ev.touches[0].clientY);
        redraw();
    };

    let ended = false;
    const onEnd = () => {
        if (ended) return;
        ended = true;

        window.removeEventListener('mousemove', onMoveMouse);
        window.removeEventListener('mouseup', onEnd);
        window.removeEventListener('touchmove', onMoveTouch);
        window.removeEventListener('touchend', onEnd);
        window.removeEventListener('touchcancel', onEnd);
        window.removeEventListener('blur', onEnd);

        this.unlockScroll();
        clipEl.style.touchAction = prevClipTouchAction || '';

        this.envelopeDrag = { active: false, index: -1, clip: null };

        const envCanvas = clipEl.querySelector('.clip-envelope-canvas');
        if (envCanvas) this.drawEnvelope(envCanvas, clip, -1);

        if (document.getElementById('clip-manager-modal')?.classList.contains('show')) {
            this._renderEnvelopeEditor();
            this._drawEnvelopeEditorCanvas();
        }

        const pending = this._pendingEnvelopeEdit;
        this._pendingEnvelopeEdit = null;
        if (!pending) return;

        const track = this.getTrack(pending.trackId);
        const targetClip = track?.clips.find(c => c.id === pending.clipId);
        if (!targetClip) return;

        const after = targetClip.envelope.map(p => ({ ...p }));
        const before = pending.before;

        const same = after.length === before.length &&
            after.every((p, i) =>
                Math.abs(p.time - before[i].time) < 1e-6 &&
                Math.abs(p.value - before[i].value) < 1e-6
            );
        if (same) return;

        const self = this;
        this.app.history.push({
            label: 'Edit Envelope',
            do: () => {
                const t = self.getTrack(pending.trackId);
                const c = t?.clips.find(x => x.id === pending.clipId);
                if (c) {
                    c.envelope = after.map(p => ({ ...p }));
                    self.renderTracks();
                }
            },
            undo: () => {
                const t = self.getTrack(pending.trackId);
                const c = t?.clips.find(x => x.id === pending.clipId);
                if (c) {
                    c.envelope = before.map(p => ({ ...p }));
                    self.renderTracks();
                }
            },
        });
    };
  
    window.addEventListener('mousemove', onMoveMouse, { passive: false });
    window.addEventListener('mouseup', onEnd);
    window.addEventListener('touchmove', onMoveTouch, { passive: false });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    window.addEventListener('blur', onEnd);
}

    getEnvelopeValueAt(env, time) {
        if (!env || env.length === 0) return 1;
        const sorted = [...env].sort((a, b) => a.time - b.time);
        if (time <= sorted[0].time) return sorted[0].value;
        if (time >= sorted[sorted.length - 1].time) return sorted[sorted.length - 1].value;
        for (let i = 0; i < sorted.length - 1; i++) {
            const a = sorted[i], b = sorted[i + 1];
            if (time >= a.time && time <= b.time) {
                const t = (time - a.time) / (b.time - a.time);
                return a.value + (b.value - a.value) * t;
            }
        }
        return 1;
    }

    createClipElement(clip, track) {
        const clipEl = document.createElement('div');
        clipEl.className = 'timeline-clip';
        clipEl.style.left = `${clip.startTime * this.zoom}px`;
        clipEl.style.width = `${clip.duration * this.zoom}px`;
        clipEl.style.backgroundColor = track.color + '60';
        clipEl.style.borderColor = track.color;
        clipEl.dataset.clipId = clip.id;
        clipEl.dataset.trackId = track.id;

        if (clip.type === 'pattern') {
            if (clip.mode === 'wav' && clip._frozen && clip._frozen.buffer) {
                const canvas = document.createElement('canvas');
                canvas.className = 'clip-waveform';
                clipEl.appendChild(canvas);
                this.drawWaveform(canvas, { buffer: clip._frozen.buffer, duration: clip.duration, loop: clip.loop });
            } else {
                const preview = document.createElement('div');
                preview.className = 'clip-waveform';
                clipEl.appendChild(preview);
                this._renderClipPreview(preview, clip);
            }
        } else {
            const canvas = document.createElement('canvas');
            canvas.className = 'clip-waveform';
            clipEl.appendChild(canvas);
            this.drawWaveform(canvas, clip);
        }

        const envCanvas = document.createElement('canvas');
        envCanvas.className = 'clip-envelope-canvas';
        clipEl.appendChild(envCanvas);
        this.drawEnvelope(envCanvas, clip);

        let badgeHtml = '';
        if (clip.type === 'pattern') {
            if (clip.mode === 'wav') {
                badgeHtml = '<span class="clip-mode-badge wav" title="Pre-rendered WAV">WAV</span>';
            } else {
                badgeHtml = '<span class="clip-mode-badge native" title="Live synthesis">NATIVE</span>';
            }
        }

        clipEl.insertAdjacentHTML('beforeend', `
            <div class="clip-content">
                <div class="clip-name">${clip.name}</div>
                <div class="clip-info">
                    <span>${clip.duration.toFixed(1)}s</span>
                    ${badgeHtml}
                    ${clip.type === 'pattern'
                        ? '<i class="fa-solid fa-list-check" title="Pattern Clip"></i>'
                        : (clip.loop ? '<i class="fa-solid fa-repeat"></i>' : '')}
                </div>
            </div>
            <div class="clip-resize-handle" data-action="resize"></div>
            ${clip.type === 'pattern' || clip.loop ? '<div class="clip-loop-indicator"></div>' : ''}
        `);
        this.refreshRepeatSegments(clipEl, clip);

        const hitEnvelopePoint = (clientX, clientY) => {
            const rect = clipEl.getBoundingClientRect();
            const x = clientX - rect.left;
            const y = clientY - rect.top;
            const w = rect.width, h = rect.height;
            const pad = 6;
            const env = clip.envelope || [];
            let idx = -1, best = 16;
            env.forEach((pt, i) => {
                const px = (pt.time / clip.duration) * w;
                const py = pad + (1 - pt.value) * (h - pad * 2);
                const d = Math.hypot(x - px, y - py);
                if (d < best) { best = d; idx = i; }
            });
            return idx;
        };

        let touchState = null;
        const clearTouchState = () => {
            if (touchState) { clearTimeout(touchState.timer); touchState = null; }
        };

        clipEl.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            if (e.touches.length !== 1) return;
            if (this.dragState.isDragging || this.dragState.isResizing) return;

            const t = e.touches[0];

            if (e.target.closest('.clip-resize-handle')) return;

            const envIdx = hitEnvelopePoint(t.clientX, t.clientY);
            if (envIdx !== -1) {
                e.preventDefault();
                this.startEnvelopeDragOnClip(clipEl, clip, envIdx, e);
                return;
            }

            if (this.mode === 'drag') { this.startDrag(e, clip, track); return; }

            touchState = {
                startX: t.clientX, startY: t.clientY,
                longPress: false, dragging: false,
                timer: setTimeout(() => {
                    if (!touchState) return;
                    touchState.longPress = true;
                    touchState.timer = null;
                }, 450),
            };
        }, { passive: false });

        clipEl.addEventListener('touchmove', (e) => {
            if (this.mode === 'drag') return;
            if (!touchState) return;
            if (touchState.dragging) { e.preventDefault(); return; }
            const t = e.touches[0];
            const dist = Math.hypot(t.clientX - touchState.startX, t.clientY - touchState.startY);
            if (touchState.longPress) {
                if (dist > 4) {
                    touchState.dragging = true;
                    e.preventDefault();
                    this.startDrag(e, clip, track);
                }
            } else if (dist > 8) {
                clearTimeout(touchState.timer);
                touchState = null;
            }
        }, { passive: false });

        clipEl.addEventListener('touchend', (e) => {
            if (!touchState) return;
            const { longPress, dragging } = touchState;
            const lastX = e.changedTouches[0]?.clientX ?? 0;
            const lastY = e.changedTouches[0]?.clientY ?? 0;
            clearTouchState();
            if (longPress && !dragging) {
                this.showClipContextMenu(lastX, lastY, clip, track);
            }
        });
        clipEl.addEventListener('touchcancel', clearTouchState);

        clipEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            if (e.target.closest('.clip-resize-handle')) return;
            if (this.dragState.isDragging || this.dragState.isResizing) return;

            e.stopPropagation();

            const envIdx = hitEnvelopePoint(e.clientX, e.clientY);
            if (envIdx !== -1) {
                e.preventDefault();
                this.startEnvelopeDragOnClip(clipEl, clip, envIdx, e);
                return;
            }

            this.startDrag(e, clip, track);
        });

        clipEl.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.showClipContextMenu(e.clientX, e.clientY, clip, track);
        });

        const handle = clipEl.querySelector('.clip-resize-handle');
        handle.addEventListener('touchstart', (e) => {
            e.stopPropagation();
            if (e.touches.length === 1) this.startResize(e, clip, track);
        }, { passive: false });
        handle.addEventListener('mousedown', (e) => {
            e.stopPropagation();
            if (e.button !== 0) return;
            this.startResize(e, clip, track);
        });

        clipEl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!this.dragState.isDragging && !this.dragState.isResizing) {
                this.selectedClip = { trackId: track.id, clipId: clip.id };
                this.renderTracks();
            }
        });

        let hoverIndex = -1;
        clipEl.addEventListener('mousemove', (e) => {
            if (this.dragState.isDragging || this.dragState.isResizing) return;
            if (e.target.closest('.clip-resize-handle')) {
                if (hoverIndex !== -1) {
                    hoverIndex = -1;
                    const envCanvas = clipEl.querySelector('.clip-envelope-canvas');
                    if (envCanvas) this.drawEnvelope(envCanvas, clip, -1);
                    clipEl.style.cursor = '';
                }
                return;
            }
            const idx = hitEnvelopePoint(e.clientX, e.clientY);
            if (idx !== hoverIndex) {
                hoverIndex = idx;
                const envCanvas = clipEl.querySelector('.clip-envelope-canvas');
                if (envCanvas) this.drawEnvelope(envCanvas, clip, hoverIndex);
                clipEl.style.cursor = (idx !== -1) ? 'ns-resize' : '';
            }
        });
        clipEl.addEventListener('mouseleave', () => {
            if (hoverIndex !== -1) {
                hoverIndex = -1;
                const envCanvas = clipEl.querySelector('.clip-envelope-canvas');
                if (envCanvas) this.drawEnvelope(envCanvas, clip, -1);
                clipEl.style.cursor = '';
            }
        });

        return clipEl;
    }

    refreshRepeatSegments(clipEl, clip) {
        clipEl.querySelectorAll('.clip-repeat-segment').forEach(el => el.remove());
        if (!clip.loop || !clip.buffer) return;
        const bufDur = clip.buffer.duration;
        if (!bufDur || bufDur <= 0) return;
        for (let t = bufDur; t < clip.duration - 0.001; t += bufDur) {
            const seg = document.createElement('div');
            seg.className = 'clip-repeat-segment';
            seg.style.left = `${t * this.zoom}px`;
            clipEl.appendChild(seg);
        }
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    setupGlobalInteractions() {
        document.addEventListener('click', (e) => {
            if (Date.now() - this._menuOpenedAt < 350) return;
            const clipMenu = document.getElementById('clip-context-menu');
            const trackMenu = document.getElementById('track-context-menu');
            const addTrackMenu = document.getElementById('add-track-menu');
            if (clipMenu?.contains(e.target)) return;
            if (trackMenu?.contains(e.target)) return;
            if (addTrackMenu?.contains(e.target)) return;
            this.hideContextMenu();
            this.hidePatternPopup();
            if (e.target.classList.contains('modal-overlay')) {
                e.target.classList.remove('show');
            }
        });
        const scrollArea = document.getElementById('tracks-scroll-area');
        if (scrollArea) {
            scrollArea.addEventListener('scroll', () => { this.hideContextMenu(); }, { passive: true });
            let wheelTimeout;
            scrollArea.addEventListener('wheel', (e) => {
                if (!e.ctrlKey) return;
                e.preventDefault();
                clearTimeout(wheelTimeout);
                wheelTimeout = setTimeout(() => {
                    const oldZoom = this.zoom;
                    this.zoom = Math.max(20, Math.min(400, this.zoom + (e.deltaY > 0 ? -10 : 10)));
                    const scale = this.zoom / oldZoom;
                    const oldScroll = scrollArea.scrollLeft;
                    requestAnimationFrame(() => {
                        this.renderRuler();
                        this._debouncedZoomRender();
                        scrollArea.scrollLeft = oldScroll * scale;
                    });
                }, 50);
            }, { passive: false });
        }
    }

    setupPlayControls() {
        const playBtn = document.getElementById('tracks-play-btn');
        const pauseBtn = document.getElementById('tracks-pause-btn');
        const stopBtn = document.getElementById('tracks-stop-btn');
        const modeBtn = document.getElementById('tracks-mode-btn');
        const snapBtn = document.getElementById('tracks-snap-btn');
        if (playBtn) playBtn.onclick = () => this.play();
        if (pauseBtn) pauseBtn.onclick = () => this.pause();
        if (stopBtn) stopBtn.onclick = () => this.stop();
        if (modeBtn) modeBtn.onclick = () => this.toggleMode();
        if (snapBtn) snapBtn.onclick = () => this.toggleSnap();

        this.snapEnabled = (localStorage.getItem('mrsm_snap_enabled') ?? '1') === '1';
        this._updateSnapButton();

        const undoBtn = document.getElementById('tracks-undo-btn');
        const redoBtn = document.getElementById('tracks-redo-btn');
        if (undoBtn) undoBtn.onclick = () => this.app.history.undo();
        if (redoBtn) redoBtn.onclick = () => this.app.history.redo();

        if (this.app.history) {
            this.app.history.subscribe(() => {
                if (undoBtn) undoBtn.style.opacity = this.app.history.canUndo() ? '1' : '0.35';
                if (redoBtn) redoBtn.style.opacity = this.app.history.canRedo() ? '1' : '0.35';
            });
            setTimeout(() => this.app.history._emit(), 0);
        }

    }

    toggleSnap() {
        this.snapEnabled = !this.snapEnabled;
        localStorage.setItem('mrsm_snap_enabled', this.snapEnabled ? '1' : '0');
        this._updateSnapButton();
    }

    _updateSnapButton() {
        const btn = document.getElementById('tracks-snap-btn');
        if (!btn) return;
        btn.classList.toggle('active', !!this.snapEnabled);
        btn.title = this.snapEnabled ? 'Snap: On' : 'Snap: Off';
        const icon = btn.querySelector('i');
        if (icon) {
            icon.style.opacity = this.snapEnabled ? '1' : '0.4';
        }
    }

    _nearestBeat(value) {
        const bpm = this.app.project?.bpm || 120;
        const beatSec = 60 / bpm;
        const subSec = beatSec / 4;
        const snapped = Math.round(value / subSec) * subSec;
        return snapped;
    }

    setupLaneInteractions(element, trackId) {
        const computeTimeFromClientX = (clientX) => {
            const rect = element.getBoundingClientRect();
            return (clientX - rect.left) / this.zoom;
        };

        let pressTimer = null;
        let origin = null;

        const startPress = (e) => {
            const t = e.target;
            if (t && t.closest && t.closest('.timeline-clip')) return;
            if (e.touches && e.touches.length !== 1) return;
            const p = e.touches ? e.touches[0] : e;
            origin = { x: p.clientX, y: p.clientY };
            pressTimer = setTimeout(() => {
                pressTimer = null;
                const timePosition = Math.max(0, computeTimeFromClientX(p.clientX));
                this.longPressPosition = { trackId, time: timePosition };
                this.showTrackContextMenu(p.clientX, p.clientY, trackId);
            }, this.longPressThreshold);
        };

        const moveCheck = (e) => {
            if (!pressTimer || !origin) return;
            const p = e.touches ? e.touches[0] : e;
            if (!p) return;
            if (Math.abs(p.clientX - origin.x) > 8 || Math.abs(p.clientY - origin.y) > 8) {
                clearTimeout(pressTimer); pressTimer = null;
            }
        };

        const cancelPress = () => {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
            origin = null;
        };

        element.addEventListener('touchstart', startPress, { passive: true });
        element.addEventListener('touchmove', moveCheck, { passive: true });
        element.addEventListener('touchend', cancelPress);
        element.addEventListener('touchcancel', cancelPress);

        element.addEventListener('contextmenu', (e) => {
            const t = e.target;
            if (t && t.closest && t.closest('.timeline-clip')) return;
            e.preventDefault();
            e.stopPropagation();
            const timePosition = Math.max(0, computeTimeFromClientX(e.clientX));
            this.longPressPosition = { trackId, time: timePosition };
            this.showTrackContextMenu(e.clientX, e.clientY, trackId);
        });

        element.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            const t = e.target;
            if (t && t.closest && t.closest('.timeline-clip')) return;
            if (e.altKey) return;

            e.preventDefault();
            e.stopPropagation();

            const scroller = document.getElementById('tracks-scroll-area');
            if (!scroller) return;

            const startX = e.clientX;
            const startY = e.clientY;
            const startScrollLeft = scroller.scrollLeft;
            const startScrollTop = scroller.scrollTop;
            element.style.cursor = 'grabbing';

            const onMove = (ev) => {
                ev.preventDefault();
                scroller.scrollLeft = startScrollLeft - (ev.clientX - startX);
                scroller.scrollTop = startScrollTop - (ev.clientY - startY);
            };
            const onUp = () => {
                element.style.cursor = '';
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onUp);
            };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    }

    showPatternPopup(x, y, trackId, timePosition, mode = 'wav') {
        const popup = document.getElementById('pattern-popup');
        if (!popup) return;

        this.longPressPosition = { trackId, time: timePosition };
        this._patternPopupMode = mode;
        this._patternPopupTrackId = trackId;
        this._patternPopupTime = timePosition;

        const titleEl = popup.querySelector('h4');
        if (titleEl) {
            titleEl.innerText = mode === 'native'
                ? 'Add Pattern (Native)'
                : 'Add Pattern (WAV)';
        }

        const oldToggle = popup.querySelector('.pattern-popup-mode-toggle');
        if (oldToggle) oldToggle.remove();

        const toggle = document.createElement('div');
        toggle.className = 'pattern-popup-mode-toggle';
        toggle.innerHTML = `
            <button class="pattern-mode-btn ${mode === 'wav' ? 'active' : ''}" data-mode="wav">
                <i class="fa-solid fa-wave-square"></i> WAV
            </button>
            <button class="pattern-mode-btn ${mode === 'native' ? 'active' : ''}" data-mode="native">
                <i class="fa-solid fa-microchip"></i> Native
            </button>
        `;
        const listContainer = popup.querySelector('#pattern-list-container');
        if (listContainer && listContainer.parentNode === popup) {
            popup.insertBefore(toggle, listContainer);
        } else {
            popup.appendChild(toggle);
        }

        toggle.querySelectorAll('.pattern-mode-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const newMode = btn.dataset.mode;
                this.showPatternPopup(x, y, trackId, timePosition, newMode);
            };
        });

        const oldHint = popup.querySelector('.pattern-popup-hint');
        if (oldHint) oldHint.remove();
        const hint = document.createElement('div');
        hint.className = 'pattern-popup-hint';
        hint.textContent = mode === 'native'
            ? 'Live synthesis — CPU-heavy on mobile'
            : 'Pre-rendered audio — fast, mobile-safe';
        if (toggle.parentNode === popup) {
            toggle.insertAdjacentElement('afterend', hint);
        }

        const container = document.getElementById('pattern-list-container');
        if (!container) return;
        container.innerHTML = '';

        const patterns = this.app.patterns?.patterns || {};
        const names = Object.keys(patterns);

        const targetTrack = this.getTrack(trackId);
        const trackType = targetTrack?.type || 'synth';

        const usableRaw = names.filter(n => {
            const p = patterns[n];
            if (!p || !Array.isArray(p.grid) || p.grid.length === 0) return false;
            return true;
        });

        const usable = usableRaw.slice().sort((a, b) => {
            const ka = (patterns[a].kind || 'drums');
            const kb = (patterns[b].kind || 'drums');
            const compatA = window.TrackTypes
                ? TrackTypes.acceptsPatternKind(trackType, ka) : true;
            const compatB = window.TrackTypes
                ? TrackTypes.acceptsPatternKind(trackType, kb) : true;
            if (compatA !== compatB) return compatA ? -1 : 1;
            return a.localeCompare(b);
        });

        if (usable.length === 0) {
            container.innerHTML =
                '<div style="padding:10px;color:var(--text-dim);font-size:11px;">No saved patterns</div>';
        } else {
            usable.forEach(name => {
                const pattern = patterns[name];
                const item = document.createElement('div');
                item.className = 'pattern-item';
                const bpm = pattern.bpm || 120;
                const steps = pattern.grid?.[0]?.length || 16;
                const seconds = ((steps / 4) * (60 / bpm)).toFixed(2);
                const kind = pattern.kind || 'drums';
                const kindIcon = kind === 'synth' ? '🎹' : '🥁';

                const compatible = window.TrackTypes
                    ? TrackTypes.acceptsPatternKind(trackType, kind)
                    : true;
                if (!compatible) {
                    item.classList.add('pattern-item-incompatible');
                }

                const warningTag = compatible
                    ? ''
                    : `<span class="pattern-item-warning" title="This pattern kind doesn't match the track type">${kind.toUpperCase()}</span>`;

                const renderMode = pattern.renderMode || 'native';
                const modeBadge = renderMode === 'wav'
                    ? '<span class="pattern-item-mode wav" title="Saved in WAV mode">WAV</span>'
                    : '<span class="pattern-item-mode native" title="Saved in Native mode">NATIVE</span>';

                item.innerHTML = `
                    <span class="pattern-item-name">${kindIcon} ${name}</span>
                    <span class="pattern-item-info">${bpm} BPM · ${seconds}s ${modeBadge} ${warningTag}</span>
                `;

                const activate = (ev) => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    popup.classList.remove('show');
                    const t = this._patternPopupTime;
                    if (this._patternPopupMode === 'native') {
                        this.addPatternAsNativeClip(trackId, name, pattern, t);
                    } else {
                        this.addPatternAsWavClip(trackId, name, pattern, t);
                    }
                };

                let startX = 0, startY = 0;
                item.addEventListener('touchstart', (e) => {
                    startX = e.touches[0].clientX;
                    startY = e.touches[0].clientY;
                }, { passive: true });
                item.addEventListener('touchend', (ev) => {
                    const dx = ev.changedTouches[0].clientX - startX;
                    const dy = ev.changedTouches[0].clientY - startY;
                    if (Math.hypot(dx, dy) > 10) return;
                    activate(ev);
                }, { passive: false });
                item.addEventListener('click', activate);

                container.appendChild(item);
            });
        }

        popup.classList.add('show');
        const rect = popup.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        let px = x, py = y;
        if (px + rect.width > vw - 8) px = vw - rect.width - 8;
        if (py + rect.height > vh - 8) py = vh - rect.height - 8;
        if (px < 8) px = 8;
        if (py < 8) py = 8;
        popup.style.left = `${px}px`;
        popup.style.top = `${py}px`;
    }

    _importFromPopup() {
        const trackId = this._patternPopupTrackId ?? this.longPressPosition?.trackId ?? null;
        const atTime = this._patternPopupTime ?? this.longPressPosition?.time ?? null;
        this.hidePatternPopup();
        this.importAudioFile(trackId, atTime);
    }

    hidePatternPopup() {
        const popup = document.getElementById('pattern-popup');
        if (popup) popup.classList.remove('show');
    }

    _ensureMenu(id) {
        let menu = document.getElementById(id);
        if (!menu) {
            menu = document.createElement('div');
            menu.id = id;
            menu.className = 'clip-context-menu';
            document.body.appendChild(menu);
        }
        return menu;
    }

    _positionMenu(menu, x, y) {
        menu.classList.add('show');
        menu.style.left = '0px';
        menu.style.top = '0px';
        const rect = menu.getBoundingClientRect();
        const vw = window.innerWidth, vh = window.innerHeight;
        let mx = x, my = y;
        if (mx + rect.width > vw - 8) mx = vw - rect.width - 8;
        if (my + rect.height > vh - 8) my = vh - rect.height - 8;
        if (mx < 8) mx = 8;
        if (my < 8) my = 8;
        menu.style.left = `${mx}px`;
        menu.style.top = `${my}px`;
    }

    _buildMenu(menu, items, headerText) {
        let html = '';
        if (headerText) html += `<div class="clip-context-header">${headerText}</div>`;
        html += items.map(it => {
            if (it.divider) return '<div class="clip-context-divider"></div>';
            const cls = `clip-context-item${it.disabled ? ' disabled' : ''}${it.danger ? ' danger' : ''}`;
            return `<div class="${cls}" data-action="${it.id}">
                <i class="fa-solid ${it.icon}"></i>
                <span>${it.label}</span>
            </div>`;
        }).join('');
        menu.innerHTML = html;
        menu.querySelectorAll('.clip-context-item').forEach(el => {
            if (el.classList.contains('disabled')) return;
            const id = el.dataset.action;
            const item = items.find(i => i.id === id);
            if (!item) return;
            let fired = false;
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
    this.hideContextMenu();
    setTimeout(() => item.action(), 0);
}, { passive: false });
el.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    this.hideContextMenu();
    setTimeout(() => item.action(), 0);
});
        });
    }

    showClipContextMenu(x, y, clip, track) {
        const clipEl = document.querySelector(`.timeline-clip[data-clip-id="${clip.id}"]`);
        let clickTime = clip.duration / 2;
        let clickValue = 1;
        let clickAbsTime = clip.startTime + clickTime;
        if (clipEl) {
            const rect = clipEl.getBoundingClientRect();
            const lx = Math.max(0, Math.min(rect.width, x - rect.left));
            const ly = Math.max(0, Math.min(rect.height, y - rect.top));
            clickTime = lx / this.zoom;
            clickValue = Math.max(0, Math.min(1, 1 - ly / rect.height));
            clickAbsTime = clip.startTime + clickTime;
        }
        this.contextClip = {
            trackId: track.id, clipId: clip.id,
            clickTime, clickValue, clickAbsoluteTime: clickAbsTime,
        };
        this.contextTrack = null;
        this.selectedClip = { trackId: track.id, clipId: clip.id };
        this._menuOpenedAt = Date.now();

        const menu = this._ensureMenu('clip-context-menu');
        const hasClipboard = !!this.clipboard;
        const hasEnv = clip.envelope && clip.envelope.length > 2;

        const items = [
            { id: 'copy',     icon: 'fa-copy',         label: 'Copy',                action: () => this.copyClip() },
            { id: 'paste',    icon: 'fa-paste',        label: 'Paste here',          action: () => this.pasteClip(), disabled: !hasClipboard },
            { id: 'split',    icon: 'fa-scissors',     label: 'Split here',          action: () => this.splitClip() },
            { id: 'dup',      icon: 'fa-clone',        label: 'Duplicate',           action: () => this.duplicateClip() },
            { divider: true },
            { id: 'loop',     icon: 'fa-repeat',       label: clip.loop ? 'Loop: On' : 'Loop: Off',   action: () => this.toggleClipLoop() },
            { id: 'mute',     icon: 'fa-volume-xmark', label: clip.muted ? 'Unmute' : 'Mute',         action: () => this.toggleClipMute() },
            { id: 'env',      icon: 'fa-wave-square',  label: 'Add Point here',      action: () => this.addEnvelopePoint() },
            { id: 'envclear', icon: 'fa-eraser',       label: 'Clear Envelope',      action: () => this.clearEnvelope(), disabled: !hasEnv },
            { divider: true },
            { id: 'manage',   icon: 'fa-sliders',      label: 'Manage Clip…',        action: () => this.openClipManager() },
            { id: 'delete',   icon: 'fa-trash',        label: 'Delete',              action: () => this.deleteClip(), danger: true },
        ];
        this._buildMenu(menu, items, clip.name);
        this._positionMenu(menu, x, y);
    }

    showTrackContextMenu(x, y, trackId) {
        const track = this.getTrack(trackId);
        if (!track) return;
        this.contextTrack = trackId;
        this.contextClip = null;
        this.selectedTrack = trackId;
        this._menuOpenedAt = Date.now();
        const menu = this._ensureMenu('track-context-menu');
        const clickTime = this.longPressPosition?.time ?? this.playheadPosition;

        const items = [
            {
                id: 'add-wav',
                icon: 'fa-wave-square',
                label: 'Add Pattern (WAV)',
                action: () => this.showPatternPopup(x, y, trackId, clickTime, 'wav'),
            },
            {
                id: 'add-native',
                icon: 'fa-microchip',
                label: 'Add Pattern (Native)',
                action: () => this.showPatternPopup(x, y, trackId, clickTime, 'native'),
            },
            {
                id: 'add-file',
                icon: 'fa-file-import',
                label: 'Import Audio File…',
                action: () => this.importAudioFile(trackId, clickTime),
            },
            { divider: true },
            { id: 'mute',    icon: 'fa-volume-xmark', label: track.muted ? 'Unmute Track' : 'Mute Track', action: () => this.toggleMute(trackId) },
            { id: 'solo',    icon: 'fa-headphones',   label: track.solo ? 'Unsolo Track' : 'Solo Track',  action: () => this.toggleSolo(trackId) },
            { id: 'manage',  icon: 'fa-sliders',      label: 'Manage Track…',       action: () => this.openTrackManager(trackId) },
            { divider: true },
            { id: 'delete',  icon: 'fa-trash',        label: 'Delete Track',        action: () => this.deleteTrack(trackId), danger: true },
        ];

        this._buildMenu(menu, items, track.name);
        this._positionMenu(menu, x, y);
    }

    hideContextMenu() {
        const clipMenu = document.getElementById('clip-context-menu');
        const trackMenu = document.getElementById('track-context-menu');
        const addTrackMenu = document.getElementById('add-track-menu');
        if (clipMenu) clipMenu.classList.remove('show');
        if (trackMenu) trackMenu.classList.remove('show');
        if (addTrackMenu) addTrackMenu.classList.remove('show');
    }

    deleteTrack(trackId) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const beforeClips = track.clips.slice();

        const self = this;
        this.app.history.push({
            label: 'Delete Track',
            do: () => {
                track.clips = [];
                self.tracks = self.tracks.filter(t => t.id !== trackId);
                const nodes = self._trackNodes.get(trackId);
                if (nodes) {
                    try { nodes.gain.disconnect(); } catch (_) {}
                    try { nodes.panner.disconnect(); } catch (_) {}
                    self._trackNodes.delete(trackId);
                }
                self.renderTracks();
            },
            undo: () => {
                if (!self.tracks.find(t => t.id === trackId)) {
                    track.clips = beforeClips;
                    self.tracks.push(track);
                    self._getTrackNodes(trackId);
                    self._refreshTrackGain(trackId);
                    self.renderTracks();
                }
            },
        });

        if (this.selectedTrack === trackId) this.selectedTrack = null;
        this._refreshAllTrackGains();
    }

        addTrack(name = null, color = null, type = 'synth') {
        const id = this.nextTrackId++;
        const typeDef = window.TrackTypes ? TrackTypes.byId(type) : null;

        const track = {
            id,
            name: name || (typeDef ? typeDef.defaultName : `Track ${id}`),
            type: typeDef ? typeDef.id : 'synth',
            color: color || (typeDef ? typeDef.color : this.generateUniqueColor(id)),
            clips: [], muted: false, solo: false, volume: 1, pan: 0,
        };
        const trackId = track.id;
        const self = this;
        this.app.history.push({
            label: 'Add Track',
            do: () => {
                if (!self.tracks.find(t => t.id === track.id)) {
                    self.tracks.push(track);
                    self._getTrackNodes(trackId);
                    self._refreshTrackGain(trackId);
                    self.renderTracks();
                }
            },
            undo: () => {
                self.tracks = self.tracks.filter(t => t.id !== track.id);
                self.renderTracks();
            },
        });

        return track;
    }

    addTrackWithMenu(anchorEl = null) {
        const menu = this._ensureMenu('add-track-menu');
        menu.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'clip-context-header';
        header.textContent = 'Add Track';
        menu.appendChild(header);

        const types = window.TrackTypes ? TrackTypes.enabled() : [{ id: 'synth', label: 'Synth Track', icon: 'fa-wave-square' }];

        types.forEach(type => {
            const item = document.createElement('div');
            item.className = 'clip-context-item';
            item.innerHTML = `
                <i class="fa-solid ${type.icon}"></i>
                <span>${type.label}</span>
            `;
            const activate = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.hideContextMenu();
                this.addTrack(null, null, type.id);
            };
            item.addEventListener('click', activate);
            let tStartX = 0, tStartY = 0;
            item.addEventListener('touchstart', (e) => {
                tStartX = e.touches[0].clientX;
                tStartY = e.touches[0].clientY;
            }, { passive: true });
            item.addEventListener('touchend', (e) => {
                const dx = e.changedTouches[0].clientX - tStartX;
                const dy = e.changedTouches[0].clientY - tStartY;
                if (Math.hypot(dx, dy) > 10) return;
                activate(e);
            }, { passive: false });

            menu.appendChild(item);
        });

        let x = window.innerWidth / 2 - 100;
        let y = 100;
        if (anchorEl) {
            const rect = anchorEl.getBoundingClientRect();
            x = rect.left - 20;
            y = rect.bottom + 6;
        }
        this._menuOpenedAt = Date.now();
        this._positionMenu(menu, x, y);
    }

    _addTrackSilent(name, color, type = 'synth') {
        const id = this.nextTrackId++;
        const typeDef = window.TrackTypes ? TrackTypes.byId(type) : null;

        const track = {
            id,
            name: name || (typeDef ? typeDef.defaultName : `Track ${id}`),
            type: typeDef ? typeDef.id : 'synth',
            color: color || (typeDef ? typeDef.color : this.generateUniqueColor(id)),
            clips: [],
            muted: false,
            solo: false,
            volume: 1,
            pan: 0,
        };
        this.tracks.push(track);
        this._getTrackNodes(track.id);
        this._refreshTrackGain(track.id);
        this._refreshTrackPan(track.id);
        return track;
    }

    generateUniqueColor(id = this.nextTrackId) {
        const colors = ['#1e88e5', '#43a047', '#fb8c00', '#e53935', '#8e24aa', '#00acc1', '#7cb342', '#fdd835'];
        return colors[(id - 1) % colors.length];
    }

    getTrack(trackId) { return this.tracks.find(t => t.id === trackId); }

    addClip(trackId, buffer, startTime = null, name = null, options = {}) {
        const track = this.getTrack(trackId);
        if (!track || !buffer) return null;
        const start = (startTime === null || startTime === undefined)
            ? this.playheadPosition : startTime;

        const dur = (options.duration != null)
            ? Math.min(options.duration, buffer.duration)
            : buffer.duration;

        const clip = {
            id: Date.now() + Math.random(),
            type: 'audio',
            name: name || buffer.name || 'Sample',
            buffer,
            startTime: Math.max(0, start),
            duration: dur,
            offset: 0, loop: false,
            loopStart: 0, loopEnd: buffer.duration,
            volume: options.volume || 1,
            pan: options.pan || 0,
            speed: options.speed || 1,
            muted: false,
            envelope: [
                { time: 0, value: 1 },
                { time: dur, value: 1 },
            ],
        };

        const self = this;
        this.app.history.push({
            label: 'Add Clip',
            do: () => {
                if (!track.clips.find(c => c.id === clip.id)) {
                    track.clips.push(clip);
                    self.sortClips(track);
                    self.renderTracks({ trackId });
                }
            },
            undo: () => {
                track.clips = track.clips.filter(c => c.id !== clip.id);
                self.renderTracks({ trackId });
            },
        });

        return clip;
    }

    async addPatternAsWavClip(trackId, patternName, patternData, timePosition = null) {
        const track = this.getTrack(trackId);
        if (!track) return null;

        const bpm = patternData.bpm || this.app.project?.bpm || 120;
        const steps = patternData.grid?.[0]?.length || 16;
        const duration = (steps / 4) * (60 / bpm);

        const targetTime = (timePosition !== null && timePosition !== undefined)
            ? timePosition
            : (this.longPressPosition?.time ?? this.playheadPosition);

        const kind = patternData.kind || 'drums';

        const normUniversal = (cell) => {
            if (cell && typeof cell === 'object') {
                return {
                    active: !!cell.active,
                    velocity: typeof cell.velocity === 'number' ? cell.velocity : 1,
                    probability: typeof cell.probability === 'number' ? cell.probability : 1,
                    ratchet: typeof cell.ratchet === 'number' ? cell.ratchet : 1,
                    pan: typeof cell.pan === 'number' ? cell.pan : 0,
                    pitch: typeof cell.pitch === 'number' ? Math.round(cell.pitch) : 0,
                    length: typeof cell.length === 'number' && cell.length >= 1
                        ? Math.round(cell.length) : 1,
                    attack:  (typeof cell.attack  === 'number' && isFinite(cell.attack))  ? cell.attack  : null,
                    decay:   (typeof cell.decay   === 'number' && isFinite(cell.decay))   ? cell.decay   : null,
                    sustain: (typeof cell.sustain === 'number' && isFinite(cell.sustain)) ? cell.sustain : null,
                    release: (typeof cell.release === 'number' && isFinite(cell.release)) ? cell.release : null,
                };
            }
            return {
                active: !!cell, velocity: 1, probability: 1,
                ratchet: 1, pan: 0, pitch: 0, length: 1,
                attack: null, decay: null, sustain: null, release: null,
            };
        };

        const frozenGrid = patternData.grid.map(row => row.map(normUniversal));

        const padSnapshots = this.app.drumPads.map(pad => ({
            effects: Object.assign({}, pad.effects || {}),
            effectStates: JSON.parse(JSON.stringify(pad.effectStates || {})),
            volume: pad.volume ?? 1,
            pitch: pad.pitch ?? 0,
            pan: pad.pan ?? 0,
            muted: pad.muted ?? false,
            solo: pad.solo ?? false,
            sample: pad.sample,
        }));

        const clip = {
            id: Date.now() + Math.random(),
            type: 'pattern',
            mode: 'wav',
            name: patternName || patternData.name || 'Pattern',
            pattern: {
                grid: frozenGrid,
                steps,
                bpm,
                kind,
                baseMidiNote: Number.isFinite(patternData.baseMidiNote)
                    ? patternData.baseMidiNote
                    : (patternData.octave != null ? (patternData.octave + 1) * 12 : 60),
                octave: patternData.octave ?? 4,
                sourceName: patternName || null,
            },
            padSnapshots,
            startTime: Math.max(0, targetTime),
            duration,
            offset: 0,
            loop: true,
            loopStart: 0,
            loopEnd: duration,
            volume: 1,
            pan: 0,
            speed: 1,
            muted: false,
            envelope: [
                { time: 0, value: 1 },
                { time: duration, value: 1 },
            ],
            _frozen: null,
        };

        if (kind === 'synth') {
            const prof = patternData.soundProfile || {};

            const voiceEffects = prof.effects || {};
            const voiceEffectStates = prof.effectStates || {};
            const voiceOnly = {};
            Object.keys(prof).forEach(k => {
                if (k === 'effects' || k === 'effectStates') return;
                voiceOnly[k] = prof[k];
            });

            const completeVoice = (window.Voice && Voice.applyDefaults)
                ? Voice.applyDefaults(voiceOnly)
                : Object.assign({}, voiceOnly);

            clip.synthVoice = Object.assign({}, completeVoice, {
                sampleBuffer: null,
                effects: Object.assign({}, voiceEffects),
                effectStates: JSON.parse(JSON.stringify(voiceEffectStates)),
                _shapeVersion: 3,
            });

            if (clip.synthVoice.waveform === 'sample') {
                clip._missingSample = true;
                setTimeout(() => {
                    alert(
                        `Pattern "${patternName}" uses a sample that is not embedded in the pattern file.\n\n` +
                        `Notes in this clip will play silently. To restore sound, re-upload the sample ` +
                        `and re-save the pattern.`
                    );
                }, 0);
            }
        }

        track.clips.push(clip);
        this.sortClips(track);
        this.renderTracks({ trackId });

        if (window.ClipFreezer) {
            window.ClipFreezer.freeze(clip, bpm).then(() => {
                this.renderTracks({ trackId });
            }).catch(err => {
                console.warn('Failed to freeze WAV clip:', err);
            });
        }

        this.app.history.push({
            label: 'Add Pattern WAV Clip',
            do: () => {
                if (!track.clips.find(c => c.id === clip.id)) {
                    track.clips.push(clip);
                    this.sortClips(track);
                    this.renderTracks({ trackId });
                }
            },
            undo: () => {
                track.clips = track.clips.filter(c => c.id !== clip.id);
                if (window.ClipFreezer) window.ClipFreezer.dispose(clip);
                this.renderTracks({ trackId });
            },
        });

        return clip;
    }

    addPatternAsNativeClip(trackId, patternName, patternData, timePosition = null) {
        const track = this.getTrack(trackId);
        if (!track) return null;

        const bpm = patternData.bpm || this.app.project?.bpm || 120;
        const steps = patternData.grid?.[0]?.length || 16;
        const duration = (steps / 4) * (60 / bpm);

        const targetTime = (timePosition !== null && timePosition !== undefined)
            ? timePosition
            : (this.longPressPosition?.time ?? this.playheadPosition);

        const kind = patternData.kind || 'drums';
        const frozenGrid = patternData.grid.map(row =>
            row.map(cell => this.app.currentSequencer._normStep(cell))
        );

        const padSnapshots = this.app.drumPads.map(pad => ({
            effects: Object.assign({}, pad.effects || {}),
            effectStates: JSON.parse(JSON.stringify(pad.effectStates || {})),
            volume: pad.volume ?? 1,
            pitch: pad.pitch ?? 0,
            pan: pad.pan ?? 0,
            muted: pad.muted ?? false,
            solo: pad.solo ?? false,
            sample: pad.sample,
        }));

        const clip = {
            id: Date.now() + Math.random(),
            type: 'pattern',
            mode: 'native',
            name: patternName || patternData.name || 'Pattern',
            pattern: {
                grid: frozenGrid,
                steps,
                bpm,
                kind,
                baseMidiNote: Number.isFinite(patternData.baseMidiNote)
                    ? patternData.baseMidiNote
                    : (patternData.octave != null ? (patternData.octave + 1) * 12 : 60),
                octave: patternData.octave ?? 4,
                sourceName: patternName || null,
            },
            padSnapshots,
            startTime: Math.max(0, targetTime),
            duration,
            offset: 0,
            loop: true,
            loopStart: 0,
            loopEnd: duration,
            volume: 1,
            pan: 0,
            speed: 1,
            muted: false,
            envelope: [
                { time: 0, value: 1 },
                { time: duration, value: 1 },
            ],
        };

        if (kind === 'synth') {
            const prof = patternData.soundProfile || {};

            const voiceEffects = prof.effects || {};
            const voiceEffectStates = prof.effectStates || {};
            const voiceOnly = {};
            Object.keys(prof).forEach(k => {
                if (k === 'effects' || k === 'effectStates') return;
                voiceOnly[k] = prof[k];
            });

            const completeVoice = (window.Voice && Voice.applyDefaults)
                ? Voice.applyDefaults(voiceOnly)
                : Object.assign({}, voiceOnly);

            clip.synthVoice = Object.assign({}, completeVoice, {
                sampleBuffer: null,
                effects: Object.assign({}, voiceEffects),
                effectStates: JSON.parse(JSON.stringify(voiceEffectStates)),
                _shapeVersion: 3,
            });

            if (clip.synthVoice.waveform === 'sample') {
                clip._missingSample = true;
                setTimeout(() => {
                    alert(
                        `Pattern "${patternName}" uses a sample that is not embedded in the pattern file.\n\n` +
                        `Notes in this clip will play silently. To restore sound, re-upload the sample ` +
                        `and re-save the pattern.`
                    );
                }, 0);
            }
        }

        track.clips.push(clip);
        this.sortClips(track);
        requestAnimationFrame(() => this.renderTracks({ trackId }));

        this.app.history.push({
            label: 'Add Pattern Clip',
            do: () => {
                if (!track.clips.find(c => c.id === clip.id)) {
                    track.clips.push(clip);
                    this.sortClips(track);
                    this.renderTracks({ trackId });
                }
            },
            undo: () => {
                track.clips = track.clips.filter(c => c.id !== clip.id);
                this.renderTracks({ trackId });
            }
        });
        return clip;
    }

    _queueRender(opts = {}) {
        if (!this._pendingRender) this._pendingRender = { full: false };
        this._pendingRender.full = this._pendingRender.full || opts.full;
        if (opts.trackId !== undefined && this._pendingRender.trackId === undefined) {
            this._pendingRender.trackId = opts.trackId;
        }
        if (opts.clipId !== undefined && this._pendingRender.clipId === undefined) {
            this._pendingRender.clipId = opts.clipId;
        }

        if (this._renderRAF) return;
        this._renderRAF = requestAnimationFrame(() => {
            this._renderRAF = null;
            const pending = this._pendingRender || { full: true };
            this._pendingRender = null;
            this._renderTracksNow(pending);
        });
    }

    removeClip(trackId, clipId) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const clip = track.clips.find(c => c.id === clipId);
        if (!clip) return;

        const self = this;
        this.app.history.push({
            label: 'Delete Clip',
            do: () => {
                track.clips = track.clips.filter(c => c.id !== clipId);
                self._disposeClipAudio(clip);
                self.renderTracks({ trackId });
            },
            undo: () => {
                if (!track.clips.find(c => c.id === clipId)) {
                    track.clips.push(clip);
                    self.sortClips(track);
                    self.renderTracks({ trackId });
                }
            },
        });
    }

    _disposeClipAudio(clip) {
        if (!clip) return;

        if (window.ClipFreezer) {
            try { window.ClipFreezer.dispose(clip); } catch (_) {}
        }

        try { clip._synthFxChain?.proc?.reset(); } catch (_) {}
        if (clip._synthFxChain?.proc) {
            try { clip._synthFxChain.proc.masterInput.disconnect(); } catch (_) {}
            try { clip._synthFxChain.proc.masterOutput.disconnect(); } catch (_) {}
        }
        clip._synthFxChain = null;

        if (clip._fxChains) {
            Object.values(clip._fxChains).forEach(entry => {
                try { entry.proc.reset(); } catch (_) {}
                try { entry.proc.masterInput.disconnect(); } catch (_) {}
                try { entry.proc.masterOutput.disconnect(); } catch (_) {}
            });
            clip._fxChains = null;
        }

        if (clip._activeEnvelopeGain) {
            try { clip._activeEnvelopeGain.disconnect(); } catch (_) {}
            clip._activeEnvelopeGain = null;
        }
    }

    updateClip(trackId, clipId, updates) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const clip = track.clips.find(c => c.id === clipId);
        if (clip) {
            Object.assign(clip, updates);
            requestAnimationFrame(() => this.renderTracks({ trackId }));
        }
    }

    sortClips(track) { track.clips.sort((a, b) => a.startTime - b.startTime); }

    _resolveTargetClip() {
        const target = this.selectedClip || this.contextClip;
        if (!target) return null;
        const track = this.getTrack(target.trackId);
        if (!track) return null;
        const clip = track.clips.find(c => c.id === target.clipId);
        if (!clip) return null;
        return { trackId: target.trackId, clipId: target.clipId, track, clip };
    }

    copyClip() {
        const resolved = this._resolveTargetClip();
        if (!resolved) return;
        this.clipboard = {
            ...resolved.clip,
            id: null,
            envelope: (resolved.clip.envelope || []).map(p => ({ ...p })),
            sourceTrackId: resolved.trackId,
        };
    }

    pasteClip() {
        if (!this.clipboard) return;
        const targetTrackId = this.selectedTrack ?? this.clipboard.sourceTrackId ?? this.tracks[0]?.id;
        const track = this.getTrack(targetTrackId);
        if (!track) return;
        const pasteTime = this.contextClip?.clickAbsoluteTime ?? this.playheadPosition;
        const newClip = {
            ...this.clipboard,
            id: Date.now() + Math.random(),
            name: (this.clipboard.name || 'Clip') + ' (paste)',
            startTime: Math.max(0, pasteTime),
            envelope: (this.clipboard.envelope || []).map(p => ({ ...p })),
        };
        delete newClip.sourceTrackId;
        track.clips.push(newClip);
        this.sortClips(track);
        this.selectedClip = { trackId: targetTrackId, clipId: newClip.id };
        this.contextClip = this.selectedClip;
        requestAnimationFrame(() => this.renderTracks(targetTrackId));
        this.closeClipManager();
    }

    splitClip() {
        const resolved = this._resolveTargetClip();
        if (!resolved) return;
        const { trackId, clipId, clip } = resolved;
        let splitTime;
        if (this.contextClip && typeof this.contextClip.clickAbsoluteTime === 'number') {
            splitTime = this.contextClip.clickAbsoluteTime;
        } else {
            splitTime = this.playheadPosition;
        }
        const minT = clip.startTime + 0.05;
        const maxT = clip.startTime + clip.duration - 0.05;
        if (splitTime <= minT || splitTime >= maxT) splitTime = clip.startTime + clip.duration / 2;
        this.splitClipAt(trackId, clipId, splitTime);
    }

    splitClipAt(trackId, clipId, splitTime) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const idx = track.clips.findIndex(c => c.id === clipId);
        if (idx === -1) return;

        const clip = track.clips[idx];
        const rel = splitTime - clip.startTime;
        if (rel <= 0.02 || rel >= clip.duration - 0.02) return;

        const bufDur = clip.buffer?.duration || 0;

        const env = (clip.envelope || []).slice().sort((a, b) => a.time - b.time);
        const valueAtSplit = this.getEnvelopeValueAt(env, rel);
        const envA = env.filter(p => p.time < rel).map(p => ({ ...p }));
        envA.push({ time: rel, value: valueAtSplit });
        const envB = env.filter(p => p.time > rel).map(p => ({ time: p.time - rel, value: p.value }));
        envB.unshift({ time: 0, value: valueAtSplit });
        const rightDuration = clip.duration - rel;
        if (envB[envB.length - 1].time < rightDuration - 0.001) {
            envB.push({ time: rightDuration, value: envB[envB.length - 1].value });
        }

        let rightOffset = clip.offset + rel;
        if (bufDur > 0) {
            if (clip.loop) rightOffset = ((rightOffset % bufDur) + bufDur) % bufDur;
            else if (rightOffset >= bufDur) return;
        }
        const remaining = bufDur > 0 ? (bufDur - rightOffset) : rightDuration;
        const rightNeedsLoop = clip.loop || rightDuration > remaining + 0.001;

        const a = { ...clip, id: Date.now() + Math.random(), duration: rel, envelope: envA };
        const b = {
            ...clip, id: Date.now() + Math.random() + 1,
            startTime: splitTime, offset: rightOffset,
            duration: rightDuration, loop: rightNeedsLoop,
            loopStart: 0, loopEnd: bufDur,
            envelope: envB,
        };

        const self = this;
        this.app.history.push({
            label: 'Split Clip',
            do: () => {
                const i = track.clips.findIndex(c => c.id === clipId);
                if (i === -1) return;
                track.clips.splice(i, 1, a, b);
                self.sortClips(track);
                self.renderTracks({ trackId });
            },
            undo: () => {
                const ia = track.clips.findIndex(c => c.id === a.id);
                const ib = track.clips.findIndex(c => c.id === b.id);
                if (ia >= 0 && ib >= 0) {
                    const restore = Math.min(ia, ib);
                    track.clips.splice(restore, 2, clip);
                    self.sortClips(track);
                    self.renderTracks({ trackId });
                }
            },
        });

        this.selectedClip = { trackId, clipId: a.id };
        this.contextClip = this.selectedClip;
        this.closeClipManager();
    }

    duplicateClip() {
        const resolved = this._resolveTargetClip();
        if (!resolved) return;
        const { trackId, clip } = resolved;
        const track = this.getTrack(trackId);

        const newClip = {
            ...clip,
            id: Date.now() + Math.random(),
            startTime: clip.startTime + clip.duration,
            name: clip.name + ' Copy',
            envelope: (clip.envelope || []).map(p => ({ ...p })),
        };

        const self = this;
        this.app.history.push({
            label: 'Duplicate Clip',
            do: () => {
                if (!track.clips.find(c => c.id === newClip.id)) {
                    track.clips.push(newClip);
                    self.sortClips(track);
                    self.renderTracks({ trackId });
                }
            },
            undo: () => {
                track.clips = track.clips.filter(c => c.id !== newClip.id);
                self.renderTracks({ trackId });
            },
        });

        this.selectedClip = { trackId, clipId: newClip.id };
        this.closeClipManager();
    }

    deleteClip() {
        const resolved = this._resolveTargetClip();
        if (!resolved) return;
        this.removeClip(resolved.trackId, resolved.clipId);
        this.selectedClip = null;
        this.contextClip = null;
        this.closeClipManager();
    }

    toggleClipLoop() {
        const resolved = this._resolveTargetClip();
        if (!resolved) return;
        this.updateClip(resolved.trackId, resolved.clipId, { loop: !resolved.clip.loop });
    }
    toggleClipMute() {
        const resolved = this._resolveTargetClip();
        if (!resolved) return;
        this.updateClip(resolved.trackId, resolved.clipId, { muted: !resolved.clip.muted });
    }
    clearEnvelope() {
        const resolved = this._resolveTargetClip();
        if (!resolved) return;
        const { clip } = resolved;
        const trackId = resolved.trackId;
        clip.envelope = [
            { time: 0, value: 1 },
            { time: clip.duration, value: 1 },
        ];
        this.renderTracks({ trackId });
        this._renderEnvelopeEditor();
        this._drawEnvelopeEditorCanvas();
    }

    _computeSnapTargets(excludeClipId) {
        const targets = [];
        this.tracks.forEach(t => {
            t.clips.forEach(c => {
                if (c.id === excludeClipId) return;
                targets.push({ start: c.startTime, end: c.startTime + c.duration });
            });
        });
        return targets;
    }
    _findNearestSnap(value, targets, radiusSeconds) {
        let best = null;
        let bestDist = radiusSeconds;

        let beatTime;
        try {
            beatTime = this._nearestBeat(value);
        } catch (_) {
            beatTime = null;
        }
        if (beatTime != null) {
            const beatDist = Math.abs(beatTime - value);
            if (beatDist < bestDist) {
                bestDist = beatDist;
                best = { time: beatTime, kind: 'beat' };
            }
        }

        if (Array.isArray(targets)) {
            for (const t of targets) {
                if (!t) continue;

                if (typeof t.time === 'number') {
                    const d = Math.abs(t.time - value);
                    if (d < bestDist) {
                        bestDist = d;
                        best = { time: t.time, kind: t.kind || 'clip' };
                    }
                }

                if (typeof t.start === 'number') {
                    const d = Math.abs(t.start - value);
                    if (d < bestDist) {
                        bestDist = d;
                        best = { time: t.start, kind: 'clip-start' };
                    }
                }
                if (typeof t.end === 'number') {
                    const d = Math.abs(t.end - value);
                    if (d < bestDist) {
                        bestDist = d;
                        best = { time: t.end, kind: 'clip-end' };
                    }
                }
            }
        }

        return best;
    }
    _showSnapIndicator(timeSec, kind = null, holding = false) {
        const indicator = document.getElementById('snap-indicator');
        if (!indicator) return;
        const labelWidth = window.innerWidth <= 768 ? 120 : 180;
        indicator.style.left = `${labelWidth + timeSec * this.zoom}px`;
        indicator.classList.add('show');
        indicator.classList.toggle('holding', holding);
        if (kind) indicator.dataset.kind = kind;
        else delete indicator.dataset.kind;
    }
    _hideSnapIndicator() {
        const indicator = document.getElementById('snap-indicator');
        if (indicator) indicator.classList.remove('show');
    }

    lockScroll() {
        const scroller = document.getElementById('tracks-scroll-area');
        if (!scroller) return;
        if (scroller.dataset.prevTouchAction === undefined) {
            scroller.dataset.prevTouchAction = scroller.style.touchAction || '';
        }
        scroller.style.touchAction = 'none';
    }
    unlockScroll() {
        const scroller = document.getElementById('tracks-scroll-area');
        if (!scroller) return;
        if (scroller.dataset.prevTouchAction !== undefined) {
            scroller.style.touchAction = scroller.dataset.prevTouchAction;
            delete scroller.dataset.prevTouchAction;
        }
    }

    startDrag(e, clip, track) {
        e.preventDefault();
        e.stopPropagation();
        this.hideContextMenu();
        this.dragState = {
            isDragging: true, isResizing: false,
            clip, track,
            startX: (e.clientX ?? e.touches?.[0]?.clientX ?? 0),
            startLeft: clip.startTime * this.zoom,
            startTime: clip.startTime,
            startWidth: 0, startDuration: 0,
            rafId: null, pendingEvent: null,
            snapTargets: this._computeSnapTargets(clip.id),
            snapHoldTime: null,
            snapHoldStart: 0,
        };
        this._pendingDrag = {
            trackId: track.id,
            clipId: clip.id,
            fromTime: clip.startTime,
        };
        const clipEl = document.querySelector(`.timeline-clip[data-clip-id="${clip.id}"]`);
        if (clipEl) clipEl.classList.add('dragging');
        this.lockScroll();
        document.addEventListener('mousemove', this.onDragMove);
        document.addEventListener('touchmove', this.onDragMove, { passive: false });
        document.addEventListener('mouseup', this.onDragEnd);
        document.addEventListener('touchend', this.onDragEnd);
        document.addEventListener('touchcancel', this.onDragEnd);
    }

    startResize(e, clip, track) {
        e.preventDefault();
        e.stopPropagation();
        this.hideContextMenu();
        this.dragState = {
            isDragging: false, isResizing: true,
            clip, track,
            startX: (e.clientX ?? e.touches?.[0]?.clientX ?? 0),
            startLeft: 0, startTime: 0,
            startWidth: clip.duration * this.zoom,
            startDuration: clip.duration,
            rafId: null, pendingEvent: null,
            snapTargets: this._computeSnapTargets(clip.id),
            snapHoldTime: null,
            snapHoldStart: 0,
        };
        this._pendingResize = {
            trackId: track.id,
            clipId: clip.id,
            fromDuration: clip.duration,
            startEnvelope: (clip.envelope || []).map(p => ({ time: p.time, value: p.value })),
        };
        const clipEl = document.querySelector(`.timeline-clip[data-clip-id="${clip.id}"]`);
        if (clipEl) clipEl.classList.add('dragging');
        this.lockScroll();
        document.addEventListener('mousemove', this.onResizeMove);
        document.addEventListener('touchmove', this.onResizeMove, { passive: false });
        document.addEventListener('mouseup', this.onDragEnd);
        document.addEventListener('touchend', this.onDragEnd);
        document.addEventListener('touchcancel', this.onDragEnd);
    }

    onDragMove(e) {
        if (!this.dragState.isDragging || !this.dragState.clip) return;
        e.preventDefault();
        this.dragState.pendingEvent = e;
        if (this.dragState.rafId) return;

        this.dragState.rafId = requestAnimationFrame(() => {
            const ev = this.dragState.pendingEvent;
            this.dragState.rafId = null;
            if (!ev) return;

            try {
                const clientX = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
                const deltaX = clientX - this.dragState.startX;
                const rawTime = Math.max(0, this.dragState.startTime + (deltaX / this.zoom));
                const dur = this.dragState.clip.duration;

                const SNAP_RADIUS_PX = 4;
                const SNAP_HOLD_MS = 180;
                const snapRadiusSec = SNAP_RADIUS_PX / this.zoom;
                const now = performance.now();

                let finalTime = rawTime;
                let snapTarget = null;
                let snappedEdge = null;

                if (this.snapEnabled) {
                    const hold = this.dragState.snapHoldTime;

                    if (hold != null) {
                        const holdStart = this.dragState.snapHoldStart || 0;
                        const holdElapsed = now - holdStart;
                        const holdEdge = this.dragState.snapEdge || 'start';

                        const rawEdgeTime = holdEdge === 'start' ? rawTime : rawTime + dur;
                        const distFromHold = Math.abs(rawEdgeTime - hold.time);
                        const releaseThresholdSec = (SNAP_RADIUS_PX * 3) / this.zoom;

                        if (holdElapsed > SNAP_HOLD_MS && distFromHold > releaseThresholdSec) {
                            this.dragState.snapHoldTime = null;
                            this.dragState.snapEdge = null;
                        } else {
                            finalTime = holdEdge === 'start'
                                ? Math.max(0, hold.time)
                                : Math.max(0, hold.time - dur);
                            snapTarget = hold;
                            snappedEdge = holdEdge;
                        }
                    }

                    if (!this.dragState.snapHoldTime) {
                        const startSnap = this._findNearestSnap(rawTime, this.dragState.snapTargets, snapRadiusSec);
                        const endSnap = this._findNearestSnap(rawTime + dur, this.dragState.snapTargets, snapRadiusSec);

                        const dStart = startSnap ? Math.abs(startSnap.time - rawTime) : Infinity;
                        const dEnd = endSnap ? Math.abs(endSnap.time - (rawTime + dur)) : Infinity;

                        const EPS = 0.001;
                        if (startSnap && dStart <= dEnd + EPS) {
                            finalTime = Math.max(0, startSnap.time);
                            snapTarget = startSnap;
                            snappedEdge = 'start';
                        } else if (endSnap) {
                            finalTime = Math.max(0, endSnap.time - dur);
                            snapTarget = endSnap;
                            snappedEdge = 'end';
                        }

                        if (snapTarget) {
                            this.dragState.snapHoldTime = snapTarget;
                            this.dragState.snapHoldStart = now;
                            this.dragState.snapEdge = snappedEdge;
                        }
                    }
                } else {
                    this.dragState.snapHoldTime = null;
                    this.dragState.snapEdge = null;
                }

                this.dragState.clip.startTime = finalTime;
                if (snapTarget) this._showSnapIndicator(snapTarget.time, snapTarget.kind, true);
                else this._hideSnapIndicator();

                const clipEl = document.querySelector(`.timeline-clip[data-clip-id="${this.dragState.clip.id}"]`);
                if (clipEl) clipEl.style.left = `${finalTime * this.zoom}px`;
            } catch (err) {
                console.error('onDragMove RAF failed:', err);
            }
        });
    }

    onResizeMove(e) {
        if (!this.dragState.isResizing || !this.dragState.clip) return;
        e.preventDefault();
        this.dragState.pendingEvent = e;
        if (this.dragState.rafId) return;

        this.dragState.rafId = requestAnimationFrame(() => {
            const ev = this.dragState.pendingEvent;
            this.dragState.rafId = null;
            if (!ev) return;

            try {
                const clientX = ev.clientX ?? ev.touches?.[0]?.clientX ?? 0;
                const deltaX = clientX - this.dragState.startX;
                const rawDuration = Math.max(0.1, this.dragState.startDuration + (deltaX / this.zoom));
                const clip = this.dragState.clip;
                const rawEndTime = clip.startTime + rawDuration;

                const SNAP_RADIUS_PX = 4;
                const SNAP_HOLD_MS = 180;
                const snapRadiusSec = SNAP_RADIUS_PX / this.zoom;
                const now = performance.now();

                let finalDuration = rawDuration;
                let snapTarget = null;

                if (this.snapEnabled) {
                    const hold = this.dragState.snapHoldTime;

                    if (hold != null) {
                        const holdStart = this.dragState.snapHoldStart || 0;
                        const holdElapsed = now - holdStart;
                        const distFromHold = Math.abs(rawEndTime - hold.time);
                        const releaseThresholdSec = (SNAP_RADIUS_PX * 3) / this.zoom;

                        if (holdElapsed > SNAP_HOLD_MS && distFromHold > releaseThresholdSec) {
                            this.dragState.snapHoldTime = null;
                        } else {
                            finalDuration = Math.max(0.1, hold.time - clip.startTime);
                            snapTarget = hold;
                        }
                    }

                    if (!this.dragState.snapHoldTime) {
                        const endSnap = this._findNearestSnap(rawEndTime, this.dragState.snapTargets, snapRadiusSec);
                        if (endSnap && endSnap.time > clip.startTime + 0.05) {
                            finalDuration = Math.max(0.1, endSnap.time - clip.startTime);
                            snapTarget = endSnap;
                            this.dragState.snapHoldTime = endSnap;
                            this.dragState.snapHoldStart = now;
                            this.dragState.snapEdge = 'end';
                        }
                    }
                } else {
                    this.dragState.snapHoldTime = null;
                }

                clip.duration = Math.max(0.1, finalDuration);

                const bufDur = clip.buffer?.duration || 0;

                if (snapTarget) this._showSnapIndicator(snapTarget.time, snapTarget.kind, true);
                else this._hideSnapIndicator();

                const clipEl = document.querySelector(`.timeline-clip[data-clip-id="${clip.id}"]`);
                if (!clipEl) return;
                clipEl.style.width = `${clip.duration * this.zoom}px`;

                const canvas = clipEl.querySelector('.clip-waveform');
                if (canvas) {
                    if (clip.type === 'pattern') {
                        this._renderClipPreview(canvas, clip);
                    } else {
                        this.drawWaveform(canvas, clip);
                    }
                }

                const envCanvas = clipEl.querySelector('.clip-envelope-canvas');
                if (envCanvas) this.drawEnvelope(envCanvas, clip);

                this.refreshRepeatSegments(clipEl, clip);
            } catch (err) {
                console.error('onResizeMove RAF failed:', err);
            }
        });
    }

    onDragEnd() {
        if (this.dragState.rafId) {
            cancelAnimationFrame(this.dragState.rafId);
            this.dragState.rafId = null;
        }
        if (this.dragState.clip) {
            const clipEl = document.querySelector(`.timeline-clip[data-clip-id="${this.dragState.clip.id}"]`);
            if (clipEl) clipEl.classList.remove('dragging');
        }
        this._hideSnapIndicator();
        this.unlockScroll();

        this.dragState = {
            isDragging: false, isResizing: false,
            clip: null, track: null,
            startX: 0, startLeft: 0, startTime: 0,
            startWidth: 0, startDuration: 0,
            rafId: null, pendingEvent: null,
            snapTargets: null,
            snapHoldTime: null,
            snapHoldStart: 0,
        };

        document.removeEventListener('mousemove', this.onDragMove);
        document.removeEventListener('touchmove', this.onDragMove);
        document.removeEventListener('mouseup', this.onDragEnd);
        document.removeEventListener('touchend', this.onDragEnd);
        document.removeEventListener('touchcancel', this.onDragEnd);
        document.removeEventListener('mousemove', this.onResizeMove);
        document.removeEventListener('touchmove', this.onResizeMove);

        if (this._pendingDrag) {
            const pending = this._pendingDrag;
            const track = this.getTrack(pending.trackId);
            const clip = track?.clips.find(c => c.id === pending.clipId);
            const toTime = clip ? clip.startTime : pending.fromTime;
            if (clip && Math.abs(toTime - pending.fromTime) > 0.0001) {
                const fromTime = pending.fromTime;
                this.app.history.push({
                    label: 'Move Clip',
                    do: () => {
                        const t = this.getTrack(pending.trackId);
                        const c = t?.clips.find(x => x.id === pending.clipId);
                        if (c) { c.startTime = toTime; this.renderTracks(); }
                    },
                    undo: () => {
                        const t = this.getTrack(pending.trackId);
                        const c = t?.clips.find(x => x.id === pending.clipId);
                        if (c) { c.startTime = fromTime; this.renderTracks(); }
                    },
                });
            }
            this._pendingDrag = null;
        }

        if (this._pendingResize) {
            const pending = this._pendingResize;
            const track = this.getTrack(pending.trackId);
            const clip = track?.clips.find(c => c.id === pending.clipId);

            if (clip && Math.abs(clip.duration - pending.fromDuration) > 0.0001) {
                const fromDuration = pending.fromDuration;
                const toDuration = clip.duration;

                this.app.history.push({
                    label: 'Resize Clip',
                    do: () => {
                        const t = this.getTrack(pending.trackId);
                        const c = t?.clips.find(x => x.id === pending.clipId);
                        if (!c) return;
                        c.duration = toDuration;
                        this.renderTracks();
                    },
                    undo: () => {
                        const t = this.getTrack(pending.trackId);
                        const c = t?.clips.find(x => x.id === pending.clipId);
                        if (!c) return;
                        c.duration = fromDuration;
                        this.renderTracks();
                    },
                });
            }
            this._pendingResize = null;
        }

        requestAnimationFrame(() => this.renderTracks());
    }

    _scheduleFrozenClip(clip, track, startOffset, now) {
        if (!this.audioContext) return;
        if (!clip._frozen || !clip._frozen.buffer) return;

        const buffer = clip._frozen.buffer;
        const trackNodes = this._getTrackNodes(track.id);
        const destNode = trackNodes ? trackNodes.gain : this.app.audioEngine.panner;

        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        if (clipEnd <= startOffset) return;

        const playFrom = Math.max(0, startOffset - clipStart);
        const remaining = clip.duration - playFrom;
        if (remaining <= 0) return;

        const bufDur = buffer.duration;
        const shouldLoop = clip.loop && clip.duration > bufDur + 0.001;

        const source = this.audioContext.createBufferSource();
        source.buffer = buffer;

        const gain = this.audioContext.createGain();
        const baseGain = clip.volume ?? 1;

        const panner = this.audioContext.createStereoPanner();
        panner.pan.value = clip.pan ?? 0;

        source.connect(gain);
        gain.connect(panner);
        panner.connect(destNode);

        const startAt = now + Math.max(0, clipStart - startOffset);

        let offset = playFrom;
        if (bufDur > 0) {
            if (shouldLoop) offset = offset % bufDur;
            else offset = Math.max(0, Math.min(bufDur - 0.001, offset));
        }

        const playDuration = shouldLoop ? remaining : Math.min(remaining, bufDur - offset);
        if (playDuration <= 0.001) return;

        if (shouldLoop) {
            source.loop = true;
            source.loopStart = clip.loopStart ?? 0;
            source.loopEnd = clip.loopEnd ?? bufDur;
            source.start(startAt, offset);
            try { source.stop(startAt + remaining); } catch (_) {}
        } else {
            source.start(startAt, offset, playDuration);
        }

        if (typeof Scheduler !== 'undefined' && Scheduler.applyClipEnvelope) {
            Scheduler.applyClipEnvelope(gain, baseGain, clip, startAt, playFrom, playDuration);
        } else {
            gain.gain.setValueAtTime(baseGain, startAt);
        }

        const estStop = startAt + remaining + 0.2;
        this.activeSources.push({ source, stopAt: estStop, clip, track });
    }

    _notifyPatternEdited(patternName, projectBpm, kind = null) {
        if (!patternName) return;
        if (!window.ClipFreezer) return;

        const key = patternName + ':' + (kind || '*');
        this._patternEditTimers = this._patternEditTimers || {};
        if (this._patternEditTimers[key]) {
            clearTimeout(this._patternEditTimers[key]);
        }
        this._patternEditTimers[key] = setTimeout(() => {
            delete this._patternEditTimers[key];
            try {
                window.ClipFreezer.invalidateByPatternName(patternName, projectBpm, kind);
            } catch (err) {
                console.warn('Freezer invalidation failed on edit:', err);
            }
        }, 800);
    }

    async play() {
        if (this.isPlaying) return;
        if (!this.audioContext) this.audioContext = this.app.audioEngine.ctx;
        if (!this.audioContext) return;
        this.isPlaying = true;
        this.playStartPosition = this.playheadPosition;
        this.playheadActive = true;
        this.updatePlayhead(true);
        document.getElementById('tracks-play-btn').style.display = 'none';
        document.getElementById('tracks-pause-btn').style.display = 'flex';
        const now = this.audioContext.currentTime;
        const startOffset = this.playheadPosition;
        const soloActive = this.tracks.some(t => t.solo);
        this.tracks.forEach(track => {
            const trackNodes = this._getTrackNodes(track.id);
            if (trackNodes) {
                this._refreshTrackGain(track.id);
                this._refreshTrackPan(track.id);
            }
            track.clips.forEach(clip => {
                if (clip.muted) return;
                const clipEnd = clip.startTime + clip.duration;
                if (clipEnd <= startOffset) return;

                try {
                    if (clip.type === 'pattern') {
                        if (clip.mode === 'wav' && clip._frozen && clip._frozen.buffer) {
                            this._scheduleFrozenClip(clip, track, startOffset, now);
                            return;
                        }
                        this._schedulePatternClip(clip, track, startOffset, now, soloActive);
                        return;
                    }
                const playFrom = Math.max(0, startOffset - clip.startTime);
                const remaining = clip.duration - playFrom;
                if (remaining <= 0) return;
                const source = this.audioContext.createBufferSource();
                source.buffer = clip.buffer;
                source.playbackRate.value = clip.speed || 1;

                const baseGain = clip.volume || 1;
                const gain = this.audioContext.createGain();

                const clipPanner = this.audioContext.createStereoPanner();
                clipPanner.pan.value = (clip.pan || 0);

                source.connect(gain);
                gain.connect(clipPanner);

                if (trackNodes) {
                    clipPanner.connect(trackNodes.gain);
                } else {
                    clipPanner.connect(this.app.audioEngine.panner);
                }

                const bufDur = clip.buffer.duration;
                const loopOn = clip.loop && bufDur > 0 && clip.duration > bufDur * 1.001;
                const startAt = now + Math.max(0, clip.startTime - startOffset);

                let offsetInBuffer = clip.offset + playFrom;
                if (bufDur > 0) {
                    if (loopOn) offsetInBuffer = ((offsetInBuffer % bufDur) + bufDur) % bufDur;
                    else offsetInBuffer = Math.max(0, Math.min(bufDur - 0.001, offsetInBuffer));
                }

                const availableFromBuffer = bufDur > 0 ? Math.max(0, bufDur - offsetInBuffer) : 0;

                const playDuration = loopOn ? remaining : Math.min(remaining, availableFromBuffer);
                if (playDuration <= 0.001) return;

                if (loopOn) {
                    source.loop = true;
                    source.loopStart = clip.loopStart ?? 0;
                    source.loopEnd = clip.loopEnd ?? bufDur;
                    source.start(startAt, offsetInBuffer);
                    try { source.stop(startAt + remaining); } catch (_) {}
                } else {
                    source.start(startAt, offsetInBuffer, playDuration);
                }

                this._scheduleClipEnvelope(gain, baseGain, clip, startAt, playFrom, playDuration);
                const estStop = startAt + (playDuration || remaining) + 0.2;
                this.activeSources.push({ source, stopAt: estStop });
                } catch (err) {
                    console.warn('Failed to schedule clip', clip.id, err);
                }
            });
        });
        this.animatePlayhead();
    }

    _schedulePatternClip(clip, track, startOffset, now, soloActive) {
        const pattern = clip.pattern;
        if (!pattern) return;

        if (pattern.kind === 'synth') {
            this._scheduleSynthPatternClip(clip, track, startOffset, now);
            return;
        }

        const bpm = this.app.project?.bpm || 120;
        const trackNodes = this._getTrackNodes(track.id);
        const destNode = trackNodes ? trackNodes.gain : this.app.audioEngine.panner;

        const padFxChains = [];
        if (pattern.grid) {
            for (let padIndex = 0; padIndex < pattern.grid.length; padIndex++) {
                const fxChain = this._getPatternClipFxChain(clip, null, padIndex);
                if (fxChain && fxChain.output) {
                    try { fxChain.output.disconnect(); } catch (_) {}
                }
                padFxChains[padIndex] = fxChain;
            }
        }

        Scheduler.schedulePatternClip(
            this.audioContext, clip, track, destNode,
            {
                startOffset,
                now,
                bpm,
                activeSources: this.activeSources,
                padFxChains,
                soloActive,
            }
        );
    } 

    _scheduleSynthPatternClip(clip, track, startOffset, now) {
        const bpm = this.app.project?.bpm || 120;
        const trackNodes = this._getTrackNodes(track.id);
        const destNode = trackNodes ? trackNodes.gain : this.app.audioEngine.panner;

        const fxChain = this._getSynthClipFxChain(clip);
        if (fxChain && fxChain.output) {
            try { fxChain.output.disconnect(); } catch (_) {}
        }

        Scheduler.scheduleSynthPatternClip(
            this.audioContext, clip, track, destNode,
            {
                startOffset,
                now,
                bpm,
                activeSources: this.activeSources,
                fxChain,
            }
        );
    }

    _getSynthClipFxChain(clip) {
        const voice = clip.synthVoice;
        if (!voice) return null;

        const effects = voice.effects || {};
        const effectStates = voice.effectStates || {};

        const activeFxList = Object.keys(effects).filter(k => k !== 'adsr' && !!effects[k]);
        if (activeFxList.length === 0) return null;

        const fxKey = JSON.stringify({ e: effects, s: effectStates });

        if (!clip._synthFxChain || clip._synthFxChain.key !== fxKey) {
            if (clip._synthFxChain?.proc) {
                try { clip._synthFxChain.proc.reset(); } catch (_) {}
            }

            const proc = new EffectProcessor(this.audioContext);
            const order = [
                'echo', 'reverb', 'distortion', 'compressor',
                'equalizer', 'chorus', 'bitcrusher', 'phaser'
            ];

            order.forEach(fx => {
                if (!effects[fx]) return;
                const params = effectStates[fx] || {};
                switch (fx) {
                    case 'echo':        proc.createEcho(params); break;
                    case 'reverb':      proc.createReverb(params); break;
                    case 'distortion':  proc.createDistortion(params); break;
                    case 'compressor':  proc.createCompressor(params); break;
                    case 'equalizer':   proc.createEqualizer(params); break;
                    case 'chorus':      proc.createChorus(params); break;
                    case 'bitcrusher':  proc.createBitcrusher(params); break;
                    case 'phaser':      proc.createPhaser(params); break;
                }
            });

            clip._synthFxChain = { proc, key: fxKey };
        }

        const proc = clip._synthFxChain.proc;
        try { proc.masterOutput.disconnect(); } catch (_) {}
        return { input: proc.masterInput, output: proc.masterOutput };
    }

    _getPatternClipFxChain(clip, pad, padIndex) {
        if (!clip.padSnapshots) return null;

        const snap = clip.padSnapshots[padIndex];
        if (!snap) return null;

        const effects = snap.effects || {};
        const effectStates = snap.effectStates || {};

        const anyFx = Object.keys(effects)
            .filter(k => k !== 'adsr')
            .some(k => effects[k]);
        if (!anyFx) return null;

        clip._fxChains = clip._fxChains || {};

        const fxKey = JSON.stringify({ e: effects, s: effectStates });
        const cached = clip._fxChains[padIndex];

        if (!cached || cached.key !== fxKey) {
            if (cached?.proc) {
                try { cached.proc.reset(); } catch (_) {}
            }

            const proc = new EffectProcessor(this.audioContext);
            const order = [
                'echo', 'reverb', 'distortion', 'compressor',
                'equalizer', 'chorus', 'bitcrusher', 'phaser',
            ];
            order.forEach(fx => {
                if (!effects[fx]) return;
                const params = effectStates[fx] || {};
                switch (fx) {
                    case 'echo':       proc.createEcho(params); break;
                    case 'reverb':     proc.createReverb(params); break;
                    case 'distortion': proc.createDistortion(params); break;
                    case 'compressor': proc.createCompressor(params); break;
                    case 'equalizer':  proc.createEqualizer(params); break;
                    case 'chorus':     proc.createChorus(params); break;
                    case 'bitcrusher': proc.createBitcrusher(params); break;
                    case 'phaser':     proc.createPhaser(params); break;
                }
            });

            clip._fxChains[padIndex] = { proc, key: fxKey };
        }

        const proc = clip._fxChains[padIndex].proc;
        try { proc.masterOutput.disconnect(); } catch (_) {}
        return { input: proc.masterInput, output: proc.masterOutput };
    }

    _scheduleClipEnvelope(gain, baseGain, clip, startAt, playFrom, playDuration) {
        if (typeof Scheduler !== 'undefined' && Scheduler.applyClipEnvelope) {
            Scheduler.applyClipEnvelope(gain, baseGain, clip, startAt, playFrom, playDuration);
        } else {
            gain.gain.setValueAtTime(baseGain, startAt);
        }
    }

    pause() {
        this.isPlaying = false;
        cancelAnimationFrame(this.animationFrame);
        this.activeSources.forEach(({ source }) => { try { source.stop(); } catch (e) {} });
        this.activeSources = [];
        const playBtn = document.getElementById('tracks-play-btn');
        const pauseBtn = document.getElementById('tracks-pause-btn');
        if (playBtn) playBtn.style.display = 'flex';
        if (pauseBtn) pauseBtn.style.display = 'none';
        this.playheadActive = true;
        this.updatePlayhead(true);
        this.tracks.forEach(track => {
            track.clips.forEach(clip => {
                if (clip._activeEnvelopeGain) {
                    try { clip._activeEnvelopeGain.disconnect(); } catch (_) {}
                    clip._activeEnvelopeGain = null;
                }
                if (clip._synthFxChain) {
                    try { clip._synthFxChain.proc.reset(); } catch (_) {}
                    try { clip._synthFxChain.proc.masterInput.disconnect(); } catch (_) {}
                    try { clip._synthFxChain.proc.masterOutput.disconnect(); } catch (_) {}
                    clip._synthFxChain = null;
                }
            });
        });
    }

    stop() {
        this.isPlaying = false;
        cancelAnimationFrame(this.animationFrame);
        this.animationFrame = null;
        this.activeSources.forEach(({ source }) => { try { source.stop(); } catch (e) {} });
        this.activeSources = [];

        this.playheadPosition = 0;
        this.playStartPosition = 0;
        this.playheadActive = true;

        const playBtn = document.getElementById('tracks-play-btn');
        const pauseBtn = document.getElementById('tracks-pause-btn');
        if (playBtn) playBtn.style.display = 'flex';
        if (pauseBtn) pauseBtn.style.display = 'none';

        const timeEl = document.getElementById('tracks-time-value');
        if (timeEl) timeEl.innerText = this.formatTime(0);

        const scrollArea = document.getElementById('tracks-scroll-area');
        if (scrollArea) scrollArea.scrollLeft = 0;

        this.updatePlayhead(true);
        requestAnimationFrame(() => this.updatePlayhead(true));
        this.tracks.forEach(track => {
            track.clips.forEach(clip => {
                if (clip._activeEnvelopeGain) {
                    try { clip._activeEnvelopeGain.disconnect(); } catch (_) {}
                    clip._activeEnvelopeGain = null;
                }
                if (clip._synthFxChain) {
                    try { clip._synthFxChain.proc.reset(); } catch (_) {}
                    try { clip._synthFxChain.proc.masterInput.disconnect(); } catch (_) {}
                    try { clip._synthFxChain.proc.masterOutput.disconnect(); } catch (_) {}
                    clip._synthFxChain = null;
                }
            });
        });
    }

    animatePlayhead() {
        if (!this.isPlaying) return;

        const computeMaxTime = () => {
            let max = 0;
            for (const t of this.tracks) {
                for (const c of t.clips) {
                    const end = c.startTime + c.duration;
                    if (end > max) max = end;
                }
            }
            return max;
        };
        const maxTime = computeMaxTime();

        const timeEl = document.getElementById('tracks-time-value');
        let lastTimeText = '';
        let lastPlayheadLeft = -1;
        let lastSecondRendered = -1;

        let lastTime = performance.now();
        const animate = (now) => {
            if (!this.isPlaying) return;
            const dt = (now - lastTime) / 1000;
            lastTime = now;
            this.playheadPosition += dt;

            this.updatePlayhead();

            const wholeSecond = Math.floor(this.playheadPosition);
            if (timeEl && wholeSecond !== lastSecondRendered) {
                lastSecondRendered = wholeSecond;
                const txt = this.formatTime(this.playheadPosition);
                if (txt !== lastTimeText) {
                    lastTimeText = txt;
                    timeEl.innerText = txt;
                }
            }

            if (maxTime > 0 && this.playheadPosition >= maxTime) {
                this.stop();
                return;
            }
            this.animationFrame = requestAnimationFrame(animate);
        };
        this.animationFrame = requestAnimationFrame(animate);
    }

    updatePlayhead(forceShow = false) {
        const playhead = document.getElementById('playhead');
        if (!playhead) return;

        const scrollArea = document.getElementById('tracks-scroll-area');
        const labelWidth = this._getLabelWidth();
        const scrollLeft = scrollArea ? scrollArea.scrollLeft : 0;
        const playheadContainerX = labelWidth + this.playheadPosition * this.zoom;
        const playheadViewportX = playheadContainerX - scrollLeft;

        playhead.style.transform = `translate3d(${playheadViewportX}px, 0, 0)`;
        
        if (!playhead._positioned) {
            playhead._positioned = true;
            playhead.style.left = '0';
        }

        const shouldShow = this.playheadActive || this.isPlaying || forceShow;
        playhead.classList.toggle('show', shouldShow);

        if (this.isPlaying && this.autoScrollEnabled && scrollArea) {
            const viewportW = this._getViewportWidth();
            const halfViewport = viewportW / 2;
            if (playheadViewportX > halfViewport) {
                const target = playheadContainerX - halfViewport;
                if (Math.abs(scrollArea.scrollLeft - target) > 1) {
                    scrollArea.scrollLeft = target;
                }
            }
        }
    }

    _envelopeToCanvas(pt, clip, cssW, cssH) {
        const pad = 10;
        const h = cssH - pad * 2;
        return {
            x: (pt.time / clip.duration) * cssW,
            y: pad + (1 - pt.value) * h,
        };
    }
    _canvasToEnvelope(x, y, clip, cssW, cssH) {
        const pad = 10;
        const h = cssH - pad * 2;
        const time = Math.max(0, Math.min(clip.duration, (x / cssW) * clip.duration));
        const value = Math.max(0, Math.min(1, 1 - (y - pad) / h));
        return { time, value };
    }

    _drawEnvelopeEditorCanvas() {
        const canvas = document.getElementById('envelope-canvas');
        if (!canvas) return;
        const resolved = this._resolveTargetClip();
        if (!resolved) return;
        const { clip } = resolved;
        const rect = canvas.getBoundingClientRect();
        let cssW = Math.round(rect.width);
        let cssH = Math.round(rect.height);
        if (cssW < 20) cssW = canvas.clientWidth || 300;
        if (cssH < 20) cssH = canvas.clientHeight || 120;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
        const ctx = canvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.fillRect(0, 0, cssW, cssH);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
            const y = (i / 4) * cssH;
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cssW, y); ctx.stroke();
        }
        for (let i = 1; i < 4; i++) {
            const x = (i / 4) * cssW;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, cssH); ctx.stroke();
        }
        const env = clip.envelope || [];
        if (env.length >= 2) {
            const sorted = [...env].sort((a, b) => a.time - b.time);
            ctx.beginPath();
            sorted.forEach((pt, i) => {
                const pos = this._envelopeToCanvas(pt, clip, cssW, cssH);
                if (i === 0) ctx.moveTo(pos.x, pos.y);
                else ctx.lineTo(pos.x, pos.y);
            });
            const lastPos = this._envelopeToCanvas(sorted[sorted.length - 1], clip, cssW, cssH);
            ctx.lineTo(lastPos.x, cssH);
            ctx.lineTo(0, cssH);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0, 230, 118, 0.15)';
            ctx.fill();

            ctx.beginPath();
            sorted.forEach((pt, i) => {
                const pos = this._envelopeToCanvas(pt, clip, cssW, cssH);
                if (i === 0) ctx.moveTo(pos.x, pos.y);
                else ctx.lineTo(pos.x, pos.y);
            });
            ctx.strokeStyle = 'rgba(0, 230, 118, 0.9)';
            ctx.lineWidth = 2;
            ctx.stroke();

            let activeDraggedPt = null;
            if (this.envelopeDrag.active && this.envelopeDrag.clip === clip) {
                const dragged = clip.envelope[this.envelopeDrag.index];
                if (dragged) activeDraggedPt = dragged;
            }
            sorted.forEach(pt => {
                const pos = this._envelopeToCanvas(pt, clip, cssW, cssH);
                const isActive = pt === activeDraggedPt;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, isActive ? 9 : 6, 0, Math.PI * 2);
                ctx.fillStyle = isActive ? '#00e676' : '#fff';
                ctx.fill();
                ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            });
        }
    }

    _setupEnvelopeCanvas() {
        const canvas = document.getElementById('envelope-canvas');
        if (!canvas || canvas.dataset.wired === '1') return;
        canvas.dataset.wired = '1';

        const getPoint = (e) => {
            if (e.touches && e.touches.length) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            if (e.changedTouches && e.changedTouches.length) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            return { x: e.clientX, y: e.clientY };
        };

        const onStart = (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            const resolved = this._resolveTargetClip();
            if (!resolved) return;
            const { clip } = resolved;
            const rect = canvas.getBoundingClientRect();
            const t = getPoint(e);
            const x = t.x - rect.left;
            const y = t.y - rect.top;

            const env = clip.envelope || [];
            let nearestIdx = -1;
            let nearestDist = 30;
            env.forEach((pt, i) => {
                const pos = this._envelopeToCanvas(pt, clip, rect.width, rect.height);
                const d = Math.hypot(x - pos.x, y - pos.y);
                if (d < nearestDist) { nearestDist = d; nearestIdx = i; }
            });

            if (nearestIdx === -1) {
                if (env.length < 2) {
                    clip.envelope = [
                        { time: 0, value: 1 },
                        { time: clip.duration, value: 1 },
                    ];
                }
                const pt = this._canvasToEnvelope(x, y, clip, rect.width, rect.height);
                clip.envelope.push(pt);
                nearestIdx = clip.envelope.length - 1;
            }
            this.envelopeDrag = { active: true, index: nearestIdx, clip };
            const ownerTrack = this.tracks.find(t =>
                t.clips.some(c => c.id === clip.id)
            );
            this._pendingEnvelopeModalEdit = ownerTrack
                ? {
                    trackId: ownerTrack.id,
                    clipId: clip.id,
                    before: clip.envelope.map(p => ({ ...p })),
                }
                : null;

            const pt = clip.envelope[nearestIdx];
            const newPt = this._canvasToEnvelope(x, y, clip, rect.width, rect.height);
            pt.time = newPt.time;
            pt.value = newPt.value;
            this._drawEnvelopeEditorCanvas();
            this._syncClipEnvelopeCanvas(clip);

            const onMove = (ev) => {
                if (!this.envelopeDrag.active) return;
                ev.preventDefault();
                ev.stopPropagation();
                const touch = getPoint(ev);
                const r = canvas.getBoundingClientRect();
                const px = touch.x - r.left;
                const py = touch.y - r.top;
                const newPoint = this._canvasToEnvelope(px, py, clip, r.width, r.height);
                const draggedPt = clip.envelope[this.envelopeDrag.index];
                if (!draggedPt) return;
                draggedPt.time = newPoint.time;
                draggedPt.value = newPoint.value;
                this._drawEnvelopeEditorCanvas();
                this._syncClipEnvelopeCanvas(clip);
            };
            const onEnd = () => {
                if (!this.envelopeDrag.active) return;
                if (clip.envelope) clip.envelope.sort((a, b) => a.time - b.time);
                this.envelopeDrag = { active: false, index: -1, clip: null };
                window.removeEventListener('pointermove', onMove);
                window.removeEventListener('pointerup', onEnd);
                window.removeEventListener('pointercancel', onEnd);
                window.removeEventListener('touchmove', onMove);
                window.removeEventListener('touchend', onEnd);
                window.removeEventListener('touchcancel', onEnd);
                window.removeEventListener('mousemove', onMove);
                window.removeEventListener('mouseup', onEnd);
                this._drawEnvelopeEditorCanvas();
                this._renderEnvelopeEditor();
                this.renderTracks();

                const pending = this._pendingEnvelopeModalEdit;
                this._pendingEnvelopeModalEdit = null;
                if (!pending) return;

                const track = this.getTrack(pending.trackId);
                const targetClip = track?.clips.find(c => c.id === pending.clipId);
                if (!targetClip) return;

                const after = targetClip.envelope.map(p => ({ ...p }));
                const before = pending.before;

                const same = after.length === before.length &&
                    after.every((p, i) =>
                        Math.abs(p.time - before[i].time) < 1e-6 &&
                        Math.abs(p.value - before[i].value) < 1e-6
                    );
                if (same) return;

                const self = this;
                this.app.history.push({
                    label: 'Edit Envelope',
                    do: () => {
                        const t = self.getTrack(pending.trackId);
                        const c = t?.clips.find(x => x.id === pending.clipId);
                        if (c) {
                            c.envelope = after.map(p => ({ ...p }));
                            self.renderTracks();
                            self._renderEnvelopeEditor();
                            self._drawEnvelopeEditorCanvas();
                        }
                    },
                    undo: () => {
                        const t = self.getTrack(pending.trackId);
                        const c = t?.clips.find(x => x.id === pending.clipId);
                        if (c) {
                            c.envelope = before.map(p => ({ ...p }));
                            self.renderTracks();
                            self._renderEnvelopeEditor();
                            self._drawEnvelopeEditorCanvas();
                        }
                    },
                });
            };
            window.addEventListener('pointermove', onMove, { passive: false });
            window.addEventListener('pointerup', onEnd);
            window.addEventListener('pointercancel', onEnd);
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('touchend', onEnd);
            window.addEventListener('touchcancel', onEnd);
            window.addEventListener('mousemove', onMove, { passive: false });
            window.addEventListener('mouseup', onEnd);
        };

        canvas.addEventListener('pointerdown', onStart, { passive: false });
        canvas.addEventListener('touchstart', onStart, { passive: false });
        canvas.addEventListener('mousedown', onStart);
    }

    _syncClipEnvelopeCanvas(clip) {
        const clipEl = document.querySelector(`.timeline-clip[data-clip-id="${clip.id}"]`);
        if (!clipEl) return;
        const envCanvas = clipEl.querySelector('.clip-envelope-canvas');
        if (envCanvas) this.drawEnvelope(envCanvas, clip);
    }

    addEnvelopePoint() {
        const resolved = this._resolveTargetClip();
        if (!resolved) return;
        const { trackId, clipId, clip } = resolved;

        if (!clip.envelope) {
            clip.envelope = [
                { time: 0, value: 1 },
                { time: clip.duration, value: 1 },
            ];
        }

        let time, value;
        if (this.contextClip && typeof this.contextClip.clickTime === 'number') {
            time = this.contextClip.clickTime;
            value = this.contextClip.clickValue ?? 1;
        } else {
            const last = clip.envelope[clip.envelope.length - 1];
            time = Math.min(clip.duration, last.time + Math.max(0.25, (clip.duration - last.time) / 2));
            value = this.getEnvelopeValueAt(clip.envelope, time);
        }
        if (clip.envelope.some(p => Math.abs(p.time - time) < 0.02)) return;

        const before = clip.envelope.map(p => ({ ...p }));
        const after = [...before, { time, value }].sort((a, b) => a.time - b.time);

        const self = this;
        this.app.history.push({
            label: 'Add Envelope Point',
            do: () => {
                const t = self.getTrack(trackId);
                const c = t?.clips.find(x => x.id === clipId);
                if (!c) return;
                c.envelope = after.map(p => ({ ...p }));
                self.renderTracks();
                self._renderEnvelopeEditor();
                self._drawEnvelopeEditorCanvas();
            },
            undo: () => {
                const t = self.getTrack(trackId);
                const c = t?.clips.find(x => x.id === clipId);
                if (!c) return;
                c.envelope = before.map(p => ({ ...p }));
                self.renderTracks();
                self._renderEnvelopeEditor();
                self._drawEnvelopeEditorCanvas();
            },
        });
    }

    updateEnvelopePoint(index, updates) {
        const resolved = this._resolveTargetClip();
        if (!resolved) return;
        const { trackId, clipId, clip } = resolved;
        if (!clip.envelope || !clip.envelope[index]) return;

        const before = clip.envelope.map(p => ({ ...p }));
        const after = before.map((p, i) => {
            if (i !== index) return { ...p };
            const next = { ...p };
            if (updates.time !== undefined) {
                next.time = Math.max(0, Math.min(clip.duration, parseFloat(updates.time)));
            }
            if (updates.value !== undefined) {
                next.value = Math.max(0, Math.min(1, parseFloat(updates.value)));
            }
            return next;
        });
        after.sort((a, b) => a.time - b.time);

        const self = this;
        this.app.history.push({
            label: 'Edit Envelope Point',
            coalesceKey: `envelope:${clipId}:${index}`,
            do: () => {
                const t = self.getTrack(trackId);
                const c = t?.clips.find(x => x.id === clipId);
                if (!c) return;
                c.envelope = after.map(p => ({ ...p }));
                self.renderTracks();
                self._drawEnvelopeEditorCanvas();
            },
            undo: () => {
                const t = self.getTrack(trackId);
                const c = t?.clips.find(x => x.id === clipId);
                if (!c) return;
                c.envelope = before.map(p => ({ ...p }));
                self.renderTracks();
                self._drawEnvelopeEditorCanvas();
            },
        });
    }

    removeEnvelopePoint(index) {
        const resolved = this._resolveTargetClip();
        if (!resolved) return;
        const { trackId, clipId, clip } = resolved;
        if (!clip.envelope || !clip.envelope[index]) return;
        if (clip.envelope.length <= 2) return;

        const before = clip.envelope.map(p => ({ ...p }));
        const after = before.filter((_, i) => i !== index);

        const self = this;
        this.app.history.push({
            label: 'Remove Envelope Point',
            do: () => {
                const t = self.getTrack(trackId);
                const c = t?.clips.find(x => x.id === clipId);
                if (!c) return;
                c.envelope = after.map(p => ({ ...p }));
                self.renderTracks();
                self._renderEnvelopeEditor();
                self._drawEnvelopeEditorCanvas();
            },
            undo: () => {
                const t = self.getTrack(trackId);
                const c = t?.clips.find(x => x.id === clipId);
                if (!c) return;
                c.envelope = before.map(p => ({ ...p }));
                self.renderTracks();
                self._renderEnvelopeEditor();
                self._drawEnvelopeEditorCanvas();
            },
        });
    }

    openClipManager() {
        if (!this.contextClip) return;
        const { trackId, clipId } = this.contextClip;
        const track = this.getTrack(trackId);
        const clip = track?.clips.find(c => c.id === clipId);
        if (!clip) return;
        const modal = document.getElementById('clip-manager-modal');
        if (!modal) return;
        document.getElementById('clip-manager-title').innerText = clip.name;
        document.getElementById('clip-manager-volume').value = clip.volume || 1;
        document.getElementById('clip-manager-pan').value = clip.pan || 0;
        document.getElementById('clip-manager-speed').value = clip.speed || 1;
        document.getElementById('clip-manager-loop').checked = clip.loop || false;
        this.selectedClip = { trackId, clipId };
        modal.classList.add('show');
        ['volume', 'pan', 'speed', 'loop'].forEach(param => {
            const input = document.getElementById(`clip-manager-${param}`);
            if (input) {
                input.oninput = (e) => {
                    const value = param === 'loop' ? e.target.checked : parseFloat(e.target.value);
                    this.updateClip(trackId, clipId, { [param]: value });
                };
            }
        });
        this._ensureEnvelopeEditor();
        this._ensureClipToolsSection();
        this._renderEnvelopeEditor();
        requestAnimationFrame(() => {
            this._setupEnvelopeCanvas();
            this._drawEnvelopeEditorCanvas();
        });
    }

    closeClipManager() {
        const modal = document.getElementById('clip-manager-modal');
        if (modal) modal.classList.remove('show');
    }

    _ensureClipToolsSection() {
        const modal = document.getElementById('clip-manager-modal');
        if (!modal) return;
        if (modal.querySelector('#clip-tools-section')) return;
        const content = modal.querySelector('.modal-content') || modal;
        const section = document.createElement('div');
        section.id = 'clip-tools-section';
        section.className = 'clip-tools-row';
        section.innerHTML = `
            <button type="button" class="clip-tools-btn" id="clip-tool-copy">
                <i class="fa-solid fa-copy"></i>Copy
            </button>
            <button type="button" class="clip-tools-btn" id="clip-tool-paste">
                <i class="fa-solid fa-paste"></i>Paste
            </button>
            <button type="button" class="clip-tools-btn" id="clip-tool-split">
                <i class="fa-solid fa-scissors"></i>Split
            </button>
            <button type="button" class="clip-tools-btn" id="clip-tool-dup">
                <i class="fa-solid fa-clone"></i>Dup
            </button>
            <button type="button" class="clip-tools-btn" id="clip-tool-del">
                <i class="fa-solid fa-trash"></i>Del
            </button>
        `;
        const actions = content.querySelector('.clip-manager-actions');
        if (actions && actions.parentNode) {
            actions.parentNode.insertBefore(section, actions);
        } else {
            content.appendChild(section);
        }
        section.querySelector('#clip-tool-copy').onclick = () => this.copyClip();
        section.querySelector('#clip-tool-paste').onclick = () => this.pasteClip();
        section.querySelector('#clip-tool-split').onclick = () => this.splitClip();
        section.querySelector('#clip-tool-dup').onclick = () => this.duplicateClip();
        section.querySelector('#clip-tool-del').onclick = () => this.deleteClip();
    }

    _ensureEnvelopeEditor() {
        const modal = document.getElementById('clip-manager-modal');
        if (!modal) return null;
        let el = modal.querySelector('#clip-manager-envelope');
        if (el) return el;
        const content = modal.querySelector('.modal-content') || modal;
        el = document.createElement('div');
        el.id = 'clip-manager-envelope';
        el.className = 'clip-envelope-editor';
        el.innerHTML = `
            <div class="envelope-header">
                <label>Volume Envelope</label>
                <button type="button" class="envelope-add-btn" id="envelope-add-btn">
                    + Add Point
                </button>
            </div>
            <canvas id="envelope-canvas" class="envelope-canvas"></canvas>
            <div class="envelope-points" id="envelope-points"></div>
        `;
        const actions = content.querySelector('.clip-manager-actions');
        if (actions && actions.parentNode) {
            actions.parentNode.insertBefore(el, actions);
        } else {
            content.appendChild(el);
        }
        el.querySelector('#envelope-add-btn').onclick = () => this.addEnvelopePoint();
        return el;
    }

    _renderEnvelopeEditor() {
        const list = document.getElementById('envelope-points');
        if (!list) return;
        const resolved = this._resolveTargetClip();
        if (!resolved) { list.innerHTML = ''; return; }
        const { clip } = resolved;
        const env = clip.envelope || [];
        list.innerHTML = '';
        if (env.length === 0) {
            list.innerHTML = '<div class="envelope-empty">No envelope points.</div>';
            return;
        }
        env.forEach((pt, i) => {
            const row = document.createElement('div');
            row.className = 'envelope-point';
            row.innerHTML = `
                <input type="number" step="0.05" min="0" max="${clip.duration.toFixed(3)}"
                       value="${pt.time.toFixed(2)}" data-role="time" data-index="${i}"
                       inputmode="decimal">
                <input type="number" step="0.05" min="0" max="1"
                       value="${pt.value.toFixed(2)}" data-role="value" data-index="${i}"
                       inputmode="decimal">
                <button class="remove-btn" data-role="remove" data-index="${i}">
                    <i class="fa-solid fa-times"></i>
                </button>
            `;
            list.appendChild(row);
        });
        list.querySelectorAll('input').forEach(input => {
            input.addEventListener('change', (e) => {
                const idx = parseInt(e.target.dataset.index, 10);
                const role = e.target.dataset.role;
                this.updateEnvelopePoint(idx, { [role]: e.target.value });
                this._renderEnvelopeEditor();
            });
        });
        list.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.index, 10);
                this.removeEnvelopePoint(idx);
            });
        });
    }

    selectTrack(trackId) {
        this.selectedTrack = trackId;
        requestAnimationFrame(() => this.renderTracks({ trackId }));
    }
    toggleMute(trackId) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const prev = track.muted;
        const next = !prev;

        this.app.history.push({
            label: prev ? 'Unmute Track' : 'Mute Track',
            do: () => { track.muted = next; this._refreshTrackGain(trackId); this.renderTracks({ trackId }); },
            undo: () => { track.muted = prev; this._refreshTrackGain(trackId); this.renderTracks({ trackId }); },
        });
    }
    toggleSolo(trackId) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const prev = track.solo;
        const next = !prev;

        this.app.history.push({
            label: prev ? 'Unsolo Track' : 'Solo Track',
            do: () => {
                track.solo = next;
                this._refreshAllTrackGains();
                this.renderTracks({ trackId });
            },
            undo: () => {
                track.solo = prev;
                this._refreshAllTrackGains();
                this.renderTracks({ trackId });
            },
        });
    }
    openTrackManager(trackId) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const modal = document.getElementById('track-manager-modal');
        if (!modal) return;

        document.getElementById('track-manager-title').innerText = track.name;
        const nameInput = document.getElementById('track-manager-name');
        if (nameInput) nameInput.value = track.name;

        document.getElementById('track-manager-color').value = track.color;

        const typeSelect = document.getElementById('track-manager-type');
        if (typeSelect && window.TrackTypes) {
            typeSelect.innerHTML = '';
            TrackTypes.enabled().forEach(type => {
                const opt = document.createElement('option');
                opt.value = type.id;
                opt.textContent = type.label;
                typeSelect.appendChild(opt);
            });
            typeSelect.value = track.type || 'synth';
            typeSelect.onchange = (e) => this.updateTrackType(trackId, e.target.value);
        }

        modal.classList.add('show');

        if (nameInput) {
            nameInput.oninput = (e) => this.renameTrack(trackId, e.target.value);
        }

        document.getElementById('track-manager-color').oninput = (e) =>
            this.updateTrackColor(trackId, e.target.value);

        requestAnimationFrame(() => {
            this._buildTrackManagerSliders(trackId);
        });
    }

    updateTrackType(trackId, newType) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const prev = track.type || 'synth';
        if (prev === newType) return;

        const self = this;
        this.app.history.push({
            label: 'Change Track Type',
            do: () => {
                track.type = newType;
                self.renderTracks({ trackId });
            },
            undo: () => {
                track.type = prev;
                self.renderTracks({ trackId });
            },
        });
    }

    _buildTrackManagerSliders(trackId) {
        const track = this.getTrack(trackId);
        if (!track) return;
        if (typeof createRNSlider === 'undefined') return;

        const volHost = document.getElementById('track-manager-volume-slider');
        const panHost = document.getElementById('track-manager-pan-slider');
        if (!volHost || !panHost) return;

        const modalContent = volHost.closest('.modal-content');
        const hostWidth = modalContent
            ? Math.max(200, Math.min(360, modalContent.clientWidth - 40))
            : 300;
        const sliderHeight = 60;

        volHost.innerHTML = '';
        panHost.innerHTML = '';

        const volSlider = createRNSlider({
            label: 'Volume',
            min: 0, max: 1, value: track.volume ?? 1, step: 0.01,
            orientation: 'horizontal',
            width: hostWidth, height: sliderHeight,
            theme: {
                accent: '#00e676',
                bg: ['#222', '#111'],
                rail: ['#444', '#333']
            },
            onChange: (v) => this.updateTrackVolume(trackId, v)
        });
        volHost.appendChild(volSlider);

        const panSlider = createRNSlider({
            label: 'Pan',
            min: -1, max: 1, value: track.pan ?? 0, step: 0.01,
            orientation: 'horizontal',
            width: hostWidth, height: sliderHeight,
            theme: {
                accent: '#00e676',
                bg: ['#222', '#111'],
                rail: ['#444', '#333']
            },
            onChange: (v) => this.updateTrackPan(trackId, v)
        });
        panHost.appendChild(panSlider);
    }

    renameTrack(trackId, newName) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const name = (newName || '').trim() || `Track ${trackId}`;
        const prev = track.name;
        if (prev === name) return;

        const self = this;
        this.app.history.push({
            label: 'Rename Track',
            coalesceKey: `track-name:${trackId}`,
            do: () => {
                track.name = name;
                const titleEl = document.getElementById('track-manager-title');
                if (titleEl) titleEl.innerText = name;
                const row = document.querySelector(`.track-row[data-track-id="${trackId}"] .track-name`);
                if (row) row.textContent = name;
            },
            undo: () => {
                track.name = prev;
                const titleEl = document.getElementById('track-manager-title');
                if (titleEl) titleEl.innerText = prev;
                const row = document.querySelector(`.track-row[data-track-id="${trackId}"] .track-name`);
                if (row) row.textContent = prev;
            },
        });
    }
    closeTrackManager() {
        const modal = document.getElementById('track-manager-modal');
        if (modal) modal.classList.remove('show');
    }
    updateTrackColor(trackId, color) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const prev = track.color;
        if (prev === color) return;

        this.app.history.push({
            label: 'Track Color',
            coalesceKey: `color:${trackId}`,
            do: () => { track.color = color; this.renderTracks({ trackId }); },
            undo: () => { track.color = prev; this.renderTracks({ trackId }); },
        });
    }
    updateTrackVolume(trackId, val) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const next = parseFloat(val);
        const prev = track.volume;
        if (Math.abs(prev - next) < 1e-6) return;

        this.app.history.push({
            label: 'Track Volume',
            coalesceKey: `vol:${trackId}`,
            do: () => {
                track.volume = next;
                this._refreshTrackGain(trackId);
            },
            undo: () => {
                track.volume = prev;
                this._refreshTrackGain(trackId);
            },
        });
    }
    updateTrackPan(trackId, val) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const next = parseFloat(val);
        const prev = track.pan;
        if (Math.abs(prev - next) < 1e-6) return;

        this.app.history.push({
            label: 'Track Pan',
            coalesceKey: `pan:${trackId}`,
            do: () => {
                track.pan = next;
                this._refreshTrackPan(trackId);
            },
            undo: () => {
                track.pan = prev;
                this._refreshTrackPan(trackId);
            },
        });
    }

    _getTrackNodes(trackId) {
        if (!this.audioContext) {
            this.audioContext = this.app.audioEngine?.ctx || null;
        }
        const ctx = this.audioContext;
        if (!ctx) return null;

        let nodes = this._trackNodes.get(trackId);
        if (nodes) return nodes;

        const gain = ctx.createGain();
        const panner = ctx.createStereoPanner();
        gain.connect(panner);
        panner.connect(this.app.audioEngine.panner);

        nodes = { gain, panner };
        this._trackNodes.set(trackId, nodes);
        return nodes;
    }

    _refreshTrackGain(trackId) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const nodes = this._getTrackNodes(trackId);
        if (!nodes) return;

        const anySolo = this.tracks.some(t => t.solo);
        const soloMuted = anySolo && !track.solo;
        const effective = track.muted || soloMuted ? 0 : (track.volume ?? 1);

        const now = this.audioContext.currentTime;
        nodes.gain.gain.cancelScheduledValues(now);
        nodes.gain.gain.setTargetAtTime(effective, now, 0.01);
    }

    _refreshAllTrackGains() {
        this.tracks.forEach(t => this._refreshTrackGain(t.id));
    }

    _refreshTrackPan(trackId) {
        const track = this.getTrack(trackId);
        if (!track) return;
        const nodes = this._getTrackNodes(trackId);
        if (!nodes) return;
        const now = this.audioContext.currentTime;
        nodes.panner.pan.cancelScheduledValues(now);
        nodes.panner.pan.setTargetAtTime(track.pan ?? 0, now, 0.01);
    }

    _pruneActiveSources() {
        if (!this.activeSources.length) return;
        const now = this.audioContext ? this.audioContext.currentTime : 0;
        const MARGIN = 0.5;

        let writeIdx = 0;
        for (let i = 0; i < this.activeSources.length; i++) {
            const entry = this.activeSources[i];
            const source = entry.source;
            if (!source) continue;

            const stopAt = entry.stopAt || entry.clip?.startTime + entry.clip?.duration + 3;
            const expired = stopAt != null && stopAt + MARGIN < now;

            if (expired) {
                try { source.disconnect(); } catch (_) {}
            } else {
                this.activeSources[writeIdx++] = entry;
            }
        }
        this.activeSources.length = writeIdx;
    }

    importAudioFile(trackId = null, atTime = null) {
        const targetTrackId = (trackId !== null && trackId !== undefined)
            ? trackId
            : (this.selectedTrack ?? this.tracks[0]?.id);
        const track = this.getTrack(targetTrackId);
        if (!track) {
            alert('Create a track first.');
            return;
        }

        const targetTime = (atTime !== null && atTime !== undefined)
            ? atTime
            : (this.longPressPosition?.time ?? this.playheadPosition);

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*';
        input.style.position = 'fixed';
        input.style.left = '-10000px';
        input.style.top = '0';
        document.body.appendChild(input);

        const cleanup = () => {
            try { input.remove(); } catch (_) {}
        };

        input.addEventListener('change', () => {
            const file = input.files && input.files[0];
            cleanup();
            if (!file) return;
            this._loadAudioFileIntoClip(file, targetTrackId, targetTime);
        });

        input.addEventListener('cancel', cleanup);

        input.click();
    }

    async _loadAudioFileIntoClip(file, trackId, atTime) {
        const track = this.getTrack(trackId);
        if (!track) return;

        if (!this.app.audioEngine.ctx) {
            this.app.audioEngine.init();
        }
        const ctx = this.app.audioEngine.ctx;
        if (!ctx) {
            alert('Audio not initialized. Tap anywhere first.');
            return;
        }
        if (ctx.state === 'suspended') {
            try { await ctx.resume(); } catch (_) {}
        }

        this._showToast(`Loading "${file.name}"…`);

        let arrayBuffer;
        try {
            arrayBuffer = await file.arrayBuffer();
        } catch (err) {
            this._hideToast();
            alert('Could not read file: ' + err.message);
            return;
        }

        let audioBuffer;
        try {
            audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        } catch (err) {
            this._hideToast();
            alert(
                'Could not decode audio file.\n\n' +
                'Supported: WAV, MP3, M4A, AAC, OGG, FLAC.\n' +
                'The browser reported: ' + err.message
            );
            return;
        }

        audioBuffer.name = file.name.replace(/\.[^/.]+$/, '');

        this._hideToast();

        const clip = this.addClip(trackId, audioBuffer, atTime, audioBuffer.name);
        if (clip) {
            this.selectedClip = { trackId, clipId: clip.id };
            this.renderTracks();
        }
    }

    _showToast(msg) {
        let toast = document.getElementById('daw-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'daw-toast';
            toast.className = 'daw-toast';
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add('show');
    }

    _hideToast() {
        const toast = document.getElementById('daw-toast');
        if (toast) toast.classList.remove('show');
    }

    _getLabelWidth() {
        const vw = window.innerWidth;
        if (this._cachedVW !== vw) {
            this._cachedVW = vw;
            this._cachedLabelWidth = vw <= 768 ? 120 : 180;
        }
        return this._cachedLabelWidth;
    }

    _getViewportWidth() {
        const area = document.getElementById('tracks-scroll-area');
        if (!area) return 0;
        const w = area.clientWidth;
        if (this._cachedViewportW !== w) {
            this._cachedViewportW = w;
            this._cachedViewportHalf = w / 2;
        }
        return w;
    }
}

window.TrackSystem = TrackSystem;