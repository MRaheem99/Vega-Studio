
(function () {
    'use strict';

    const FX_ORDER = [
        'equalizer',
        'distortion',
        'bitcrusher',
        'phaser',
        'compressor',
        'echo',
        'reverb',
        'chorus',
        'flanger',
    ];

    const FX_TYPES = [
        'adsr',
        'echo',
        'reverb',
        'chorus',
        'flanger',
        'equalizer',
        'distortion',
        'compressor',
        'vibrato',
        'bitcrusher',
        'phaser',
    ];

    const FX_CONFIG = {
        adsr: {
            labels: {
                attack: 'Attack',
                decay: 'Decay',
                sustain: 'Sustain',
                release: 'Release',
            },
            ranges: {
                attack: [0.01, 2, 0.001],
                decay: [0.01, 2, 0.001],
                sustain: [0, 1, 0.01],
                release: [0.01, 5, 0.001],
            },
            layout: 'stack',
        },
        echo: {
            labels: {
                time: 'Time (s)',
                width: 'Width',
                feedback: 'Feedback',
                mix: 'Mix',
                filter: 'Damping',
                modulationRate: 'Wobble',
                modulationDepth: 'Tape',
                pingpong: 'PingPong',
            },
            ranges: {
                time: [0.05, 1.2, 0.005],
                width: [0, 0.2, 0.002],
                feedback: [0, 0.9, 0.01],
                mix: [0, 1, 0.01],
                filter: [200, 10000, 100],
                modulationRate: [0.05, 5, 0.05],
                modulationDepth: [0, 0.003, 0.0001],
                pingpong: [0, 1, 1],
            },
            layout: 'stack',
        },
        reverb: {
            labels: {
                decay: 'Decay',
                mix: 'Mix',
            },
            ranges: {
                decay: [0.1, 5, 0.1],
                mix: [0, 1, 0.01],
            },
            layout: 'stack',
        },
        chorus: {
            labels: {
                rate: 'Rate',
                depth: 'Depth',
                mix: 'Mix',
            },
            ranges: {
                rate: [0.1, 20, 0.1],
                depth: [0.0001, 0.01, 0.0001],
                mix: [0, 1, 0.01],
            },
            layout: 'stack',
        },
        flanger: {
            labels: {
                rate: 'Rate',
                depth: 'Depth',
                mix: 'Mix',
            },
            ranges: {
                rate: [0.1, 20, 0.1],
                depth: [0.0001, 0.01, 0.0001],
                mix: [0, 1, 0.01],
            },
            layout: 'stack',
        },
        equalizer: {
            labels: {
                band1: '60Hz',
                band2: '250Hz',
                band3: '1kHz',
                band4: '4kHz',
                band5: '16kHz',
            },
            ranges: {
                band1: [-20, 20, 1],
                band2: [-20, 20, 1],
                band3: [-20, 20, 1],
                band4: [-20, 20, 1],
                band5: [-20, 20, 1],
            },
            layout: 'row-compact-vertical',
        },
        distortion: {
            labels: {
                drive: 'Drive',
                mix: 'Mix',
            },
            ranges: {
                drive: [0, 100, 1],
                mix: [0, 1, 0.01],
            },
            layout: 'stack',
        },
        compressor: {
            labels: {
                threshold: 'Thresh',
                ratio: 'Ratio',
                attack: 'Attack',
                release: 'Release',
            },
            ranges: {
                threshold: [-60, 0, 1],
                ratio: [1, 20, 1],
                attack: [0.001, 1, 0.001],
                release: [0.01, 2, 0.01],
            },
            layout: 'stack',
        },
        vibrato: {
            labels: {
                rate: 'Rate',
                depth: 'Depth',
            },
            ranges: {
                rate: [0.1, 20, 0.1],
                depth: [0, 100, 1],
            },
            layout: 'stack',
        },
        bitcrusher: {
            labels: {
                bits: 'Bits',
                normFreq: 'Freq',
                mix: 'Mix',
            },
            ranges: {
                bits: [1, 16, 1],
                normFreq: [0.01, 1, 0.01],
                mix: [0, 1, 0.01],
            },
            layout: 'stack',
        },
        phaser: {
            labels: {
                rate: 'Rate',
                depth: 'Depth',
                feedback: 'Feed',
                mix: 'Mix',
            },
            ranges: {
                rate: [0.1, 10, 0.1],
                depth: [0.1, 1, 0.01],
                feedback: [0, 0.9, 0.01],
                mix: [0, 1, 0.01],
            },
            layout: 'stack',
        },
    };

    window.FX_ORDER = FX_ORDER;
    window.FX_TYPES = FX_TYPES;
    window.FX_CONFIG = FX_CONFIG;

    window.FX_DEFAULTS = {
        adsr:       { attack: 0.01, decay: 0.2, sustain: 0.8, release: 0.3 },
        echo:       { time: 0.375, width: 0.05, feedback: 0.45, mix: 0.4, filter: 3500, modulationRate: 0.25, modulationDepth: 0.0008, pingpong: 1 },
        reverb:     { decay: 2.0, mix: 0.4 },
        chorus:     { rate: 1.5, depth: 0.003, mix: 0.6, type: 'chorus' },
        flanger:    { rate: 0.5, depth: 0.002, mix: 0.7, type: 'flanger' },
        equalizer:  { band1: 0, band2: 0, band3: 0, band4: 0, band5: 0 },
        distortion: { drive: 50, mix: 0.8 },
        compressor: { threshold: -24, ratio: 12, attack: 0.003, release: 0.25 },
        vibrato:    { rate: 5, depth: 10 },
        bitcrusher: { bits: 8, normFreq: 0.1, mix: 0.8 },
        phaser:     { rate: 1.0, depth: 0.8, feedback: 0.5, mix: 0.7 },
    };
})();