// js/genreSongProfiles.js
// Injects per-genre song structure + section templates into window.Genres.
// Loads AFTER genres.js and BEFORE genreGenerator.js.
(function () {
    'use strict';

    if (!window.Genres || !window.Genres.GENRES) {
        console.warn('[genreSongProfiles] Genres not loaded — aborting.');
        return;
    }

    const INSTRUMENT_HINTS = {
        // Genre         bass            chords            melody
        house:            { bass: 'Sub',        chords: 'Rhodes 70s',      melody: 'Saw Lead' },
        deepHouse:        { bass: 'Sub',        chords: 'Wurlitzer',       melody: 'Whistle Lead' },
        techno:           { bass: 'Acid 303',   chords: 'Warm Analog Pad', melody: 'Square Lead' },
        trance:           { bass: 'Reese Bass', chords: 'Supersaw Pad',    melody: 'Supersaw Lead' },
        progressiveHouse: { bass: 'Moog Mono Bass', chords: 'Warm Analog Pad', melody: 'Supersaw Lead' },
        electro:          { bass: 'Fat Analog Bass', chords: 'Warm Analog Pad', melody: 'Sync Lead' },
        dubstep:          { bass: 'Wobble Bass', chords: 'Dark Cinematic', melody: 'Saw Lead' },
        drumAndBass:      { bass: 'Reese Bass',  chords: 'Warm Analog Pad', melody: 'Bell' },
        jungle:           { bass: 'Reese Bass',  chords: 'Warm Analog Pad', melody: 'Kalimba' },
        ambient:          { bass: 'Deep Sub',    chords: 'Ambient Drift',   melody: 'Glass Pad' },
        boomBap:          { bass: 'Sub',         chords: 'Rhodes 70s',      melody: 'Vibraphone' },
        trap:             { bass: 'Deep Sub',    chords: 'Rhodes 70s',      melody: 'Bell' },
        drill:            { bass: 'Sub',         chords: 'Dark Cinematic',  melody: 'Marimba' },
        loFi:             { bass: 'Sub',         chords: 'Wurlitzer',       melody: 'Vibraphone' },
        neoSoul:          { bass: 'Sub',         chords: 'Rhodes 70s',      melody: 'Electric piano' },
        pop:              { bass: 'Fat Analog Bass', chords: 'Studio Grand', melody: 'Saw Lead' },
        rock:             { bass: 'Fat Analog Bass', chords: 'Honky Tonk',  melody: 'Saw Lead' },
        funk:             { bass: 'Moog Mono Bass', chords: 'Clavinet',     melody: 'Whistle Lead' },
        jazz:             { bass: 'Sub',         chords: 'Rhodes 70s',      melody: 'Soft Lead' },
        blues:            { bass: 'Sub',         chords: 'Rhodes 70s',      melody: 'Harmonica' },
        cinematic:        { bass: 'Deep Sub',    chords: 'Dark Cinematic',  melody: 'Solo Violin' },
    };

    const STRUCTURES = {
        // 7-section electronic
        electronic7: ['intro', 'build', 'main', 'main', 'break', 'main', 'outro'],
        // 6-section electronic (no build)
        electronic6: ['intro', 'main', 'main', 'break', 'main', 'outro'],
        // 8-section progressive / trance
        electronic8: ['intro', 'build', 'main', 'main', 'break', 'build', 'main', 'outro'],
        // Hip-hop
        hiphop6: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
        // Ambient / cinematic
        ambient5: ['intro', 'main', 'main', 'main', 'outro'],
        cinematic6: ['intro', 'build', 'main', 'main', 'climax', 'outro'],
        // Pop / rock
        pop8: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
        // Jazz / blues / funk
        jazz6: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'outro'],
    };

    // ---------- Section behavior templates ----------

    const SECTION_TEMPLATES = {
        intro: {
            bars: 2,
            drumDensity: 0.45,
            includeBass: false,
            includeChords: true,
            includeMelody: false,
            chordDensity: 0.8,
            melodyDensityMul: 0,
            drumRolesOverride: { kick: 1, hatClosed: 1, crash: 1 },   // only these
        },
        build: {
            bars: 2,
            drumDensity: 0.75,
            includeBass: true,
            includeChords: true,
            includeMelody: false,
            chordDensity: 0.9,
            melodyDensityMul: 0,
            addRiser: true,
            addSnareRoll: true,
        },
        main: {
            bars: 2,
            drumDensity: 1.0,
            includeBass: true,
            includeChords: true,
            includeMelody: true,
            chordDensity: 1.0,
            melodyDensityMul: 1.0,
        },
        verse: {
            bars: 2,
            drumDensity: 0.9,
            includeBass: true,
            includeChords: true,
            includeMelody: true,
            chordDensity: 1.0,
            melodyDensityMul: 0.7,
        },
        chorus: {
            bars: 2,
            drumDensity: 1.0,
            includeBass: true,
            includeChords: true,
            includeMelody: true,
            chordDensity: 1.0,
            melodyDensityMul: 1.3,
            melodyOctaveShift: 1,
        },
        break: {
            bars: 2,
            drumDensity: 0.25,
            includeBass: false,
            includeChords: true,
            includeMelody: true,
            chordDensity: 1.0,
            melodyDensityMul: 0.8,
            drumRolesOverride: { hatClosed: 1, ride: 1 },
        },
        bridge: {
            bars: 2,
            drumDensity: 0.35,
            includeBass: false,
            includeChords: true,
            includeMelody: false,
            chordDensity: 1.0,
            melodyDensityMul: 0,
            drumRolesOverride: { hatClosed: 1 },
        },
        climax: {
            bars: 2,
            drumDensity: 1.0,
            includeBass: true,
            includeChords: true,
            includeMelody: true,
            chordDensity: 1.0,
            melodyDensityMul: 1.5,
            melodyOctaveShift: 1,
            addSnareRoll: true,
        },
        outro: {
            bars: 2,
            drumDensity: 0.4,
            includeBass: false,
            includeChords: true,
            includeMelody: false,
            chordDensity: 0.9,
            melodyDensityMul: 0,
            drumRolesOverride: { kick: 1, hatClosed: 1, crash: 1 },
        },
    };

    // ---------- Per-genre assignments ----------

    const GENRE_SONG_MAP = {
        house:            { structure: STRUCTURES.electronic7, stepsPerBar: 16, sectionSteps: 32 },
        deepHouse:        { structure: STRUCTURES.electronic6, stepsPerBar: 16, sectionSteps: 32 },
        techno:           { structure: STRUCTURES.electronic6, stepsPerBar: 16, sectionSteps: 32 },
        trance:           { structure: STRUCTURES.electronic8, stepsPerBar: 16, sectionSteps: 32 },
        progressiveHouse: { structure: STRUCTURES.electronic8, stepsPerBar: 16, sectionSteps: 32 },
        electro:          { structure: STRUCTURES.electronic7, stepsPerBar: 16, sectionSteps: 32 },
        dubstep:          { structure: STRUCTURES.electronic6, stepsPerBar: 16, sectionSteps: 32 },
        drumAndBass:      { structure: STRUCTURES.electronic7, stepsPerBar: 16, sectionSteps: 32 },
        jungle:           { structure: STRUCTURES.electronic7, stepsPerBar: 16, sectionSteps: 32 },
        ambient:          { structure: STRUCTURES.ambient5,    stepsPerBar: 16, sectionSteps: 32 },
        boomBap:          { structure: STRUCTURES.hiphop6,     stepsPerBar: 16, sectionSteps: 32 },
        trap:             { structure: STRUCTURES.hiphop6,     stepsPerBar: 16, sectionSteps: 32 },
        drill:            { structure: STRUCTURES.hiphop6,     stepsPerBar: 16, sectionSteps: 32 },
        loFi:             { structure: STRUCTURES.hiphop6,     stepsPerBar: 16, sectionSteps: 32 },
        neoSoul:          { structure: STRUCTURES.jazz6,       stepsPerBar: 16, sectionSteps: 32 },
        pop:              { structure: STRUCTURES.pop8,        stepsPerBar: 16, sectionSteps: 32 },
        rock:             { structure: STRUCTURES.pop8,        stepsPerBar: 16, sectionSteps: 32 },
        funk:             { structure: STRUCTURES.jazz6,       stepsPerBar: 16, sectionSteps: 32 },
        jazz:             { structure: STRUCTURES.jazz6,       stepsPerBar: 16, sectionSteps: 32 },
        blues:            { structure: STRUCTURES.jazz6,       stepsPerBar: 16, sectionSteps: 32 },
        cinematic:        { structure: STRUCTURES.cinematic6,  stepsPerBar: 16, sectionSteps: 32 },
    };

    // ---------- Inject ----------

    Object.keys(window.Genres.GENRES).forEach(genreId => {
        const genre = window.Genres.GENRES[genreId];
        const profile = GENRE_SONG_MAP[genreId];
        if (!profile) {
            genre.song = {
                structure: STRUCTURES.electronic6,
                stepsPerBar: 16,
                sectionSteps: 32,
                sectionTemplates: SECTION_TEMPLATES,
            };
            return;
        }
        genre.song = {
            structure: profile.structure,
            stepsPerBar: profile.stepsPerBar,
            sectionSteps: profile.sectionSteps,
            sectionTemplates: SECTION_TEMPLATES,
            instruments: INSTRUMENT_HINTS[genreId] || {
                bass: 'Sub',
                chords: 'Rhodes 70s',
                melody: 'Saw Lead',
            },
        };
    });

    // Expose templates for reuse
    window.Genres.SECTION_TEMPLATES = SECTION_TEMPLATES;
    window.Genres.STRUCTURES = STRUCTURES;
    window.Genres.INSTRUMENT_HINTS = INSTRUMENT_HINTS;

    console.log('[genreSongProfiles] Song profiles injected for',
        Object.keys(window.Genres.GENRES).length, 'genres');
})();