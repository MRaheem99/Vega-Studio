class Metronome {
    constructor(app) {
        this.app = app;
        this.enabled = false;
        this.volume = (typeof app?.project?.metronomeVolume === 'number')
            ? app.project.metronomeVolume
            : 0.5;

        const bindTransport = () => {
            if (this.app?.transport) {
                this.app.transport.subscribe((step, audioTime) => this.tick(step, audioTime));
            } else {
                setTimeout(bindTransport, 50);
            }
        };
        bindTransport();

        const bindProject = () => {
            if (this.app?.project) {
                this.app.project.subscribe((type, data) => {
                    if (type === 'metronomeVolume') {
                        this.setVolume(data.metronomeVolume);
                    }
                });
            } else {
                setTimeout(bindProject, 50);
            }
        };
        bindProject();
    }

    toggle() {
        this.enabled = !this.enabled;
        const btn = document.getElementById('metronome-btn');
        if (btn) btn.classList.toggle('active', this.enabled);
    }

    setVolume(v) {
        this.volume = Math.max(0, Math.min(1, parseFloat(v) || 0));
    }

    _beatsPerBar() {
        const sig = this.app.project?.timeSignature || '4/4';
        const n = parseInt(sig.split('/')[0], 10);
        return Number.isFinite(n) && n > 0 ? n : 4;
    }

    tick(masterStep, audioTime) {
        if (!this.enabled) return;

        const stepsPerBeat = 4;
        const beatsPerBar = this._beatsPerBar();
        const stepsPerBar = beatsPerBar * stepsPerBeat;

        const isBeat = (masterStep % stepsPerBeat) === 0;
        const isDownbeat = (masterStep % stepsPerBar) === 0;

        if (isBeat) {
            this._playClick(isDownbeat, audioTime);
        }
    }

    _playClick(accent, audioTime) {
        const ctx = this.app.audioEngine?.ctx;
        if (!ctx) return;

        const t0 = audioTime || ctx.currentTime;
        const t1 = t0 + 0.05;
        const vol = Number.isFinite(this.volume) ? this.volume : 0.5;

        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(accent ? 1760 : 880, t0);

        gain.gain.setValueAtTime(vol, t0);
        gain.gain.exponentialRampToValueAtTime(0.0001, t1);

        const dest = this.app.audioEngine.masterGain || ctx.destination;
        osc.connect(gain);
        gain.connect(dest);

        osc.start(t0);
        osc.stop(t1 + 0.01);
    }
}

window.Metronome = Metronome;