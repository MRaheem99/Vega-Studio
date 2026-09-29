class EffectProcessor {
    constructor(audioContext) {
        this.ctx = audioContext;
        this.activeNodes = {};
        this.masterInput = this.ctx.createGain();
        this.masterOutput = this.ctx.createGain();
        this._tail = this.masterInput;
    }

    _num(v, fallback) {
        const n = (typeof v === 'number' && isFinite(v)) ? v : fallback;
        return n;
    }
    _clamp(v, min, max) {
        return Math.max(min, Math.min(max, v));
    }
    _seed(fx, userParams) {
        const defaults = (window.FX_DEFAULTS && window.FX_DEFAULTS[fx]) || {};
        return Object.assign({}, defaults, userParams || {});
    }

    _connectPassthrough() {
        try { this._tail.disconnect(); } catch (_) {}
        this._tail.connect(this.masterOutput);
    }

    _appendToChain(inputNode, outputNode, nodeKeys) {
        try { this._tail.disconnect(); } catch (_) {}
        this._tail.connect(inputNode);
        this._tail = outputNode;
        try { this._tail.connect(this.masterOutput); } catch (_) {}
        Object.assign(this.activeNodes, nodeKeys);
    }

    reset() {
        try { this.masterInput.disconnect(); } catch (_) {}
        Object.values(this.activeNodes).forEach(node => {
            try { if (node.stop) node.stop(); } catch (_) {}
            try { if (node.disconnect) node.disconnect(); } catch (_) {}
        });
        this.activeNodes = {};
        this._tail = this.masterInput;
        this.masterInput.connect(this.masterOutput);
    }

    disconnectOutput() {
        try { this.masterOutput.disconnect(); } catch (_) {}
    }

    createEcho(userParams) {
        const ctx = this.ctx;
        const params = this._seed('echo', userParams);

        const time      = this._num(params.time, 0.375);
        const width     = this._num(params.width, 0.05);
        const feedback  = this._clamp(this._num(params.feedback, 0.45), 0, 0.92);
        const mix       = this._clamp(this._num(params.mix, 0.4), 0, 1);
        const filter    = this._clamp(this._num(params.filter, 3500), 20, 20000);
        const modRate   = this._num(params.modulationRate, 0.25);
        const modDepth  = this._num(params.modulationDepth, 0.0008);
        const pingpong  = this._num(params.pingpong, 1) > 0 ? 1 : 0;

        const panL = ctx.createStereoPanner();
        const panR = ctx.createStereoPanner();

        const input = ctx.createGain();
        const wet = ctx.createGain();
        const dry = ctx.createGain();
        const delayL = ctx.createDelay(2.0);
        const delayR = ctx.createDelay(2.0);
        const delayBaseL = ctx.createConstantSource();
        const delayBaseR = ctx.createConstantSource();

        const leftTime  = this._clamp(time - width * 0.5, 0.01, 2.0);
        const rightTime = this._clamp(time + width * 0.5, 0.01, 2.0);

        delayBaseL.offset.value = leftTime;
        delayBaseR.offset.value = rightTime;

        const feedbackL = ctx.createGain();
        const feedbackR = ctx.createGain();
        feedbackL.gain.value = feedback;
        feedbackR.gain.value = feedback;

        const filterL = ctx.createBiquadFilter();
        const filterR = ctx.createBiquadFilter();
        filterL.type = 'lowpass';
        filterR.type = 'lowpass';
        filterL.frequency.value = filter;
        filterR.frequency.value = filter;

        const lfo = ctx.createOscillator();
        const lfoGainL = ctx.createGain();
        const lfoGainR = ctx.createGain();
        lfo.frequency.value = modRate;
        lfoGainL.gain.value = modDepth;
        lfoGainR.gain.value = -modDepth;

        wet.gain.value = mix;
        dry.gain.value = 1 - mix;

        panL.pan.value = pingpong ? -1 : 0;
        panR.pan.value = pingpong ? 1 : 0;

        input.connect(dry);
        input.connect(delayL);
        input.connect(delayR);

        if (pingpong) {
            delayL.connect(filterL);
            filterL.connect(feedbackL);
            feedbackL.connect(delayR);
            delayR.connect(filterR);
            filterR.connect(feedbackR);
            feedbackR.connect(delayL);
        } else {
            delayL.connect(filterL);
            filterL.connect(feedbackL);
            feedbackL.connect(delayL);
            delayR.connect(filterR);
            filterR.connect(feedbackR);
            feedbackR.connect(delayR);
        }

        delayL.connect(panL);
        delayR.connect(panR);
        panL.connect(wet);
        panR.connect(wet);

        const output = ctx.createGain();
        dry.connect(output);
        wet.connect(output);

        delayBaseL.connect(delayL.delayTime);
        delayBaseR.connect(delayR.delayTime);
        lfo.connect(lfoGainL);
        lfo.connect(lfoGainR);
        lfoGainL.connect(delayL.delayTime);
        lfoGainR.connect(delayR.delayTime);

        delayBaseL.start();
        delayBaseR.start();
        lfo.start();

        this._appendToChain(input, output, {
            echoInput: input, echoOutput: output,
            echoDelayL: delayL, echoDelayR: delayR,
            echoPanL: panL, echoPanR: panR,
            echoDelayBaseL: delayBaseL, echoDelayBaseR: delayBaseR,
            echoFeedL: feedbackL, echoFeedR: feedbackR,
            echoFilterL: filterL, echoFilterR: filterR,
            echoLFO: lfo, echoLfoGainL: lfoGainL, echoLfoGainR: lfoGainR,
            echoWet: wet, echoDry: dry,
        });
    }

    updateEcho(userParams) {
        const n = this.activeNodes;
        if (!n.echoDelayL) return;
        const params = this._seed('echo', userParams);
        const now = this.ctx.currentTime;
        const baseTime = this._num(params.time, 0.375);
        const width = this._num(params.width, 0.05);
        const leftTime = this._clamp(baseTime - width * 0.5, 0.01, 2.0);
        const rightTime = this._clamp(baseTime + width * 0.5, 0.01, 2.0);

        n.echoDelayBaseL.offset.setTargetAtTime(leftTime, now, 0.05);
        n.echoDelayBaseR.offset.setTargetAtTime(rightTime, now, 0.05);

        const fb = this._clamp(this._num(params.feedback, 0.45), 0, 0.92);
        const mix = this._clamp(this._num(params.mix, 0.4), 0, 1);
        const filter = this._clamp(this._num(params.filter, 3500), 20, 20000);

        n.echoFeedL.gain.setTargetAtTime(fb, now, 0.05);
        n.echoFeedR.gain.setTargetAtTime(fb, now, 0.05);
        n.echoFilterL.frequency.setTargetAtTime(filter, now, 0.05);
        n.echoFilterR.frequency.setTargetAtTime(filter, now, 0.05);
        n.echoWet.gain.setTargetAtTime(mix, now, 0.05);
        n.echoDry.gain.setTargetAtTime(1 - mix, now, 0.05);

        if (n.echoLFO) {
            const modRate = this._num(params.modulationRate, 0.25);
            const modDepth = this._num(params.modulationDepth, 0.0008);
            n.echoLFO.frequency.setTargetAtTime(modRate, now, 0.05);
            n.echoLfoGainL.gain.setTargetAtTime(modDepth, now, 0.05);
            n.echoLfoGainR.gain.setTargetAtTime(-modDepth, now, 0.05);
        }
        if (n.echoPanL && params.pingpong !== undefined) {
            const pp = this._num(params.pingpong, 1) > 0;
            n.echoPanL.pan.setTargetAtTime(pp ? -1 : 0, now, 0.05);
            n.echoPanR.pan.setTargetAtTime(pp ? 1 : 0, now, 0.05);
        }
    }

    createReverb(userParams) {
        const params = this._seed('reverb', userParams);
        const decay = this._clamp(this._num(params.decay, 2.0), 0.05, 10);
        const mix = this._clamp(this._num(params.mix, 0.4), 0, 1);

        const rate = this.ctx.sampleRate;
        const length = Math.max(1, Math.floor(rate * decay));
        const impulse = this.ctx.createBuffer(2, length, rate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);
        for (let i = 0; i < length; i++) {
            const env = Math.pow(1 - i / length, decay);
            left[i] = (Math.random() * 2 - 1) * env;
            right[i] = (Math.random() * 2 - 1) * env;
        }

        const input = this.ctx.createGain();
        const output = this.ctx.createGain();
        const convolver = this.ctx.createConvolver();
        convolver.buffer = impulse;
        convolver.normalize = true;

        const dryGain = this.ctx.createGain();
        const wetGain = this.ctx.createGain();
        wetGain.gain.value = mix;
        dryGain.gain.value = 1 - mix;

        input.connect(convolver);
        input.connect(dryGain);
        convolver.connect(wetGain);
        dryGain.connect(output);
        wetGain.connect(output);

        this._appendToChain(input, output, {
            convolver, wetGain, dryGain,
            reverbInput: input, reverbOutput: output,
        });
    }

    updateReverb(userParams) {
        const n = this.activeNodes;
        if (!n.wetGain) return;
        const params = this._seed('reverb', userParams);
        const mix = this._clamp(this._num(params.mix, 0.4), 0, 1);
        n.wetGain.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.1);
        n.dryGain.gain.setTargetAtTime(1 - mix, this.ctx.currentTime, 0.1);
    }

    createChorus(userParams, fxType) {
        const type = fxType || (userParams && userParams.type) || 'chorus';
        const params = this._seed(type === 'flanger' ? 'flanger' : 'chorus', userParams);

        const rate  = this._clamp(this._num(params.rate, 1.5), 0.01, 40);
        const depth = this._clamp(this._num(params.depth, 0.003), 0.00001, 0.05);
        const mix   = this._clamp(this._num(params.mix, 0.5), 0, 1);

        const input = this.ctx.createGain();
        const output = this.ctx.createGain();
        const delay = this.ctx.createDelay(0.1);
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        const wetGain = this.ctx.createGain();
        const dryGain = this.ctx.createGain();

        const baseDelay = type === 'flanger' ? 0.002 : 0.03;
        delay.delayTime.value = baseDelay;
        lfo.frequency.value = rate;
        lfoGain.gain.value = depth;
        wetGain.gain.value = mix;
        dryGain.gain.value = 1 - mix;

        lfo.connect(lfoGain);
        lfoGain.connect(delay.delayTime);

        input.connect(delay);
        input.connect(dryGain);
        delay.connect(wetGain);
        dryGain.connect(output);
        wetGain.connect(output);
        lfo.start();

        this._appendToChain(input, output, {
            delay, lfo, lfoGain, wetGain, dryGain,
            chorusInput: input, chorusOutput: output,
        });
    }

    updateChorus(userParams, fxType) {
        const n = this.activeNodes;
        if (!n.lfo) return;
        const type = fxType || (userParams && userParams.type) || 'chorus';
        const params = this._seed(type === 'flanger' ? 'flanger' : 'chorus', userParams);
        const now = this.ctx.currentTime;
        const rate  = this._clamp(this._num(params.rate, 1.5), 0.01, 40);
        const depth = this._clamp(this._num(params.depth, 0.003), 0.00001, 0.05);
        const mix   = this._clamp(this._num(params.mix, 0.5), 0, 1);
        n.lfo.frequency.setTargetAtTime(rate, now, 0.1);
        n.lfoGain.gain.setTargetAtTime(depth, now, 0.1);
        n.wetGain.gain.setTargetAtTime(mix, now, 0.1);
        n.dryGain.gain.setTargetAtTime(1 - mix, now, 0.1);
    }

    createEqualizer(userParams) {
        const params = this._seed('equalizer', userParams);
        const b1 = this._clamp(this._num(params.band1, 0), -24, 24);
        const b2 = this._clamp(this._num(params.band2, 0), -24, 24);
        const b3 = this._clamp(this._num(params.band3, 0), -24, 24);
        const b4 = this._clamp(this._num(params.band4, 0), -24, 24);
        const b5 = this._clamp(this._num(params.band5, 0), -24, 24);

        const bands = [
            { freq: 60, type: 'lowshelf', gain: b1 },
            { freq: 250, type: 'peaking', Q: 1.0, gain: b2 },
            { freq: 1000, type: 'peaking', Q: 1.0, gain: b3 },
            { freq: 4000, type: 'peaking', Q: 1.0, gain: b4 },
            { freq: 16000, type: 'highshelf', gain: b5 },
        ];

        const input = this.ctx.createGain();
        const nodes = [];
        let prev = input;
        bands.forEach(band => {
            const f = this.ctx.createBiquadFilter();
            f.type = band.type;
            f.frequency.value = band.freq;
            if (band.Q) f.Q.value = band.Q;
            f.gain.value = band.gain;
            prev.connect(f);
            prev = f;
            nodes.push(f);
        });
        const output = prev;

        this._appendToChain(input, output, {
            filters: nodes, eqInput: input, eqOutput: output,
        });
    }

    updateEqualizer(userParams) {
        const n = this.activeNodes;
        if (!n.filters || n.filters.length !== 5) return;
        const params = this._seed('equalizer', userParams);
        const gains = [params.band1, params.band2, params.band3, params.band4, params.band5];
        gains.forEach((g, i) => {
            const v = this._clamp(this._num(g, 0), -24, 24);
            n.filters[i].gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
        });
    }

    createDistortion(userParams) {
        const params = this._seed('distortion', userParams);
        const drive = this._clamp(this._num(params.drive, 50), 0, 100);
        const mix   = this._clamp(this._num(params.mix, 0.8), 0, 1);

        const input = this.ctx.createGain();
        const output = this.ctx.createGain();
        const shaper = this.ctx.createWaveShaper();
        const makeUpGain = this.ctx.createGain();
        const wetGain = this.ctx.createGain();
        const dryGain = this.ctx.createGain();

        shaper.curve = this.makeDistortionCurve(drive);
        shaper.oversample = '4x';
        wetGain.gain.value = mix;
        dryGain.gain.value = 1 - mix;
        makeUpGain.gain.value = 1 / (drive / 100 + 1);

        input.connect(shaper);
        shaper.connect(makeUpGain);
        makeUpGain.connect(wetGain);
        input.connect(dryGain);
        wetGain.connect(output);
        dryGain.connect(output);

        this._appendToChain(input, output, { shaper, makeUpGain, wetGain, dryGain });
    }

    updateDistortion(userParams) {
        const n = this.activeNodes;
        if (!n.shaper) return;
        const params = this._seed('distortion', userParams);
        const drive = this._clamp(this._num(params.drive, 50), 0, 100);
        const mix   = this._clamp(this._num(params.mix, 0.8), 0, 1);
        n.shaper.curve = this.makeDistortionCurve(drive);
        n.wetGain.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.1);
        n.dryGain.gain.setTargetAtTime(1 - mix, this.ctx.currentTime, 0.1);
    }

    makeDistortionCurve(amount) {
        const k = this._clamp(this._num(amount, 50), 0, 100);
        const n_samples = 2048;
        const curve = new Float32Array(n_samples);
        const deg = Math.PI / 180;
        for (let i = 0; i < n_samples; ++i) {
            const x = (i * 2) / n_samples - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }
        return curve;
    }

    createCompressor(userParams) {
        const params = this._seed('compressor', userParams);
        const threshold = this._clamp(this._num(params.threshold, -24), -100, 0);
        const ratio     = this._clamp(this._num(params.ratio, 12), 1, 20);
        const attack    = this._clamp(this._num(params.attack, 0.003), 0, 1);
        const release   = this._clamp(this._num(params.release, 0.25), 0, 2);

        const input = this.ctx.createGain();
        const comp = this.ctx.createDynamicsCompressor();
        comp.threshold.value = threshold;
        comp.knee.value = 30;
        comp.ratio.value = ratio;
        comp.attack.value = attack;
        comp.release.value = release;
        input.connect(comp);

        this._appendToChain(input, comp, { comp, compInput: input });
    }

    updateCompressor(userParams) {
        const n = this.activeNodes;
        if (!n.comp) return;
        const params = this._seed('compressor', userParams);
        const now = this.ctx.currentTime;
        n.comp.threshold.setTargetAtTime(this._clamp(this._num(params.threshold, -24), -100, 0), now, 0.1);
        n.comp.ratio.setTargetAtTime(this._clamp(this._num(params.ratio, 12), 1, 20), now, 0.1);
    }

    createBitcrusher(userParams) {
        const params = this._seed('bitcrusher', userParams);
        const bits = this._clamp(Math.round(this._num(params.bits, 8)), 1, 16);
        const mix  = this._clamp(this._num(params.mix, 0.8), 0, 1);

        const input = this.ctx.createGain();
        const output = this.ctx.createGain();
        const shaper = this.ctx.createWaveShaper();
        const wetGain = this.ctx.createGain();
        const dryGain = this.ctx.createGain();

        wetGain.gain.value = mix;
        dryGain.gain.value = 1 - mix;
        shaper.curve = this._makeBitCurve(bits);
        shaper.oversample = 'none';

        input.connect(shaper);
        shaper.connect(wetGain);
        input.connect(dryGain);
        wetGain.connect(output);
        dryGain.connect(output);

        this._appendToChain(input, output, {
            bitShaper: shaper, bitWet: wetGain, bitDry: dryGain,
        });
    }

    updateBitcrusher(userParams) {
        const n = this.activeNodes;
        if (!n.bitShaper) return;
        const params = this._seed('bitcrusher', userParams);
        const bits = this._clamp(Math.round(this._num(params.bits, 8)), 1, 16);
        const mix  = this._clamp(this._num(params.mix, 0.8), 0, 1);
        n.bitShaper.curve = this._makeBitCurve(bits);
        n.bitWet.gain.setTargetAtTime(mix, this.ctx.currentTime, 0.1);
        n.bitDry.gain.setTargetAtTime(1 - mix, this.ctx.currentTime, 0.1);
    }

    _makeBitCurve(bits) {
        const n_samples = 2048;
        const curve = new Float32Array(n_samples);
        const steps = Math.pow(2, bits);
        const stepSize = 2.0 / steps;
        for (let i = 0; i < n_samples; i++) {
            const x = (i * 2) / n_samples - 1;
            let y = Math.floor(x / stepSize) * stepSize + stepSize / 2;
            y = Math.max(-1, Math.min(1, y));
            curve[i] = y;
        }
        return curve;
    }

    createPhaser(userParams) {
        const params = this._seed('phaser', userParams);
        const rate     = this._clamp(this._num(params.rate, 1.0), 0.01, 20);
        const depth    = this._clamp(this._num(params.depth, 0.8), 0.01, 1);
        const feedback = this._clamp(this._num(params.feedback, 0.5), 0, 0.92);
        const mix      = this._clamp(this._num(params.mix, 0.7), 0, 1);

        const input = this.ctx.createGain();
        const output = this.ctx.createGain();

        const ap1 = this.ctx.createBiquadFilter();
        const ap2 = this.ctx.createBiquadFilter();
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        const wetGain = this.ctx.createGain();
        const dryGain = this.ctx.createGain();
        const feedbackGain = this.ctx.createGain();

        ap1.type = 'allpass';
        ap1.frequency.value = 500;
        ap2.type = 'allpass';
        ap2.frequency.value = 500;

        lfo.frequency.value = rate;
        lfoGain.gain.value = depth * 500;

        wetGain.gain.value = mix;
        dryGain.gain.value = 1 - mix;
        feedbackGain.gain.value = feedback;

        lfo.connect(lfoGain);
        lfoGain.connect(ap1.frequency);
        lfoGain.connect(ap2.frequency);

        input.connect(ap1);
        ap1.connect(ap2);
        ap2.connect(feedbackGain);
        feedbackGain.connect(ap1);

        ap2.connect(wetGain);
        input.connect(dryGain);
        dryGain.connect(output);
        wetGain.connect(output);
        lfo.start();

        this._appendToChain(input, output, {
            phaserAP1: ap1, phaserAP2: ap2, phaserLFO: lfo,
            phaserLFO_Gain: lfoGain,
            phaserWet: wetGain, phaserDry: dryGain, phaserFeed: feedbackGain,
        });
    }

    updatePhaser(userParams) {
        const n = this.activeNodes;
        if (!n.phaserLFO) return;
        const params = this._seed('phaser', userParams);
        const now = this.ctx.currentTime;
        const rate = this._clamp(this._num(params.rate, 1.0), 0.01, 20);
        const depth = this._clamp(this._num(params.depth, 0.8), 0.01, 1);
        const feedback = this._clamp(this._num(params.feedback, 0.5), 0, 0.92);
        const mix = this._clamp(this._num(params.mix, 0.7), 0, 1);

        n.phaserLFO.frequency.setTargetAtTime(rate, now, 0.1);
        if (n.phaserLFO_Gain) n.phaserLFO_Gain.gain.setTargetAtTime(depth * 500, now, 0.1);
        n.phaserWet.gain.setTargetAtTime(mix, now, 0.1);
        n.phaserDry.gain.setTargetAtTime(1 - mix, now, 0.1);
        n.phaserFeed.gain.setTargetAtTime(feedback, now, 0.1);
    }
}

window.EffectProcessor = EffectProcessor;