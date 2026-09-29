(function () {
    'use strict';

    const SCALES = {
        major:          [0, 2, 4, 5, 7, 9, 11],
        natural_minor:  [0, 2, 3, 5, 7, 8, 10],
        minor:          [0, 2, 3, 5, 7, 8, 10],
        harmonic_minor: [0, 2, 3, 5, 7, 8, 11],
        melodic_minor:  [0, 2, 3, 5, 7, 9, 11],
        dorian:         [0, 2, 3, 5, 7, 9, 10],
        phrygian:       [0, 1, 3, 5, 7, 8, 10],
        lydian:         [0, 2, 4, 6, 7, 9, 11],
        mixolydian:     [0, 2, 4, 5, 7, 9, 10],
        locrian:        [0, 1, 3, 5, 6, 8, 10],
        major_pentatonic:    [0, 2, 4, 7, 9],
        minor_pentatonic:    [0, 3, 5, 7, 10],
        blues:          [0, 3, 5, 6, 7, 10],
        chromatic:      [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    };

    const NOTE_TO_PC = {
        'C': 0, 'C#': 1, 'Db': 1,
        'D': 2, 'D#': 3, 'Eb': 3,
        'E': 4, 'Fb': 4, 'E#': 5,
        'F': 5, 'F#': 6, 'Gb': 6,
        'G': 7, 'G#': 8, 'Ab': 8,
        'A': 9, 'A#': 10, 'Bb': 10,
        'B': 11, 'Cb': 11,
    };

    function keyToPitchClass(key) {
        return NOTE_TO_PC[key] ?? 0;
    }

    function scaleSteps(scaleName) {
        return SCALES[scaleName] || SCALES.major;
    }

    function isNoteInScale(midi, key, scale) {
        const root = keyToPitchClass(key);
        const steps = scaleSteps(scale);
        const pc = ((midi % 12) + 12) % 12;
        const offset = ((pc - root) % 12 + 12) % 12;
        return steps.includes(offset);
    }

    function snapToScale(midi, key, scale) {
        if (isNoteInScale(midi, key, scale)) return midi;
        
        for (let d = 1; d <= 6; d++) {
            if (isNoteInScale(midi - d, key, scale)) return midi - d;
            if (isNoteInScale(midi + d, key, scale)) return midi + d;
        }
        return midi;
    }

    function notesInScale(lowMidi, highMidi, key, scale) {
        const out = [];
        for (let m = lowMidi; m <= highMidi; m++) {
            if (isNoteInScale(m, key, scale)) out.push(m);
        }
        return out;
    }

    function scaleDegree(midi, key, scale) {
        const root = keyToPitchClass(key);
        const steps = scaleSteps(scale);
        const pc = ((midi % 12) + 12) % 12;
        const offset = ((pc - root) % 12 + 12) % 12;
        return steps.indexOf(offset);
    }

    function midiFromDegree(degree, key, scale, octave = 4) {
        const root = keyToPitchClass(key);
        const steps = scaleSteps(scale);
        const n = steps.length;
        const safeDegree = ((degree % n) + n) % n;
        const octaveShift = Math.floor(degree / n);
        const rootMidi = (octave + 1) * 12 + root;
        return rootMidi + octaveShift * 12 + steps[safeDegree];
    }

    window.MusicTheory = {
        SCALES,
        NOTE_TO_PC,
        keyToPitchClass,
        scaleSteps,
        isNoteInScale,
        snapToScale,
        notesInScale,
        scaleDegree,
        midiFromDegree,
    };
})();