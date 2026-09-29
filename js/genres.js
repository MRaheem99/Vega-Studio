
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
        kick: 'Kick',
        snare: 'Snare',
        clap: 'Clap',
        hatClosed: 'Closed Hat',
        hatOpen: 'Open Hat',
        ride: 'Ride',
        tom: 'Tom',
        crash: 'Crash',
    };

    const GENRES = {

        house: {
            label: 'House',
            category: 'Electronic',
            bpmRange: [118, 128],
            swing: 0,
            roles: {
                kick:       { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                snare:      { primary: [4, 12], optional: [0, 8], fill: 0.05 },
                clap:       { primary: [4, 12], optional: [7, 15], fill: 0.15 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.35 },
                hatOpen:    { primary: [2, 6, 10, 14], optional: [], fill: 0 },
                ride:       { primary: [], optional: [0, 4, 8, 12], fill: 0.1 },
                tom:        { primary: [], optional: [], fill: 0 },
                crash:      { primary: [0], optional: [8], fill: 0.1 },
            },
        },

        deepHouse: {
            label: 'Deep House',
            category: 'Electronic',
            bpmRange: [110, 122],
            swing: 0.08,
            roles: {
                kick:       { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                snare:      { primary: [], optional: [4, 12], fill: 0.4 },
                clap:       { primary: [4, 12], optional: [], fill: 0 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [1,5,9,13], fill: 0.25 },
                hatOpen:    { primary: [2, 6, 10, 14], optional: [], fill: 0 },
                ride:       { primary: [], optional: [3, 11], fill: 0.2 },
                tom:        { primary: [], optional: [7, 15], fill: 0.1 },
                crash:      { primary: [0], optional: [], fill: 0 },
            },
        },

        techno: {
            label: 'Techno',
            category: 'Electronic',
            bpmRange: [125, 140],
            swing: 0,
            roles: {
                kick:       { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                snare:      { primary: [], optional: [4, 12], fill: 0.15 },
                clap:       { primary: [4, 12], optional: [7, 15], fill: 0.2 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [0,4,8,12], fill: 0.3 },
                hatOpen:    { primary: [], optional: [6, 14], fill: 0.3 },
                ride:       { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                tom:        { primary: [], optional: [3, 11], fill: 0.25 },
                crash:      { primary: [], optional: [0, 8], fill: 0.3 },
            },
        },

        trance: {
            label: 'Trance',
            category: 'Electronic',
            bpmRange: [128, 140],
            swing: 0,
            roles: {
                kick:       { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                snare:      { primary: [], optional: [4, 12], fill: 0.1 },
                clap:       { primary: [4, 12], optional: [], fill: 0 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [0,4,8,12], fill: 0.4 },
                hatOpen:    { primary: [2, 6, 10, 14], optional: [], fill: 0 },
                ride:       { primary: [], optional: [0, 8], fill: 0.15 },
                tom:        { primary: [], optional: [14, 15], fill: 0.25 },
                crash:      { primary: [0], optional: [8], fill: 0.2 },
            },
        },

        progressiveHouse: {
            label: 'Progressive House',
            category: 'Electronic',
            bpmRange: [120, 130],
            swing: 0,
            roles: {
                kick:       { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                snare:      { primary: [], optional: [4, 12], fill: 0.2 },
                clap:       { primary: [4, 12], optional: [7, 15], fill: 0.25 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [1,5,9,13], fill: 0.3 },
                hatOpen:    { primary: [2, 6, 10, 14], optional: [], fill: 0 },
                ride:       { primary: [], optional: [0, 4, 8, 12], fill: 0.15 },
                tom:        { primary: [], optional: [], fill: 0 },
                crash:      { primary: [0], optional: [8], fill: 0.15 },
            },
        },

        electro: {
            label: 'Electro',
            category: 'Electronic',
            bpmRange: [125, 140],
            swing: 0,
            roles: {
                kick:       { primary: [0, 3, 8, 11], optional: [6, 14], fill: 0.3 },
                snare:      { primary: [4, 12], optional: [], fill: 0 },
                clap:       { primary: [4, 12], optional: [], fill: 0 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.35 },
                hatOpen:    { primary: [], optional: [6, 14], fill: 0.4 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [7, 15], fill: 0.3 },
                crash:      { primary: [], optional: [0], fill: 0.3 },
            },
        },

        dubstep: {
            label: 'Dubstep',
            category: 'Electronic',
            bpmRange: [138, 145],
            swing: 0,
            roles: {
                kick:       { primary: [0, 10], optional: [], fill: 0 },
                snare:      { primary: [8], optional: [4], fill: 0.15 },
                clap:       { primary: [], optional: [8], fill: 0.3 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.25 },
                hatOpen:    { primary: [], optional: [6, 14], fill: 0.4 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [], fill: 0 },
                crash:      { primary: [0], optional: [], fill: 0 },
            },
        },

        drumAndBass: {
            label: 'Drum and Bass',
            category: 'Electronic',
            bpmRange: [170, 180],
            swing: 0,
            roles: {
                kick:       { primary: [0, 10], optional: [4, 12], fill: 0.2 },
                snare:      { primary: [4, 12], optional: [7, 15], fill: 0.3 },
                clap:       { primary: [], optional: [12], fill: 0.2 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.35 },
                hatOpen:    { primary: [], optional: [6, 14], fill: 0.4 },
                ride:       { primary: [], optional: [0, 8], fill: 0.25 },
                tom:        { primary: [], optional: [], fill: 0 },
                crash:      { primary: [0], optional: [8], fill: 0.15 },
            },
        },

        jungle: {
            label: 'Jungle',
            category: 'Electronic',
            bpmRange: [160, 175],
            swing: 0,
            roles: {
                kick:       { primary: [0, 10], optional: [3, 6, 13], fill: 0.35 },
                snare:      { primary: [4, 12], optional: [6, 14], fill: 0.35 },
                clap:       { primary: [], optional: [4, 12], fill: 0.3 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.4 },
                hatOpen:    { primary: [], optional: [7, 15], fill: 0.3 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [7, 15], fill: 0.4 },
                crash:      { primary: [], optional: [0], fill: 0.4 },
            },
        },

        ambient: {
            label: 'Ambient',
            category: 'Electronic',
            bpmRange: [70, 100],
            swing: 0,
            roles: {
                kick:       { primary: [], optional: [0, 8], fill: 0.3 },
                snare:      { primary: [], optional: [], fill: 0 },
                clap:       { primary: [], optional: [], fill: 0 },
                hatClosed:  { primary: [], optional: [2, 6, 10, 14], fill: 0.15 },
                hatOpen:    { primary: [], optional: [4, 12], fill: 0.2 },
                ride:       { primary: [], optional: [0, 8], fill: 0.15 },
                tom:        { primary: [], optional: [], fill: 0 },
                crash:      { primary: [], optional: [0, 8], fill: 0.2 },
            },
        },

        boomBap: {
            label: 'Boom Bap',
            category: 'Hip-Hop',
            bpmRange: [85, 95],
            swing: 0.2,
            roles: {
                kick:       { primary: [0, 6, 10], optional: [3, 8], fill: 0.25 },
                snare:      { primary: [4, 12], optional: [7, 15], fill: 0.2 },
                clap:       { primary: [], optional: [4, 12], fill: 0.3 },
                hatClosed:  { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.3 },
                hatOpen:    { primary: [], optional: [2, 10], fill: 0.35 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [13, 14], fill: 0.3 },
                crash:      { primary: [0], optional: [], fill: 0 },
            },
        },

        trap: {
            label: 'Trap',
            category: 'Hip-Hop',
            bpmRange: [130, 150],
            swing: 0,
            roles: {
                kick:       { primary: [0, 6], optional: [10], fill: 0.15 },
                snare:      { primary: [4, 12], optional: [], fill: 0 },
                clap:       { primary: [], optional: [4, 12], fill: 0.6 },
                hatClosed:  { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.45 },
                hatOpen:    { primary: [], optional: [6, 14], fill: 0.35 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [15], fill: 0.4 },
                crash:      { primary: [], optional: [0], fill: 0.3 },
            },
        },

        drill: {
            label: 'Drill',
            category: 'Hip-Hop',
            bpmRange: [138, 145],
            swing: 0,
            roles: {
                kick:       { primary: [0, 6, 10], optional: [3, 11], fill: 0.4 },
                snare:      { primary: [8], optional: [4], fill: 0.3 },
                clap:       { primary: [], optional: [8], fill: 0.4 },
                hatClosed:  { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.4 },
                hatOpen:    { primary: [], optional: [3, 11], fill: 0.3 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [], fill: 0 },
                crash:      { primary: [], optional: [0], fill: 0.25 },
            },
        },

        loFi: {
            label: 'Lo-Fi Hip-Hop',
            category: 'Hip-Hop',
            bpmRange: [70, 90],
            swing: 0.25,
            roles: {
                kick:       { primary: [0, 7, 10], optional: [4], fill: 0.15 },
                snare:      { primary: [4, 12], optional: [], fill: 0 },
                clap:       { primary: [], optional: [], fill: 0 },
                hatClosed:  { primary: [0, 4, 8, 12], optional: [2,6,10,14], fill: 0.4 },
                hatOpen:    { primary: [], optional: [7, 15], fill: 0.2 },
                ride:       { primary: [], optional: [2, 10], fill: 0.15 },
                tom:        { primary: [], optional: [], fill: 0 },
                crash:      { primary: [], optional: [0], fill: 0.2 },
            },
        },

        neoSoul: {
            label: 'Neo Soul',
            category: 'R&B',
            bpmRange: [70, 90],
            swing: 0.3,
            roles: {
                kick:       { primary: [0, 6, 10], optional: [3, 14], fill: 0.2 },
                snare:      { primary: [4, 12], optional: [7, 15], fill: 0.15 },
                clap:       { primary: [], optional: [], fill: 0 },
                hatClosed:  { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.4 },
                hatOpen:    { primary: [], optional: [10], fill: 0.2 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [], fill: 0 },
                crash:      { primary: [], optional: [0], fill: 0.15 },
            },
        },

        rnb: {
            label: 'R&B',
            category: 'R&B',
            bpmRange: [90, 110],
            swing: 0.1,
            roles: {
                kick:       { primary: [0, 6, 8], optional: [10], fill: 0.2 },
                snare:      { primary: [4, 12], optional: [], fill: 0 },
                clap:       { primary: [4, 12], optional: [7, 15], fill: 0.2 },
                hatClosed:  { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.35 },
                hatOpen:    { primary: [], optional: [6, 14], fill: 0.2 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [], fill: 0 },
                crash:      { primary: [], optional: [0, 8], fill: 0.2 },
            },
        },

        afrobeat: {
            label: 'Afrobeat',
            category: 'World',
            bpmRange: [105, 120],
            swing: 0.1,
            roles: {
                kick:       { primary: [0, 3, 8, 11], optional: [6, 14], fill: 0.3 },
                snare:      { primary: [], optional: [4, 12], fill: 0.3 },
                clap:       { primary: [4, 12], optional: [2, 10], fill: 0.2 },
                hatClosed:  { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.5 },
                hatOpen:    { primary: [], optional: [6, 14], fill: 0.3 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [3, 7, 11, 15], optional: [], fill: 0 },
                crash:      { primary: [], optional: [0], fill: 0.2 },
            },
        },

        pop: {
            label: 'Pop',
            category: 'Pop/Rock',
            bpmRange: [100, 125],
            swing: 0,
            roles: {
                kick:       { primary: [0, 8], optional: [4, 12], fill: 0.3 },
                snare:      { primary: [4, 12], optional: [], fill: 0 },
                clap:       { primary: [], optional: [4, 12], fill: 0.4 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [0,4,8,12], fill: 0.4 },
                hatOpen:    { primary: [], optional: [6, 14], fill: 0.3 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [], fill: 0 },
                crash:      { primary: [0], optional: [8], fill: 0.15 },
            },
        },

        rock: {
            label: 'Rock',
            category: 'Pop/Rock',
            bpmRange: [100, 140],
            swing: 0,
            roles: {
                kick:       { primary: [0, 8], optional: [4, 10], fill: 0.35 },
                snare:      { primary: [4, 12], optional: [], fill: 0 },
                clap:       { primary: [], optional: [], fill: 0 },
                hatClosed:  { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [], fill: 0 },
                hatOpen:    { primary: [], optional: [6, 14], fill: 0.25 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [14, 15], fill: 0.3 },
                crash:      { primary: [0], optional: [8], fill: 0.2 },
            },
        },

        indieRock: {
            label: 'Indie Rock',
            category: 'Pop/Rock',
            bpmRange: [110, 135],
            swing: 0,
            roles: {
                kick:       { primary: [0, 6, 8], optional: [10], fill: 0.3 },
                snare:      { primary: [4, 12], optional: [7, 15], fill: 0.15 },
                clap:       { primary: [], optional: [], fill: 0 },
                hatClosed:  { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.2 },
                hatOpen:    { primary: [], optional: [14], fill: 0.2 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [14], fill: 0.25 },
                crash:      { primary: [0], optional: [], fill: 0 },
            },
        },

        punk: {
            label: 'Punk',
            category: 'Pop/Rock',
            bpmRange: [160, 200],
            swing: 0,
            roles: {
                kick:       { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                snare:      { primary: [4, 12], optional: [], fill: 0 },
                clap:       { primary: [], optional: [], fill: 0 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [], fill: 0 },
                hatOpen:    { primary: [], optional: [6, 14], fill: 0.3 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [14, 15], fill: 0.2 },
                crash:      { primary: [0], optional: [8], fill: 0.15 },
            },
        },

        metal: {
            label: 'Metal',
            category: 'Pop/Rock',
            bpmRange: [140, 200],
            swing: 0,
            roles: {
                kick:       { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [], fill: 0 },
                snare:      { primary: [4, 12], optional: [], fill: 0 },
                clap:       { primary: [], optional: [], fill: 0 },
                hatClosed:  { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [], fill: 0 },
                hatOpen:    { primary: [], optional: [], fill: 0 },
                ride:       { primary: [], optional: [0, 4, 8, 12], fill: 0.2 },
                tom:        { primary: [], optional: [14, 15], fill: 0.4 },
                crash:      { primary: [0], optional: [8], fill: 0.3 },
            },
        },

        funk: {
            label: 'Funk',
            category: 'Funk/Soul',
            bpmRange: [100, 120],
            swing: 0.1,
            roles: {
                kick:       { primary: [0, 7, 10], optional: [3, 6], fill: 0.35 },
                snare:      { primary: [4, 12], optional: [2, 10, 15], fill: 0.3 },
                clap:       { primary: [], optional: [4, 12], fill: 0.2 },
                hatClosed:  { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.4 },
                hatOpen:    { primary: [], optional: [6], fill: 0.4 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [7, 15], fill: 0.3 },
                crash:      { primary: [], optional: [0], fill: 0.25 },
            },
        },

        motown: {
            label: 'Motown',
            category: 'Funk/Soul',
            bpmRange: [110, 130],
            swing: 0.15,
            roles: {
                kick:       { primary: [0, 4, 8, 12], optional: [6], fill: 0.15 },
                snare:      { primary: [4, 12], optional: [], fill: 0 },
                clap:       { primary: [], optional: [], fill: 0 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [0,4,8,12], fill: 0.3 },
                hatOpen:    { primary: [], optional: [], fill: 0 },
                ride:       { primary: [], optional: [0, 4, 8, 12], fill: 0.25 },
                tom:        { primary: [], optional: [], fill: 0 },
                crash:      { primary: [], optional: [0], fill: 0.2 },
            },
        },

        disco: {
            label: 'Disco',
            category: 'Funk/Soul',
            bpmRange: [110, 130],
            swing: 0,
            roles: {
                kick:       { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                snare:      { primary: [], optional: [4, 12], fill: 0.5 },
                clap:       { primary: [4, 12], optional: [], fill: 0 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [], fill: 0 },
                hatOpen:    { primary: [2, 6, 10, 14], optional: [], fill: 0 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [7, 15], fill: 0.35 },
                crash:      { primary: [0], optional: [8], fill: 0.2 },
            },
        },

        gospel: {
            label: 'Gospel',
            category: 'Funk/Soul',
            bpmRange: [80, 110],
            swing: 0.2,
            roles: {
                kick:       { primary: [0, 6, 10], optional: [3, 12], fill: 0.25 },
                snare:      { primary: [4, 12], optional: [15], fill: 0.15 },
                clap:       { primary: [], optional: [4, 12], fill: 0.3 },
                hatClosed:  { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.4 },
                hatOpen:    { primary: [], optional: [6, 10], fill: 0.3 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [14, 15], fill: 0.4 },
                crash:      { primary: [], optional: [0, 8], fill: 0.25 },
            },
        },

        reggaeton: {
            label: 'Reggaeton',
            category: 'Latin/World',
            bpmRange: [90, 100],
            swing: 0,
            roles: {
                kick:       { primary: [0, 6, 10], optional: [3, 12], fill: 0.2 },
                snare:      { primary: [4, 12], optional: [], fill: 0 },
                clap:       { primary: [4, 12], optional: [7, 15], fill: 0.3 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [1,5,9,13], fill: 0.4 },
                hatOpen:    { primary: [], optional: [3, 11], fill: 0.3 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [], fill: 0 },
                crash:      { primary: [], optional: [0], fill: 0.15 },
            },
        },

        salsa: {
            label: 'Salsa',
            category: 'Latin/World',
            bpmRange: [150, 200],
            swing: 0,
            roles: {
                kick:       { primary: [0, 6, 10], optional: [3], fill: 0.2 },
                snare:      { primary: [], optional: [4, 12], fill: 0.3 },
                clap:       { primary: [4, 12], optional: [], fill: 0 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.4 },
                hatOpen:    { primary: [], optional: [], fill: 0 },
                ride:       { primary: [], optional: [0, 8], fill: 0.3 },
                tom:        { primary: [3, 7, 11, 15], optional: [], fill: 0 },
                crash:      { primary: [], optional: [0], fill: 0.15 },
            },
        },

        bossaNova: {
            label: 'Bossa Nova',
            category: 'Latin/World',
            bpmRange: [120, 140],
            swing: 0.1,
            roles: {
                kick:       { primary: [0, 6, 10], optional: [12], fill: 0.2 },
                snare:      { primary: [], optional: [4, 12], fill: 0.25 },
                clap:       { primary: [], optional: [], fill: 0 },
                hatClosed:  { primary: [2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.4 },
                hatOpen:    { primary: [], optional: [], fill: 0 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [], fill: 0 },
                crash:      { primary: [], optional: [0], fill: 0.15 },
            },
        },

        afroHouse: {
            label: 'Afro House',
            category: 'Latin/World',
            bpmRange: [118, 128],
            swing: 0.05,
            roles: {
                kick:       { primary: [0, 4, 8, 12], optional: [], fill: 0 },
                snare:      { primary: [], optional: [4, 12], fill: 0.3 },
                clap:       { primary: [4, 12], optional: [], fill: 0 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.4 },
                hatOpen:    { primary: [], optional: [6, 14], fill: 0.3 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [3, 7, 11, 15], optional: [1,5,9,13], fill: 0.4 },
                crash:      { primary: [0], optional: [], fill: 0 },
            },
        },

        cinematic: {
            label: 'Cinematic',
            category: 'Cinematic',
            bpmRange: [70, 100],
            swing: 0,
            roles: {
                kick:       { primary: [0, 6], optional: [10, 12], fill: 0.3 },
                snare:      { primary: [], optional: [8], fill: 0.3 },
                clap:       { primary: [], optional: [], fill: 0 },
                hatClosed:  { primary: [], optional: [2, 10], fill: 0.2 },
                hatOpen:    { primary: [], optional: [], fill: 0 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [4, 12, 14, 15], fill: 0.4 },
                crash:      { primary: [0], optional: [8], fill: 0.3 },
            },
        },

        industrial: {
            label: 'Industrial',
            category: 'Cinematic',
            bpmRange: [120, 160],
            swing: 0,
            roles: {
                kick:       { primary: [0, 4, 8, 12], optional: [6, 14], fill: 0.4 },
                snare:      { primary: [4, 12], optional: [7, 15], fill: 0.3 },
                clap:       { primary: [], optional: [], fill: 0 },
                hatClosed:  { primary: [2, 6, 10, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.4 },
                hatOpen:    { primary: [], optional: [], fill: 0 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [6, 14], optional: [3, 11], fill: 0.4 },
                crash:      { primary: [0], optional: [8], fill: 0.4 },
            },
        },

        idm: {
            label: 'IDM',
            category: 'Cinematic',
            bpmRange: [100, 160],
            swing: 0,
            roles: {
                kick:       { primary: [0, 5, 10, 13], optional: [3, 7], fill: 0.4 },
                snare:      { primary: [4, 12], optional: [7, 9, 15], fill: 0.4 },
                clap:       { primary: [], optional: [4, 12], fill: 0.3 },
                hatClosed:  { primary: [0, 2, 4, 6, 8, 10, 12, 14], optional: [1,3,5,7,9,11,13,15], fill: 0.45 },
                hatOpen:    { primary: [], optional: [6, 14], fill: 0.4 },
                ride:       { primary: [], optional: [], fill: 0 },
                tom:        { primary: [], optional: [3, 11, 15], fill: 0.4 },
                crash:      { primary: [], optional: [0], fill: 0.3 },
            },
        },
    };

    const GENRE_ORDER = [
        'house', 'deepHouse', 'techno', 'trance', 'progressiveHouse',
        'electro', 'dubstep', 'drumAndBass', 'jungle', 'ambient',
        'boomBap', 'trap', 'drill', 'loFi',
        'neoSoul', 'rnb',
        'afrobeat',
        'pop', 'rock', 'indieRock', 'punk', 'metal',
        'funk', 'motown', 'disco', 'gospel',
        'reggaeton', 'salsa', 'bossaNova', 'afroHouse',
        'cinematic', 'industrial', 'idm',
    ];

    function getGenre(id) {
        return GENRES[id] || GENRES.house;
    }

    function listGenres() {
        return GENRE_ORDER
            .filter(id => GENRES[id])
            .map(id => ({
                id,
                label: GENRES[id].label,
                category: GENRES[id].category,
            }));
    }

    window.Genres = {
        GENRES,
        GENRE_ORDER,
        DRUM_ROLE_MAP,
        ROLE_LABELS,
        getGenre,
        listGenres,
        resolveRole,
    };
})();