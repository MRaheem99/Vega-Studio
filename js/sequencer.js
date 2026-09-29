//js/sequencer.js
class DrumSequencer {
    constructor(app) {
        this.app = app;
        this.steps = 16;
        this.minSteps = 4;
        this.maxSteps = 64;
        this.currentStep = 0;
        this.isPlaying = false;
        this.padNames = [
            { icon: 'fa-drum', title: 'Kick' },
            { icon: 'fa-drum', title: 'Snare' },
            { icon: 'fa-hand', title: 'Clap' },
            { icon: 'fa-music', title: 'Hi-Hat Closed' },
            { icon: 'fa-music', title: 'Hi-Hat Open' },
            { icon: 'fa-bell', title: 'Ride' },
            { icon: 'fa-drum', title: 'Tom' },
            { icon: 'fa-bell', title: 'Crash' }
        ];
        this.pattern = new Array(8).fill(null).map(() => new Array(this.steps).fill(false));
        this._patternClipboard = null;
        this._rowClipboard = null;
        this._lastPlayEls = [];
        this._projectSubscribed = false;
    }

    _blankCell() {
        return {
            active: false,
            velocity: 1,
            probability: 1,
            ratchet: 1,
            pan: 0,
            length: 1
        };
    }

    setSteps(newSteps) {
        const steps = Math.max(this.minSteps, Math.min(this.maxSteps, parseInt(newSteps) || 16));
        if (steps === this.steps) return;

        const newPattern = new Array(8).fill(null).map((_, pad) => {
            const newRow = new Array(steps).fill(false);
            for (let s = 0; s < Math.min(this.steps, steps); s++) {
                newRow[s] = this.pattern[pad][s];
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
                this.app.project?.bpm || 120,
                'drums'
            );
        }

        if (this.app.patterns) {
            this.app.patterns.updatePatternInfo();
        }

        console.log(`Sequencer steps changed to: ${steps}`);
    }

    render() {
        const container = document.getElementById("sequencer");
        if (!container) return;

        container.innerHTML = `
            <div class="seq-controls">
                <div class="seq-controls-left">
                    <button class="seq-btn" id="seq-play-btn" onclick="app.sequencer.togglePlay()" title="Play/Stop">
                        <i class="fa-solid fa-play"></i>
                    </button>
                    <button class="seq-btn" onclick="app.sequencer.clear()" title="Clear Pattern">
                        <i class="fa-solid fa-eraser"></i>
                    </button>
                    <button class="seq-btn" onclick="app.sequencer.randomize()" title="Generate from Genre">
                        <i class="fa-solid fa-dice"></i>
                    </button>
                
                    <div class="seq-steps-control">
                        <label for="seq-steps-input" class="visually-hidden">Steps</label>
                        <input type="number" id="seq-steps-input" 
                               value="${this.steps}" 
                               min="${this.minSteps}" 
                               max="${this.maxSteps}"
                               class="seq-steps-input"
                               title="Number of steps (4-64)">
                        <button class="seq-btn" onclick="app.sequencer.setSteps(document.getElementById('seq-steps-input').value)" title="Apply step count">
                            <i class="fa-solid fa-check"></i>
                        </button>
                    </div>
                </div>
                
                <div class="seq-controls-right">
                </div>
            </div>
            
            <div class="sequencer-container">
                ${this.padNames.map((pad, padIndex) => `
                    <div class="seq-row">
                        <div class="seq-label" 
                             data-pad="${padIndex}" 
                             title="${pad.title || 'PAD ' + (padIndex+1)}"
                             onclick="app.openPadManager(${padIndex}, '${pad.title}')">
                            <i class="fa-solid ${pad.icon || 'fa-drum'}"></i> ${pad.title || 'PAD ' + (padIndex+1)}
                        </div>
                        <div class="seq-steps" 
                             data-pad="${padIndex}" 
                             data-steps="${this.steps}" 
                             style="grid-template-columns: repeat(${this.steps}, 1fr); min-width: ${this.steps * 26}px;">
                            ${Array.from({length: this.steps}, (_, stepIndex) => `
                            <div class="seq-step" 
                                data-step="${stepIndex + 1}"
                                data-pad="${padIndex}"
                                onclick="app.sequencer.toggleStep(${padIndex}, ${stepIndex})"
                                title="Step ${stepIndex + 1}">
                            </div>
                        `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        container.querySelectorAll('.seq-step').forEach(el => {
            const padIndex = parseInt(el.dataset.pad, 10);
            const stepIndex = parseInt(el.dataset.step, 10) - 1;
            this._applyStepVisuals(el, this.pattern[padIndex][stepIndex]);
            this._wireStepContextMenu(el, padIndex, stepIndex);
        });
    }

    _wireStepContextMenu(el, padIndex, stepIndex) {
        let pressTimer = null;
        let origin = null;
        let fired = false;

        const openMenu = (clientX, clientY) => {
            fired = true;
            if (this.app.stepContextMenu) {
                this.app.stepContextMenu.show(clientX, clientY, padIndex, stepIndex);
            }
        };

        el.addEventListener('touchstart', (e) => {
            if (e.touches.length !== 1) return;
            const t = e.touches[0];
            origin = { x: t.clientX, y: t.clientY };
            fired = false;
            pressTimer = setTimeout(() => {
                pressTimer = null;
                openMenu(t.clientX, t.clientY);
                if (navigator.vibrate) navigator.vibrate(15);
            }, 450);
        }, { passive: true });

        el.addEventListener('touchmove', (e) => {
            if (!pressTimer || !origin) return;
            const t = e.touches[0];
            if (Math.hypot(t.clientX - origin.x, t.clientY - origin.y) > 8) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        }, { passive: true });

        el.addEventListener('touchend', () => {
            if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        });

        el.addEventListener('click', (e) => {
            if (fired) { e.stopPropagation(); e.preventDefault(); fired = false; }
        }, true);

        el.addEventListener('pointerup', () => {
            setTimeout(() => { fired = false; }, 0);
        });

        el.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (fired) return;
            openMenu(e.clientX, e.clientY);
        });
    }

    toggleStep(padIndex, stepIndex) {
        const before = this._normStep(this.pattern[padIndex][stepIndex]);
        const after = { ...before, active: !before.active };
        const seq = this;

        const applyVisual = (state) => {
            const stepEl = document.querySelector(`.seq-steps[data-pad="${padIndex}"] .seq-step[data-step="${stepIndex + 1}"]`);
            if (stepEl) seq._applyStepVisuals(stepEl, state);
            if (seq.app.patterns) seq.app.patterns.updatePatternInfo();
        };

        this.app.history.push({
            label: after.active ? 'Activate Step' : 'Deactivate Step',
            do: () => {
                seq.pattern[padIndex][stepIndex] = { ...after };
                applyVisual(after);
                if (this.app?.tracks && this.currentPatternName) {
                    this.app.tracks._notifyPatternEdited(
                        this.currentPatternName,
                        this.app.project?.bpm || 120,
                        'drums'
                    );
                }
                if (after.active) {
                    const pad = seq.app.drumPads[padIndex];
                    if (pad?.sample) seq.app.audioEngine.playDrumSample(pad.sample, pad);
                }
            },
            undo: () => {
                seq.pattern[padIndex][stepIndex] = { ...before };
                applyVisual(before);
                if (this.app?.tracks && this.currentPatternName) {
                    this.app.tracks._notifyPatternEdited(
                        this.currentPatternName,
                        this.app.project?.bpm || 120,
                        'drums'
                    );
                }
            },
        });
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
            };
        }
        return { active: !!step, velocity: 1, probability: 1, ratchet: 1, pan: 0, pitch: 0, length: 1 };
    }

    _normalizePattern(pattern) {
        return pattern.map(row =>
            row.map(cell => this._normStep(cell))
        );
    }

    toSnapshot(name = null) {
        const padSnapshots = (this.app.drumPads || []).map(pad => ({
            effects: Object.assign({}, pad.effects || {}),
            effectStates: JSON.parse(JSON.stringify(pad.effectStates || {})),
            volume: pad.volume ?? 1,
            pitch: pad.pitch ?? 0,
            pan: pad.pan ?? 0,
            muted: pad.muted ?? false,
            solo: pad.solo ?? false
        }));

        return {
            kind: 'drums',
            name: name || 'Drum Pattern',
            steps: this.steps,
            rows: 8,
            bpm: this.app?.project?.bpm || 120,
            grid: this.pattern.map(row => row.map(cell => this._normStep(cell))),
            padSnapshots
        };
    }

    applySnapshot(snapshot) {
        if (!snapshot) return;

        if (Number.isFinite(snapshot.steps)) {
            const steps = Math.max(this.minSteps, Math.min(this.maxSteps, snapshot.steps));
            this.steps = steps;
        }

        const rows = 8;
        const newPattern = new Array(rows).fill(null)
            .map(() => new Array(this.steps).fill(null).map(() => this._blankCell()));
        if (Array.isArray(snapshot.grid)) {
            const gridRows = Math.min(snapshot.grid.length, rows);
            for (let r = 0; r < gridRows; r++) {
                const row = snapshot.grid[r] || [];
                const n = Math.min(row.length, this.steps);
                for (let s = 0; s < n; s++) {
                    newPattern[r][s] = this._normStep(row[s]);
                }
            }
        }
        this.pattern = newPattern;
        this.currentStep = 0;

        if (Array.isArray(snapshot.padSnapshots) && this.app.drumPads) {
            const n = Math.min(snapshot.padSnapshots.length, this.app.drumPads.length);
            for (let i = 0; i < n; i++) {
                const src = snapshot.padSnapshots[i];
                const pad = this.app.drumPads[i];
                if (!pad || !src) continue;
                if (src.volume !== undefined) pad.volume = src.volume;
                if (src.pitch !== undefined) pad.pitch = src.pitch;
                if (src.pan !== undefined) pad.pan = src.pan;
                if (src.muted !== undefined) pad.muted = !!src.muted;
                if (src.solo !== undefined) pad.solo = !!src.solo;
                if (src.effects) pad.effects = Object.assign({}, src.effects);
                if (src.effectStates) {
                    pad.effectStates = JSON.parse(JSON.stringify(src.effectStates));
                }
            }
        }

        this.render();
        if (this.app.patterns) this.app.patterns.updatePatternInfo();
    }

    _shouldFire(step) {
        const s = this._normStep(step);
        if (!s.active) return false;
        if (s.probability >= 1) return true;
        return Math.random() < s.probability;
    }

    step(stepIndex, audioTime) {
        this.currentStep = stepIndex;

        requestAnimationFrame(() => {
            if (this._lastPlayEls) {
                this._lastPlayEls.forEach(el => el.classList.remove('play'));
            }
            this._lastPlayEls = [];

            const container = document.getElementById('sequencer');
            if (container) {
                const column = container.querySelectorAll(`.seq-step[data-step="${stepIndex + 1}"]`);
                column.forEach(el => {
                    el.classList.add('play');
                    this._lastPlayEls.push(el);
                });
            }
        });

        for (let padIndex = 0; padIndex < 8; padIndex++) {
            try {
                const stepData = this._normStep(this.pattern[padIndex][stepIndex]);
                if (stepData.active && this._shouldFire(stepData)) {
                    const pad = this.app.drumPads[padIndex];
                    if (pad?.sample) {
                        this._playStepPrecise(pad, stepData, audioTime);
                    }
                }
            } catch (err) {
                console.warn('synth step row', row, 'failed:', err);
            }
        }
    }

    _playStepPrecise(pad, step, audioTime) {
        const bpm = this.app.project?.bpm || 120;
        const stepSec = (60 / bpm) * 0.25;
        const hits = Math.max(1, Math.min(8, step.ratchet || 1));
        const subGap = stepSec / hits;

        const originalVol = pad.volume;
        const stepPan = typeof step.pan === 'number' ? step.pan : 0;
        const stepPitch = typeof step.pitch === 'number' ? step.pitch : 0;

        const stepPitchRatio = stepPitch !== 0
            ? Math.pow(2, stepPitch / 12)
            : 1;

        try {
            pad.volume = (originalVol ?? 1) * (step.velocity ?? 1);

            this.app.audioEngine.playDrumSample(pad.sample, pad, null, {
                time: audioTime,
                pan: stepPan,
                pitchRatio: stepPitchRatio
            });

            for (let i = 1; i < hits; i++) {
                const subTime = audioTime + i * subGap;
                pad.volume = (originalVol ?? 1) * (step.velocity ?? 1) * 0.6;
                this.app.audioEngine.playDrumSample(pad.sample, pad, null, {
                    time: subTime,
                    pan: stepPan,
                    pitchRatio: stepPitchRatio
                });
            }
        } finally {
            pad.volume = originalVol;
        }
    }

    _playStepWithModifiers(pad, step) {
        const bpm = this.app.project?.bpm || 120;
        const stepSec = (60 / bpm) / 4;
        const hits = Math.max(1, Math.min(8, step.ratchet || 1));
        const hitGap = stepSec / hits;
        const originalVol = pad.volume;
        const originalPan = pad.pan;
        try {
            pad.volume = (originalVol ?? 1) * (step.velocity ?? 1);
            if (typeof pad.pan === 'number') pad.pan = (originalPan ?? 0) + (step.pan ?? 0);
            this.app.audioEngine.playDrumSample(pad.sample, pad);
        } finally {
            pad.volume = originalVol;
            if (typeof pad.pan === 'number') pad.pan = originalPan;
        }

        for (let i = 1; i < hits; i++) {
            setTimeout(() => {
                const origV = pad.volume;
                const origP = pad.pan;
                try {
                    pad.volume = (origV ?? 1) * (step.velocity ?? 1) * 0.6;
                    if (typeof pad.pan === 'number') pad.pan = (origP ?? 0) + (step.pan ?? 0);
                    this.app.audioEngine.playDrumSample(pad.sample, pad);
                } finally {
                    pad.volume = origV;
                    if (typeof pad.pan === 'number') pad.pan = origP;
                }
            }, i * hitGap * 1000);
        }
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
        if (s.ratchet > 1) stepEl.dataset.ratchet = s.ratchet;
        else delete stepEl.dataset.ratchet;
        if (s.pitch !== 0) stepEl.dataset.pitch = (s.pitch > 0 ? '+' : '') + s.pitch;
        else delete stepEl.dataset.pitch;
    }

    togglePlay() {
        const btn = document.getElementById('seq-play-btn');
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
        this.app.transport.setLoopLength(this.steps);
        this._subscribeToTransport();

        if (!this.app.transport.isPlaying) {
            this.app.transport.start();
        } else {
        }
        if (this.app?.updateStatusDisplay) this.app.updateStatusDisplay();
    }

    stop() {
        this.isPlaying = false;
        document.querySelectorAll(".seq-step").forEach(el => el.classList.remove("play"));

        // If the synth seq is also stopped, clean up any lingering voices
        if (!this.app.synthSequencer?.isPlaying) {
            if (this.app.audioEngine?.stopAllNotes) {
                try { this.app.audioEngine.stopAllNotes(); } catch (_) {}
            }
            this.app.transport.stop();
        }
        if (this.app?.updateStatusDisplay) this.app.updateStatusDisplay();
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

    clear() {
        if (!confirm('Clear all steps in sequencer?')) return;

        this.pattern = new Array(8).fill(null)
            .map(() => new Array(this.steps).fill(null).map(() => this._blankCell()));
        this.render();

        if (this.app?.tracks && this.currentPatternName) {
            this.app.tracks._notifyPatternEdited(
                this.currentPatternName,
                this.app.project?.bpm || 120,
                'drums'
            );
        }

        if (this.app.patterns) {
            this.app.patterns.updatePatternInfo();
        }
    }

    randomize(options = {}) {
        const app = this.app;
        if (app && typeof app.generateDrumsFromGenre === 'function'
            && app.project && app.project.genre && window.GenreGenerator) {
            app.generateDrumsFromGenre();
            return;
        }

        const {
            density = 0.3,
            padWeights = {0: 0.7, 1: 0.5, 2: 0.8, 3: 0.3, 4: 0.4, 5: 0.3, 6: 0.4, 7: 0.3},
            avoidConsecutive = true,
            musical = true
        } = options;

        for (let pad = 0; pad < 8; pad++) {
            for (let step = 0; step < this.steps; step++) {
                const padDensity = padWeights?.[pad] ?? density;
                let active = Math.random() < padDensity;

                if (musical && active) {
                    if (pad === 0 && step % 4 !== 0) {
                        active = Math.random() < padDensity * 0.4;
                    }
                    if (pad === 1 && ![4, 12].includes(step)) {
                        active = Math.random() < padDensity * 0.5;
                    }
                    if (pad === 2 && step % 2 !== 0) {
                        active = Math.random() < padDensity * 1.3;
                    }
                }

                if (avoidConsecutive && active && step >= 2) {
                    const prev1 = this._normStep(this.pattern[pad][step - 1]);
                    const prev2 = this._normStep(this.pattern[pad][step - 2]);
                    if (prev1.active && prev2.active) {
                        active = false;
                    }
                }

                this.pattern[pad][step] = active
                    ? { active: true, velocity: 1, probability: 1, ratchet: 1, pan: 0 }
                    : false;
            }
        }

        this.render();

        if (this.app?.tracks && this.currentPatternName) {
            this.app.tracks._notifyPatternEdited(
                this.currentPatternName,
                this.app.project?.bpm || 120,
                'drums'
            );
        }

        if (this.app.patterns) {
            this.app.patterns.updatePatternInfo();
        }
    }

    async exportPatternToWav(pattern, bpm = 120, padSamples = [], padConfigs = []) {
        if (!pattern || !padSamples.length) return null;

        const normPattern = this._normalizePattern(pattern);
        const liveCtx = this.app?.audioEngine?.ctx;
        const sampleRate = (liveCtx && liveCtx.sampleRate) || 44100;
        const totalSteps = normPattern[0]?.length || 16;
        const secondsPerBeat = 60 / bpm;
        const patternDuration = (totalSteps / 4) * secondsPerBeat;
        const offlineCtx = new OfflineAudioContext(
            2, Math.max(1, Math.ceil(sampleRate * patternDuration)), sampleRate
        );

        const masterGain = offlineCtx.createGain();
        masterGain.gain.value = 1.0;
        const panner = offlineCtx.createStereoPanner();
        panner.pan.value = 0;
        masterGain.connect(panner);
        panner.connect(offlineCtx.destination);

        for (let padIndex = 0; padIndex < 8; padIndex++) {
            const sample = padSamples[padIndex];
            if (!sample) continue;

            const pad = padConfigs[padIndex] || {};
            const padEffects = pad.effects || {};
            const padEffectStates = pad.effectStates || {};
            const padVolume = pad.volume ?? 1;
            const padPitch = pad.pitch ?? 0;

            const masterAdsr = this.app?.audioEngine?.params || {};
            const adsr = (padEffects.adsr && padEffectStates.adsr)
                ? {
                    attack: Math.max(0.001, padEffectStates.adsr.attack ?? 0.001),
                    decay: Math.max(0.01, padEffectStates.adsr.decay ?? 0.2),
                    sustain: Math.min(1, Math.max(0, padEffectStates.adsr.sustain ?? 0.8)),
                    release: Math.max(0.01, padEffectStates.adsr.release ?? 0.3),
                }
                : {
                    attack: Math.max(0.001, masterAdsr.attack ?? 0.01),
                    decay: Math.max(0.01, masterAdsr.decay ?? 0.2),
                    sustain: Math.min(1, Math.max(0, masterAdsr.sustain ?? 0.6)),
                    release: Math.max(0.01, masterAdsr.release ?? 0.3),
                };

            const anyOtherFx = Object.keys(padEffects)
                .filter(k => k !== 'adsr')
                .some(k => padEffects[k]);

            let padProcessor = null;
            if (anyOtherFx && window.EffectProcessor) {
                padProcessor = new EffectProcessor(offlineCtx);
                const order = [
                    'echo', 'reverb', 'distortion', 'compressor',
                    'equalizer', 'chorus', 'bitcrusher', 'phaser',
                ];
                order.forEach(fx => {
                    if (!padEffects[fx]) return;
                    const params = padEffectStates[fx] || {};
                    switch (fx) {
                        case 'echo':       padProcessor.createEcho(params); break;
                        case 'reverb':     padProcessor.createReverb(params); break;
                        case 'distortion': padProcessor.createDistortion(params); break;
                        case 'compressor': padProcessor.createCompressor(params); break;
                        case 'equalizer':  padProcessor.createEqualizer(params); break;
                        case 'chorus':     padProcessor.createChorus(params); break;
                        case 'bitcrusher': padProcessor.createBitcrusher(params); break;
                        case 'phaser':     padProcessor.createPhaser(params); break;
                    }
                });
                padProcessor.masterOutput.connect(masterGain);
            }

            for (let step = 0; step < totalSteps; step++) {
                const s = normPattern[padIndex]?.[step];
                if (!s || !s.active) continue;

                const stepTime = (step / 4) * secondsPerBeat;
                const ratchet = Math.max(1, Math.min(8, s.ratchet || 1));
                const subGap = (secondsPerBeat / 4) / ratchet;

                const stepPitchRatio = Math.pow(2, padPitch / 12);
                const stepPan = Math.max(-1, Math.min(1, (s.pan || 0)));
                const stepVelocity = s.velocity ?? 1;

                for (let h = 0; h < ratchet; h++) {
                    const subTime = stepTime + h * subGap;
                    const velocityScale = stepVelocity * (h === 0 ? 1 : 0.6);

                    const source = offlineCtx.createBufferSource();
                    source.buffer = sample;
                    source.playbackRate.value = stepPitchRatio;

                    const volumeGain = offlineCtx.createGain();
                    volumeGain.gain.value = padVolume * 1.5 * velocityScale;

                    const stepPanner = offlineCtx.createStereoPanner();
                    stepPanner.pan.value = stepPan;

                    const envGain = offlineCtx.createGain();
                    const a = adsr.attack, d = adsr.decay, sus = adsr.sustain, r = adsr.release;
                    const srcDur = sample.duration / stepPitchRatio;

                    envGain.gain.setValueAtTime(0, subTime);
                    envGain.gain.linearRampToValueAtTime(1, subTime + a);
                    envGain.gain.exponentialRampToValueAtTime(
                        Math.max(0.001, sus), subTime + a + d
                    );
                    const releaseStart = Math.max(subTime + a + d, subTime + srcDur);
                    envGain.gain.setValueAtTime(Math.max(0.001, sus), releaseStart);
                    envGain.gain.exponentialRampToValueAtTime(0.001, releaseStart + r);

                    source.connect(volumeGain);
                    volumeGain.connect(envGain);
                    envGain.connect(stepPanner);

                    if (padProcessor) stepPanner.connect(padProcessor.masterInput);
                    else stepPanner.connect(masterGain);

                    source.start(subTime);
                }
            }
        }

        try {
            const rendered = await offlineCtx.startRendering();
            return this.bufferToWav(rendered);
        } catch (err) {
            console.error('WAV export failed:', err);
            return null;
        }
    }

    bufferToWav(buffer) {
        const numChannels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const format = 1;
        const bitDepth = 16;
        const bytesPerSample = bitDepth / 8;
        const blockAlign = numChannels * bytesPerSample;

        const data = [];
        for (let i = 0; i < buffer.length; i++) {
            for (let channel = 0; channel < numChannels; channel++) {
                const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
                const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
                data.push(intSample);
            }
        }

        const dataLength = data.length * bytesPerSample;
        const bufferSize = 44 + dataLength;
        const arrayBuffer = new ArrayBuffer(bufferSize);
        const view = new DataView(arrayBuffer);

        this.writeString(view, 'RIFF', 0);
        view.setUint32(4, bufferSize - 8, true);
        this.writeString(view, 'WAVE', 8);
        this.writeString(view, 'fmt ', 12);
        view.setUint32(16, 16, true);
        view.setUint16(20, format, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * blockAlign, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitDepth, true);
        this.writeString(view, 'data', 36);
        view.setUint32(40, dataLength, true);

        let offset = 44;
        for (let i = 0; i < data.length; i++) {
            view.setInt16(offset, data[i], true);
            offset += 2;
        }

        return new Blob([arrayBuffer], { type: 'audio/wav' });
    }

    writeString(view, string, offset) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    async savePatternAsWav(patternName) {
        const name = patternName || 'pattern';
        const bpm = this.app.project?.bpm || 120;

        const padSamples = this.app.drumPads.map(p => p.sample);
        const padConfigs = this.app.drumPads.map(pad => ({
            effects: pad.effects || {},
            effectStates: pad.effectStates || {},
            volume: pad.volume ?? 1,
            pitch: pad.pitch ?? 0,
            pan: pad.pan ?? 0,
        }));

        const wavBlob = await this.exportPatternToWav(this.pattern, bpm, padSamples, padConfigs);

        if (wavBlob) {
            const url = URL.createObjectURL(wavBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${name.replace(/[^a-z0-9]/gi, '_')}.wav`;
            a.click();
            URL.revokeObjectURL(url);

            return true;
        }
        return false;
    }
}

window.DrumSequencer = DrumSequencer;