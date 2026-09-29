(function () {
    'use strict';

    const DRUM_ROLE_MAP = {
        kick:       0,
        snare:      1,
        clap:       2,
        hatClosed:  3,
        hatOpen:    4,
        ride:       5,
        tom:        6,
        crash:      7,
    };

    function resolveRole(roleName, drumPads) {
        if (Array.isArray(drumPads)) {
            for (let i = 0; i < drumPads.length; i++) {
                if (drumPads[i]?.role === roleName) return i;
            }
        }
        return DRUM_ROLE_MAP[roleName] ?? -1;
    }

    const ROLE_LABELS = {
        kick: 'Kick', snare: 'Snare', clap: 'Clap',
        hatClosed: 'Closed Hat', hatOpen: 'Open Hat',
        ride: 'Ride', tom: 'Tom', crash: 'Crash',
    };

    // --- Harmonic presets (reused across genres) ---
    const HARMONY = {
        // 4-chord loop types. `degree` = scale degree (0-indexed)
        // `type` = chord name from synthSequencer.chordTypes
        minorPop: [
            { degree: 0, type: 'Minor 7',    beats: 4 },
            { degree: 5, type: 'Major 7',    beats: 4 },
            { degree: 3, type: 'Major 7',    beats: 4 },
            { degree: 4, type: 'Minor 7',    beats: 4 },
        ],
        minorDeep: [
            { degree: 0, type: 'Minor 9',    beats: 4 },
            { degree: 3, type: 'Major 7',    beats: 4 },
            { degree: 5, type: 'Major 9',    beats: 4 },
            { degree: 6, type: 'Dominant 7', beats: 4 },
        ],
        minorEpic: [
            { degree: 0, type: 'Minor',      beats: 4 },
            { degree: 5, type: 'Major',      beats: 4 },
            { degree: 2, type: 'Major',      beats: 4 },
            { degree: 6, type: 'Major',      beats: 4 },
        ],
        majorPop: [
            { degree: 0, type: 'Major 7',    beats: 4 },
            { degree: 4, type: 'Major 7',    beats: 4 },
            { degree: 5, type: 'Minor 7',    beats: 4 },
            { degree: 3, type: 'Major 7',    beats: 4 },
        ],
        majorClassic: [
            { degree: 0, type: 'Major',      beats: 4 },
            { degree: 5, type: 'Minor',      beats: 4 },
            { degree: 3, type: 'Major',      beats: 4 },
            { degree: 4, type: 'Dominant 7', beats: 4 },
        ],
        jazz2_5_1: [
            { degree: 1, type: 'Minor 7',    beats: 4 },
            { degree: 4, type: 'Dominant 7', beats: 4 },
            { degree: 0, type: 'Major 7',    beats: 4 },
            { degree: 5, type: 'Major 7',    beats: 4 },
        ],
        modalDorian: [
            { degree: 0, type: 'Minor 7',    beats: 8 },
            { degree: 3, type: 'Major 7',    beats: 8 },
        ],
        ambient: [
            { degree: 0, type: 'Major 9',    beats: 16 },
        ],
    };

    const GENRES = {

        house: {
            label: 'House', category: 'Electronic',
            bpmRange: [118, 128], swing: 0,
            roles: {
                kick:      { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                snare:     { primary: [4, 12], optional: [0, 8], fill: 0.05 },
                clap:      { primary: [4, 12], optional: [7, 15], fill: 0.15 },
                hatClosed: { primary: [2, 6, 10, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.35 },
                hatOpen:   { primary: [2, 6, 10, 14], optional: [], fill: 0 },
                ride:      { primary: [], optional: [0, 4, 8, 12], fill: 0.1 },
                tom:       { primary: [], optional: [], fill: 0 },
                crash:     { primary: [0], optional: [8], fill: 0.1 },
            },
            harmonic: {
                scale: 'natural_minor', progression: HARMONY.minorPop,
                bassStyle: 'root-fifth', melodyStyle: 'pentatonic',
                melodyDensity: 0.30, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: true,
            },
        },

        deepHouse: {
            label: 'Deep House', category: 'Electronic',
            bpmRange: [110, 122], swing: 0.08,
            roles: {
                kick:      { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                snare:     { primary: [], optional: [4, 12], fill: 0.4 },
                clap:      { primary: [4, 12], optional: [], fill: 0 },
                hatClosed: { primary: [2, 6, 10, 14], optional: [1,5,9,13], fill: 0.25 },
                hatOpen:   { primary: [2, 6, 10, 14], optional: [], fill: 0 },
                ride:      { primary: [], optional: [3, 11], fill: 0.2 },
                tom:       { primary: [], optional: [7, 15], fill: 0.1 },
                crash:     { primary: [0], optional: [], fill: 0 },
            },
            harmonic: {
                scale: 'dorian', progression: HARMONY.minorDeep,
                bassStyle: 'root-fifth', melodyStyle: 'pentatonic',
                melodyDensity: 0.25, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: true,
            },
        },

        techno: {
            label: 'Techno', category: 'Electronic',
            bpmRange: [125, 140], swing: 0,
            roles: {
                kick:      { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                snare:     { primary: [], optional: [4, 12], fill: 0.15 },
                clap:      { primary: [4, 12], optional: [7, 15], fill: 0.2 },
                hatClosed: { primary: [2, 6, 10, 14], optional: [0,4,8,12], fill: 0.3 },
                hatOpen:   { primary: [], optional: [6, 14], fill: 0.3 },
                ride:      { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                tom:       { primary: [], optional: [3, 11], fill: 0.25 },
                crash:     { primary: [], optional: [0, 8], fill: 0.3 },
            },
            harmonic: {
                scale: 'natural_minor', progression: HARMONY.modalDorian,
                bassStyle: 'octave', melodyStyle: 'scale',
                melodyDensity: 0.15, melodyOctave: 5,
                bassOctave: 2, chordOctave: 3, useSeventhChords: false,
            },
        },

        trance: {
            label: 'Trance', category: 'Electronic',
            bpmRange: [128, 140], swing: 0,
            roles: {
                kick:      { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                snare:     { primary: [], optional: [4, 12], fill: 0.1 },
                clap:      { primary: [4, 12], optional: [], fill: 0 },
                hatClosed: { primary: [2, 6, 10, 14], optional: [0,4,8,12], fill: 0.4 },
                hatOpen:   { primary: [2, 6, 10, 14], optional: [], fill: 0 },
                ride:      { primary: [], optional: [0, 8], fill: 0.15 },
                tom:       { primary: [], optional: [14, 15], fill: 0.25 },
                crash:     { primary: [0], optional: [8], fill: 0.2 },
            },
            harmonic: {
                scale: 'natural_minor', progression: HARMONY.minorEpic,
                bassStyle: 'octave', melodyStyle: 'scale',
                melodyDensity: 0.45, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: false,
            },
        },

        progressiveHouse: {
            label: 'Progressive House', category: 'Electronic',
            bpmRange: [120, 130], swing: 0,
            roles: {
                kick:      { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                snare:     { primary: [], optional: [4, 12], fill: 0.2 },
                clap:      { primary: [4, 12], optional: [7, 15], fill: 0.25 },
                hatClosed: { primary: [2, 6, 10, 14], optional: [1,5,9,13], fill: 0.3 },
                hatOpen:   { primary: [2, 6, 10, 14], optional: [], fill: 0 },
                ride:      { primary: [], optional: [0, 4, 8, 12], fill: 0.15 },
                tom:       { primary: [], optional: [], fill: 0 },
                crash:     { primary: [0], optional: [8], fill: 0.15 },
            },
            harmonic: {
                scale: 'natural_minor', progression: HARMONY.minorEpic,
                bassStyle: 'root-fifth', melodyStyle: 'scale',
                melodyDensity: 0.35, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: true,
            },
        },

        electro: {
            label: 'Electro', category: 'Electronic',
            bpmRange: [125, 140], swing: 0,
            roles: {
                kick:      { primary: [0, 3, 8, 11], optional: [6, 14], fill: 0.3 },
                snare:     { primary: [4, 12], optional: [], fill: 0 },
                clap:      { primary: [4, 12], optional: [], fill: 0 },
                hatClosed: { primary: [2, 6, 10, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.35 },
                hatOpen:   { primary: [], optional: [6, 14], fill: 0.4 },
                ride:      { primary: [], optional: [], fill: 0 },
                tom:       { primary: [], optional: [7, 15], fill: 0.3 },
                crash:     { primary: [], optional: [0], fill: 0.3 },
            },
            harmonic: {
                scale: 'phrygian', progression: HARMONY.modalDorian,
                bassStyle: 'root-fifth', melodyStyle: 'scale',
                melodyDensity: 0.25, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: false,
            },
        },

        dubstep: {
            label: 'Dubstep', category: 'Electronic',
            bpmRange: [138, 145], swing: 0,
            roles: {
                kick:      { primary: [0, 10], optional: [], fill: 0 },
                snare:     { primary: [8], optional: [4], fill: 0.15 },
                clap:      { primary: [], optional: [8], fill: 0.3 },
                hatClosed: { primary: [2, 6, 10, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.25 },
                hatOpen:   { primary: [], optional: [6, 14], fill: 0.4 },
                ride:      { primary: [], optional: [], fill: 0 },
                tom:       { primary: [], optional: [], fill: 0 },
                crash:     { primary: [0], optional: [], fill: 0 },
            },
            harmonic: {
                scale: 'natural_minor', progression: HARMONY.minorEpic,
                bassStyle: 'octave', melodyStyle: 'pentatonic',
                melodyDensity: 0.20, melodyOctave: 5,
                bassOctave: 1, chordOctave: 3, useSeventhChords: false,
            },
        },

        drumAndBass: {
            label: 'Drum and Bass', category: 'Electronic',
            bpmRange: [170, 180], swing: 0,
            roles: {
                kick:      { primary: [0, 10], optional: [4, 12], fill: 0.2 },
                snare:     { primary: [4, 12], optional: [7, 15], fill: 0.3 },
                clap:      { primary: [], optional: [12], fill: 0.2 },
                hatClosed: { primary: [2, 6, 10, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.35 },
                hatOpen:   { primary: [], optional: [6, 14], fill: 0.4 },
                ride:      { primary: [], optional: [0, 8], fill: 0.25 },
                tom:       { primary: [], optional: [], fill: 0 },
                crash:     { primary: [0], optional: [8], fill: 0.15 },
            },
            harmonic: {
                scale: 'dorian', progression: HARMONY.minorDeep,
                bassStyle: 'root-fifth', melodyStyle: 'pentatonic',
                melodyDensity: 0.25, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: true,
            },
        },

        jungle: {
            label: 'Jungle', category: 'Electronic',
            bpmRange: [160, 175], swing: 0,
            roles: {
                kick:      { primary: [0, 10], optional: [3, 6, 13], fill: 0.35 },
                snare:     { primary: [4, 12], optional: [6, 14], fill: 0.35 },
                clap:      { primary: [], optional: [4, 12], fill: 0.3 },
                hatClosed: { primary: [2, 6, 10, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.4 },
                hatOpen:   { primary: [], optional: [7, 15], fill: 0.3 },
                ride:      { primary: [], optional: [], fill: 0 },
                tom:       { primary: [], optional: [7, 15], fill: 0.4 },
                crash:     { primary: [], optional: [0], fill: 0.4 },
            },
            harmonic: {
                scale: 'dorian', progression: HARMONY.minorDeep,
                bassStyle: 'root-fifth', melodyStyle: 'pentatonic',
                melodyDensity: 0.30, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: true,
            },
        },

        ambient: {
            label: 'Ambient', category: 'Electronic',
            bpmRange: [70, 100], swing: 0,
            roles: {
                kick:      { primary: [], optional: [0, 8], fill: 0.3 },
                snare:     { primary: [], optional: [], fill: 0 },
                clap:      { primary: [], optional: [], fill: 0 },
                hatClosed: { primary: [], optional: [2, 6, 10, 14], fill: 0.15 },
                hatOpen:   { primary: [], optional: [4, 12], fill: 0.2 },
                ride:      { primary: [], optional: [0, 8], fill: 0.15 },
                tom:       { primary: [], optional: [], fill: 0 },
                crash:     { primary: [], optional: [0, 8], fill: 0.2 },
            },
            harmonic: {
                scale: 'lydian', progression: HARMONY.ambient,
                bassStyle: 'root', melodyStyle: 'scale',
                melodyDensity: 0.15, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: true,
            },
        },

        boomBap: {
            label: 'Boom Bap', category: 'Hip-Hop',
            bpmRange: [85, 95], swing: 0.2,
            roles: {
                kick:      { primary: [0, 6, 10], optional: [3, 8], fill: 0.25 },
                snare:     { primary: [4, 12], optional: [7, 15], fill: 0.2 },
                clap:      { primary: [], optional: [4, 12], fill: 0.3 },
                hatClosed: { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.3 },
                hatOpen:   { primary: [], optional: [2, 10], fill: 0.35 },
                ride:      { primary: [], optional: [], fill: 0 },
                tom:       { primary: [], optional: [13, 14], fill: 0.3 },
                crash:     { primary: [0], optional: [], fill: 0 },
            },
            harmonic: {
                scale: 'natural_minor', progression: HARMONY.jazz2_5_1,
                bassStyle: 'walking', melodyStyle: 'pentatonic',
                melodyDensity: 0.25, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: true,
            },
        },

        trap: {
            label: 'Trap', category: 'Hip-Hop',
            bpmRange: [130, 150], swing: 0,
            roles: {
                kick:      { primary: [0, 6], optional: [10], fill: 0.15 },
                snare:     { primary: [4, 12], optional: [], fill: 0 },
                clap:      { primary: [], optional: [4, 12], fill: 0.6 },
                hatClosed: { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.45 },
                hatOpen:   { primary: [], optional: [6, 14], fill: 0.35 },
                ride:      { primary: [], optional: [], fill: 0 },
                tom:       { primary: [], optional: [15], fill: 0.4 },
                crash:     { primary: [], optional: [0], fill: 0.3 },
            },
            harmonic: {
                scale: 'natural_minor', progression: HARMONY.minorPop,
                bassStyle: 'octave', melodyStyle: 'pentatonic',
                melodyDensity: 0.35, melodyOctave: 5,
                bassOctave: 1, chordOctave: 4, useSeventhChords: false,
            },
        },

        drill: {
            label: 'Drill', category: 'Hip-Hop',
            bpmRange: [138, 145], swing: 0,
            roles: {
                kick:      { primary: [0, 6, 10], optional: [3, 11], fill: 0.4 },
                snare:     { primary: [8], optional: [4], fill: 0.3 },
                clap:      { primary: [], optional: [8], fill: 0.4 },
                hatClosed: { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.4 },
                hatOpen:   { primary: [], optional: [3, 11], fill: 0.3 },
                ride:      { primary: [], optional: [], fill: 0 },
                tom:       { primary: [], optional: [], fill: 0 },
                crash:     { primary: [], optional: [0], fill: 0.25 },
            },
            harmonic: {
                scale: 'harmonic_minor', progression: HARMONY.minorEpic,
                bassStyle: 'root', melodyStyle: 'scale',
                melodyDensity: 0.25, melodyOctave: 5,
                bassOctave: 1, chordOctave: 4, useSeventhChords: false,
            },
        },

        loFi: {
            label: 'Lo-Fi Hip-Hop', category: 'Hip-Hop',
            bpmRange: [70, 90], swing: 0.25,
            roles: {
                kick:      { primary: [0, 7, 10], optional: [4], fill: 0.15 },
                snare:     { primary: [4, 12], optional: [], fill: 0 },
                clap:      { primary: [], optional: [], fill: 0 },
                hatClosed: { primary: [0, 4, 8, 12], optional: [2,6,10,14], fill: 0.4 },
                hatOpen:   { primary: [], optional: [7, 15], fill: 0.2 },
                ride:      { primary: [], optional: [2, 10], fill: 0.15 },
                tom:       { primary: [], optional: [], fill: 0 },
                crash:     { primary: [], optional: [0], fill: 0.2 },
            },
            harmonic: {
                scale: 'dorian', progression: HARMONY.jazz2_5_1,
                bassStyle: 'root-fifth', melodyStyle: 'pentatonic',
                melodyDensity: 0.20, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: true,
            },
        },

        neoSoul: {
            label: 'Neo Soul', category: 'R&B',
            bpmRange: [70, 90], swing: 0.3,
            roles: {
                kick:      { primary: [0, 6, 10], optional: [3, 14], fill: 0.2 },
                snare:     { primary: [4, 12], optional: [7, 15], fill: 0.15 },
                clap:      { primary: [], optional: [], fill: 0 },
                hatClosed: { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.35 },
                hatOpen:   { primary: [], optional: [7, 15], fill: 0.3 },
                ride:      { primary: [], optional: [], fill: 0 },
                tom:       { primary: [], optional: [], fill: 0 },
                crash:     { primary: [], optional: [0], fill: 0.15 },
            },
            harmonic: {
                scale: 'dorian', progression: HARMONY.jazz2_5_1,
                bassStyle: 'walking', melodyStyle: 'scale',
                melodyDensity: 0.30, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: true,
            },
        },

        pop: {
            label: 'Pop', category: 'Pop',
            bpmRange: [100, 130], swing: 0,
            roles: {
                kick:      { primary: [0, 8], optional: [4, 12], fill: 0.15 },
                snare:     { primary: [4, 12], optional: [], fill: 0 },
                clap:      { primary: [4, 12], optional: [], fill: 0 },
                hatClosed: { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [], fill: 0.15 },
                hatOpen:   { primary: [], optional: [6, 14], fill: 0.25 },
                ride:      { primary: [], optional: [], fill: 0 },
                tom:       { primary: [], optional: [], fill: 0 },
                crash:     { primary: [0], optional: [], fill: 0 },
            },
            harmonic: {
                scale: 'major', progression: HARMONY.majorPop,
                bassStyle: 'root', melodyStyle: 'scale',
                melodyDensity: 0.35, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: true,
            },
        },

        rock: {
            label: 'Rock', category: 'Rock',
            bpmRange: [110, 140], swing: 0,
            roles: {
                kick:      { primary: [0, 8], optional: [6, 10], fill: 0.2 },
                snare:     { primary: [4, 12], optional: [], fill: 0 },
                clap:      { primary: [], optional: [], fill: 0 },
                hatClosed: { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [], fill: 0.1 },
                hatOpen:   { primary: [], optional: [6, 14], fill: 0.25 },
                ride:      { primary: [], optional: [0, 4, 8, 12], fill: 0.2 },
                tom:       { primary: [], optional: [14, 15], fill: 0.35 },
                crash:     { primary: [0], optional: [8], fill: 0.15 },
            },
            harmonic: {
                scale: 'major', progression: HARMONY.majorClassic,
                bassStyle: 'root-fifth', melodyStyle: 'pentatonic',
                melodyDensity: 0.30, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: false,
            },
        },

        funk: {
            label: 'Funk', category: 'Funk',
            bpmRange: [95, 115], swing: 0.1,
            roles: {
                kick:      { primary: [0, 6, 10], optional: [4, 8], fill: 0.2 },
                snare:     { primary: [4, 12], optional: [7, 15], fill: 0.2 },
                clap:      { primary: [], optional: [], fill: 0 },
                hatClosed: { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.35 },
                hatOpen:   { primary: [], optional: [2, 10], fill: 0.3 },
                ride:      { primary: [], optional: [4, 12], fill: 0.25 },
                tom:       { primary: [], optional: [13, 15], fill: 0.3 },
                crash:     { primary: [], optional: [0], fill: 0.15 },
            },
            harmonic: {
                scale: 'dorian', progression: HARMONY.minorDeep,
                bassStyle: 'walking', melodyStyle: 'pentatonic',
                melodyDensity: 0.35, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: true,
            },
        },

        jazz: {
            label: 'Jazz', category: 'Jazz',
            bpmRange: [90, 140], swing: 0.3,
            roles: {
                kick:      { primary: [0, 8], optional: [10], fill: 0.2 },
                snare:     { primary: [], optional: [4, 12], fill: 0.3 },
                clap:      { primary: [], optional: [], fill: 0 },
                hatClosed: { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [], fill: 0.15 },
                hatOpen:   { primary: [], optional: [2, 10], fill: 0.2 },
                ride:      { primary: [0, 4, 8, 12], optional: [2, 6, 10, 14], fill: 0.3 },
                tom:       { primary: [], optional: [], fill: 0 },
                crash:     { primary: [], optional: [0], fill: 0.15 },
            },
            harmonic: {
                scale: 'dorian', progression: HARMONY.jazz2_5_1,
                bassStyle: 'walking', melodyStyle: 'scale',
                melodyDensity: 0.40, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: true,
            },
        },

        blues: {
            label: 'Blues', category: 'Blues',
            bpmRange: [70, 110], swing: 0.25,
            roles: {
                kick:      { primary: [0, 6, 8, 14], optional: [10], fill: 0.2 },
                snare:     { primary: [4, 12], optional: [], fill: 0 },
                clap:      { primary: [], optional: [], fill: 0 },
                hatClosed: { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [], fill: 0.15 },
                hatOpen:   { primary: [], optional: [6, 14], fill: 0.2 },
                ride:      { primary: [], optional: [4, 12], fill: 0.15 },
                tom:       { primary: [], optional: [], fill: 0 },
                crash:     { primary: [0], optional: [], fill: 0 },
            },
            harmonic: {
                scale: 'blues', progression: HARMONY.majorClassic,
                bassStyle: 'walking', melodyStyle: 'pentatonic',
                melodyDensity: 0.35, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: true,
            },
        },

        cinematic: {
            label: 'Cinematic', category: 'Orchestral',
            bpmRange: [60, 100], swing: 0,
            roles: {
                kick:      { primary: [0, 8], optional: [], fill: 0 },
                snare:     { primary: [], optional: [12], fill: 0.15 },
                clap:      { primary: [], optional: [], fill: 0 },
                hatClosed: { primary: [], optional: [4, 12], fill: 0.15 },
                hatOpen:   { primary: [], optional: [], fill: 0 },
                ride:      { primary: [], optional: [0, 8], fill: 0.15 },
                tom:       { primary: [0, 4, 8, 12], optional: [], fill: 0.2 },
                crash:     { primary: [], optional: [0, 8], fill: 0.35 },
            },
            harmonic: {
                scale: 'natural_minor', progression: HARMONY.minorEpic,
                bassStyle: 'root', melodyStyle: 'scale',
                melodyDensity: 0.20, melodyOctave: 5,
                bassOctave: 2, chordOctave: 4, useSeventhChords: false,
            },
        },
    };

    function getGenre(id) {
        return GENRES[id] || null;
    }

    function list() {
        return Object.keys(GENRES).map(id => ({
            id,
            label: GENRES[id].label,
            category: GENRES[id].category,
        }));
    }

    function populateGenreSelect(selectEl) {
        if (!selectEl) return;
        const byCategory = {};
        list().forEach(g => {
            (byCategory[g.category] = byCategory[g.category] || []).push(g);
        });

        selectEl.innerHTML = '';
        Object.keys(byCategory).forEach(cat => {
            const group = document.createElement('optgroup');
            group.label = cat;
            byCategory[cat].forEach(g => {
                const opt = document.createElement('option');
                opt.value = g.id;
                opt.textContent = g.label;
                group.appendChild(opt);
            });
            selectEl.appendChild(group);
        });
    }

    window.Genres = {
        GENRES,
        HARMONY,
        DRUM_ROLE_MAP,
        ROLE_LABELS,
        getGenre,
        list,
        populateGenreSelect,
        resolveRole,
    };
})();