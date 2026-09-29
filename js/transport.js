class Transport {
    constructor(project, app = null) {
    this.project = project;
    this.app = app;
    this.isPlaying = false;
    this.subscribers = new Set();
    this.currentStep = 0;
    this.stepsPerLoop = 16;
    this.nextStepTime = 0.0;

    const isMobile = (typeof window !== 'undefined') &&
        (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
         || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches));

    this.lookahead = isMobile ? 50.0 : 25.0;
    this.scheduleAheadTime = isMobile ? 0.35 : 0.15;
    this._isMobile = isMobile;

    this.timerID = null;
    this._schedulerRunning = false;
}

    get audioContext() {
        return this.app?.audioEngine?.ctx || window.app?.audioEngine?.ctx;
    }

    get bpm() {
        return this.project?.bpm || 120;
    }

    setBPM(bpm) {
        if (this.project) this.project.setBPM(bpm);
    }

    setLoopLength(steps) {
        if (Number.isFinite(steps) && steps > 0) {
            this.stepsPerLoop = steps;
        }
    }

    subscribe(fn) {
        if (typeof fn === 'function') {
            this.subscribers.add(fn);
            return () => this.subscribers.delete(fn);
        }
        return () => {};
    }

    unsubscribe(fn) {
        this.subscribers.delete(fn);
    }

    start() {
        if (this.isPlaying) return;
        const ctx = this.audioContext;
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume();

        this.isPlaying = true;
        this.currentStep = 0;
        this.nextStepTime = ctx.currentTime + 0.02;
        
        this.timerID = setInterval(() => this._scheduler(), this.lookahead);
    }

    stop() {
        if (!this.isPlaying) return;
        this.isPlaying = false;
        clearInterval(this.timerID);
        this.timerID = null;
        this.currentStep = 0;
    }

    _scheduler() {
    if (this._schedulerRunning) return;
    this._schedulerRunning = true;
    try {
        const ctx = this.audioContext;
        if (!ctx) return;

        const stepSec = (60.0 / this.bpm) * 0.25;
        if (this.nextStepTime < ctx.currentTime - stepSec) {
            const missedSteps = Math.ceil((ctx.currentTime - this.nextStepTime) / stepSec);
            this.currentStep = (this.currentStep + missedSteps) % Math.max(1, this.stepsPerLoop);
            this.nextStepTime += missedSteps * stepSec;
            if (this.nextStepTime < ctx.currentTime) {
                this.nextStepTime = ctx.currentTime;
            }
        }

        let safety = 64;
        while (this.nextStepTime < ctx.currentTime + this.scheduleAheadTime && safety-- > 0) {
            this._scheduleStep(this.currentStep, this.nextStepTime);
            this._advanceStep();
        }
    } finally {
        this._schedulerRunning = false;
    }
}

    _scheduleStep(stepIndex, audioTime) {
        this.subscribers.forEach(fn => {
            try {
                fn(stepIndex, audioTime);
            } catch (e) {
                console.error('Transport subscriber error:', e);
            }
        });
    }

    _advanceStep() {
        const secondsPer16th = (60.0 / this.bpm) * 0.25;
        this.nextStepTime += secondsPer16th;
        this.currentStep++;
    }
}

window.Transport = Transport;