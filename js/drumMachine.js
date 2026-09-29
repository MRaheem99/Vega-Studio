class DrumMachine {

    constructor(audioCtx){
        this.ctx = audioCtx;
        this.bpm = 120;
        this.steps = 16;
        this.isPlaying = false;
        this.currentStep = 0;
        this.nextNoteTime = 0;
        this.lookahead = 25;
        this.scheduleAhead = 0.1;
        this.samples = {};
        this.pattern = {
        kick: new Array(16).fill(0),
        snare: new Array(16).fill(0),
        hihat: new Array(16).fill(0)
        };
    }

    async loadSample(name,url){
        const res = await fetch(url);
        const arr = await res.arrayBuffer();
        this.samples[name] = await this.ctx.decodeAudioData(arr);
    }

    playSample(name,time){
        const buffer = this.samples[name];
        if(!buffer) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(this.ctx.destination);
        src.start(time);
    }

    scheduler(){
        while(this.nextNoteTime < this.ctx.currentTime + this.scheduleAhead){
            this.scheduleStep(this.currentStep,this.nextNoteTime);
            this.nextStep();
        }
    }

    scheduleStep(step,time){
        for(const drum in this.pattern){
            if(this.pattern[drum][step]){
            this.playSample(drum,time);
            }
        }
    }

    nextStep(){
        const secondsPerBeat = 60/this.bpm;
        this.nextNoteTime += 0.25 * secondsPerBeat;
        this.currentStep++;
        if(this.currentStep >= this.steps){
            this.currentStep = 0;
        }
    }

    start(){
        if(this.isPlaying) return;
        this.currentStep = 0;
        this.nextNoteTime = this.ctx.currentTime;
        this.timer = setInterval(()=>this.scheduler(),this.lookahead);
        this.isPlaying = true;
    }


    stop(){
        clearInterval(this.timer);
        this.isPlaying = false;
    }
}

window.DrumMachine = DrumMachine;