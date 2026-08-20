import { WebSocket } from 'ws';
import { GameSim, CONSTANTS, clampLoadout } from '../js/sim.mjs';

const FILL_MS = 2000;
const TICK = 1000 / 20;

let nextRoomId = 1;

export class Room {
    constructor() {
        this.id = nextRoomId++;
        this.clients = new Map(); // ws -> { id, nick, loadout }
        this.nextId = 1;
        this.sim = null;
        this.filling = true;
        this.started = false;
        this.closed = false;
        this.fillTimer = setTimeout(() => this.begin(), FILL_MS);
        this.tickTimer = null;
    }

    get size() { return this.clients.size; }
    get full() { return this.clients.size >= CONSTANTS.SLOTS; }

    add(ws, join) {
        if (!this.filling || this.full || this.closed) return null;
        const loadout = clampLoadout(join || {});
        const id = this.nextId++;
        const info = { id, nick: loadout.nick, loadout };
        this.clients.set(ws, info);
        this.send(ws, { type: 'welcome', id, room: this.id, wait: FILL_MS });
        this.broadcast({
            type: 'roster',
            players: [...this.clients.values()].map(c => ({ id: c.id, nick: c.nick }))
        });
        if (this.full) this.begin();
        return info;
    }

    begin() {
        if (this.started || this.closed) return;
        this.started = true;
        this.filling = false;
        if (this.fillTimer) { clearTimeout(this.fillTimer); this.fillTimer = null; }
        if (this.clients.size === 0) { this.closed = true; return; }

        const humans = [...this.clients.values()].map(c => ({
            id: c.id,
            nick: c.nick,
            color: c.loadout.color,
            loadout: c.loadout
        }));
        const stage = Math.max(1, ...humans.map(h => h.loadout.stage || 1));
        const seed = (Math.random() * 0xffffffff) >>> 0;
        const bots = Math.max(0, CONSTANTS.SLOTS - humans.length);
        this.sim = new GameSim({ humans, bots, seed, stage });
        const map = this.sim.mapSnapshot();
        this.broadcast({
            type: 'start',
            seed,
            map,
            snapshot: this.sim.snapshot()
        });
        this.tickTimer = setInterval(() => this.step(), TICK);
    }

    step() {
        if (!this.sim || this.closed) return;
        this.sim.tick(TICK / 1000);
        const events = this.sim.drainEvents();
        const snap = this.sim.snapshot();
        this.broadcast({ type: 'state', snapshot: snap, events });
        if (this.sim.ended) this.close();
    }

    onInput(ws, msg) {
        const info = this.clients.get(ws);
        if (!info || !this.sim) return;
        this.sim.setInput(info.id, {
            dx: clamp1(msg.dx), dy: clamp1(msg.dy),
            aim: Number(msg.aim) || 0,
            attack: !!msg.attack,
            sprint: !!msg.sprint
        });
    }

    onLeave(ws) {
        const info = this.clients.get(ws);
        this.clients.delete(ws);
        if (!info) {
            if (this.clients.size === 0) this.close();
            return;
        }
        if (this.sim) this.sim.disconnect(info.id);
        if (!this.started && this.clients.size === 0) this.close();
        else if (this.started && this.clients.size === 0) this.close();
    }

    send(ws, msg) {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    }

    broadcast(msg) {
        const raw = JSON.stringify(msg);
        for (const ws of this.clients.keys()) {
            if (ws.readyState === WebSocket.OPEN) ws.send(raw);
        }
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        this.filling = false;
        if (this.fillTimer) clearTimeout(this.fillTimer);
        if (this.tickTimer) clearInterval(this.tickTimer);
        this.tickTimer = null;
    }
}

function clamp1(v) {
    const n = Number(v) || 0;
    return Math.max(-1, Math.min(1, n));
}

export class Matchmaker {
    constructor() {
        this.open = null;
        this.rooms = new Set();
    }
    join(ws, join) {
        this.gc();
        if (!this.open || !this.open.filling || this.open.full || this.open.closed) {
            this.open = new Room();
            this.rooms.add(this.open);
        }
        const room = this.open;
        const info = room.add(ws, join);
        if (room.full || room.started) this.open = null;
        return { room, info };
    }
    gc() {
        for (const r of [...this.rooms]) {
            if (r.closed) this.rooms.delete(r);
        }
        if (this.open && this.open.closed) this.open = null;
    }
}
