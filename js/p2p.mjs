import { Peer } from 'https://esm.sh/peerjs@1.5.4?bundle';

const FILL_MS = 2000;
const PREFIX = 'ppi-rr';

function bucketIds() {
    const t = Math.floor(Date.now() / FILL_MS);
    const ids = [];
    for (let b = t; b <= t + 1; b++) {
        for (let n = 0; n < 4; n++) ids.push(n ? `${PREFIX}-${b}-${n}` : `${PREFIX}-${b}`);
    }
    return ids;
}

function parse(raw) {
    if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch (e) { return null; }
    }
    return raw && typeof raw === 'object' ? raw : null;
}

export class P2PRoom {
    constructor() {
        this.role = null;
        this.peer = null;
        this.hostConn = null;
        this.guests = [];
        this.nextId = 2;
        this.myId = 1;
        this.loadout = null;
        this.started = false;
        this.handlers = {};
        this.fillTimer = null;
    }

    on(type, fn) { this.handlers[type] = fn; }
    emit(msg) { const fn = this.handlers[msg.type]; if (fn) fn(msg); }

    send(msg) {
        if (this.role === 'guest' && this.hostConn && this.hostConn.open) {
            this.hostConn.send(JSON.stringify(msg));
        }
    }

    broadcast(msg) {
        const raw = JSON.stringify(msg);
        for (const g of this.guests) {
            if (g.conn.open) g.conn.send(raw);
        }
    }

    humans() {
        const list = [{
            id: this.myId,
            nick: this.loadout.nick,
            color: this.loadout.color,
            loadout: this.loadout
        }];
        for (const g of this.guests) {
            list.push({ id: g.id, nick: g.loadout.nick, color: g.loadout.color, loadout: g.loadout });
        }
        return list;
    }

    close() {
        if (this.fillTimer) clearTimeout(this.fillTimer);
        try { if (this.hostConn) this.hostConn.close(); } catch (e) {}
        for (const g of this.guests) {
            try { g.conn.close(); } catch (e) {}
        }
        try { if (this.peer) this.peer.destroy(); } catch (e) {}
        this.peer = null;
    }

    async joinQuick(loadout) {
        this.loadout = loadout;
        const ids = bucketIds();
        let lastErr = null;
        for (const id of ids) {
            try {
                return await this._tryRoom(id);
            } catch (e) {
                lastErr = e;
                this.close();
                if (e && e.code === 'full') continue;
            }
        }
        throw lastErr || new Error('p2p fail');
    }

    _tryRoom(roomId) {
        return new Promise((resolve, reject) => {
            const peer = new Peer(roomId);
            const timeout = setTimeout(() => {
                try { peer.destroy(); } catch (e) {}
                reject(new Error('timeout'));
            }, 4000);

            const fail = (err) => {
                clearTimeout(timeout);
                try { peer.destroy(); } catch (e) {}
                reject(err);
            };

            peer.on('error', (err) => {
                if (err.type === 'unavailable-id') {
                    clearTimeout(timeout);
                    try { peer.destroy(); } catch (e) {}
                    this._joinHost(roomId).then(resolve, reject);
                    return;
                }
                fail(err);
            });

            peer.on('open', () => {
                clearTimeout(timeout);
                this.peer = peer;
                this.role = 'host';
                this.myId = 1;
                this.nextId = 2;
                this.guests = [];
                this.started = false;
                peer.on('connection', (conn) => this._accept(conn));
                this.emit({ type: 'welcome', id: this.myId });
                this.fillTimer = setTimeout(() => this._begin(), FILL_MS);
                resolve({ role: 'host', myId: this.myId });
            });
        });
    }

    _joinHost(roomId) {
        return new Promise((resolve, reject) => {
            const peer = new Peer();
            const timeout = setTimeout(() => {
                try { peer.destroy(); } catch (e) {}
                reject(Object.assign(new Error('join timeout'), { code: 'full' }));
            }, 4000);

            peer.on('error', (err) => {
                clearTimeout(timeout);
                try { peer.destroy(); } catch (e) {}
                reject(err);
            });

            peer.on('open', () => {
                const conn = peer.connect(roomId, { reliable: true });
                conn.on('error', () => {
                    clearTimeout(timeout);
                    try { peer.destroy(); } catch (e) {}
                    reject(Object.assign(new Error('peer-unavailable'), { code: 'full' }));
                });
                conn.on('open', () => {
                    conn.send(JSON.stringify({ type: 'join', ...this.loadout }));
                });
                conn.on('data', (raw) => {
                    const msg = parse(raw);
                    if (!msg) return;
                    if (msg.type === 'too_late' || msg.type === 'full') {
                        clearTimeout(timeout);
                        try { conn.close(); peer.destroy(); } catch (e) {}
                        reject(Object.assign(new Error('full'), { code: 'full' }));
                        return;
                    }
                    if (msg.type === 'welcome') {
                        clearTimeout(timeout);
                        this.peer = peer;
                        this.hostConn = conn;
                        this.role = 'guest';
                        this.myId = msg.id;
                        conn.on('data', (r2) => {
                            const m2 = parse(r2);
                            if (m2) this.emit(m2);
                        });
                        conn.on('close', () => this.emit({ type: 'close' }));
                        this.emit({ type: 'welcome', id: msg.id });
                        resolve({ role: 'guest', myId: msg.id });
                    } else {
                        this.emit(msg);
                    }
                });
            });
        });
    }

    _accept(conn) {
        conn.on('data', (raw) => {
            const msg = parse(raw);
            if (!msg) return;
            if (msg.type === 'join') {
                if (this.started || this.humans().length >= 10) {
                    conn.send(JSON.stringify({ type: 'full' }));
                    conn.close();
                    return;
                }
                const id = this.nextId++;
                const loadout = {
                    nick: String(msg.nick || 'PLAYER').slice(0, 12),
                    color: msg.color,
                    hp: msg.hp, atk: msg.atk, spd: msg.spd, sta: msg.sta,
                    luck: msg.luck, idle: msg.idle, gear: msg.gear, stage: msg.stage
                };
                this.guests.push({ conn, id, loadout });
                conn.send(JSON.stringify({ type: 'welcome', id }));
                conn.on('close', () => {
                    this.guests = this.guests.filter(g => g.id !== id);
                    this.emit({ type: 'guest_left', id });
                });
                return;
            }
            if (msg.type === 'input') {
                const g = this.guests.find(x => x.conn === conn);
                if (g) this.emit({ type: 'peer_input', id: g.id, dx: msg.dx, dy: msg.dy, aim: msg.aim, attack: msg.attack, sprint: msg.sprint });
            }
        });
    }

    _begin() {
        if (this.started) return;
        this.started = true;
        this.emit({ type: 'host_ready' });
    }
}
