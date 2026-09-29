
(function () {
    'use strict';

    const TRACK_TYPES = {
        drums: {
            id: 'drums',
            label: 'Drum Track',
            shortLabel: 'Drums',
            icon: 'fa-drum',
            color: '#e53935',
            defaultName: 'Drums',
            acceptsPatternKinds: ['drums'],
            acceptsAudio: false,
            enabled: true,
        },
        synth: {
            id: 'synth',
            label: 'Synth Track',
            shortLabel: 'Synth',
            icon: 'fa-wave-square',
            color: '#1e88e5',
            defaultName: 'Synth',
            acceptsPatternKinds: ['synth'],
            acceptsAudio: false,
            enabled: true,
        },
        audio: {
            id: 'audio',
            label: 'Audio Track',
            shortLabel: 'Audio',
            icon: 'fa-music',
            color: '#43a047',
            defaultName: 'Audio',
            acceptsPatternKinds: [],
            acceptsAudio: true,
            enabled: false,
        },
    };

    function byId(id) {
        return TRACK_TYPES[id] || TRACK_TYPES.synth;
    }

    function enabled() {
        return Object.values(TRACK_TYPES).filter(t => t.enabled);
    }

    function all() {
        return Object.values(TRACK_TYPES);
    }

    function acceptsPatternKind(typeId, patternKind) {
        const t = byId(typeId);
        return t.acceptsPatternKinds.includes(patternKind);
    }

    function acceptsAudio(typeId) {
        return !!byId(typeId).acceptsAudio;
    }

    function defaultColor(typeId) {
        return byId(typeId).color || null;
    }

    function defaultName(typeId) {
        return byId(typeId).defaultName || null;
    }

    window.TrackTypes = {
        TRACK_TYPES,
        byId,
        enabled,
        all,
        acceptsPatternKind,
        acceptsAudio,
        defaultColor,
        defaultName,
    };
})();