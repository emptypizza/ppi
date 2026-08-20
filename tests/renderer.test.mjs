import assert from 'node:assert/strict';
import { createMatchView, DEFAULT_VIEW } from '../js/view.mjs';

function log(...a) { console.log(...a); }

function makeFakePixi() {
    class Vec {
        constructor() { this.x = 0; this.y = 0; }
        set(x, y) { this.x = x; this.y = y; }
    }
    class Scale {
        constructor() { this.x = 1; this.y = 1; }
        set(x, y) { this.x = x; this.y = y == null ? x : y; }
    }
    class Container {
        constructor() {
            this.children = [];
            this.position = new Vec();
            this.scale = new Scale();
            this.pivot = new Vec();
            this.rotation = 0;
            this.alpha = 1;
            this.visible = true;
        }
        addChild(c) { this.children.push(c); return c; }
        removeChild(c) { this.children = this.children.filter((x) => x !== c); }
        removeChildren() { this.children = []; }
        destroy() {}
    }
    class Graphics extends Container {
        circle() { return this; }
        rect() { return this; }
        roundRect() { return this; }
        ellipse() { return this; }
        poly() { return this; }
        arc() { return this; }
        moveTo() { return this; }
        lineTo() { return this; }
        fill() { return this; }
        stroke() { return this; }
        clear() { return this; }
    }
    class Text extends Container {
        constructor(opts = {}) {
            super();
            this.text = opts.text || '';
            this.anchor = new Vec();
            this.anchor.set = (x, y) => { this.anchor.x = x; this.anchor.y = y == null ? x : y; };
        }
    }
    class Application {
        constructor() {
            this.canvas = { width: 0, height: 0, style: {}, tagName: 'CANVAS' };
            this.stage = new Container();
            this.ticker = { add() {}, remove() {} };
            this.renderer = { width: 0, height: 0, resize(w, h) { this.width = w; this.height = h; } };
        }
        async init(opts = {}) {
            const w = opts.width;
            const h = opts.height;
            if (w == null || h == null) throw new Error('Application.init requires width/height (no leftover default)');
            const canvas = opts.canvas || this.canvas;
            canvas.width = w;
            canvas.height = h;
            if (!canvas.style) canvas.style = {};
            this.canvas = canvas;
            this.renderer.width = w;
            this.renderer.height = h;
        }
        destroy() {}
    }
    return { Application, Graphics, Container, Text };
}

log('--- renderer bootstrap (shipped js/view.mjs) ---');

globalThis.window = globalThis;
globalThis.document = {
    createElement(tag) {
        return {
            tagName: String(tag).toUpperCase(),
            width: 0,
            height: 0,
            style: {},
            getContext() { return {}; }
        };
    }
};

const intended = { width: 1280, height: 720 };
assert.equal(DEFAULT_VIEW.width, 1280);
assert.equal(DEFAULT_VIEW.height, 720);

const host = {
    clientWidth: intended.width,
    clientHeight: intended.height,
    child: null,
    appendChild(el) { this.child = el; return el; }
};

const pixi = makeFakePixi();
const view = await createMatchView(host, pixi);

assert.ok(view.app, 'Pixi Application created');
assert.equal(typeof view.app.init, 'function');
assert.equal(view.width, intended.width, 'view width is intended size');
assert.equal(view.height, intended.height, 'view height is intended size');
assert.ok(view.canvas, 'drawing surface exists');
assert.equal(view.canvas.width, intended.width, 'canvas width matches intended');
assert.equal(view.canvas.height, intended.height, 'canvas height matches intended');
assert.equal(host.child, view.canvas, 'surface attached to host');
assert.notEqual(view.width, 800, 'not leftover pixi default width');
assert.notEqual(view.height, 600, 'not leftover pixi default height');
assert.ok(view.app.stage, 'stage present');

log('ok Pixi Application', view.width + 'x' + view.height, 'attached');

{
    const emptyHost = {
        clientWidth: 0,
        clientHeight: 0,
        child: null,
        appendChild(el) { this.child = el; return el; }
    };
    const fallback = await createMatchView(emptyHost, makeFakePixi());
    assert.equal(fallback.width, DEFAULT_VIEW.width, 'empty host uses intended 1280');
    assert.equal(fallback.height, DEFAULT_VIEW.height, 'empty host uses intended 720');
    assert.notEqual(fallback.width, 800);
    assert.notEqual(fallback.height, 600);
    log('ok fallback DEFAULT_VIEW', fallback.width + 'x' + fallback.height);
}

log('ALL RENDERER TESTS PASSED');
