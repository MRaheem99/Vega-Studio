
(function () {
    'use strict';

    const MAIN_WAVEFORMS = ['sawtooth', 'square', 'triangle', 'sine', 'sample'];
    const SUB_WAVEFORMS  = ['sine', 'square', 'sawtooth'];
    const OSC2_WAVEFORMS = ['sine', 'square', 'sawtooth', 'triangle'];
    const NOISE_COLORS   = ['white', 'pink', 'brown'];
    const FILTER_TYPES   = ['lowpass', 'highpass', 'bandpass', 'notch'];
    const FILTER_SLOPES  = ['12db', '24db'];
    const LFO_SHAPES     = ['sine', 'triangle', 'square', 'sawtooth'];
    const LFO_TARGETS    = ['pitch', 'filter', 'amp'];

    const VOICE_SCHEMA = {
        waveform: {
            type: 'enum', values: MAIN_WAVEFORMS, default: 'sawtooth',
            group: 'osc1', label: 'Waveform',
        },
        detune: {
            type: 'num', min: -50, max: 50, step: 1, default: 0,
            group: 'osc1', label: 'Detune', unit: 'ct',
        },
        pulseWidth: {
            type: 'num', min: 0.1, max: 0.9, step: 0.01, default: 0.5,
            group: 'osc1', label: 'Pulse Width',
        },
        octaveOffset: {
            type: 'num', min: -3, max: 3, step: 1, default: 0,
            group: 'osc1', label: 'Octave',
        },

        unisonVoices: {
            type: 'num', min: 1, max: 7, step: 1, default: 1,
            group: 'unison', label: 'Voices',
        },
        unisonSpread: {
            type: 'num', min: 0, max: 50, step: 1, default: 15,
            group: 'unison', label: 'Detune Spread', unit: 'ct',
        },
        unisonPanSpread: {
            type: 'num', min: 0, max: 1, step: 0.05, default: 0.5,
            group: 'unison', label: 'Stereo Spread',
        },

        subEnabled: {
            type: 'bool', default: false,
            group: 'sub', label: 'Enable',
        },
        subWaveform: {
            type: 'enum', values: SUB_WAVEFORMS, default: 'sine',
            group: 'sub', label: 'Waveform',
        },
        subVolume: {
            type: 'num', min: 0, max: 1, step: 0.01, default: 0.5,
            group: 'sub', label: 'Level',
        },

        osc2Enabled: {
            type: 'bool', default: false,
            group: 'osc2', label: 'Enable',
        },
        osc2Waveform: {
            type: 'enum', values: OSC2_WAVEFORMS, default: 'sawtooth',
            group: 'osc2', label: 'Waveform',
        },
        osc2Detune: {
            type: 'num', min: -50, max: 50, step: 1, default: 0,
            group: 'osc2', label: 'Detune', unit: 'ct',
        },
        osc2Octave: {
            type: 'num', min: -2, max: 2, step: 1, default: 0,
            group: 'osc2', label: 'Octave',
        },
        osc2Semitone: {
            type: 'num', min: -12, max: 12, step: 1, default: 0,
            group: 'osc2', label: 'Semitone', unit: 'st',
        },
        osc2Level: {
            type: 'num', min: 0, max: 1, step: 0.01, default: 0.5,
            group: 'osc2', label: 'Level',
        },
        osc2Pan: {
            type: 'num', min: -1, max: 1, step: 0.01, default: 0,
            group: 'osc2', label: 'Pan',
        },

        noiseEnabled: {
            type: 'bool', default: false,
            group: 'noise', label: 'Enable',
        },
        noiseLevel: {
            type: 'num', min: 0, max: 1, step: 0.01, default: 0.15,
            group: 'noise', label: 'Level',
        },
        noiseColor: {
            type: 'enum', values: NOISE_COLORS, default: 'white',
            group: 'noise', label: 'Color',
        },
        noiseMode: {
            type: 'enum', values: ['amp', 'transient'], default: 'amp',
            group: 'noise', label: 'Mode',
        },

        attack: {
            type: 'num', min: 0.001, max: 5, step: 0.001, default: 0.01,
            group: 'amp', label: 'Attack', unit: 's',
        },
        decay: {
            type: 'num', min: 0.01, max: 5, step: 0.01, default: 0.2,
            group: 'amp', label: 'Decay', unit: 's',
        },
        sustain: {
            type: 'num', min: 0, max: 1, step: 0.01, default: 0.8,
            group: 'amp', label: 'Sustain',
        },
        release: {
            type: 'num', min: 0.01, max: 8, step: 0.01, default: 0.3,
            group: 'amp', label: 'Release', unit: 's',
        },

        filterType: {
            type: 'enum', values: FILTER_TYPES, default: 'lowpass',
            group: 'filter', label: 'Type',
        },
        filterSlope: {
            type: 'enum', values: FILTER_SLOPES, default: '12db',
            group: 'filter', label: 'Slope',
        },
        cutoff: {
            type: 'num', min: 20, max: 20000, step: 10, default: 8000,
            group: 'filter', label: 'Cutoff', unit: 'Hz',
        },
        resonance: {
            type: 'num', min: 0, max: 20, step: 0.1, default: 1,
            group: 'filter', label: 'Resonance',
        },
        filterKeytrack: {
            type: 'num', min: 0, max: 100, step: 1, default: 0,
            group: 'filter', label: 'Keytrack', unit: '%',
        },

        filterEnvEnabled: {
            type: 'bool', default: false,
            group: 'filterEnv', label: 'Enable',
        },
        filterEnvAmount: {
            type: 'num', min: -100, max: 100, step: 1, default: 0,
            group: 'filterEnv', label: 'Amount', unit: '%',
        },
        filterEnvAttack: {
            type: 'num', min: 0.001, max: 5, step: 0.001, default: 0.05,
            group: 'filterEnv', label: 'Attack', unit: 's',
        },
        filterEnvDecay: {
            type: 'num', min: 0.01, max: 5, step: 0.01, default: 0.3,
            group: 'filterEnv', label: 'Decay', unit: 's',
        },
        filterEnvSustain: {
            type: 'num', min: 0, max: 1, step: 0.01, default: 0.6,
            group: 'filterEnv', label: 'Sustain',
        },
        filterEnvRelease: {
            type: 'num', min: 0.01, max: 8, step: 0.01, default: 0.3,
            group: 'filterEnv', label: 'Release', unit: 's',
        },

        lfoEnabled: {
            type: 'bool', default: false,
            group: 'lfo', label: 'Enable',
        },
        lfoShape: {
            type: 'enum', values: LFO_SHAPES, default: 'sine',
            group: 'lfo', label: 'Shape',
        },
        lfoRate: {
            type: 'num', min: 0.05, max: 30, step: 0.05, default: 5,
            group: 'lfo', label: 'Rate', unit: 'Hz',
        },
        lfoDepth: {
            type: 'num', min: 0, max: 100, step: 1, default: 20,
            group: 'lfo', label: 'Depth',
        },
        lfoTarget: {
            type: 'enum', values: LFO_TARGETS, default: 'pitch',
            group: 'lfo', label: 'Target',
        },

        glideEnabled: {
            type: 'bool', default: false,
            group: 'glide', label: 'Enable',
        },
        glideTime: {
            type: 'num', min: 0.01, max: 2, step: 0.01, default: 0.15,
            group: 'glide', label: 'Time', unit: 's',
        },
    };


    function defaults() {
        const out = {};
        for (const key in VOICE_SCHEMA) {
            const def = VOICE_SCHEMA[key].default;
            out[key] = (typeof def === 'object' && def !== null)
                ? JSON.parse(JSON.stringify(def))
                : def;
        }
        return out;
    }

    function coerceValue(key, raw) {
        const spec = VOICE_SCHEMA[key];
        if (!spec) return raw;

        if (spec.type === 'bool') return !!raw;

        if (spec.type === 'enum') {
            return spec.values.includes(raw) ? raw : spec.default;
        }

        if (spec.type === 'num') {
            let n = (typeof raw === 'number' && isFinite(raw)) ? raw : spec.default;
            if (spec.min != null) n = Math.max(spec.min, n);
            if (spec.max != null) n = Math.min(spec.max, n);
            return n;
        }
        return raw;
    }

    function applyDefaults(partial) {
        const out = defaults();
        if (!partial || typeof partial !== 'object') return out;
        for (const key in VOICE_SCHEMA) {
            if (key in partial) out[key] = coerceValue(key, partial[key]);
        }
        return out;
    }

    function validateInPlace(obj) {
        if (!obj || typeof obj !== 'object') return;
        for (const key in VOICE_SCHEMA) {
            if (key in obj) obj[key] = coerceValue(key, obj[key]);
        }
    }

    const GROUP_LABELS = {
        osc1: 'Main Oscillator',
        unison: 'Unison',
        sub: 'Sub Oscillator',
        osc2: 'Second Oscillator',
        noise: 'Noise Layer',
        amp: 'Amplitude Envelope',
        filter: 'Filter',
        filterEnv: 'Filter Envelope',
        lfo: 'LFO',
        glide: 'Glide',
    };

    function keysInGroup(group) {
        const out = [];
        for (const key in VOICE_SCHEMA) {
            if (VOICE_SCHEMA[key].group === group) out.push(key);
        }
        return out;
    }

    function extractVoice(obj) {
        const out = defaults();
        if (!obj) return out;
        for (const key in VOICE_SCHEMA) {
            if (key in obj) out[key] = coerceValue(key, obj[key]);
        }
        return out;
    }

    window.VOICE_SCHEMA = VOICE_SCHEMA;
    window.VOICE_GROUP_LABELS = GROUP_LABELS;
    window.Voice = {
        defaults,
        applyDefaults,
        validateInPlace,
        keysInGroup,
        extractVoice,
        coerceValue,
        groupLabels: GROUP_LABELS,
    };
})();