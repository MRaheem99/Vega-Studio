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
		
		document.getElementById("proj-metronome-vol").addEventListener("input", (e) => {
    		this.setMetronomeVolume(e.target.value);
		});
	}

	subscribe(fn){
		this.listeners.push(fn);
	}

	emit(type){
		this.listeners.forEach(fn => fn(type,this));
	}
}

window.Project = Project;