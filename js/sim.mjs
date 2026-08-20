/** Shared match simulation. No DOM. Used by the browser (solo) and Node (multi). */

export const CONSTANTS = {
    MAP_SIZE: 3000, START_ALTITUDE: 1000,
    DROP_TIME_NORMAL: 10, DROP_TIME_FAST: 5, GROUND_TIME: 60,
    PLAYER_SPEED_AIR: 300, PLAYER_SPEED_GROUND: 200, PLAYER_RADIUS: 15,
    CRATER_RADIUS: 60,
    LOOT_SPAWN_INTERVAL: 5,
    BLUEZONE_DAMAGE: 90,
    WIN_LOOT_COUNT: 7,
    PORTAL_SPAWN_TIME: 20,
    PORTAL_DURATION: 10,
    SLOTS: 10,
    MAP_OBJECT_COUNT: 60,
    INITIAL_LOOT: 30
};

export const WEAPONS = {
    NONE: { name: '맨손', range: 40, damage: 5, delay: 500 },
    KNIFE: { name: '나이프', range: 60, damage: 40, delay: 400 },
    GUN: { name: '소총', range: 500, damage: 15, delay: 150, speed: 1200 },
    SHIELD: { name: '방탄방패', range: 40, damage: 10, delay: 600, defense: 0.5 }
};

export const BOT_COLOR = '#FF5252';

export function mulberry32(seed) {
    let a = seed | 0;
    return function rand() {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

export function clampLoadout(raw = {}) {
    const lv = (n, max = 25) => Math.max(0, Math.min(max, Math.floor(Number(n) || 0)));
    const hp = lv(raw.hp);
    const atk = lv(raw.atk);
    const spd = lv(raw.spd);
    const sta = lv(raw.sta);
    const luck = lv(raw.luck);
    const idle = lv(raw.idle);
    const gear = lv(raw.gear, 3);
    return {
        hp, atk, spd, sta, luck, idle, gear,
        nick: String(raw.nick || 'PLAYER').slice(0, 12),
        color: /^#[0-9A-Fa-f]{6}$/.test(raw.color || '') ? raw.color : '#00BFFF',
        stage: Math.max(1, Math.min(99, Math.floor(Number(raw.stage) || 1))),
        hpBonus: hp * 25,
        atkMult: 1 + atk * 0.08,
        spdMult: 1 + spd * 0.06,
        staDrain: Math.max(0.4, 1 - sta * 0.05),
        staRecover: 1 + sta * 0.06,
        botHpMult: 1,
        botAtkMult: 1,
        botSpdMult: 1
    };
}

export function stageBotMult(stage) {
    const s = Math.max(1, Math.floor(Number(stage) || 1));
    return {
        hp: 1 + Math.max(0, s - 1) * 0.20,
        atk: 1 + Math.max(0, s - 1) * 0.12,
        spd: Math.min(1.6, 1 + Math.max(0, s - 1) * 0.04)
    };
}

export function rollLoot(rand, luck) {
    const l = Math.max(0, luck || 0);
    let gun = 0.60 + l * 0.03, knife = 0.20 + l * 0.02;
    const shield = Math.max(0.05, 1 - gun - knife);
    const tot = gun + knife + shield;
    const r = rand() * tot;
    if (r < gun) return 'GUN';
    if (r < gun + knife) return 'KNIFE';
    return 'SHIELD';
}

export class MapObject {
    constructor(rand) {
        this.x = rand() * CONSTANTS.MAP_SIZE;
        this.y = rand() * CONSTANTS.MAP_SIZE;
        this.type = rand() > 0.4 ? 'BUILDING' : 'ROCK';
        this.width = 60 + rand() * 120;
        this.height = this.type === 'BUILDING' ? 60 + rand() * 100 : this.width;
    }
    checkCollision(x, y, r) {
        if (this.type === 'ROCK') {
            return Math.hypot(x - this.x, y - this.y) < (this.width / 2 + r);
        }
        const nx = Math.max(this.x, Math.min(x, this.x + this.width));
        const ny = Math.max(this.y, Math.min(y, this.y + this.height));
        const dx = x - nx, dy = y - ny;
        return (dx * dx + dy * dy) < (r * r);
    }
}

export class Bullet {
    constructor(x, y, angle, ownerId, damage) {
        this.x = x; this.y = y;
        this.vx = Math.cos(angle) * WEAPONS.GUN.speed;
        this.vy = Math.sin(angle) * WEAPONS.GUN.speed;
        this.ownerId = ownerId; this.damage = damage; this.life = 1.0;
    }
}

export class LootBox {
    constructor(x, y, type) {
        this.x = x; this.y = y;
        this.active = true;
        this.type = type;
    }
}

export class Entity {
    constructor(world, opts) {
        this.world = world;
        this.id = opts.id;
        this.bot = !!opts.bot;
        this.nick = opts.nick || (this.bot ? `BOT ${opts.id}` : 'PLAYER');
        this.x = opts.x || 0; this.y = opts.y || 0;
        this.z = CONSTANTS.START_ALTITUDE;
        this.radius = CONSTANTS.PLAYER_RADIUS;
        this.color = this.bot ? BOT_COLOR : (opts.color || '#00BFFF');
        this.loadout = opts.loadout || clampLoadout({});
        this.maxHp = this.bot
            ? 100 * (opts.botHpMult || 1)
            : 400 + this.loadout.hpBonus;
        this.hp = this.maxHp;
        this.stamina = 100; this.fatigued = false; this.alive = true;
        this.weapon = 'NONE'; this.kills = 0; this.ammo = 0; this.lootCount = 0;
        this.isDiving = false;
        this.dropSpeed = CONSTANTS.START_ALTITUDE / CONSTANTS.DROP_TIME_NORMAL;
        this.actionTimer = 0; this.attackCooldown = 0;
        this.lastX = 0; this.lastY = 0; this.stuckCounter = 0;
        this.angle = 0;
        this.applyStartGear();
    }

    atkMult() {
        return this.bot ? (this.world.botAtkMult || 1) : this.loadout.atkMult;
    }
    spdMult() {
        return this.bot ? (this.world.botSpdMult || 1) : this.loadout.spdMult;
    }

    applyStartGear() {
        if (this.bot) return;
        const luckLoot = Math.floor(this.loadout.luck / 4);
        this.lootCount = luckLoot;
        const gear = this.loadout.gear;
        if (gear >= 1) {
            this.equipWeapon(gear >= 2 ? 'GUN' : 'KNIFE', true);
            if (gear >= 3 && this.weapon === 'GUN') this.ammo = 45;
        }
    }

    update(dt, input) {
        if (!this.alive) return;
        if (this.z > 0) this.updateDrop(dt, input);
        else this.updateGround(dt, input);
    }

    updateDrop(dt, input) {
        let rate = this.dropSpeed;
        if (this.bot) {
            if (this.actionTimer <= 0) {
                this.isDiving = this.world.rand() > 0.5;
                this.actionTimer = 0.5 + this.world.rand() * 2;
            } else this.actionTimer -= dt;
        } else {
            this.isDiving = !!(input && input.sprint);
        }
        if (this.isDiving) rate = CONSTANTS.START_ALTITUDE / CONSTANTS.DROP_TIME_FAST;
        this.z -= rate * dt;

        const spd = CONSTANTS.PLAYER_SPEED_AIR * (this.bot ? 1 : this.loadout.spdMult);
        let dx = 0, dy = 0;
        if (this.bot) {
            dx = this.world.rand() - 0.5; dy = this.world.rand() - 0.5;
        } else if (input) {
            dx = input.dx || 0; dy = input.dy || 0;
        }
        if (dx || dy) {
            const len = Math.hypot(dx, dy) || 1;
            this.x += (dx / len) * spd * dt;
            this.y += (dy / len) * spd * dt;
        }
        this.clamp();

        if (this.z <= 0) {
            this.z = 0; this.isDiving = false;
            this.world.land(this);
        }

        this.world.entities.forEach(other => {
            if (other === this || !other.alive || other.z <= 0) return;
            if (Math.abs(this.z - other.z) > 100) return;
            if (Math.hypot(this.x - other.x, this.y - other.y) < this.radius * 2) {
                const angle = Math.atan2(this.y - other.y, this.x - other.x);
                this.x += Math.cos(angle) * 10;
                this.y += Math.sin(angle) * 10;
                if (this.isDiving) this.isDiving = false;
            }
        });
    }

    updateGround(dt, input) {
        if (this.attackCooldown > 0) this.attackCooldown -= dt;

        if (this.world.phase === 'GROUND') {
            const dist = Math.hypot(this.x - this.world.safeZone.currentX, this.y - this.world.safeZone.currentY);
            if (dist > this.world.safeZone.currentR) {
                this.takeDamage(CONSTANTS.BLUEZONE_DAMAGE * dt, null);
            }
        }

        if (this.bot) this.updateAI(dt);
        else this.updateHuman(dt, input || emptyInput());

        this.clamp();

        this.world.lootBoxes.forEach(box => {
            if (!box.active) return;
            if (Math.hypot(this.x - box.x, this.y - box.y) < this.radius + 15) {
                const drop = this.bot ? box.type : rollLoot(this.world.rand, this.loadout.luck);
                this.equipWeapon(drop, false);
                box.active = false;
                this.world.pushEvent({ type: 'loot', id: this.id, x: box.x, y: box.y, drop });
            }
        });
    }

    updateHuman(dt, input) {
        let dx = input.dx || 0, dy = input.dy || 0;
        let spd = CONSTANTS.PLAYER_SPEED_GROUND * this.loadout.spdMult;
        const moving = (dx !== 0 || dy !== 0);
        if (this.fatigued) {
            this.stamina += 33.3 * this.loadout.staRecover * dt;
            if (this.stamina >= 100) { this.stamina = 100; this.fatigued = false; }
        } else if (input.sprint && moving && this.stamina > 0) {
            spd *= 1.5;
            this.stamina -= 40 * this.loadout.staDrain * dt;
            if (this.stamina <= 0) { this.stamina = 0; this.fatigued = true; }
        } else if (this.stamina < 100) {
            this.stamina += 20 * this.loadout.staRecover * dt;
            if (this.stamina > 100) this.stamina = 100;
        }
        if (moving) {
            const len = Math.hypot(dx, dy) || 1;
            const nx = this.x + (dx / len) * spd * dt;
            const ny = this.y + (dy / len) * spd * dt;
            if (!this.checkMapCollision(nx, ny)) { this.x = nx; this.y = ny; }
            else if (!this.checkMapCollision(nx, this.y)) this.x = nx;
            else if (!this.checkMapCollision(this.x, ny)) this.y = ny;
        }
        if (typeof input.aim === 'number') this.angle = input.aim;
        if (input.attack && this.attackCooldown <= 0) this.attack();
    }

    updateAI(dt) {
        if (this.actionTimer > 0) this.actionTimer -= dt;
        const moved = Math.hypot(this.x - this.lastX, this.y - this.lastY);
        if (moved < 1) this.stuckCounter += dt; else this.stuckCounter = 0;
        this.lastX = this.x; this.lastY = this.y;
        if (this.stuckCounter > 0.5) {
            if (this.stuckCounter > 2) this.stuckCounter = 0;
            const a = this.world.rand() * Math.PI * 2;
            this.x += Math.cos(a) * 50; this.y += Math.sin(a) * 50;
            return;
        }
        const zone = this.world.safeZone;
        if (this.world.phase === 'GROUND') {
            const d = Math.hypot(this.x - zone.currentX, this.y - zone.currentY);
            if (d > zone.currentR - 100) {
                this.moveAI(zone.currentX, zone.currentY, dt);
                this.findAndAttackEnemy(dt, true);
                return;
            }
        }
        if (this.weapon === 'NONE' || (this.weapon === 'GUN' && this.ammo <= 0)) {
            let box = null, min = Infinity;
            this.world.lootBoxes.forEach(b => {
                if (!b.active) return;
                const d = Math.hypot(this.x - b.x, this.y - b.y);
                if (d < min) { min = d; box = b; }
            });
            if (box) {
                this.moveAI(box.x, box.y, dt);
                this.angle = Math.atan2(box.y - this.y, box.x - this.x);
                return;
            }
        }
        this.findAndAttackEnemy(dt, false);
    }

    findAndAttackEnemy(dt, onlyAttack) {
        let target = null, min = Infinity;
        this.world.entities.forEach(e => {
            if (e === this || !e.alive) return;
            const d = Math.hypot(this.x - e.x, this.y - e.y);
            if (d < min) { min = d; target = e; }
        });
        if (!target) return;
        const dist = Math.hypot(target.x - this.x, target.y - this.y);
        const wData = WEAPONS[this.weapon];
        this.angle = Math.atan2(target.y - this.y, target.x - this.x);
        if (!onlyAttack) {
            let desired = wData.range * 0.8;
            if (this.weapon === 'GUN') desired = 250;
            if (dist > desired) this.moveAI(target.x, target.y, dt);
            else if (this.weapon === 'GUN' && dist < 100) {
                const nx = this.x - Math.cos(this.angle) * CONSTANTS.PLAYER_SPEED_GROUND * this.spdMult() * dt;
                const ny = this.y - Math.sin(this.angle) * CONSTANTS.PLAYER_SPEED_GROUND * this.spdMult() * dt;
                if (!this.checkMapCollision(nx, ny)) { this.x = nx; this.y = ny; }
            }
        }
        if (dist <= wData.range || (this.weapon === 'GUN' && dist < 600)) {
            if (this.attackCooldown <= 0) this.attack();
        }
    }

    moveAI(tx, ty, dt) {
        const spd = CONSTANTS.PLAYER_SPEED_GROUND * this.spdMult();
        const angle = Math.atan2(ty - this.y, tx - this.x);
        const check = [0, 0.5, -0.5, 1.0, -1.0, 1.5, -1.5];
        for (const off of check) {
            const a = angle + off;
            const nx = this.x + Math.cos(a) * spd * dt;
            const ny = this.y + Math.sin(a) * spd * dt;
            let hit = false;
            for (const obj of this.world.mapObjects) {
                if (obj.checkCollision(nx, ny, this.radius + 5)) { hit = true; break; }
            }
            if (!hit) { this.x = nx; this.y = ny; return; }
        }
    }

    checkMapCollision(x, y) {
        for (const obj of this.world.mapObjects) {
            if (obj.checkCollision(x, y, this.radius)) return true;
        }
        return false;
    }

    clamp() {
        this.x = Math.max(0, Math.min(CONSTANTS.MAP_SIZE, this.x));
        this.y = Math.max(0, Math.min(CONSTANTS.MAP_SIZE, this.y));
    }

    equipWeapon(type, silent) {
        this.lootCount++;
        this.weapon = type;
        this.ammo = type === 'GUN' ? 30 : 0;
        if (!silent) this.world.pushEvent({ type: 'equip', id: this.id, weapon: type, loot: this.lootCount });
    }

    attack() {
        const wData = WEAPONS[this.weapon];
        this.attackCooldown = wData.delay / 1000;
        const dmg = wData.damage * this.atkMult();
        if (this.weapon === 'GUN') {
            if (this.ammo > 0) {
                this.ammo--;
                this.world.bullets.push(new Bullet(this.x, this.y, this.angle, this.id, dmg));
                this.world.pushEvent({ type: 'shot', id: this.id, x: this.x, y: this.y });
            }
            return;
        }
        this.world.entities.forEach(target => {
            if (target === this || !target.alive) return;
            const dist = Math.hypot(target.x - this.x, target.y - this.y);
            if (dist < wData.range) {
                const ad = Math.abs(Math.atan2(target.y - this.y, target.x - this.x) - this.angle);
                if (ad < 1.5 || ad > 4.7) {
                    target.takeDamage(dmg, this);
                    this.world.pushEvent({ type: 'hit', x: target.x, y: target.y });
                }
            }
        });
    }

    takeDamage(amount, attacker) {
        if (!this.alive) return;
        if (this.weapon === 'SHIELD') amount *= WEAPONS.SHIELD.defense;
        this.hp -= amount;
        if (this.hp <= 0 && this.alive) {
            this.hp = 0; this.alive = false;
            if (attacker) attacker.kills++;
            this.world.pushEvent({
                type: 'kill',
                killer: attacker ? attacker.id : null,
                victim: this.id
            });
            this.world.checkWin();
        }
    }
}

function emptyInput() {
    return { dx: 0, dy: 0, aim: 0, attack: false, sprint: false };
}

export class GameSim {
    constructor(opts) {
        this.seed = (opts.seed >>> 0) || 1;
        this.rand = mulberry32(this.seed);
        this.phase = 'DROPPING';
        this.time = CONSTANTS.DROP_TIME_NORMAL;
        this.hasFirstLanded = false;
        this.lootSpawnTimer = CONSTANTS.LOOT_SPAWN_INTERVAL;
        this.ended = false;
        this.endInfo = null;
        this.events = [];
        this.bullets = [];
        this.lootBoxes = [];
        this.entities = [];
        this.mapObjects = [];
        this.craters = [];
        this.inputs = new Map();
        this.portal = { active: false, x: 0, y: 0, timer: 0, spawnTimer: CONSTANTS.PORTAL_SPAWN_TIME, radius: 60 };
        this.safeZone = { startX: 0, startY: 0, endX: 0, endY: 0, currentX: 0, currentY: 0, startR: 0, endR: 0, currentR: 0 };
        const botM = stageBotMult(opts.stage || 1);
        this.botHpMult = botM.hp;
        this.botAtkMult = botM.atk;
        this.botSpdMult = botM.spd;

        for (let i = 0; i < CONSTANTS.MAP_OBJECT_COUNT; i++) this.mapObjects.push(new MapObject(this.rand));

        const humans = opts.humans || [];
        let nextId = 0;
        for (const h of humans) {
            const pos = this.safeSpawn();
            const e = new Entity(this, {
                id: h.id != null ? h.id : nextId,
                bot: false,
                nick: h.nick,
                color: h.color,
                loadout: clampLoadout(h.loadout || h),
                x: pos.x, y: pos.y
            });
            this.entities.push(e);
            nextId = Math.max(nextId, e.id + 1);
        }
        const bots = opts.bots != null ? opts.bots : Math.max(0, CONSTANTS.SLOTS - this.entities.length);
        for (let i = 0; i < bots; i++) {
            const pos = this.safeSpawn();
            this.entities.push(new Entity(this, {
                id: nextId++,
                bot: true,
                nick: `BOT ${i + 1}`,
                x: pos.x, y: pos.y,
                botHpMult: this.botHpMult
            }));
        }
        for (let i = 0; i < CONSTANTS.INITIAL_LOOT; i++) this.spawnLoot();
    }

    pushEvent(ev) { this.events.push(ev); }

    drainEvents() {
        const e = this.events;
        this.events = [];
        return e;
    }

    setInput(id, input) { this.inputs.set(id, input); }

    safeSpawn() {
        for (let n = 0; n < 50; n++) {
            const x = this.rand() * (CONSTANTS.MAP_SIZE - 100) + 50;
            const y = this.rand() * (CONSTANTS.MAP_SIZE - 100) + 50;
            let hit = false;
            for (const obj of this.mapObjects) {
                if (obj.checkCollision(x, y, CONSTANTS.PLAYER_RADIUS + 5)) { hit = true; break; }
            }
            if (!hit) return { x, y };
        }
        return { x: CONSTANTS.MAP_SIZE / 2, y: CONSTANTS.MAP_SIZE / 2 };
    }

    spawnLoot() {
        for (let n = 0; n < 10; n++) {
            const x = this.rand() * (CONSTANTS.MAP_SIZE - 100) + 50;
            const y = this.rand() * (CONSTANTS.MAP_SIZE - 100) + 50;
            let hit = false;
            for (const obj of this.mapObjects) {
                if (obj.checkCollision(x, y, 15)) { hit = true; break; }
            }
            if (!hit) {
                const r = this.rand();
                const type = r < 0.6 ? 'GUN' : r < 0.8 ? 'SHIELD' : 'KNIFE';
                this.lootBoxes.push(new LootBox(x, y, type));
                return;
            }
        }
    }

    land(ent) {
        this.craters.push({ x: ent.x, y: ent.y, r: CONSTANTS.CRATER_RADIUS, alpha: 1 });
        this.pushEvent({ type: 'land', id: ent.id, x: ent.x, y: ent.y });
        if (!this.hasFirstLanded) {
            this.hasFirstLanded = true;
            this.pushEvent({ type: 'first_land' });
        }
        this.entities.forEach(e => {
            if (e.id === ent.id || !e.alive) return;
            if (e.z <= 50 && Math.hypot(e.x - ent.x, e.y - ent.y) < CONSTANTS.CRATER_RADIUS) {
                e.takeDamage(1000, ent);
                this.pushEvent({ type: 'crater_kill', id: e.id });
            }
        });
    }

    startGround() {
        this.phase = 'GROUND';
        this.time = CONSTANTS.GROUND_TIME;
        const end = this.safeSpawn();
        this.safeZone.startX = CONSTANTS.MAP_SIZE / 2;
        this.safeZone.startY = CONSTANTS.MAP_SIZE / 2;
        this.safeZone.currentX = this.safeZone.startX;
        this.safeZone.currentY = this.safeZone.startY;
        this.safeZone.endX = end.x; this.safeZone.endY = end.y;
        this.safeZone.startR = CONSTANTS.MAP_SIZE * 0.8;
        this.safeZone.endR = 200;
        this.safeZone.currentR = this.safeZone.startR;
        this.pushEvent({ type: 'ground' });
    }

    checkWin() {
        if (this.ended) return;
        const humans = this.entities.filter(e => !e.bot);
        if (humans.length && humans.every(e => !e.alive)) {
            this.finish('death', null);
            return;
        }
        const alive = this.entities.filter(e => e.alive);
        if (alive.length <= 1) this.finish('last', alive[0] || null);
    }

    finish(outcome, winner) {
        if (this.ended) return;
        this.ended = true;
        this.phase = 'END';
        const survived = this.phase === 'GROUND' ? Math.max(0, CONSTANTS.GROUND_TIME - this.time) : 0;
        this.endInfo = {
            outcome,
            winnerId: winner ? winner.id : null,
            winnerBot: winner ? !!(winner.bot) : true,
            survived
        };
        this.pushEvent({ type: 'match_end', ...this.endInfo });
    }

    tick(dt) {
        if (this.ended) return;
        if (this.hasFirstLanded) {
            this.lootSpawnTimer -= dt;
            if (this.lootSpawnTimer <= 0) {
                this.spawnLoot();
                this.lootSpawnTimer = CONSTANTS.LOOT_SPAWN_INTERVAL;
            }
            if (!this.portal.active) {
                this.portal.spawnTimer -= dt;
                if (this.portal.spawnTimer <= 0) {
                    const p = this.safeSpawn();
                    this.portal.x = p.x; this.portal.y = p.y;
                    this.portal.active = true;
                    this.portal.timer = CONSTANTS.PORTAL_DURATION;
                    this.portal.spawnTimer = CONSTANTS.PORTAL_SPAWN_TIME + this.rand() * 20;
                    this.pushEvent({ type: 'portal_spawn', x: p.x, y: p.y });
                }
            } else {
                this.portal.timer -= dt;
                if (this.portal.timer <= 0) {
                    this.portal.active = false;
                    this.pushEvent({ type: 'portal_gone' });
                } else {
                    this.entities.forEach(e => {
                        if (e.bot || !e.alive || e.lootCount < CONSTANTS.WIN_LOOT_COUNT) return;
                        if (Math.hypot(e.x - this.portal.x, e.y - this.portal.y) < this.portal.radius) {
                            this.finish('portal', e);
                        }
                    });
                }
            }
        }

        if (this.phase === 'DROPPING') {
            if (this.entities.every(e => e.z <= 0 || !e.alive)) this.startGround();
        } else if (this.phase === 'GROUND') {
            this.time -= dt;
            if (this.time <= 0) {
                this.time = 0;
                const aliveHumans = this.entities.filter(e => !e.bot && e.alive);
                this.finish(aliveHumans.length ? 'time' : 'death', aliveHumans[0] || null);
            }
            const p = 1 - (this.time / CONSTANTS.GROUND_TIME);
            this.safeZone.currentR = this.safeZone.startR + (this.safeZone.endR - this.safeZone.startR) * p;
            this.safeZone.currentX = this.safeZone.startX + (this.safeZone.endX - this.safeZone.startX) * p;
            this.safeZone.currentY = this.safeZone.startY + (this.safeZone.endY - this.safeZone.startY) * p;
        }

        this.entities.forEach(e => {
            const inp = e.bot ? null : (this.inputs.get(e.id) || emptyInput());
            e.update(dt, inp);
        });

        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            const nx = b.x + b.vx * dt, ny = b.y + b.vy * dt;
            let dead = false;
            for (const obj of this.mapObjects) {
                if (obj.checkCollision(nx, ny, 2)) { dead = true; break; }
            }
            if (!dead) {
                this.entities.forEach(e => {
                    if (e.id === b.ownerId || !e.alive) return;
                    const hr = e.z > 0 ? e.radius + 10 : e.radius;
                    if (Math.hypot(nx - e.x, ny - e.y) < hr) {
                        const atk = this.entities.find(x => x.id === b.ownerId);
                        e.takeDamage(b.damage, atk || null);
                        dead = true;
                    }
                });
            }
            b.x = nx; b.y = ny; b.life -= dt;
            if (dead || b.life <= 0 || b.x < 0 || b.x > CONSTANTS.MAP_SIZE || b.y < 0 || b.y > CONSTANTS.MAP_SIZE) {
                this.bullets.splice(i, 1);
            }
        }

        this.craters.forEach(c => { c.alpha -= dt * 0.05; });
        this.checkWin();
    }

    snapshot() {
        return {
            phase: this.phase,
            time: this.time,
            ended: this.ended,
            endInfo: this.endInfo,
            zone: this.phase === 'GROUND' ? {
                x: this.safeZone.currentX, y: this.safeZone.currentY, r: this.safeZone.currentR
            } : null,
            portal: this.portal.active ? { x: this.portal.x, y: this.portal.y, r: this.portal.radius } : null,
            entities: this.entities.map(e => ({
                id: e.id, bot: e.bot, nick: e.nick, color: e.color,
                x: e.x, y: e.y, z: e.z, angle: e.angle,
                hp: e.hp, maxHp: e.maxHp, stamina: e.stamina, fatigued: e.fatigued,
                alive: e.alive, weapon: e.weapon, ammo: e.ammo,
                loot: e.lootCount, kills: e.kills, diving: e.isDiving
            })),
            bullets: this.bullets.map(b => ({ x: b.x, y: b.y })),
            loot: this.lootBoxes.filter(b => b.active).map(b => ({ x: b.x, y: b.y })),
            craters: this.craters.filter(c => c.alpha > 0).map(c => ({ x: c.x, y: c.y, r: c.r, a: c.alpha })),
            alive: this.entities.filter(e => e.alive).length
        };
    }

    mapSnapshot() {
        return this.mapObjects.map(o => ({
            x: o.x, y: o.y, type: o.type, width: o.width, height: o.height
        }));
    }

    entity(id) { return this.entities.find(e => e.id === id); }

    disconnect(id) {
        const e = this.entity(id);
        if (e && e.alive) e.takeDamage(1e9, null);
    }
}
