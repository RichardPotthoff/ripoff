`
// ripoff.js
// Guy Carver's original Python version of "ripoff" was converted 
// to this javascript version with the help of Grok3.
#----------------------------------------------------------------------
# Copyright (c) 2012, Guy Carver
# All rights reserved.
#
# Redistribution and use in source and binary forms, with or without modification,
# are permitted provided that the following conditions are met:
#
#     * Redistributions of source code must retain the above copyright notice,
#       this list of conditions and the following disclaimer.
#
#     * Redistributions in binary form must reproduce the above copyright notice,
#       this list of conditions and the following disclaimer in the documentation
#       and/or other materials provided with the distribution.
#
#     * The name of Guy Carver may not be used to endorse or promote products # derived#
#       from # this software without specific prior written permission.#
#
# THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
# ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
# WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
# DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR
# ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
# (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
# LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
# ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
# (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
# SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
#
# FILE    ripoffv3.py
# BY      Guy Carver
# DATE    11/19/2012 06:16 PM
#----------------------------------------------------------------------
`

import { SoundGen } from './sound.js';

// Constants
const PI2 = Math.PI * 2;
const HPI = Math.PI / 2;
const G_SCALE = 16;
const NUM_CRATES = 9;
const CRATE_SPACING = 45;
const NUM_BULLETS = 5;
const AI_BULLET_SPEED = 500;
const AI_BULLET_LIFE = 0.5;
const BULLET_SPEED = 1000;
const MOVE_SENSE = 2;
const MOVE_SCALE = 2;
const TURN_SCALE = 0.05;
const UADJ = Math.PI / 16;
const EXP_V = 32;
const EXP_AV = Math.PI;
const EXP_DUR = 0.75;
const BLAST_DUR = 2.5;
const BLAST_EXP = 64;
const DEAD_TIME = 5;
const TETHER_LEN = 32;
const MAX_KILLERS = 4;
const FIRE_DELAY = 0.5;
const ROBBER_COUNT = 6;
const KILLER_INTERVAL = 4;
const KILLER_DOWN_TIME = 5;
const KILLER_VEL = 1.25;
const VEL_BASE = 100.0;
const VEL_SCALE = 1.0 / 100.0;
const WP_SKIP_CHANCE = 0.1;
const WP_SKIP_FACTOR = 0.01;
const PLAYER_FILTER = 1;
const AI_FILTER = 2;

// Meshes
const crateMesh = {
    verts: [[-0.5, 0], [0, 0.75], [0.5, 0], [0, -0.75]],
    segs: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 2]]
};
const playerMesh = {
    verts: [[0, 0.75], [1, 0], [0.75, -0.5], [0.5, -0.25], [-0.5, -0.25], [-0.75, -0.5], [-1, 0]],
    segs: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 0]]
};
const robberMesh = {
    verts: [[0, 1], [0.5, 0.25], [0.5, -0.25], [0, -0.75], [-0.5, -0.25], [-0.5, 0.25]],
    segs: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0], [0, 3]]
};
const killerMesh = {
    verts: [[0, 1], [0.35, 0], [0.5, -0.75], [0, 0], [-0.5, -0.75], [-0.35, 0]],
    segs: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 0]]
};

// Waypoints
const pathRange = [
    [0.85, Math.PI, [0.8, 0.6]],
    [0.5, HPI, [0.6, 0.5]],
    [0.25, HPI / 2, [0.5, 0.3]],
    [0, 0, [0.3, 0.02]],
    [1.5, Math.PI, [0.6, 0.3]]
];
const EXIT_WP = pathRange.length - 1;
const PICKUP_WP = EXIT_WP - 1;

// Utility Functions
function sgn(val) { return val >= 0 ? 1 : -1; }
function lensq(vec) { return vec[0] * vec[0] + vec[1] * vec[1]; }
function dot(p1, p2) { return p1[0] * p2[0] + p1[1] * p2[1]; }
function normalize(vec) {
    const len = Math.hypot(vec[0], vec[1]) || 1;
    vec[0] /= len;
    vec[1] /= len;
    return len;
}
function segvcircle(p1, p2, circle) {
    const segv = [p2[0] - p1[0], p2[1] - p1[1]];
    const cp1v = [circle[0] - p1[0], circle[1] - p1[1]];
    const segvn = [...segv];
    const l = normalize(segvn);
    const sl = dot(cp1v, segvn);
    let c = [...p1];
    if (sl >= l) c = [...p2];
    else if (sl > 0) {
        c[0] += segvn[0] * sl;
        c[1] += segvn[1] * sl;
    }
    return Math.hypot(c[0] - circle[0], c[1] - circle[1]) < circle[2];
}
function addangle(a1, a2) {
    a1 += a2;
    while (a1 < 0) a1 += PI2;
    while (a1 > PI2) a1 -= PI2;
    return a1;
}
function deltaangle(a0, a1) {
    const a = a1 - a0;
    const b = Math.abs(a);
    const c = PI2 - b;
    return b < c ? a : c * -sgn(a);
}
function anglefromvector(vect) {
    const len = Math.hypot(vect[0], vect[1]);
    let a = len > 0 ? Math.acos(vect[1] / len) : 0;
    if (vect[0] < 0) a = PI2 - a;
    return [a, len];
}
function dampen(val, d) {
    const s = sgn(val);
    val -= s * d;
    return sgn(val) !== s ? 0 : val;
}
function rotpoint(a, p) {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = p[0] * c + p[1] * s;
    p[1] = p[1] * c - p[0] * s;
    p[0] = x;
}
function clippoint(pnt, bound) {
    pnt[0] = Math.max(bound[0], Math.min(bound[0] + bound[2], pnt[0]));
    pnt[1] = Math.max(bound[1], Math.min(bound[1] + bound[3], pnt[1]));
}

// Mob Class
class Mob {
    constructor(pos, scene, mesh) {
        this.scene = scene;
        this.pos = [...pos];
        this.filter = 0;
        this.scale = G_SCALE;
        this.color = [0.4, 0.8, 1, 1];
        this.mesh = mesh;
        this.points = mesh.verts.map(p => [...p]);
        this.angle = 0;
        this.dotrans = true;
        this.on = false;
    }
    reset() {
        this.angle = 0;
        this.on = true;
    }
    boundcheck(bound) {
        if (!this.on) return false;
        const dx = bound[0] - this.pos[0];
        const dy = bound[1] - this.pos[1];
        const dsq = dx * dx + dy * dy;
        const r = this.scale + bound[2];
        return dsq <= r * r;
    }
	offscreen() {
	    const s = this.scale;
	    return (
	        this.pos[0] + s < 0 || 
	        this.pos[0] - s > this.scene.size[0] || 
	        this.pos[1] + s < 0 || 
	        this.pos[1] - s > this.scene.size[1]
	    );
	}
    transformpoints() {
        const c = Math.cos(this.angle);
        const s = Math.sin(this.angle);
        this.points = this.mesh.verts.map(p => {
            const x = (p[0] * c + p[1] * s) * this.scale + this.pos[0];
            const y = (p[1] * c - p[0] * s) * this.scale + this.pos[1];
            return [x, y];
        });
    }
    draw(ctx) {
        if (!this.on) return;
        ctx.strokeStyle = `rgba(${this.color[0] * 255},${this.color[1] * 255},${this.color[2] * 255},${this.color[3]})`;
        ctx.lineWidth = 1;
        if (this.dotrans) this.transformpoints();
        ctx.beginPath();
        this.mesh.segs.forEach(([p0, p1]) => {
            ctx.moveTo(this.points[p0][0], this.points[p0][1]);
            ctx.lineTo(this.points[p1][0], this.points[p1][1]);
        });
        ctx.stroke();
    }
    kill() { this.on = false; }
}

// Explosion Class
class Explosion {
    constructor(mob) {
        this.pos = [...mob.pos];
        this.alpha = 1;
        this.color = [...mob.color];
        this.color[3] = 1;
        this.angle = mob.angle;
        this.blast = 4;
        this.segs = mob.mesh.segs.map(([i0, i1]) => {
            const xv = Math.random() * EXP_V * 2 - EXP_V;
            const yv = Math.random() * EXP_V * 2 - EXP_V;
            const av = Math.random() * EXP_AV * 2 - EXP_AV;
            const p0 = [...mob.points[i0]];
            const p1 = [mob.points[i1][0] - p0[0], mob.points[i1][1] - p0[1]];
            return [[p0[0], p0[1], 0], p1, [xv, yv, av]];
        });
        mob.scene.sg.play('Explosion_5'); // Play explosion sound
    }
    update(dt) {
        if (this.color[3] <= 0) return false;
        this.color[3] = Math.max(0, this.color[3] - EXP_DUR * dt);
        this.alpha = Math.max(0, this.alpha - BLAST_DUR * dt);
        this.blast += BLAST_EXP * dt;
        this.segs.forEach(([p0, _, v]) => {
            p0[0] += v[0] * dt;
            p0[1] += v[1] * dt;
            p0[2] = addangle(p0[2], v[2] * dt);
        });
        return true;
    }
    draw(ctx) {
        if (this.alpha) {
            const width = this.alpha * 32;
            ctx.strokeStyle = `rgba(255,${1.5 * this.alpha * 255},${this.alpha * this.alpha * 255},${this.alpha})`;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.arc(this.pos[0], this.pos[1], this.blast, 0, PI2);
            ctx.stroke();
        }
        ctx.strokeStyle = `rgba(${this.color[0] * 255},${this.color[1] * 255},${this.color[2] * 255},${this.color[3]})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        this.segs.forEach(([p0, p1d, v]) => {
            const p1 = [...p1d];
            rotpoint(p0[2], p1);
            p1[0] += p0[0];
            p1[1] += p0[1];
            ctx.moveTo(p0[0], p0[1]);
            ctx.lineTo(p1[0], p1[1]);
        });
        ctx.stroke();
    }
}

// Crate Class
class Crate extends Mob {
    constructor(pos, scene) {
        super(pos, scene, crateMesh);
        this.color = [0.80, 0.80, 0.20, 1];
        this.reset();
    }
    reset() {
        super.reset();
        this.targeted = 0;
        this.tethered = null;
        this.dotrans = false;
        this.transformpoints();
    }
    kill() {
        super.kill();
        this.scene.crates = this.scene.crates.filter(c => c !== this);
        this.scene.sg.play('Clank'); // Play clank sound
    }
}

// Bullet Class
class Bullet {
    constructor(owner) {
        this.owner = owner;
        this.pos = [0, 0];
        this.vel = [0, 0];
        this.color = [1, 0.7, 0.7, 1];
        this.life = 0;
        this.speed = BULLET_SPEED;
        this.lifespan = 1;
    }
    getfilter() { return this.owner.filter; }
    turnon(pos, vel) {
        this.life = this.lifespan;
        this.pos = [...pos];
        this.vel = [vel[0] * this.speed, vel[1] * this.speed];
    }
    update(dt) {
        if (!this.life) return false;
        this.life = Math.max(0, this.life - dt);
        if (this.life) {
            const prev = [...this.pos];
            this.pos[0] += this.vel[0] * dt;
            this.pos[1] += this.vel[1] * dt;
            if (this.scene.checkbullet(prev, this.pos, this.owner)) this.life = 0;
        }
        if (!this.life) {
            this.owner.shotcount--;
            return true;
        }
        return false;
    }
    draw(ctx) {
        if (!this.life) return;
        ctx.strokeStyle = `rgba(${this.color[0] * 255},${this.color[1] * 255},${this.color[2] * 255},${this.color[3]})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(this.pos[0], this.pos[1]);
        ctx.lineTo(this.pos[0] + 2, this.pos[1] + 2);
        ctx.stroke();
    }
}

// Machine Class
class Machine extends Mob {
    constructor(pos, filter, scene, mesh, bulletcount) {
        super(pos, scene, mesh);
        this.filter = filter;
        this.brk = 200;
        this.brka = Math.PI * 2;
        this.shotcount = 0;
        this.bullets = Array(bulletcount).fill().map(() => new Bullet(this));
        this.wrap = true;
        this.sh = null; // Shoot sound
    }
    reset() {
        super.reset();
        this.avel = 0;
        this.vel = [0, 0];
    }
    slowdown(dt) { this.vel[1] = dampen(this.vel[1], this.brk * dt); }
    shotpos() {
        const p = [...this.points[0]];
        const v = [(p[0] - this.pos[0]) / this.scale, (p[1] - this.pos[1]) / this.scale];
        return [p, v];
    }
    fire() {
        if (!this.on || this.shotcount >= this.bullets.length) return;
        const bullet = this.bullets.find(b => !b.life);
        if (bullet) {
            bullet.turnon(...this.shotpos());
            bullet.scene = this.scene;
            this.shotcount++;
            this.scene.activebullets.push(bullet);
            if (this.sh) this.scene.sg.play(this.sh); // Play shoot sound
        }
    }
    update(dt) {
        if (!this.on) return;
        const v = [...this.vel];
        rotpoint(this.angle, v);
        this.pos[0] += v[0] * dt;
        this.pos[1] += v[1] * dt;
        if (this.wrap) {
            if (this.pos[0] > this.scene.size[0]) this.pos[0] -= this.scene.size[0];
            else if (this.pos[0] < 0) this.pos[0] += this.scene.size[0];
            if (this.pos[1] > this.scene.size[1]) this.pos[1] -= this.scene.size[1];
            else if (this.pos[1] < 0) this.pos[1] += this.scene.size[1];
        }
        this.angle = addangle(this.angle, this.avel * dt);
    }
}

// AIMachine Class
class AIMachine extends Machine {
    constructor(scene, mesh, numbullets) {
        super([0, 0], AI_FILTER, scene, mesh, numbullets);
        this.on = false;
        this.brka = 0;
    }
    reset(pos, angle) {
        super.reset();
        this.wrap = false;
        this.pos = [...pos];
        this.angle = angle;
        this.minvel = 0;
        this.maxvel = 0;
        this.wp = [0, 0];
        this.wpn = [0, 0];
        this.nextwaypoint();
    }
    basevel() { return VEL_BASE + (VEL_BASE * this.scene.wave * VEL_SCALE); }
    updatevels(dt) {
        const vect = [this.wp[0] - this.pos[0], this.wp[1] - this.pos[1]];
        const [a, l] = anglefromvector(vect);
        this.avel = deltaangle(this.angle, a);
        this.vel = [0, Math.max(this.minvel, Math.min(this.maxvel, l))];
    }
    checkdest() {
        const delta = [this.pos[0] - this.wp[0], this.pos[1] - this.wp[1]];
        const l = lensq(delta);
        return l < (this.minvel * this.minvel) && dot(delta, this.wpn) <= 0;
    }
    update(dt) {
        if (!this.on) return 0;
        this.state(dt);
        return 1;
    }
    updatePosition(dt) {
        super.update(dt);
    }
}

class Robber extends AIMachine {
    constructor(scene) {
        super(scene, robberMesh, 0);
    }
    reset(pos, angle, tgt) {
        this.state = this.approachstate.bind(this);
        this.wpindex = -1;
        this.approacha = 0;
        this.target = tgt;
        if (tgt) tgt.targeted++;
        super.reset(pos, angle);
    }
    setexit() {
        this.state = this.exitstate.bind(this);
        this.wrap = false;
        const tgt = this.target;
        if (!tgt.tethered) {
            const b = [this.pos[0], this.pos[1], this.scale];
            if (tgt.boundcheck(b)) {
                tgt.tethered = this;
                tgt.dotrans = true;
                return;
            }
        }
        this.wp = tgt.pos;
        this.state = this.followstate.bind(this);
    }
    done() {
        this.on = false;
        if (this.target && this.target.tethered === this) this.target.kill();
    }
    kill() {
        super.kill();
        const tgt = this.target;
        if (tgt) {
            this.target = null;
            tgt.targeted--;
            if (tgt.tethered === this) {
                tgt.tethered = null;
                tgt.dotrans = false;
            }
        }
    }
	pullcrate(dt) {
	    const tgt = this.target;
	    if (tgt && tgt.tethered === this) {
	        if (tgt.offscreen()) {
	            this.done();
	        } else {
	            const p = tgt.pos;
	            const d = [this.pos[0] - p[0], this.pos[1] - p[1]];
	            const dm = [Math.abs(d[0]) - TETHER_LEN, Math.abs(d[1]) - TETHER_LEN];
	            if (dm[0] > 0) p[0] += dm[0] * sgn(d[0]);
	            if (dm[1] > 0) p[1] += dm[1] * sgn(d[1]);
	        }
	    } else if (this.offscreen()) {
	        this.done();
	    } else if (!tgt || !tgt.on) {
	        this.on = false;
	    }
	}
    tetherpos() { return this.points[3]; }
    nextwaypoint() {
        this.wpindex++;
        while (this.wpindex < PICKUP_WP && Math.random() < this.scene.wpskipchance) this.wpindex++;
        this.setwaypoint();
        if (this.wpindex === EXIT_WP) this.setexit();
    }
    setwaypoint() {
        if (!this.target) return;
        const [rad, da, vels] = pathRange[this.wpindex];
        const v = this.basevel();
        this.maxvel = vels[0] * v;
        this.minvel = vels[1] * v;
        this.approacha = addangle(this.approacha, Math.random() * 2 * da - da);
        this.wp = [0, rad * this.scene.screenrad];
        rotpoint(this.approacha, this.wp);
        this.wp[0] += this.target.pos[0];
        this.wp[1] += this.target.pos[1];
        if (this.wpindex < EXIT_WP) clippoint(this.wp, this.scene.bounds);
        this.wpn = [this.pos[0] - this.wp[0], this.pos[1] - this.wp[1]];
        normalize(this.wpn);
    }
    followstate(dt) {
        if (!this.target.tethered) {
            this.wpindex = PICKUP_WP;
            this.state = this.approachstate.bind(this);
            this.setwaypoint();
        } else this.exitstate(dt);
    }
    approachstate(dt) {
        if (this.checkdest()) this.nextwaypoint();
        this.updatevels(dt);
        this.updatePosition(dt);
    }
    exitstate(dt) {
        this.updatevels(dt);
        this.pullcrate(dt);
        this.updatePosition(dt);
    }
    draw(ctx) {
        if (!this.on) return;
        super.draw(ctx);
        const tgt = this.target;
        if (tgt && tgt.tethered === this) {
            ctx.strokeStyle = 'rgba(255,255,255,0.5)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            const tp = this.tetherpos();
            ctx.moveTo(tp[0], tp[1]);
            ctx.lineTo(tgt.pos[0], tgt.pos[1]);
            ctx.stroke();
        }
    }
}

class Killer extends AIMachine {
    constructor(scene) {
        super(scene, killerMesh, 2);
        this.color = [1.00, 0.00, 1.00, 1];
        this.downtime = KILLER_DOWN_TIME;
        this.state = this.down.bind(this);
        this.sh = 'Hit_3'; // Shoot sound
    }
    reset(pos, angle) {
        super.reset(pos, angle);
        const v = KILLER_VEL * this.basevel();
        this.minvel = this.maxvel = v;
        this.firedelay = 0;
        this.state = this.hunt.bind(this);
        this.bullets.forEach(b => {
            b.speed = AI_BULLET_SPEED;
            b.lifespan = AI_BULLET_LIFE;
        });
    }
    nextwaypoint() {
        this.wp = [Math.random() * this.scene.size[0], Math.random() * this.scene.size[1]];
        this.wpn = [this.pos[0] - this.wp[0], this.pos[1] - this.wp[1]];
        normalize(this.wpn);
    }
    kill() {
        this.downtime = KILLER_DOWN_TIME;
        super.kill();
        this.state = this.down.bind(this);
    }
    down(dt) {
        this.downtime -= dt;
        if (this.downtime <= 0) {
            const [p, a] = this.scene.startpos();
            this.reset(p, a);
        }
    }
    checkfire(dt) {
        if (this.firedelay > 0) {
            this.firedelay = Math.max(0, this.firedelay - dt);
            return;
        }
        for (const p of this.scene.pl) {
            const v = [p.pos[0] - this.pos[0], p.pos[1] - this.pos[1]];
            const [a1] = anglefromvector(v);
            const da = deltaangle(this.angle, a1);
            if (Math.abs(da) < 0.07) {
                this.firedelay = FIRE_DELAY;
                this.fire();
            }
        }
    }
    hunt(dt) {
        if (this.checkdest()) this.nextwaypoint();
        this.updatevels(dt);
        this.checkfire(dt);
        this.updatePosition(dt);
    }
    update(dt) { this.state(dt); }
}

// Player Class
class Player extends Machine {
    constructor(pos, scene, dir) {
        super(pos, PLAYER_FILTER, scene, playerMesh, NUM_BULLETS);
        this.dir = dir;
        this.startpos = [...pos];
        this.control = 0;
        this.unstable = false;
        this.sh = dir > 0 ? 'Laser_6' : 'Laser_3'; // Shoot sound based on player
        this.reset();
    }
    reset() {
        super.reset();
        this.dead = 0;
        this.pos = [...this.startpos];
        this.vel[1] = this.scale * 8;
        this.angle = -HPI * this.dir;
        this.destangle = this.angle;
    }
    kill() {
        super.kill();
        this.dead = DEAD_TIME;
    }
    move(dt) {
        if (this.control) {
            const da = deltaangle(this.angle, this.destangle);
            if (da) {
                const av = this.avel + da;
                const s = sgn(av);
                this.avel = Math.min(Math.PI, Math.abs(av)) * s;
            }
        }
    }
    update(dt) {
        if (this.on) {
            this.move(dt);
            this.unstable = false;
            const b = [this.pos[0], this.pos[1], this.scale * 0.75];
            for (const m of this.scene.crates) {
                if (m.boundcheck(b)) {
                    this.unstable = true;
                    break;
                }
            }
            this.avel = dampen(this.avel, this.brka * dt);
            if (!this.control) this.slowdown(dt);
            super.update(dt);
        } else {
            this.dead -= dt;
            if (this.dead <= 0) this.reset();
        }
    }
    movetouch(touch) {
        const deltax = touch.x - this.movepos[0];
        const deltay = touch.y - this.movepos[1];
        const [a, l] = anglefromvector([deltax, deltay]);
        this.destangle = a;
        if (l > MOVE_SENSE) this.vel[1] = l * MOVE_SCALE;
    }
}

// Scene Class
class MyScene {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.size = [canvas.width, canvas.height];
        this.bounds = [0, 0, this.size[0], this.size[1]];
        this.screenrad = Math.hypot(this.size[0], this.size[1]) * 0.5;
        this.isPaused = false; // Add pause flag
        this.sg = new SoundGen(); // Sound generator
        this.setup();
        this.lastTime = performance.now();
        this.state = this.run.bind(this);
        this.touches = [];
        this.setupEvents();
        this.animate();
    }

    setup() {
        const cp = [this.size[0] / 2, this.size[1] / 2];
        const w3 = this.size[0] / 5;
        const w6 = w3 / 2;
        this.pl = [
            new Player([0, cp[1]], this, 1.0),
            new Player([this.size[0], cp[1]], this, -1.0)
        ];
        this.pl[0].color = [1.00, 0.50, 0.00, 1];
        this.pl[0].moverect = [this.size[0] - w3, 0, w3, w3];
        this.pl[0].movepos = [this.pl[0].moverect[0] + w3 / 2, this.pl[0].moverect[1] + w3 / 2];
        this.pl[0].shootrect = [this.size[0] - w6, w3 * 2.25, w6, w3];
        this.pl[1].color = [0.40, 1.00, 0.40, 1];
        this.pl[1].moverect = [0, this.size[1] - w3, w3, w3];
        this.pl[1].movepos = [w3 / 2, this.size[1] - w3 / 2];
        this.pl[1].shootrect = [0, this.size[1] - w3 * 2.25 - w3, w6, w3];
        this.activebullets = [];
        this.explosions = [];
        this.controlalpha = 0.45;
        this.wave = 0;
        this.wpskipchance = WP_SKIP_CHANCE;
        this.killerinterval = KILLER_INTERVAL;
        this.crates = Array(NUM_CRATES).fill().map((_, i) => {
            const x = (Math.floor(i / 3) - 1) * CRATE_SPACING + cp[0];
            const y = ((i % 3) - 1) * CRATE_SPACING + cp[1];
            return new Crate([x, y], this);
        });
        this.robbers = Array(ROBBER_COUNT).fill().map(() => new Robber(this));
        this.killers = [];
        this.numrobbers = 0;
        document.getElementById('wave').textContent = this.wave;
    }
	adjustdifficulty() {
	    this.wpskipchance = WP_SKIP_CHANCE + (this.wave * WP_SKIP_FACTOR);
	    let nk = Math.max(1, Math.min(Math.floor(this.wave / this.killerinterval), MAX_KILLERS)) - this.killers.length;
	    //console.log('Adjusting difficulty, wave:', this.wave, 'killers to add:', nk, 'current killers:', this.killers.length);
	    while (nk > 0) {
	        this.killerinterval += 2;
	        nk--;
	        this.killers.push(new Killer(this));
	    }
	}
	checkwave(dt) {
	    //console.log('Checking wave, numrobbers:', this.numrobbers, 'crates:', this.crates.length);
	    if (this.numrobbers === 0) {
	        if (this.crates.length > 0) {
	            this.wave++;
	            //console.log('New wave:', this.wave);
	            document.getElementById('wave').textContent = this.wave;
	            this.adjustdifficulty();
	            this.startrobbers();
	        } else {
	            //console.log('Game Over');
	            this.state = this.gameover.bind(this);
	        }
	    }
	}
    checkbullet(p1, p2, owner) {
        let hit = false;
        const checkcol = amob => {
            if (!amob.on) return false;
            const circle = [amob.pos[0], amob.pos[1], amob.scale];
            if (segvcircle(p1, p2, circle)) {
                this.explosions.push(new Explosion(amob));
                amob.kill();
                return true;
            }
            return false;
        };
        if (owner.filter !== PLAYER_FILTER) {
            for (const p of this.pl) hit |= checkcol(p);
        } else if (owner.filter !== AI_FILTER) {
            for (const k of this.killers) if (checkcol(k)) return true;
            for (const r of this.robbers) hit |= checkcol(r);
        }
        return hit;
    }
    startpos() {
        const a = Math.random() * PI2;
        const p = [0, this.screenrad];
        rotpoint(a, p);
        p[0] += this.size[0] / 2;
        p[1] += this.size[1] / 2;
        return [p, a];
    }
    startrobbers() {
        this.robbers.forEach(r => {
            if (!r.on) {
                const c = this.crates[Math.floor(Math.random() * this.crates.length)];
                const [p, a] = this.startpos();
                r.reset(p, a, c);
            }
        });
    }
	udrobbers(dt) {
	    this.numrobbers = this.robbers.reduce((sum, r) => sum + r.update(dt), 0);
	    //console.log('Number of active robbers:', this.numrobbers);
	}
	update1(dt) {
        if (!this.touches.length) this.pl.forEach(p => p.control = 0);
        this.pl.forEach(p => p.update(dt));
        this.killers.forEach(k => k.update(dt));
        this.udrobbers(dt);
        this.activebullets = this.activebullets.filter(b => !b.update(dt));
        this.explosions = this.explosions.filter(e => e.update(dt));
    }

    paused1(dt) {
        // Do nothing while paused
    }

    run(dt) {
        if (this.isPaused) return; // Skip updates if paused
        dt = Math.min(0.1, dt);
        this.checkwave(dt);
        this.update1(dt);
    }
    paused1() {}
    gameover(dt) {
        this.ctx.fillStyle = 'rgba(0,255,0,1)';
        this.ctx.font = '32px Copperplate';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("You've been Ripped Off!", this.size[0] / 2, this.size[1] / 2);
        this.update1(dt / 4);
    }
    drawcontrols() {
        if (!this.controlalpha) return;
        this.ctx.strokeStyle = `rgba(0,0,127,${this.controlalpha})`;
        this.ctx.lineWidth = 2;
        this.pl.forEach(p => this.ctx.strokeRect(...p.moverect));
        this.ctx.strokeStyle = `rgba(127,0,127,${this.controlalpha})`;
        this.pl.forEach(p => this.ctx.strokeRect(...p.shootrect));
    }
    draw() {
        this.ctx.clearRect(0, 0, this.size[0], this.size[1]);
        this.state(this.dt);
        this.drawcontrols();
        this.crates.forEach(cr => cr.draw(this.ctx));
        this.pl.forEach(p => p.draw(this.ctx));
        this.killers.forEach(k => k.draw(this.ctx));
        this.activebullets.forEach(b => b.draw(this.ctx));
        this.robbers.forEach(r => r.draw(this.ctx));
        this.explosions.forEach(e => e.draw(this.ctx));
    }

    setupEvents() {
        // Activate audio context on first click
        const aa = () => {
            if (this.sg.ctx.state === 'suspended') this.sg.ctx.resume();
            this.canvas.removeEventListener('click', aa);
        };
        this.canvas.addEventListener('click', aa);
        const touchHandler = (e, began) => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const touches = Array.from(e.touches).map(t => ({
                x: t.clientX - rect.left,
                y: t.clientY - rect.top
            }));
            this.touches = began ? touches : [];
            touches.forEach(t => {
                for (const p of this.pl) {
                    if (began && (p.moverect[0] <= t.x && t.x <= p.moverect[0] + p.moverect[2] &&
                                  p.moverect[1] <= t.y && t.y <= p.moverect[1] + p.moverect[3])) {
                        p.control++;
                        p.movetouch(t);
                    } else if (!began && (p.shootrect[0] <= t.x && t.x <= p.shootrect[0] + p.shootrect[2] &&
                                         p.shootrect[1] <= t.y && t.y <= p.shootrect[1] + p.shootrect[3])) {
                        p.control = Math.max(0, p.control - 1);
                    } else if (began && (p.shootrect[0] <= t.x && t.x <= p.shootrect[0] + p.shootrect[2] &&
                                        p.shootrect[1] <= t.y && t.y <= p.shootrect[1] + p.shootrect[3])) {
                        p.fire();
                    }
                }
            });
        };
        this.canvas.addEventListener('touchstart', e => touchHandler(e, true));
        this.canvas.addEventListener('touchend', e => touchHandler(e, false));
        this.canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const touches = Array.from(e.touches).map(t => ({
                x: t.clientX - rect.left,
                y: t.clientY - rect.top,
                prevX: t.clientX - rect.left,
                prevY: t.clientY - rect.top
            }));
            touches.forEach(t => {
                for (const p of this.pl) {
                    if (p.moverect[0] <= t.x && t.x <= p.moverect[0] + p.moverect[2] &&
                        p.moverect[1] <= t.y && t.y <= p.moverect[1] + p.moverect[3]) {
                        p.movetouch(t);
                    }
                }
            });
        });

        // Updated pause button logic
        const pauseBtn = document.getElementById('pauseBtn');
        pauseBtn.addEventListener('click', () => {
            this.isPaused = !this.isPaused;
            pauseBtn.textContent = this.isPaused ? 'Resume' : 'Pause';
            if (this.isPaused) {
                this.prevstate = this.state;
                this.state = this.paused1.bind(this);
            } else {
                this.state = this.prevstate || this.run.bind(this);
            }
            this.sg.play('Ding_2'); // Play pause sound
        });
    }
	animate() {
        const now = performance.now();
        this.dt = (now - this.lastTime) / 1000;
        this.lastTime = now;
        this.draw();
        requestAnimationFrame(() => this.animate());
    }
}

// Initialize
const canvas = document.getElementById('gameCanvas');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
new MyScene(canvas);
