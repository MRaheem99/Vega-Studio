//js/project.js
class Project {
    constructor(){
        this.name = "New Project";
        this.bpm = 120;
        this.bars = 8;
        this.timeSignature = "4/4";
        this.swing = 0;
        this.key = "C";
        this.scale = "major";
        this.genre = "house";  
		this.songLengthBars = 32;
        this.breakCount = 2;
        this.metronomeVolume = 0.5;
        this.listeners = [];
    }

    setBPM(val){
        if(!Number.isFinite(val)) return;
        this.bpm = val;
        this.emit("bpm");
    }

    setBars(val){
        if(!Number.isFinite(val)) return; 
        this.bars = val;
        this.emit("bars");
    }

    setTimeSignature(val){
        this.timeSignature = val;
        this.emit("timesig");
    }

    setSwing(val){
        this.swing = val;
        this.emit("swing");
    }

    setKey(val){
        this.key = val;
        this.emit("key");
    }

    setScale(val){
        this.scale = val;
        this.emit("scale");
    }

    setGenre(val){                          // ← NEW
        if (!val) return;
        this.genre = val;
        this.emit("genre");
    }

    setMetronomeVolume(val) {
        const v = Math.max(0, Math.min(1, parseFloat(val) || 0));
        this.metronomeVolume = v;
        this.emit("metronomeVolume");
    }

    setupProjectSettings(){
        document.getElementById("proj-bpm").addEventListener("change",(e)=>{
            const projectbpm = parseFloat(e.target.value);
            this.setBPM(projectbpm);
        });

        document.getElementById("proj-bars").addEventListener("change",(e)=>{
            const projectbars = parseInt(e.target.value);
            this.setBars(projectbars);
        });

        document.getElementById("proj-timesig").addEventListener("change",(e)=>{
            this.setTimeSignature(e.target.value);
        });

        document.getElementById("proj-swing").addEventListener("input",(e)=>{
            this.setSwing(parseFloat(e.target.value));
        });

        document.getElementById("proj-key").addEventListener("change",(e)=>{
            this.setKey(e.target.value);
        });

        document.getElementById("proj-scale").addEventListener("change",(e)=>{
            this.setScale(e.target.value);
        });

        // ← NEW: genre selector
        const genreSel = document.getElementById("proj-genre");
        if (genreSel) {
            genreSel.addEventListener("change", (e) => {
                this.setGenre(e.target.value);
            });
        }

        document.getElementById("proj-metronome-vol").addEventListener("input", (e) => {
            this.setMetronomeVolume(e.target.value);
        });

		        const songLenEl = document.getElementById("proj-song-length");
        if (songLenEl) songLenEl.addEventListener("change", (e) => this.setSongLengthBars(e.target.value));

        const breakCountEl = document.getElementById("proj-break-count");
        if (breakCountEl) breakCountEl.addEventListener("change", (e) => this.setBreakCount(e.target.value));
    }

	setSongLengthBars(val) {
        const n = parseInt(val);
        if (!Number.isFinite(n) || n < 4) return;
        this.songLengthBars = n;
        this.emit("songLengthBars");
    }

    setBreakCount(val) {
        const n = parseInt(val);
        if (!Number.isFinite(n) || n < 0 || n > 6) return;
        this.breakCount = n;
        this.emit("breakCount");
    }

    subscribe(fn){
        this.listeners.push(fn);
    }

    emit(type){
        this.listeners.forEach(fn => fn(type,this));
    }
}

window.Project = Project;