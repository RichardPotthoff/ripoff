// sound.js
// Enhanced sound generator with FM, envelopes, and wave types

const SR = 44100; // Sample rate
const PI2 = Math.PI * 2;

export class SoundGen {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.snds = {};
        this.genSounds();
    }

    // Envelope: simple ADSR (Attack, Decay, Sustain, Release)
    env(t, a = 0.05, d = 0.1, s = 0.7, r = 0.2, dur) {
        if (t < a) return t / a; // Attack ramp
        if (t < a + d) return 1 - (1 - s) * (t - a) / d; // Decay to sustain
        if (t < dur - r) return s; // Sustain
        if (t < dur) return s * (1 - (t - (dur - r)) / r); // Release
        return 0;
    }

    // Wave generators
    sine(t, f) { return Math.sin(PI2 * f * t); }
    saw(t, f) { return 2 * (t * f - Math.floor(t * f + 0.5)); }
    sqr(t, f) { return Math.sin(PI2 * f * t) > 0 ? 1 : -1; }
    noise() { return Math.random() * 2 - 1; }

    // Generate tone with FM and envelope
    genTone(f, dur, vol = 1.0, fmF = 0, fmA = 0, type = 'sine') {
        const len = Math.floor(SR * dur);
        const buf = this.ctx.createBuffer(1, len, SR);
        const dat = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            const t = i / SR;
            const mod = fmA ? fmA * this.sine(t, fmF) : 0; // FM
            const freq = f + mod;
            dat[i] = this[type](t, freq) * vol * this.env(t, 0.05, 0.1, 0.7, 0.2, dur);
        }
        return buf;
    }

    // Generate noise with envelope
    genNoise(dur, vol = 1.0) {
        const len = Math.floor(SR * dur);
        const buf = this.ctx.createBuffer(1, len, SR);
        const dat = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            const t = i / SR;
            dat[i] = this.noise() * vol * this.env(t, 0.01, 0.05, 0.5, 0.2, dur);
        }
        return buf;
    }

    // Generate layered sound (e.g., shot with explosion start)
    genLayer(dur, tones, noiseVol = 0) {
        const len = Math.floor(SR * dur);
        const buf = this.ctx.createBuffer(1, len, SR);
        const dat = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            const t = i / SR;
            let v = 0;
            tones.forEach(([f, vol, fmF, fmA, type]) => {
                const mod = fmA ? fmA * this.sine(t, fmF) : 0;
                v += this[type](t, f + mod) * vol * this.env(t, 0.05, 0.1, 0.7, 0.2, dur);
            });
            if (noiseVol) v += this.noise() * noiseVol * this.env(t, 0.01, 0.05, 0.5, 0.2, dur);
            dat[i] = v;
        }
        return buf;
    }

    genSounds() {
//		this.snds['Laser_6'] = this.genLayer(0.2, [
//            [700, 0.6, 50, 10, 'sqr'], // Base square with light FM
//            [750, 0.2, 0, 0, 'sine']   // Subtle sine overtone
//          ]);
        this.snds['Laser_6'] = this.genTone(700, 0.2, 0.6, 50, 20, 'sqr');
		// Laser_3: Square wave with slight FM
        this.snds['Laser_3'] = this.genTone(600, 0.15, 0.3, 50, 20, 'sqr');

        // Hit_3: High-pitched square with FM
        this.snds['Hit_3'] = this.genTone(1000, 0.1, 1.0, 200, 50, 'sqr');

        // Explosion_5: Noise + low tone
        this.snds['Explosion_5'] = this.genLayer(0.3, [
            [100, 0.3, 0, 0, 'sine'] // Low rumble
        ], 0.5); // Strong noise

        // Clank: Sawtooth with FM for metallic feel
//        this.snds['Clank'] = this.genTone(300, 0.2, 0.5, 100, 50, 'saw');
        this.snds['Clank'] = this.genLayer(0.2, [
             [200, 0.5, 150, 100, 'saw'] // Deep sawtooth with strong FM
        ], 0.2); // Short noise burst
        // Ding_2: High sine with slight FM
        this.snds['Ding_2'] = this.genTone(1200, 0.1, 1.0, 300, 20, 'sine');
    }

    play(nm) {
        const buf = this.snds[nm];
        if (!buf) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        src.connect(this.ctx.destination);
        src.start(0);
    }
}
