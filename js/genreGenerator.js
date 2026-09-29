(function () {
    'use strict';

    function pickPresetForTrack(genreId, role) {
        const tl = window.toneLibrary;
        if (!tl || !tl.loaded) return null;

        const genre = window.Genres?.getGenre?.(genreId);
        const hint = genre?.song?.instruments?.[role];   // e.g. 'Rhodes 70s'
        if (!hint) return null;

        // Exact name match first
        const all = tl.all();
        let found = all.find(p => p.name.toLowerCase() === hint.toLowerCase());
        if (found) return found;

        // Fuzzy name match
        found = all.find(p => p.name.toLowerCase().includes(hint.toLowerCase()));
        if (found) return found;

        // Fallback: category match by role
        const cat = { bass: 'Bass', chords: 'Keys', melody: 'Leads' }[role];
        if (cat) {
            const list = all.filter(p => p.category === cat);
            if (list.length > 0) return list[Math.floor(Math.random() * list.length)];
        }
        return null;
    }

    // ---------- Cell helpers ----------
    function blankCell() {
        return {
            active: false, velocity: 1, probability: 1,
            ratchet: 1, pan: 0, pitch: 0, length: 1,
        };
    }

    function activeCell(velocity = 1) {
        const c = blankCell();
        c.active = true;
        c.velocity = velocity;
        return c;
    }

    function writeCell(grid, rowIdx, stepIdx, cell) {
        if (!grid[rowIdx]) return;
        if (stepIdx < 0 || stepIdx >= grid[rowIdx].length) return;
        grid[rowIdx][stepIdx] = cell;
    }

    function humanizeVelocity(base = 1) {
        return Math.max(0.3, Math.min(1, base + (Math.random() - 0.5) * 0.2));
    }

    function buildEmptyGrid(rows, steps) {
        const grid = new Array(rows);
        for (let r = 0; r < rows; r++) {
            grid[r] = new Array(steps);
            for (let s = 0; s < steps; s++) grid[r][s] = blankCell();
        }
        return grid;
    }

    // ---------- Drum generation (existing, unchanged) ----------
    function applyRoleToRow(grid, rowIdx, roleDef, steps, opts) {
        if (!roleDef) return;
        const { variationAmount = 0.15 } = opts;
        const primary = roleDef.primary || [];
        const optional = roleDef.optional || [];
        const fill = roleDef.fill || 0;

        primary.forEach(s => {
            const step = s % steps;
            if (variationAmount > 0 && Math.random() < variationAmount * 0.15) return;
            writeCell(grid, rowIdx, step, activeCell(humanizeVelocity(1)));
        });

        optional.forEach(s => {
            const step = s % steps;
            if (Math.random() < fill) {
                writeCell(grid, rowIdx, step, activeCell(humanizeVelocity(0.75)));
            }
        });
    }

    const SECTION_TONE_PROFILES = {
        intro: {
            voice: { waveform: 'triangle', attack: 0.15, release: 1.2, filterFreq: 2200, filterQ: 1.2 },
            fx: {
                reverb: { active: true, decay: 3.0, mix: 0.5 },
                chorus: { active: true, rate: 0.5, depth: 0.004, mix: 0.35 },
            },
        },
        build: {
            voice: { waveform: 'sawtooth', attack: 0.05, release: 0.8, filterFreq: 3200, filterQ: 2.5 },
            fx: {
                echo:   { active: true, time: 0.3, feedback: 0.35, mix: 0.25 },
                reverb: { active: true, decay: 2.0, mix: 0.3 },
                equalizer: { active: true, band1: 0, band2: -2, band3: 0, band4: 2, band5: 1 },
            },
        },
        main: {
            voice: { waveform: 'sawtooth', attack: 0.01, release: 0.5, filterFreq: 4000, filterQ: 1.0 },
            fx: {
                reverb: { active: true, decay: 1.8, mix: 0.22 },
                compressor: { active: true, threshold: -18, ratio: 4 },
            },
        },
        verse: {
            voice: { waveform: 'square', attack: 0.02, release: 0.6, filterFreq: 3000, filterQ: 1.0 },
            fx: {
                reverb: { active: true, decay: 1.6, mix: 0.2 },
                chorus: { active: true, rate: 0.8, depth: 0.002, mix: 0.3 },
            },
        },
        chorus: {
            voice: { waveform: 'sawtooth', attack: 0.01, release: 0.8, filterFreq: 5000, filterQ: 1.0 },
            fx: {
                echo:   { active: true, time: 0.375, feedback: 0.4, mix: 0.35 },
                reverb: { active: true, decay: 2.5, mix: 0.35 },
                chorus: { active: true, rate: 1.2, depth: 0.003, mix: 0.4 },
                equalizer: { active: true, band1: -1, band2: -2, band3: 0, band4: 3, band5: 2 },
            },
        },
        break: {
            voice: { waveform: 'sine', attack: 0.2, release: 2.0, filterFreq: 2000, filterQ: 0.8 },
            fx: {
                reverb: { active: true, decay: 4.5, mix: 0.65 },
                chorus: { active: true, rate: 0.4, depth: 0.005, mix: 0.5 },
            },
        },
        bridge: {
            voice: { waveform: 'triangle', attack: 0.1, release: 1.5, filterFreq: 1800, filterQ: 1.5 },
            fx: {
                reverb: { active: true, decay: 3.5, mix: 0.55 },
                phaser: { active: true, rate: 0.4, depth: 0.7, feedback: 0.3, mix: 0.5 },
            },
        },
        climax: {
            voice: { waveform: 'sawtooth', attack: 0.005, release: 0.6, filterFreq: 5500, filterQ: 1.2 },
            fx: {
                echo:   { active: true, time: 0.375, feedback: 0.45, mix: 0.4 },
                reverb: { active: true, decay: 3.0, mix: 0.4 },
                distortion: { active: true, drive: 25, mix: 0.25 },
                compressor: { active: true, threshold: -16, ratio: 6 },
            },
        },
        outro: {
            voice: { waveform: 'triangle', attack: 0.1, release: 2.5, filterFreq: 1600, filterQ: 0.8 },
            fx: {
                reverb: { active: true, decay: 5.0, mix: 0.65 },
                equalizer: { active: true, band1: 0, band2: -1, band3: 0, band4: -2, band5: -4 },
            },
        },
    };

    function getSectionToneProfile(sectionType) {
        return SECTION_TONE_PROFILES[sectionType] || SECTION_TONE_PROFILES.main;
    }

    function generateBeat(genreId, opts = {}) {
        const steps = opts.steps || 16;
        const drumPads = opts.drumPads || [];
        const variationAmount = opts.variationAmount ?? 0.15;
        const padCount = opts.padCount || 8;

        const genre = window.Genres?.getGenre(genreId);
        if (!genre) {
            console.warn('Unknown genre:', genreId);
            return buildEmptyGrid(padCount, steps);
        }

        const grid = buildEmptyGrid(padCount, steps);
        const roles = genre.roles || {};
        const roleToPad = resolveRoleToPad(roles, drumPads, opts.padIndexToRole);

        Object.keys(roles).forEach(roleName => {
            const padIdx = roleToPad[roleName];
            if (padIdx == null || padIdx < 0) return;
            if (padIdx >= padCount) return;
            applyRoleToRow(grid, padIdx, roles[roleName], steps, { variationAmount });
        });

        return grid;
    }

    function resolveRoleToPad(roles, drumPads, overrideMap) {
        const out = {};

        if (overrideMap && typeof overrideMap === 'object') {
            Object.keys(overrideMap).forEach(roleName => {
                if (roles[roleName]) out[roleName] = overrideMap[roleName];
            });
        }

        if (Array.isArray(drumPads)) {
            drumPads.forEach((pad, i) => {
                if (!pad) return;
                const roleName = pad.role;
                if (roleName && roles[roleName] && out[roleName] == null) {
                    out[roleName] = i;
                }
            });
        }

        const defaultMap = window.Genres?.DRUM_ROLE_MAP || {};
        Object.keys(roles).forEach(roleName => {
            if (out[roleName] != null) return;
            const padIdx = defaultMap[roleName];
            out[roleName] = padIndexWithinBounds(padIdx, drumPads) ? padIdx : -1;
        });

        return out;
    }

    function padIndexWithinBounds(padIdx, drumPads) {
        if (padIdx == null || padIdx < 0) return false;
        if (!Array.isArray(drumPads)) return true;
        return padIdx < drumPads.length;
    }

    // ---------- Harmonic helpers ----------

    function getHarmonicProfile(genreId, project) {
        const genre = window.Genres?.getGenre(genreId);
        const base = genre?.harmonic || {
            scale: 'natural_minor',
            progression: window.Genres?.HARMONY?.minorPop || [
                { degree: 0, type: 'Minor 7', beats: 4 },
                { degree: 5, type: 'Major 7', beats: 4 },
                { degree: 3, type: 'Major 7', beats: 4 },
                { degree: 4, type: 'Minor 7', beats: 4 },
            ],
            bassStyle: 'root-fifth',
            melodyStyle: 'pentatonic',
            melodyDensity: 0.30,
            melodyOctave: 5,
            bassOctave: 2,
            chordOctave: 4,
            useSeventhChords: true,
        };

        // Project settings override genre defaults where the user chose them
        const scale = project?.scale && window.MusicTheory?.SCALES?.[project.scale]
            ? project.scale
            : base.scale;
        const key = project?.key || 'C';

        return Object.assign({}, base, { scale, key });
    }

    // Chord intervals come from synthSequencer.chordTypes if available,
    // else a built-in fallback table.
    const FALLBACK_CHORDS = {
        'Major':      [0, 4, 7],
        'Minor':      [0, 3, 7],
        'Major 7':    [0, 4, 7, 11],
        'Minor 7':    [0, 3, 7, 10],
        'Dominant 7': [0, 4, 7, 10],
        'Major 9':    [0, 4, 7, 11, 14],
        'Minor 9':    [0, 3, 7, 10, 14],
        'Sus2':       [0, 2, 7],
        'Sus4':       [0, 5, 7],
        'Diminished': [0, 3, 6],
        'Augmented':  [0, 4, 8],
        'Power':      [0, 7],
        'Octave':     [0, 12],
    };

        // ================================================================
    // TONE PRESET PICKER
    // ================================================================

    // Map (genre, role) → hints for toneLibrary matching
    const TONE_HINTS = {
        house:      { chords: ['Rhodes', 'Wurlitzer', 'Electric', 'piano'], lead: ['saw', 'lead'], bass: ['Sub', 'Fat', 'Moog'] },
        deepHouse:  { chords: ['Rhodes', 'Wurlitzer', 'vintage'],          lead: ['Whistle', 'Soft', 'saw'], bass: ['Sub', 'Moog'] },
        techno:     { chords: ['Analog', 'drone', 'texture'],              lead: ['Acid', 'saw', 'Square'], bass: ['Acid', 'Moog'] },
        trance:     { chords: ['Supersaw', 'Pad', 'String'],               lead: ['Supersaw', 'Lead'], bass: ['Sub', 'Reese'] },
        trap:       { chords: ['Rhodes', 'Bell', 'marimba'],               lead: ['Whistle', 'Bell', 'Pluck'], bass: ['Sub', '808'] },
        loFi:       { chords: ['Rhodes', 'Wurlitzer', 'vintage'],          lead: ['Soft', 'vibraphone', 'piano'], bass: ['Sub', 'Moog'] },
        ambient:    { chords: ['Ambient', 'Glass', 'Choir', 'Pad'],        lead: ['Glass', 'bell', 'Choir'], bass: ['Sub'] },
        cinematic:  { chords: ['Dark Cinematic', 'Choir', 'String'],       lead: ['Solo Violin', 'whistle', 'Cello'], bass: ['Sub'] },
        // ...add more as needed
    };

    function pickTonePreset(genreId, role) {
        const tl = window.toneLibrary;
        if (!tl || !tl.loaded) return null;

        const all = tl.all();
        if (all.length === 0) return null;

        const hints = TONE_HINTS[genreId]?.[role] || [];

        // 1) Tag match
        const byTag = all.find(p =>
            p.tags && p.tags.some(t => t.toLowerCase() === genreId.toLowerCase()));
        if (byTag) return byTag;

        // 2) Hint-name match
        for (const h of hints) {
            const found = all.find(p => p.name.toLowerCase().includes(h.toLowerCase()));
            if (found) return found;
        }

        // 3) Category fallback by role
        const categoryForRole = {
            chords: 'Keys',
            lead:   'Leads',
            bass:   'Bass',
            pluck:  'Plucks',
            pad:    'Pads',
        };
        const cat = categoryForRole[role];
        if (cat) {
            const byCat = all.filter(p => p.category === cat);
            if (byCat.length > 0) return byCat[Math.floor(Math.random() * byCat.length)];
        }

        return null;
    }

    function chordIntervals(type) {
        const fromSeq = window.app?.synthSequencer?.chordTypes;
        return (fromSeq && fromSeq[type]) || FALLBACK_CHORDS[type] || [0, 4, 7];
    }

    function generateChords(genreId, project, opts = {}) {
        const MT = window.MusicTheory;
        if (!MT) return [];

        const steps = opts.steps || 16;
        const rows = opts.rows || 81;
        const baseMidiNote = opts.baseMidiNote ?? 36;
        const velocityScale = opts.velocityScale ?? 1;

        const profile = getHarmonicProfile(genreId, project);
        const progression = profile.progression;

        const grid = buildEmptyGrid(rows, steps);

        const chordRootMidi = MT.midiFromDegree(
            progression[0].degree, profile.key, profile.scale, profile.chordOctave
        );
        const chordRowLow  = opts.chordRowLow  ?? (chordRootMidi - baseMidiNote - 10);
        const chordRowHigh = opts.chordRowHigh ?? (chordRootMidi - baseMidiNote + 14);

        let stepCursor = 0;
        let prevVoicing = null;   // for voice-leading

        progression.forEach(chordDef => {
            const chordLen = Math.max(1, Math.round((chordDef.beats / 4) * steps));
            const rootMidi = MT.midiFromDegree(
                chordDef.degree, profile.key, profile.scale, profile.chordOctave
            );

            const intervals = chordIntervals(chordDef.type);

            // -------- Build a proper voiced stack in the chord register --------
            let voicing = intervals.map(iv => rootMidi + iv);

            // Add 9th/11th color tone for richness (30% chance)
            if (profile.useSeventhChords && Math.random() < 0.30) {
                voicing.push(rootMidi + 14);   // 9th
            }

            // Voice-leading: if previous chord exists, shift notes closer
            if (prevVoicing && prevVoicing.length > 0) {
                voicing = voicing.map((midi, i) => {
                    const target = prevVoicing[i] ?? prevVoicing[prevVoicing.length - 1];
                    // Shift octave to be closer to previous voicing
                    let m = midi;
                    while (Math.abs(m - target) > 6) {
                        if (m - target > 6) m -= 12;
                        else if (target - m > 6) m += 12;
                        else break;
                    }
                    return m;
                });
            }

            // Clamp to register
            voicing = voicing.filter(midi => {
                const rowIdx = midi - baseMidiNote;
                return rowIdx >= chordRowLow && rowIdx <= chordRowHigh;
            });

            if (voicing.length > 0) prevVoicing = voicing;

            if (voicing.length === 0) {
                stepCursor = (stepCursor + chordLen) % steps;
                return;
            }

            // -------- Rhythm style --------
            const roll = Math.random();
            const style = roll < 0.40 ? 'sustain'   // held pad
                        : roll < 0.75 ? 'stabs'     // rhythmic stabs
                        : 'arp';                     // arpeggio

            const baseVel = (0.40 + Math.random() * 0.10) * velocityScale;

            if (style === 'sustain') {
                voicing.forEach((midi, i) => {
                    const rowIdx = midi - baseMidiNote;
                    const cell = activeCell(Math.max(0.25, baseVel - i * 0.02));
                    cell.length = chordLen;
                    writeCell(grid, rowIdx, stepCursor, cell);
                });
            } else if (style === 'stabs') {
                // Chord hits on beats 1, 2.5 (like Billie Jean)
                const stabOffsets = [0, 6, 10];
                stabOffsets.forEach(offset => {
                    if (offset >= chordLen) return;
                    voicing.forEach((midi, i) => {
                        const rowIdx = midi - baseMidiNote;
                        const s = (stepCursor + offset) % steps;
                        const cell = activeCell(Math.max(0.28, baseVel - i * 0.02));
                        cell.length = 1;
                        writeCell(grid, rowIdx, s, cell);
                    });
                });
            } else {
                // Arp: cycle through voicing notes
                const subdiv = Math.max(1, Math.floor(chordLen / 4));
                const pattern = [...voicing];
                // up-down arp
                const arpSeq = pattern.concat([...pattern].reverse().slice(1, -1));
                for (let i = 0; i < chordLen; i += subdiv) {
                    const midi = arpSeq[(i / subdiv) % arpSeq.length];
                    const rowIdx = midi - baseMidiNote;
                    if (rowIdx < chordRowLow || rowIdx > chordRowHigh) continue;
                    const cell = activeCell(Math.max(0.30, baseVel - 0.02));
                    cell.length = subdiv;
                    writeCell(grid, rowIdx, (stepCursor + i) % steps, cell);
                }
            }

            stepCursor = (stepCursor + chordLen) % steps;
        });

        return grid;
    }

    // ---------- Bass generation ----------

    function generateBass(genreId, project, opts = {}) {
        const MT = window.MusicTheory;
        if (!MT) return [];

        const steps = opts.steps || 16;
        const rows = opts.rows || 81;
        const baseMidiNote = opts.baseMidiNote ?? 36;
        const velocityScale = opts.velocityScale ?? 1;

        const profile = getHarmonicProfile(genreId, project);
        const progression = profile.progression;

        const grid = buildEmptyGrid(rows, steps);

        let stepCursor = 0;
        progression.forEach(chordDef => {
            const chordLen = Math.max(1, Math.round((chordDef.beats / 4) * steps));
            const rootMidi = MT.midiFromDegree(chordDef.degree, profile.key, profile.scale, profile.bassOctave);
            const fifthMidi = MT.snapToScale(rootMidi + 7, profile.key, profile.scale);
            const thirdMidi = MT.snapToScale(rootMidi + 4, profile.key, profile.scale);

            const pattern = bassPatternForStyle(profile.bassStyle, chordLen, rootMidi, fifthMidi, thirdMidi);

            pattern.forEach(({ offset, midi, vel, len }) => {
                const rowIdx = midi - baseMidiNote;
                if (rowIdx < 0 || rowIdx >= rows) return;
                const s = (stepCursor + offset) % steps;
                const cell = activeCell(Math.min(0.85, vel * velocityScale));
                cell.length = len || 1;
                writeCell(grid, rowIdx, s, cell);
            });

            stepCursor = (stepCursor + chordLen) % steps;
        });

        return grid;
    }

    function bassPatternForStyle(style, chordLen, rootMidi, fifthMidi, thirdMidi) {
        const third = thirdMidi ?? rootMidi + 4;
        switch (style) {
            case 'root-fifth': {
                const half = Math.floor(chordLen / 2);
                return [
                    { offset: 0,    midi: rootMidi,  vel: 1.0, len: Math.max(1, half - 1) },
                    { offset: half, midi: fifthMidi, vel: 0.85, len: Math.max(1, chordLen - half - 1) },
                ];
            }
            case 'octave': {
                const out = [];
                for (let i = 0; i < chordLen; i += 2) {
                    const midi = i === 0 ? rootMidi : (Math.random() < 0.7 ? rootMidi + 12 : fifthMidi);
                    out.push({ offset: i, midi, vel: 0.9, len: 1 });
                }
                return out;
            }
            case 'walking': {
                const out = [];
                for (let i = 0; i < chordLen; i++) {
                    let midi;
                    if (i === 0) midi = rootMidi;
                    else if (i === chordLen - 1) midi = fifthMidi;
                    else {
                        const choice = Math.random();
                        if (choice < 0.4) midi = third;
                        else if (choice < 0.7) midi = rootMidi + (Math.random() < 0.5 ? 2 : -2);
                        else midi = rootMidi + (Math.random() < 0.5 ? 7 : -5);
                    }
                    out.push({ offset: i, midi, vel: 0.75 + Math.random() * 0.2, len: 1 });
                }
                return out;
            }
            case 'root':
            default:
                return [{ offset: 0, midi: rootMidi, vel: 1.0, len: chordLen }];
        }
    }

    // ---------- Melody generation ----------

        // Genre-specific rhythm pockets (16-step grid positions)
    const GENRE_RHYTHMS = {
        house:      [[0,4,8,12], [0,4,7,8,12,14], [0,4,6,8,12,14]],
        deepHouse:  [[0,3,6,8,11,14], [0,4,8,12,14], [0,3,8,11,14]],
        techno:     [[0,2,4,6,8,10,12,14], [0,4,8,12], [0,4,7,8,12,14]],
        trance:     [[0,4,8,12,14], [0,4,6,8,12,14], [0,3,4,8,11,12]],
        trap:       [[0,3,6,8,11,14], [0,2,6,8,10,14], [0,6,10,14]],
        loFi:       [[0,3,6,10,12,14], [0,4,7,10,14], [0,3,8,11,14]],
        boomBap:    [[0,3,6,10,12,14], [0,4,6,10,12], [0,3,6,8,11,14]],
        ambient:    [[0,8], [0,4,8,12], [0,6,12]],
        cinematic:  [[0,8], [0,4,8], [0,6,12]],
        pop:        [[0,2,4,6,8,10,12,14], [0,4,8,12,14], [0,4,7,8,12,14]],
        rock:       [[0,4,8,12,14], [0,2,4,6,8,10,12,14]],
        jazz:       [[0,2,3,6,8,11,14], [0,3,6,8,12,14], [0,4,7,10,12]],
        blues:      [[0,3,6,8,10,14], [0,3,4,8,11,14]],
        // Fallback
        _default:   [[0,4,8,12], [0,3,6,8,11,14], [0,4,6,8,12,14]],
    };

    function generateMelody(genreId, project, opts = {}) {
        const MT = window.MusicTheory;
        if (!MT) return [];

        const steps = opts.steps || 16;
        const rows = opts.rows || 81;
        const baseMidiNote = opts.baseMidiNote ?? 36;
        const variation = opts.variation ?? 1;
        const velocityScale = opts.velocityScale ?? 1;
        const swing = project?.swing ?? 0;

        const profile = getHarmonicProfile(genreId, project);
        const progression = profile.progression;

        const grid = buildEmptyGrid(rows, steps);

        const melodyOctave = profile.melodyOctave;
        const lowMidi  = opts.melodyLow  ?? MT.midiFromDegree(0, profile.key, profile.scale, melodyOctave - 1);
        const highMidi = opts.melodyHigh ?? MT.midiFromDegree(0, profile.key, profile.scale, melodyOctave + 1);
        const rowLow  = lowMidi - baseMidiNote;
        const rowHigh = highMidi - baseMidiNote;

        const scaleName = profile.melodyStyle === 'pentatonic'
            ? (profile.scale.includes('minor') || profile.scale === 'dorian'
                ? 'minor_pentatonic' : 'major_pentatonic')
            : profile.scale;

        const pool = MT.notesInScale(lowMidi, highMidi, profile.key, scaleName);
        if (pool.length === 0) return grid;

        // Chord-tone anchors per step
        const chordTonesByStep = [];
        let curStep = 0;
        progression.forEach(chordDef => {
            const chordLen = Math.max(1, Math.round((chordDef.beats / 4) * steps));
            const root = MT.midiFromDegree(chordDef.degree, profile.key, profile.scale, melodyOctave);
            const intervals = chordIntervals(chordDef.type);
            for (let i = 0; i < chordLen; i++) {
                chordTonesByStep[(curStep + i) % steps] = intervals.map(iv => root + iv);
            }
            curStep = (curStep + chordLen) % steps;
        });

        // Pick a rhythm template
        const rhythms = GENRE_RHYTHMS[genreId] || GENRE_RHYTHMS._default;
        const rhythm = rhythms[Math.floor(Math.random() * rhythms.length)];

        // Density gate
        const density = Math.min(0.9, (profile.melodyDensity ?? 0.3) * variation + 0.3);


        let lastIdx = Math.floor(pool.length / 2);

        rhythm.forEach((baseStep, i) => {
            if (Math.random() > density) return;
            if (baseStep >= steps) return;

            const s = baseStep;

            // Pitch selection
            const chordTones = chordTonesByStep[s % steps] || [];
            let idx;
            if (chordTones.length && Math.random() < 0.6) {
                const target = chordTones[Math.floor(Math.random() * chordTones.length)];
                idx = pool.reduce((best, m, i2) =>
                    Math.abs(m - target) < Math.abs(pool[best] - target) ? i2 : best, 0);
            } else {
                const jump = Math.random() < 0.75
                    ? Math.floor((Math.random() - 0.5) * 3)
                    : Math.floor((Math.random() - 0.5) * 6);
                idx = Math.max(0, Math.min(pool.length - 1, lastIdx + jump));
            }

            const midi = pool[idx];
            const rowIdx = midi - baseMidiNote;
            if (rowIdx < rowLow || rowIdx > rowHigh) return;

            // Note length: extend to next rhythm step or 1
            const nextStep = rhythm[i + 1] ?? steps;
            const rawLen = Math.max(1, nextStep - baseStep);

            // Velocity: quiet, expressive
            const isDownbeat = (s % 16) === 0;
            const isBeat = (s % 4) === 0;
            const accent = isDownbeat ? 1.0 : (isBeat ? 0.82 : 0.62);
            const vel = Math.max(0.3, Math.min(0.75,
                accent * (0.55 + Math.random() * 0.15) * velocityScale));

            const cell = activeCell(vel);
            cell.length = Math.min(rawLen, steps - s);
            writeCell(grid, rowIdx, s, cell);
            lastIdx = idx;
        });

        return grid;
    }

    // ---------- Full-song stacking ----------

    /**
     * Merges multiple grids into a single grid. Later grids overwrite earlier
     * ones only if a cell is already active AND the new one is also active.
     */
    function mergeGrids(baseGrid, ...extraGrids) {
        const rows = baseGrid.length;
        const steps = baseGrid[0]?.length || 16;
        const out = buildEmptyGrid(rows, steps);

        const put = (grid) => {
            for (let r = 0; r < Math.min(rows, grid.length); r++) {
                for (let s = 0; s < steps; s++) {
                    const cell = grid[r]?.[s];
                    if (cell && cell.active) out[r][s] = cell;
                }
            }
        };

        put(baseGrid);
        extraGrids.forEach(put);
        return out;
    }

    function generateFullSynth(genreId, project, opts = {}) {
        const rows = opts.rows || 81;
        const steps = opts.steps || 16;
        const baseMidiNote = opts.baseMidiNote ?? 36;

        const bassGrid   = generateBass(genreId, project, { rows, steps, baseMidiNote });
        const chordGrid  = generateChords(genreId, project, { rows, steps, baseMidiNote });
        const melodyGrid = generateMelody(genreId, project, { rows, steps, baseMidiNote });

        return mergeGrids(bassGrid, chordGrid, melodyGrid);
    }

        // ================================================================
    // SECTION-AWARE GENERATION
    // ================================================================

    function getSongProfile(genreId) {
        const genre = window.Genres?.getGenre(genreId);
        if (!genre || !genre.song) return null;
        return genre.song;
    }

    function getSectionTemplate(genreId, sectionType) {
        const song = getSongProfile(genreId);
        if (!song) return null;
        return song.sectionTemplates?.[sectionType] || song.sectionTemplates?.main || null;
    }

    /**
     * Generate a drum grid for a specific song section.
     */
    function generateDrumVariant(genreId, sectionType, project, opts = {}) {
        const steps = opts.steps || 32;
        const drumPads = opts.drumPads || [];
        const template = getSectionTemplate(genreId, sectionType);
        if (!template) return buildEmptyGrid(8, steps);

        const genre = window.Genres?.getGenre(genreId);
        if (!genre) return buildEmptyGrid(8, steps);

        const baseGrid = generateBeat(genreId, {
            steps,
            drumPads,
            padCount: 8,
            variationAmount: 0.15,
        });

        // Apply section filter: mute non-allowed roles
        const roleFilter = template.drumRolesOverride;
        const roleToPad = resolveRoleToPad(genre.roles || {}, drumPads, opts.padIndexToRole);

        if (roleFilter) {
            Object.keys(roleToPad).forEach(roleName => {
                const padIdx = roleToPad[roleName];
                if (padIdx < 0 || padIdx >= 8) return;
                if (!roleFilter[roleName]) {
                    // wipe entire row
                    for (let s = 0; s < steps; s++) {
                        baseGrid[padIdx][s] = blankCell();
                    }
                }
            });
        }

        // Add snare roll on final bar if requested
        if (template.addSnareRoll) {
            const snarePad = roleToPad.snare;
            if (snarePad >= 0 && snarePad < 8) {
                const lastBarStart = steps - 16;
                for (let s = lastBarStart; s < steps; s++) {
                    if (s % 2 === 0 || s >= steps - 8) {
                        baseGrid[snarePad][s] = activeCell(humanizeVelocity(0.6 + (s - lastBarStart) / 40));
                    }
                }
            }
        }

        // Add crash on the very first step for build/climax
        if (sectionType === 'build' || sectionType === 'climax') {
            const crashPad = roleToPad.crash;
            if (crashPad >= 0 && crashPad < 8) {
                baseGrid[crashPad][0] = activeCell(1);
            }
        }

        return baseGrid;
    }

    function generateChordVariant(genreId, sectionType, project, opts = {}) {
        const template = getSectionTemplate(genreId, sectionType);
        if (!template) return [];
        if (!template.includeChords) return buildEmptyGrid(opts.rows || 81, opts.steps || 32);

        // Chords are quieter in general — reduction factor per section type
        const sectionMul = {
            intro: 0.85, build: 1.0, main: 0.9, verse: 0.9,
            chorus: 0.85, break: 1.0, bridge: 1.05, climax: 0.8, outro: 0.9,
        }[sectionType] ?? 0.9;

        return generateChords(genreId, project, {
            steps: opts.steps || 32,
            rows: opts.rows || 81,
            baseMidiNote: opts.baseMidiNote ?? 36,
            velocityScale: (opts.velocityScale ?? 1) * sectionMul,
        });
    }

    function generateBassVariant(genreId, sectionType, project, opts = {}) {
        const template = getSectionTemplate(genreId, sectionType);
        if (!template) return [];
        if (!template.includeBass) return buildEmptyGrid(opts.rows || 81, opts.steps || 32);

        return generateBass(genreId, project, {
            steps: opts.steps || 32,
            rows: opts.rows || 81,
            baseMidiNote: opts.baseMidiNote ?? 36,
            velocityScale: opts.velocityScale ?? 1,
        });
    }

    function generateMelodyVariant(genreId, sectionType, project, opts = {}) {
        const template = getSectionTemplate(genreId, sectionType);
        if (!template) return [];
        if (!template.includeMelody || template.melodyDensityMul === 0) {
            return buildEmptyGrid(opts.rows || 81, opts.steps || 32);
        }

        // Melody velocity scale by section
        const melMul = {
            intro: 0.7, build: 0.85, main: 1.0, verse: 0.9,
            chorus: 1.0, break: 0.85, bridge: 0.8, climax: 1.05, outro: 0.75,
        }[sectionType] ?? 1.0;

        const baseMelody = generateMelody(genreId, project, {
            steps: opts.steps || 32,
            rows: opts.rows || 81,
            baseMidiNote: opts.baseMidiNote ?? 36,
            variation: template.melodyDensityMul,
            velocityScale: (opts.velocityScale ?? 1) * melMul,
        });

        if (template.melodyOctaveShift) {
            const shift = template.melodyOctaveShift * 12;
            const rows = opts.rows || 81;
            const steps = opts.steps || 32;
            const shifted = buildEmptyGrid(rows, steps);
            for (let r = 0; r < rows; r++) {
                const targetR = r + shift;
                if (targetR < 0 || targetR >= rows) continue;
                for (let s = 0; s < steps; s++) {
                    const c = baseMelody[r][s];
                    if (c && c.active) shifted[targetR][s] = c;
                }
            }
            return shifted;
        }

        return baseMelody;
    }

    function generateSection(genreId, sectionType, project, opts = {}) {
        const template = getSectionTemplate(genreId, sectionType);
        const song = getSongProfile(genreId);
        const steps = opts.steps || song?.sectionSteps || 32;

        const drumsGrid  = generateDrumVariant(genreId, sectionType, project, { ...opts, steps });
        const bassGrid   = generateBassVariant(genreId, sectionType, project, { ...opts, steps });
        const chordGrid  = generateChordVariant(genreId, sectionType, project, { ...opts, steps });
        const melodyGrid = generateMelodyVariant(genreId, sectionType, project, { ...opts, steps });

        return {
            type: sectionType,
            steps,
            template,
            drums:  drumsGrid,
            bass:   bassGrid,
            chords: chordGrid,
            melody: melodyGrid,
            // Legacy field: some old code expects .synth — provide a stacked fallback
            synth: mergeGrids(bassGrid, chordGrid, melodyGrid),
        };
    }

    function generateSong(genreId, project, opts = {}) {
        const song = getSongProfile(genreId);
        if (!song) {
            console.warn('[generateSong] No song profile for genre', genreId);
            return [];
        }

        const steps = opts.steps || song.sectionSteps || 32;
        const sections = [];

        song.structure.forEach((sectionType, idx) => {
            const sec = generateSection(genreId, sectionType, project, {
                ...opts,
                steps,
                drumPads: opts.drumPads,
                rows: opts.rows,
                baseMidiNote: opts.baseMidiNote,
            });
            sec.index = idx;
            sections.push(sec);
        });

        return sections;
    }

    window.GenreGenerator = {
        // Low-level
        pickPresetForTrack,
        generateBeat,
        generateChords,
        generateBass,
        generateMelody,
        generateFullSynth,
        mergeGrids,
        buildEmptyGrid,
        resolveRoleToPad,
        getHarmonicProfile,
        blankCell,
        activeCell,

        // Section-aware (NEW)
        getSongProfile,
        getSectionTemplate,
        generateDrumVariant,
        generateChordVariant,
        generateBassVariant,
        generateMelodyVariant,
        generateSection,
        generateSong,
        pickTonePreset,
        GENRE_RHYTHMS,
        TONE_HINTS,
    };
})();