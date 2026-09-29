class PatternManager {
    constructor(app) {
        this.app = app;
        this.storageKey = 'mrsm_patterns_v2';
        this.versionKey = 'mrsm_patterns_version';
        this.currentPatternName = 'My Pattern';

        this._enforceFreshStorage();

        this.patterns = this.loadAll();
        this.updatePatternList();
    }

    _enforceFreshStorage() {
        const storedVersion = localStorage.getItem(this.versionKey) || '0';
        if (storedVersion !== '4') {
    try {
        localStorage.removeItem('mrsm_patterns_v1');
        localStorage.removeItem('mrsm_patterns_v2');
    } catch (_) {}
    localStorage.setItem(this.versionKey, '4');
}
    }

    _activeSequencer() {
        return this.app.currentMode === 'synthseq'
            ? this.app.synthSequencer
            : this.app.sequencer;
    }

    _activeKind() {
        return this.app.currentMode === 'synthseq' ? 'synth' : 'drums';
    }


    create(name = null) {
        const seq = this._activeSequencer();
        if (!seq) return;
        const patternName = name
            || document.getElementById('pattern-name').value.trim()
            || 'New Pattern';
        this.currentPatternName = patternName;
        document.getElementById('pattern-name').value = patternName;

        if (this.app.currentMode === 'synthseq') {
            seq.pattern = new Array(seq.rows)
                .fill(null)
                .map(() => new Array(seq.steps).fill(false));
        } else {
            seq.pattern = new Array(8)
                .fill(null)
                .map(() => new Array(seq.steps).fill(false));
        }
        seq.render();
        this.updatePatternInfo();
    }

    save(name = null) {
        const seq = this._activeSequencer();
        if (!seq) return;
        const patternName = name || document.getElementById('pattern-name').value.trim();
        if (!patternName) {
            alert('Please enter a pattern name');
            return;
        }

        const kind = this._activeKind();
        const isSynth = kind === 'synth';

        const snapshot = (typeof seq.toSnapshot === 'function')
            ? seq.toSnapshot(patternName)
            : null;
        if (!snapshot) {
            console.warn('Sequencer does not expose toSnapshot()');
            return;
        }

        const patternData = {
            _shapeVersion: 3,
            name: patternName,
            kind: snapshot.kind || kind,
            bpm: snapshot.bpm || this.app.project?.bpm || 120,
            steps: snapshot.steps,
            rows: snapshot.rows,
            baseMidiNote: isSynth ? snapshot.baseMidiNote : undefined,
            octave: isSynth ? snapshot.octave : undefined,
            created: new Date().toISOString(),
            modified: new Date().toISOString(),
            grid: snapshot.grid,
            soundProfile: isSynth ? snapshot.soundProfile : null,
            padSnapshots: isSynth ? null : snapshot.padSnapshots,
            renderMode: isSynth ? (snapshot.renderMode || 'native') : undefined,
        };

        this.patterns[patternName] = patternData;
        this.saveAll();
        this.updatePatternList();
        this.currentPatternName = patternName;

        if (window.ClipFreezer) {
            try {
                window.ClipFreezer.invalidateByPatternName(
                    patternName,
                    this.app.project?.bpm || 120
                );
            } catch (err) {
                console.warn('Freezer invalidation failed on save:', err);
            }
        }

        alert(`✓ ${isSynth ? 'Synth' : 'Drum'} pattern "${patternName}" saved!`);
    }

    load(name) {
        if (!name || !this.patterns[name]) return;
        const pattern = this.patterns[name];
        this.currentPatternName = name;

        const isSynth = pattern.kind === 'synth';
        const seq = isSynth ? this.app.synthSequencer : this.app.sequencer;
        if (!seq) return;

        const modeTarget = isSynth ? 'synthseq' : 'sequencer';
        if (this.app.currentMode !== modeTarget) {
            const btn = Array.from(document.querySelectorAll('.menu-btn'))
                .find(b => b.innerText.toLowerCase().includes(isSynth ? 'synth' : 'sequencer'));
            this.app.setMode(modeTarget, btn || null);
        }

        if (typeof seq.applySnapshot === 'function') {
            seq.applySnapshot(pattern);
        } else {
            console.warn('Sequencer does not expose applySnapshot()');
        }

        document.getElementById('pattern-name').value = name;

        if (this.app.project && pattern.bpm && pattern.bpm !== this.app.project.bpm) {
            this._suspendBpmRescale = true;
            try {
                this.app.project.setBPM(pattern.bpm);
            } finally {
                this._suspendBpmRescale = false;
            }
        }

        this.updatePatternInfo();
    }
    delete(name = null) {
        const select = document.getElementById('pattern-list');
        const patternName = name || (select ? select.value : '');
        if (!patternName) return;
        if (!this.patterns[patternName]) {
            this.updatePatternList();
            return;
        }

        const kind = this.patterns[patternName].kind || 'drums';
        const label = kind === 'synth' ? 'synth pattern' : 'drum pattern';
        if (!confirm(`Delete ${label} "${patternName}"?`)) return;

        delete this.patterns[patternName];

        if (patternName === this.currentPatternName) {
            this.currentPatternName = '';
            const nameField = document.getElementById('pattern-name');
            if (nameField) nameField.value = '';
        }

        this.saveAll();
        this.updatePatternList();
        this.updatePatternInfo();
    }

    deleteSelected() {
        const select = document.getElementById('pattern-list');
        const name = select?.value || '';
        if (!name) {
            alert('Select a pattern to delete.');
            return;
        }
        this.delete(name);
    }

    clear() {
        const seq = this._activeSequencer();
        if (!seq) return;
        const kind = this._activeKind();
        if (!confirm(`Clear all steps in current ${kind} pattern?`)) return;
        const rows = seq.pattern.length;
        seq.pattern = new Array(rows).fill(null).map(() => new Array(seq.steps).fill(false));
        seq.render();
        this.updatePatternInfo();
    }


    export(name = null) {
        const patternName = name || this.currentPatternName;
        const pattern = this.patterns[patternName] || {
            name: patternName,
            kind: this._activeKind(),
            bpm: this.app.project?.bpm || 120,
            grid: this._activeSequencer()?.pattern,
        };
        const dataStr = JSON.stringify(pattern, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download',
            `${patternName.replace(/[^a-z0-9]/gi, '_')}_pattern.json`);
        linkElement.click();
    }

    import(fileInput) {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const pattern = JSON.parse(e.target.result);
                if (!pattern.grid || !Array.isArray(pattern.grid)) {
                    throw new Error('Invalid pattern format');
                }
                if (!pattern.kind) pattern.kind = 'drums';
                const name = pattern.name || `Imported_${Date.now()}`;
                this.patterns[name] = pattern;
                this.saveAll();
                this.updatePatternList();
                this.load(name);
                alert(`✓ ${pattern.kind} pattern "${name}" imported!`);
            } catch (err) {
                alert('Error importing pattern: ' + err.message);
            }
        };
        reader.readAsText(file);
        fileInput.value = '';
    }


    loadAll() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            return stored ? JSON.parse(stored) : {};
        } catch (e) {
            return {};
        }
    }

    saveAll() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.patterns));
        } catch (e) {
            console.error('Could not save patterns:', e);
            if (e && e.name === 'QuotaExceededError') {
                alert('Storage is full. Delete some patterns and try again.');
            }
        }
    }

    updatePatternList() {
        const select = document.getElementById('pattern-list');
        if (!select) return;

        select.innerHTML = '<option value="">-- Load --</option>';

        const drums = [];
        const synth = [];
        Object.keys(this.patterns).sort().forEach(name => {
            const p = this.patterns[name];
            (p.kind === 'synth' ? synth : drums).push(name);
        });

        const addGroup = (label, names) => {
            if (names.length === 0) return;
            const group = document.createElement('optgroup');
            group.label = label;
            names.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                group.appendChild(opt);
            });
            select.appendChild(group);
        };

        addGroup('Drum Patterns', drums);
        addGroup('Synth Patterns', synth);

        select.value = '';
        if (this.patterns[this.currentPatternName]) {
            select.value = this.currentPatternName;
        }
    }

    updatePatternInfo() {
        const info = document.getElementById('pattern-info');
        const badge = document.getElementById('pattern-kind-badge');
        const seq = this._activeSequencer();
        if (!seq) return;
        const kind = this._activeKind();


        if (!info) return;
        const steps = seq.steps;
        const bpm = this.app.project?.bpm || 120;
        const rows = seq.pattern.length;
        let activeSteps = 0;
        for (let r = 0; r < rows; r++) {
            for (let s = 0; s < steps; s++) {
                const norm = seq._normStep(seq.pattern[r][s]);
                if (norm.active) activeSteps++;
            }
        }
    }

    patternsFor(mode) {
        const out = [];
        Object.keys(this.patterns).forEach(name => {
            const p = this.patterns[name];
            const kind = p.kind || 'drums';
            if (mode === 'wav' && kind === 'synth') return;
            out.push({ name, ...p });
        });
        return out;
    }
}

window.PatternManager = PatternManager;