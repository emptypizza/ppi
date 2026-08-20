import { CONSTANTS } from './sim.mjs';

/** Intended match view when the host has no layout size yet. */
export const DEFAULT_VIEW = { width: 1280, height: 720 };

function hex(color) {
    if (typeof color === 'number') return color;
    if (!color) return 0x00bfff;
    const s = String(color).replace('#', '');
    return parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16) || 0x00bfff;
}

function measureHost(host, opts) {
    const w = Math.max(1, Math.floor(
        opts.width
        || (host && host.clientWidth)
        || (typeof window !== 'undefined' && window.innerWidth)
        || DEFAULT_VIEW.width
    ));
    const h = Math.max(1, Math.floor(
        opts.height
        || (host && host.clientHeight)
        || (typeof window !== 'undefined' && window.innerHeight)
        || DEFAULT_VIEW.height
    ));
    return { width: w, height: h };
}

/**
 * Boot a Pixi.js Application onto `host` at the intended view size.
 * `pixi` is the pixi.js namespace (browser CDN or a test double).
 */
export async function createMatchView(host, pixi, opts = {}) {
    if (!pixi || typeof pixi.Application !== 'function') {
        throw new Error('createMatchView requires a Pixi.js namespace with Application');
    }
    const { width, height } = measureHost(host, opts);
    let canvas = opts.canvas;
    if (!canvas && typeof document !== 'undefined' && document.createElement) {
        canvas = document.createElement('canvas');
    }
    if (!canvas) canvas = { width, height, style: {} };
    canvas.width = width;
    canvas.height = height;
    if (canvas.style) {
        canvas.style.display = 'block';
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
    }

    const app = new pixi.Application();
    const initOpts = {
        width,
        height,
        background: 0xC48A58,
        backgroundColor: 0xC48A58,
        backgroundAlpha: 1,
        antialias: true,
        preference: 'webgl',
        preserveDrawingBuffer: true,
        autoDensity: false,
        resolution: 1
    };
    if (canvas.tagName || canvas.getContext) initOpts.canvas = canvas;
    if (typeof app.init === 'function') await app.init(initOpts);
    else {
        app.renderer = app.renderer || {};
        app.renderer.width = width;
        app.renderer.height = height;
        app.canvas = canvas;
        app.stage = app.stage || new pixi.Container();
    }

    const surface = app.canvas || app.view || canvas;
    if (surface && surface !== canvas) {
        surface.width = width;
        surface.height = height;
        if (surface.style) {
            surface.style.display = 'block';
            surface.style.width = width + 'px';
            surface.style.height = height + 'px';
        }
    }
    if (host && typeof host.appendChild === 'function') {
        host.appendChild(surface);
    }

    const view = new MatchView(app, pixi, width, height, surface);
    if (app.renderer && app.renderer.background) {
        try { app.renderer.background.color = 0xC48A58; } catch (e) {}
    }
    if (typeof app.start === 'function') app.start();
    if (typeof app.render === 'function') app.render();
    return view;
}

export class MatchView {
    constructor(app, pixi, width, height, canvas) {
        this.app = app;
        this.pixi = pixi;
        this.width = width;
        this.height = height;
        this.canvas = canvas || app.canvas || app.view;
        this.stage = app.stage;
        this.world = new pixi.Container();
        this.fx = new pixi.Container();
        this.minimap = new pixi.Container();
        this.layers = {
            ground: new pixi.Container(),
            zone: new pixi.Container(),
            craters: new pixi.Container(),
            props: new pixi.Container(),
            loot: new pixi.Container(),
            actors: new pixi.Container(),
            bullets: new pixi.Container()
        };
        Object.values(this.layers).forEach((l) => this.world.addChild(l));
        this.world.addChild(this.fx);
        this.stage.addChild(this.world);
        this.stage.addChild(this.minimap);
        this._ground = null;
        this._zoneG = new pixi.Graphics();
        this.layers.zone.addChild(this._zoneG);
        this._portalG = new pixi.Graphics();
        this.layers.zone.addChild(this._portalG);
        this._actors = new Map();
        this._loot = new Map();
        this._mapBuilt = false;
        this._pulse = 0;
        this.drawGround();
        this.drawMinimapFrame();
    }

    drawGround() {
        const G = this.pixi.Graphics;
        const g = new G();
        const size = CONSTANTS.MAP_SIZE;
        g.rect(-200, -200, size + 400, size + 400);
        g.fill({ color: 0xB07A4A });
        g.rect(0, 0, size, size);
        g.fill({ color: 0xD4A373 });
        const step = 80;
        for (let y = 0; y < size; y += step) {
            for (let x = 0; x < size; x += step) {
                const odd = ((x / step) + (y / step)) % 2 === 0;
                g.rect(x, y, step, step);
                g.fill({ color: odd ? 0xC9966A : 0xD8AB7C });
            }
        }
        g.rect(0, 0, size, size);
        g.stroke({ width: 10, color: 0x8D6E63, alpha: 1 });
        this.layers.ground.addChild(g);
        this._ground = g;
    }

    drawMinimapFrame() {
        const G = this.pixi.Graphics;
        const g = new G();
        g.rect(0, 0, 160, 160);
        g.fill({ color: 0x000000, alpha: 0.55 });
        g.rect(0, 0, 160, 160);
        g.stroke({ width: 2, color: 0xffffff, alpha: 0.85 });
        this.minimap.addChild(g);
        this._mmWorld = new this.pixi.Container();
        this.minimap.addChild(this._mmWorld);
        this.minimap.position.set(18, 18);
        this._mmZone = new G();
        this._mmWorld.addChild(this._mmZone);
        this._mmPortal = new G();
        this._mmWorld.addChild(this._mmPortal);
        this._mmMe = new G();
        this._mmWorld.addChild(this._mmMe);
    }

    setMap(mapObjects) {
        this.layers.props.removeChildren();
        const G = this.pixi.Graphics;
        (mapObjects || []).forEach((obj) => {
            const g = new G();
            if (obj.type === 'BUILDING') {
                g.rect(obj.x, obj.y + obj.height, obj.width, 16);
                g.fill({ color: 0x3E2723 });
                g.rect(obj.x, obj.y, obj.width, obj.height);
                g.fill({ color: 0x6D4C41 });
                g.rect(obj.x + 10, obj.y + 10, Math.max(4, obj.width - 20), Math.max(4, obj.height - 20));
                g.fill({ color: 0x4E342E });
                g.rect(obj.x, obj.y, obj.width, 8);
                g.fill({ color: 0x8D6E63, alpha: 0.5 });
            } else {
                const r = obj.width / 2;
                g.ellipse(obj.x + 6, obj.y + 8, r, r * 0.85);
                g.fill({ color: 0x000000, alpha: 0.22 });
                g.circle(obj.x, obj.y, r);
                g.fill({ color: 0x795548 });
                g.circle(obj.x - r * 0.25, obj.y - r * 0.25, r * 0.35);
                g.fill({ color: 0x8D6A5A, alpha: 0.5 });
            }
            this.layers.props.addChild(g);
        });
        this._mapBuilt = true;
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        if (this.canvas) {
            this.canvas.width = width;
            this.canvas.height = height;
            if (this.canvas.style) {
                this.canvas.style.width = width + 'px';
                this.canvas.style.height = height + 'px';
            }
        }
        if (this.app && this.app.renderer && typeof this.app.renderer.resize === 'function') {
            this.app.renderer.resize(width, height);
        }
    }

    _actor(id) {
        let a = this._actors.get(id);
        if (a) return a;
        const G = this.pixi.Graphics;
        const root = new this.pixi.Container();
        const shadow = new G();
        const body = new G();
        const gear = new G();
        const hp = new G();
        const label = new this.pixi.Text({
            text: '',
            style: { fontFamily: 'Arial', fontSize: 18, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x000000, width: 3 } }
        });
        label.anchor ? label.anchor.set(0.5, 1) : (label.anchor = { x: 0.5, y: 1 });
        root.addChild(shadow, body, gear, hp, label);
        this.layers.actors.addChild(root);
        a = { root, shadow, body, gear, hp, label };
        this._actors.set(id, a);
        return a;
    }

    sync(snapshot, mapObjects, myId, particles) {
        if (!snapshot) return;
        if (mapObjects && !this._mapBuilt) this.setMap(mapObjects);
        this._pulse += 0.08;
        const p = (snapshot.entities || []).find((e) => e.id === myId) || snapshot.entities[0];
        if (!p) return;
        const zoom = 1 / (1 + (p.z / 300));
        this.world.scale.set(zoom, zoom);
        this.world.position.set(this.width / 2 - p.x * zoom, this.height / 2 - p.y * zoom);

        this._drawZone(snapshot);
        this._drawCraters(snapshot);
        this._drawLoot(snapshot);
        this._drawActors(snapshot, myId);
        this._drawBullets(snapshot);
        this._drawFx(particles);
        this._drawMinimap(snapshot, p);
    }

    _drawZone(snapshot) {
        const g = this._zoneG;
        g.clear();
        if (snapshot.zone) {
            const z = snapshot.zone;
            const size = CONSTANTS.MAP_SIZE;
            g.rect(-800, -800, size + 1600, size + 1600);
            g.fill({ color: 0x2266FF, alpha: 0.22 });
            g.circle(z.x, z.y, z.r);
            g.fill({ color: 0xD4A373, alpha: 1 });
            g.circle(z.x, z.y, z.r);
            g.stroke({ width: 6, color: 0xFFFFFF, alpha: 0.85 });
        }
        const pg = this._portalG;
        pg.clear();
        if (snapshot.portal) {
            const o = snapshot.portal;
            const pulse = 1 + Math.sin(this._pulse) * 0.08;
            pg.circle(o.x, o.y, o.r * pulse * 1.25);
            pg.fill({ color: 0x00FF66, alpha: 0.12 });
            pg.circle(o.x, o.y, o.r * pulse);
            pg.fill({ color: 0x00FF55, alpha: 0.28 });
            pg.circle(o.x, o.y, o.r * pulse);
            pg.stroke({ width: 5, color: 0x66FF99, alpha: 0.95 });
        }
    }

    _drawCraters(snapshot) {
        this.layers.craters.removeChildren();
        const G = this.pixi.Graphics;
        (snapshot.craters || []).forEach((c) => {
            const g = new G();
            g.circle(c.x, c.y, c.r);
            g.fill({ color: 0x1A1510, alpha: (c.a || 0.4) * 0.45 });
            this.layers.craters.addChild(g);
        });
    }

    _drawLoot(snapshot) {
        const seen = new Set();
        const G = this.pixi.Graphics;
        (snapshot.loot || []).forEach((box, i) => {
            const key = box.x + ',' + box.y;
            seen.add(key);
            let node = this._loot.get(key);
            if (!node) {
                const root = new this.pixi.Container();
                const g = new G();
                g.roundRect(-16, -16, 32, 32, 4);
                g.fill({ color: 0xFFD54F });
                g.roundRect(-16, -16, 32, 32, 4);
                g.stroke({ width: 2, color: 0xB8860B });
                const t = new this.pixi.Text({
                    text: '?',
                    style: { fontFamily: 'Arial', fontSize: 22, fontWeight: '900', fill: 0x111111 }
                });
                if (t.anchor) t.anchor.set(0.5);
                root.addChild(g, t);
                this.layers.loot.addChild(root);
                node = root;
                this._loot.set(key, node);
            }
            node.position.set(box.x, box.y);
            node.rotation = Math.sin(this._pulse + i) * 0.05;
            node.visible = true;
        });
        for (const [k, node] of this._loot) {
            if (!seen.has(k)) node.visible = false;
        }
    }

    _drawActors(snapshot, myId) {
        const seen = new Set();
        const r = CONSTANTS.PLAYER_RADIUS;
        (snapshot.entities || []).forEach((e) => {
            seen.add(e.id);
            const a = this._actor(e.id);
            a.root.position.set(e.x, e.y);
            a.root.visible = true;
            const sc = e.alive ? 1 + (e.z / 800) : 0.7;
            a.root.scale.set(sc, sc);
            a.body.clear();
            a.shadow.clear();
            a.gear.clear();
            a.hp.clear();
            if (!e.alive) {
                a.body.circle(0, 0, 10);
                a.body.fill({ color: 0x5D4037 });
                a.label.text = '';
                return;
            }
            const sh = Math.max(2, r * (1 - e.z / 2000));
            a.shadow.ellipse(4, 10, sh * 1.1, sh * 0.55);
            a.shadow.fill({ color: 0x000000, alpha: 0.35 });
            a.body.circle(0, 0, r + 2);
            a.body.fill({ color: 0x000000, alpha: 0.2 });
            a.body.circle(0, 0, r);
            a.body.fill({ color: hex(e.color) });
            a.body.circle(-r * 0.28, -r * 0.28, r * 0.38);
            a.body.fill({ color: 0xffffff, alpha: 0.28 });
            if (e.id === myId && e.loot >= CONSTANTS.WIN_LOOT_COUNT) {
                a.body.circle(0, 0, r + 6);
                a.body.stroke({ width: 3, color: 0x33FF66, alpha: 0.85 });
            }
            a.gear.rotation = e.angle || 0;
            if (e.weapon === 'GUN') {
                a.gear.roundRect(8, -5, 22, 10, 2);
                a.gear.fill({ color: 0xEEEEEE });
            } else if (e.weapon === 'KNIFE') {
                a.gear.rect(10, -2, 20, 4);
                a.gear.fill({ color: 0xCFD8DC });
            } else if (e.weapon === 'SHIELD') {
                a.gear.arc(0, 0, r + 8, -Math.PI / 2, Math.PI / 2);
                a.gear.stroke({ width: 4, color: 0x3F51B5 });
            } else {
                a.gear.circle(12, 5, 5);
                a.gear.fill({ color: 0xffffff });
                a.gear.circle(12, -5, 5);
                a.gear.fill({ color: 0xffffff });
            }
            if (e.diving && e.z > 0) {
                a.gear.moveTo(-15, -15); a.gear.lineTo(-30, -30);
                a.gear.moveTo(-15, 15); a.gear.lineTo(-30, 30);
                a.gear.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
            }
            a.label.text = e.id === myId ? (e.nick || '나') : (e.nick || '');
            a.label.position.set(0, -r - 16);
            const pct = e.maxHp ? e.hp / e.maxHp : 0;
            a.hp.rect(-15, -r - 12, 30, 4);
            a.hp.fill({ color: 0x880000 });
            a.hp.rect(-15, -r - 12, 30 * pct, 4);
            a.hp.fill({ color: 0x33DD33 });
        });
        for (const [id, a] of this._actors) {
            if (!seen.has(id)) a.root.visible = false;
        }
    }

    _drawBullets(snapshot) {
        this.layers.bullets.removeChildren();
        const G = this.pixi.Graphics;
        (snapshot.bullets || []).forEach((b) => {
            const g = new G();
            g.circle(b.x, b.y, 5);
            g.fill({ color: 0xFFE066 });
            g.circle(b.x, b.y, 8);
            g.fill({ color: 0xFFFFAA, alpha: 0.25 });
            this.layers.bullets.addChild(g);
        });
    }

    _drawFx(particles) {
        this.fx.removeChildren();
        const G = this.pixi.Graphics;
        (particles || []).forEach((pt) => {
            const g = new G();
            g.circle(0, 0, 3);
            g.fill({ color: hex(pt.color), alpha: Math.max(0, pt.life) });
            g.position.set(pt.x, pt.y);
            this.fx.addChild(g);
        });
    }

    _drawMinimap(snapshot, p) {
        const sc = 160 / CONSTANTS.MAP_SIZE;
        this._mmZone.clear();
        if (snapshot.zone) {
            this._mmZone.circle(snapshot.zone.x * sc, snapshot.zone.y * sc, snapshot.zone.r * sc);
            this._mmZone.stroke({ width: 1.5, color: 0x4488FF });
        }
        this._mmPortal.clear();
        if (snapshot.portal) {
            this._mmPortal.circle(snapshot.portal.x * sc, snapshot.portal.y * sc, 4);
            this._mmPortal.fill({ color: 0x00FF66 });
        }
        this._mmMe.clear();
        (snapshot.entities || []).forEach((e) => {
            if (!e.alive) return;
            const mine = p && e.id === p.id;
            this._mmMe.circle(e.x * sc, e.y * sc, mine ? 3.5 : 2);
            this._mmMe.fill({ color: hex(e.color) });
        });
    }
}
