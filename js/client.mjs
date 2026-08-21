import { GameSim, CONSTANTS, WEAPONS } from './sim.mjs';
import { Idle } from './idle.mjs';
import { createMatchView } from './view.mjs';
import { applyLayoutCss, layoutFor, worldZoom, cameraOffset } from './layout.mjs';

const PIXI_URL = 'https://cdn.jsdelivr.net/npm/pixi.js@8.8.1/dist/pixi.min.mjs';
const gameRoot = document.getElementById('game-root');
let matchView = null;
let pixiMod = null;

const AudioSys = {
    ctx: null, windNode: null, windGain: null,
    init() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    playTone(freq, type, duration, vol = 0.1) {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator(); const gain = this.ctx.createGain();
        osc.type = type; osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain); gain.connect(this.ctx.destination);
        osc.start(); osc.stop(this.ctx.currentTime + duration);
    },
    playNoise(duration, vol = 0.5) {
        if (!this.ctx) return;
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * duration, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        const src = this.ctx.createBufferSource(); src.buffer = buf;
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1000;
        gain.gain.setValueAtTime(vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        src.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
        src.start();
    },
    startWind() {
        if (!this.ctx) return;
        const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 2, this.ctx.sampleRate);
        const data = buf.getChannelData(0); for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        this.windNode = this.ctx.createBufferSource(); this.windNode.buffer = buf; this.windNode.loop = true;
        this.windGain = this.ctx.createGain(); this.windGain.gain.value = 0;
        const filter = this.ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 400;
        this.windNode.connect(filter); filter.connect(this.windGain); this.windGain.connect(this.ctx.destination);
        this.windNode.start(); this.windFilter = filter;
    },
    updateWind(ratio) {
        if (this.windGain) {
            this.windGain.gain.setTargetAtTime(0.1 + ratio * 0.4, this.ctx.currentTime, 0.1);
            this.windFilter.frequency.setTargetAtTime(400 + ratio * 1000, this.ctx.currentTime, 0.1);
        }
    },
    stopWind() { if (this.windNode) { this.windNode.stop(); this.windNode = null; } }
};

const keys = { w: false, a: false, s: false, d: false, shift: false, mouse: false };
const mousePos = { x: 0, y: 0 };
let particles = [];

function wantSolo() {
    try { return new URLSearchParams(location.search).has('solo'); } catch (e) { return false; }
}

async function ensureView() {
    if (matchView) return matchView;
    if (!pixiMod) {
        const mod = await import(PIXI_URL);
        pixiMod = mod.Application ? mod : (mod.default || mod);
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    applyLayoutCss(document.documentElement, layoutFor(w, h));
    if (gameRoot) {
        gameRoot.style.width = w + 'px';
        gameRoot.style.height = h + 'px';
    }
    matchView = await createMatchView(gameRoot, pixiMod, { width: w, height: h });
    window.__ppi = { view: matchView, pixi: pixiMod };
    return matchView;
}
let mode = 'menu'; // menu | solo | net
let sim = null;
let net = null;
let p2p = null;
let myId = 0;
let mapObjects = [];
let view = null;
let settled = false;
let lastTime = 0;
let inputAcc = 0;

function createParticles(x, y, c, n) {
    for (let i = 0; i < n; i++) {
        particles.push({ x, y, vx: (Math.random() - 0.5) * 200, vy: (Math.random() - 0.5) * 200, life: 0.5 + Math.random() * 0.5, color: c });
    }
}

function me() {
    if (!view) return null;
    return view.entities.find(e => e.id === myId) || null;
}

function readInput() {
    let dx = 0, dy = 0;
    if (keys.w) dy -= 1; if (keys.s) dy += 1; if (keys.a) dx -= 1; if (keys.d) dx += 1;
    const p = me() || (sim && sim.entity(myId));
    const px = p ? p.x : 0, py = p ? p.y : 0;
    const vw = matchView ? matchView.width : window.innerWidth;
    const vh = matchView ? matchView.height : window.innerHeight;
    const zoom = worldZoom(vw, vh, (p && p.z) || 0);
    const cam = cameraOffset(vw, vh, px, py, zoom);
    const wx = (mousePos.x - cam.x) / zoom;
    const wy = (mousePos.y - cam.y) / zoom;
    return {
        dx, dy,
        aim: Math.atan2(wy - py, wx - px),
        attack: keys.mouse,
        sprint: keys.shift
    };
}

function autoOn() {
    const btn = document.getElementById('auto-btn');
    return !!(btn && btn.getAttribute('aria-pressed') === 'true');
}

function applyAuto(on) {
    const btn = document.getElementById('auto-btn');
    if (btn) {
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.classList.toggle('on', !!on);
    }
    if (sim) sim.setAuto(myId, on);
}

function hideMenu() {
    document.getElementById('center-panel').style.display = 'none';
    document.getElementById('dive-controls').style.display = 'flex';
    document.getElementById('phase-text').innerText = '공중 강하!';
    document.getElementById('phase-text').className = 'text-xl hud-text text-yellow-400 mb-1';
    Idle.showHub(false);
    Idle.playing = true;
    settled = false;
    applyAuto(false);
}

async function startSolo() {
    AudioSys.init(); AudioSys.startWind();
    await ensureView();
    const loadout = Idle.loadout();
    sim = new GameSim({
        seed: (Math.random() * 0xffffffff) >>> 0,
        stage: Idle.save.stage,
        humans: [{ id: 0, nick: loadout.nick, color: loadout.color, loadout }],
        bots: CONSTANTS.SLOTS - 1
    });
    myId = 0;
    mapObjects = sim.mapSnapshot();
    if (matchView) matchView.setMap(mapObjects);
    view = sim.snapshot();
    mode = 'solo';
    net = null;
    particles = [];
    hideMenu();
    lastTime = performance.now();
    requestAnimationFrame(loop);
}

async function startNet() {
    AudioSys.init();
    if (wantSolo()) {
        startSolo();
        return;
    }
    const btn = document.getElementById('start-btn');
    const prev = btn.innerText;
    btn.innerText = '방 찾는 중…';
    let P2PRoom;
    try {
        ({ P2PRoom } = await import('./p2p.mjs'));
    } catch (e) {
        console.warn('p2p module fail, solo', e);
        btn.innerText = prev;
        startSolo();
        return;
    }
    const room = new P2PRoom();
    p2p = room;
    net = null;
    particles = [];
    room.on('welcome', (m) => { myId = m.id; });
    room.on('start', (m) => {
        mapObjects = m.map || [];
        view = m.snapshot;
        ensureView().then(() => {
            if (matchView) matchView.setMap(mapObjects);
            AudioSys.startWind();
            hideMenu();
            lastTime = performance.now();
            requestAnimationFrame(loop);
        });
    });
    room.on('state', (m) => {
        view = m.snapshot;
        (m.events || []).forEach(handleEvent);
        if (view && view.ended) onMatchEnd(view);
    });
    room.on('close', () => {
        if (mode === 'guest' && Idle.playing && !settled) {
            const p = me();
            finishLocal('death', p, 0);
        }
    });
    room.on('peer_input', (m) => {
        if (sim) sim.setInput(m.id, m);
    });
    room.on('guest_left', (m) => {
        if (sim) sim.disconnect(m.id);
    });
    room.on('host_ready', () => beginHostMatch(room));
    try {
        const info = await room.joinQuick(Idle.loadout());
        myId = info.myId;
        if (info.role === 'host') {
            btn.innerText = '사람 대기 (2초)…';
            mode = 'host';
        } else {
            btn.innerText = '방장 대기…';
            mode = 'guest';
            sim = null;
            setTimeout(() => {
                if (mode === 'guest' && !view) {
                    try { room.close(); } catch (err) {}
                    p2p = null;
                    btn.innerText = prev;
                    startSolo();
                }
            }, 8000);
        }
    } catch (e) {
        console.warn('p2p fail, solo', e);
        btn.innerText = prev;
        try { room.close(); } catch (err) {}
        p2p = null;
        startSolo();
    }
}

function beginHostMatch(room) {
    const humans = room.humans();
    ensureView().then(() => {
        sim = new GameSim({
            seed: (Math.random() * 0xffffffff) >>> 0,
            stage: Idle.save.stage,
            humans,
            bots: Math.max(0, CONSTANTS.SLOTS - humans.length)
        });
        myId = room.myId;
        mapObjects = sim.mapSnapshot();
        if (matchView) matchView.setMap(mapObjects);
        view = sim.snapshot();
        mode = 'host';
        room.broadcast({ type: 'start', map: mapObjects, snapshot: view });
        AudioSys.startWind();
        hideMenu();
        lastTime = performance.now();
        requestAnimationFrame(loop);
    });
}

function handleEvent(ev) {
    if (ev.type === 'land') createParticles(ev.x, ev.y, '#555', 24);
    if (ev.type === 'loot') createParticles(ev.x, ev.y, '#ffd700', 10);
    if (ev.type === 'hit') createParticles(ev.x, ev.y, '#ff0000', 5);
    if (ev.type === 'shot' && ev.id === myId) AudioSys.playNoise(0.08, 0.25);
    if (ev.type === 'first_land') {
        document.getElementById('phase-text').innerText = '전투 시작!';
        document.getElementById('phase-text').classList.replace('text-yellow-400', 'text-red-500');
    }
    if (ev.type === 'ground') {
        document.getElementById('phase-text').innerText = '전투 시작!';
        document.getElementById('phase-text').classList.replace('text-yellow-400', 'text-red-500');
        AudioSys.stopWind();
        document.getElementById('dive-controls').style.display = 'none';
    }
    if (ev.type === 'kill' && ev.victim === myId) AudioSys.playTone(100, 'square', 0.1);
}

function onMatchEnd(snap) {
    if (settled) return;
    const p = snap.entities.find(e => e.id === myId);
    let outcome = 'death';
    const info = snap.endInfo || {};
    if (p && p.alive) {
        if (info.outcome === 'portal' && info.winnerId === myId) outcome = 'portal';
        else if (info.outcome === 'last' && info.winnerId === myId) outcome = 'last';
        else if (info.outcome === 'time') outcome = 'time';
        else outcome = 'time';
    } else outcome = 'death';
    const survived = (info && info.survived) || 0;
    showResult(outcome, p, survived);
    teardownNet();
}

function showResult(outcome, p, survived) {
    if (settled) return;
    settled = true;
    Idle.playing = false;
    AudioSys.stopWind();
    const report = Idle.settle(p, outcome, survived || 0);
    Idle.showHub(true);
    const reward = report ? `\n+${report.gold} G` + (report.stageUp ? `\nSTAGE UP! 이제 ${report.stage}` : '') : '';
    const panel = document.getElementById('center-panel');
    const t = panel.querySelector('h1'); const d = panel.querySelector('p');
    panel.style.display = 'flex';
    document.getElementById('start-btn').innerText = '다시 하기';
    if (outcome === 'portal') {
        t.innerText = 'PORTAL ESCAPE!'; t.className = 'text-5xl font-bold text-green-400 mb-4';
        d.innerText = `당신이 웜홀을 통해 탈출했습니다!\n완벽한 승리!${reward}`;
    } else if (outcome === 'death') {
        t.innerText = 'GAME OVER'; t.className = 'text-5xl font-bold text-red-600 mb-4';
        d.innerText = `사망했습니다.\n처치 수: ${p ? p.kills : 0}${reward}`;
    } else if (outcome === 'last') {
        t.innerText = 'WINNER WINNER!'; t.className = 'text-5xl font-bold text-yellow-400 mb-4';
        d.innerText = `최후의 1인! 처치: ${p ? p.kills : 0}${reward}`;
    } else {
        t.innerText = 'TIME OVER'; t.className = 'text-5xl font-bold text-blue-400 mb-4';
        d.innerText = `생존 성공! 처치: ${p ? p.kills : 0}${reward}`;
    }
}

function teardownNet() {
    if (net) { net.close(); net = null; }
    if (p2p) { p2p.close(); p2p = null; }
    sim = null;
    mode = 'menu';
}

function finishLocal(outcome, p, survived) {
    showResult(outcome, p, survived);
    teardownNet();
}

function maybeLocalDeath(snap) {
    if (settled || !snap) return;
    const p = snap.entities.find(e => e.id === myId);
    if (p && !p.alive) {
        const survived = snap.phase === 'GROUND' ? Math.max(0, CONSTANTS.GROUND_TIME - snap.time) : 0;
        if (mode === 'host') {
            showResult('death', p, survived);
            return;
        }
        finishLocal('death', p, survived);
    }
}

function updateHud(snap) {
    const p = snap.entities.find(e => e.id === myId);
    if (!p) return;
    document.getElementById('timer-display').innerText = Math.ceil(snap.time);
    document.getElementById('alive-counter').innerText = `생존: ${snap.alive}`;
    document.getElementById('kill-counter').innerText = `킬: ${p.kills}`;
    document.getElementById('altitude-display').innerText = `고도: ${Math.floor(p.z)}pt`;
    let wName = WEAPONS[p.weapon].name;
    if (p.weapon === 'GUN') wName += ` (${p.ammo})`;
    document.getElementById('weapon-display').innerText = `무기: ${wName}`;
    const lootEl = document.getElementById('loot-count-display');
    lootEl.innerText = `파밍: ${p.loot} / ${CONSTANTS.WIN_LOOT_COUNT}`;
    if (p.loot >= CONSTANTS.WIN_LOOT_COUNT) lootEl.classList.add('animate-pulse');
    else lootEl.classList.remove('animate-pulse');
    const hp = document.getElementById('hp-bar');
    const pct = (p.hp / p.maxHp) * 100;
    hp.style.width = `${pct}%`;
    hp.className = pct < 30 ? 'bar-fill bg-red-600 animate-pulse' : 'bar-fill bg-green-500';
    const st = document.getElementById('st-bar');
    st.style.width = `${p.stamina}%`;
    st.className = p.fatigued ? 'bar-fill bg-gray-400' : 'bar-fill bg-yellow-400';
    const ov = document.getElementById('damage-overlay');
    if (snap.zone && p.alive && p.z <= 0) {
        const d = Math.hypot(p.x - snap.zone.x, p.y - snap.zone.y);
        ov.style.opacity = d > snap.zone.r ? 0.5 + Math.sin(Date.now() / 100) * 0.2 : 0;
    } else ov.style.opacity = 0;
    const box = document.getElementById('leaderboard-content');
    const sorted = [...snap.entities].sort((a, b) => {
        if (a.alive && !b.alive) return -1; if (!a.alive && b.alive) return 1; return b.kills - a.kills;
    });
    box.innerHTML = sorted.map((e, i) => {
        const mine = e.id === myId;
        const color = e.alive ? (mine ? 'text-yellow-300 font-bold' : 'text-gray-100') : 'text-gray-500 line-through';
        const name = mine ? (e.nick || '나') : (e.bot ? e.nick : e.nick);
        return `<div class="leaderboard-row ${color}"><span>${i + 1}. ${name}</span><span>${e.kills}</span></div>`;
    }).join('');
}

function draw(snap) {
    if (!matchView) return;
    matchView.sync(snap, mapObjects, myId, particles);
}

function loop(now) {
    const dt = Math.min(0.05, (now - lastTime) / 1000); lastTime = now;
    if (mode === 'menu') return;
    if ((mode === 'solo' || mode === 'host') && sim) {
        const inp = readInput();
        sim.setInput(myId, inp);
        sim.tick(dt);
        const events = sim.drainEvents();
        events.forEach(handleEvent);
        view = sim.snapshot();
        if (mode === 'host' && p2p) {
            inputAcc += dt;
            if (inputAcc >= 0.05) {
                inputAcc = 0;
                p2p.broadcast({ type: 'state', snapshot: view, events });
            }
        }
        if (me() && me().z <= 0) {
            document.getElementById('dive-controls').style.display = 'none';
        }
        maybeLocalDeath(view);
        if (view.ended) onMatchEnd(view);
    } else if (mode === 'guest') {
        inputAcc += dt;
        if (inputAcc >= 0.05) {
            inputAcc = 0;
            if (p2p) p2p.send({ type: 'input', ...readInput() });
        }
        maybeLocalDeath(view);
    }
    for (let i = particles.length - 1; i >= 0; i--) {
        particles[i].x += particles[i].vx * dt; particles[i].y += particles[i].vy * dt;
        particles[i].life -= dt;
        if (particles[i].life <= 0) particles.splice(i, 1);
    }
    if (view) { updateHud(view); draw(view); }
    if (mode !== 'menu') requestAnimationFrame(loop);
}

function saveNick() {
    const el = document.getElementById('nick-input');
    if (!el) return;
    Idle.save.nick = el.value.trim().slice(0, 12);
    Idle.persist();
}

window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    applyLayoutCss(document.documentElement, layoutFor(w, h));
    if (gameRoot) {
        gameRoot.style.width = w + 'px';
        gameRoot.style.height = h + 'px';
    }
    if (matchView) matchView.resize(w, h);
});
window.addEventListener('keydown', e => {
    if (e.code === 'KeyW' || e.key === 'ArrowUp') keys.w = true;
    if (e.code === 'KeyA' || e.key === 'ArrowLeft') keys.a = true;
    if (e.code === 'KeyS' || e.key === 'ArrowDown') keys.s = true;
    if (e.code === 'KeyD' || e.key === 'ArrowRight') keys.d = true;
    if (e.code.includes('Shift')) keys.shift = true;
});
window.addEventListener('keyup', e => {
    if (e.code === 'KeyW' || e.key === 'ArrowUp') keys.w = false;
    if (e.code === 'KeyA' || e.key === 'ArrowLeft') keys.a = false;
    if (e.code === 'KeyS' || e.key === 'ArrowDown') keys.s = false;
    if (e.code === 'KeyD' || e.key === 'ArrowRight') keys.d = false;
    if (e.code.includes('Shift')) keys.shift = false;
});
window.addEventListener('mousemove', e => { mousePos.x = e.clientX; mousePos.y = e.clientY; });
window.addEventListener('mousedown', () => { keys.mouse = true; });
window.addEventListener('mouseup', () => { keys.mouse = false; });
const db = document.getElementById('dive-btn');
if (db) {
    db.addEventListener('mousedown', () => { keys.shift = true; });
    db.addEventListener('mouseup', () => { keys.shift = false; });
    db.addEventListener('touchstart', e => { e.preventDefault(); keys.shift = true; });
    db.addEventListener('touchend', e => { e.preventDefault(); keys.shift = false; });
}
const autoBtn = document.getElementById('auto-btn');
if (autoBtn) {
    autoBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyAuto(!autoOn());
    });
    autoBtn.addEventListener('mousedown', (e) => { e.stopPropagation(); keys.mouse = false; });
    autoBtn.addEventListener('mouseup', (e) => { e.stopPropagation(); keys.mouse = false; });
}
document.getElementById('start-btn').addEventListener('click', () => {
    saveNick();
    startSolo();
});
document.getElementById('offline-claim').addEventListener('click', () => {
    document.getElementById('offline-popup').classList.remove('open');
});
const nick = document.getElementById('nick-input');
if (nick) nick.addEventListener('change', saveNick);

Idle.init();
applyLayoutCss(document.documentElement, layoutFor(window.innerWidth, window.innerHeight));
ensureView().catch((err) => console.error('pixi boot', err));
setInterval(() => Idle.tickHub(0.25), 250);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) Idle.persist();
    else {
        const g = Idle.collectOffline();
        if (g > 0) {
            document.getElementById('offline-msg').textContent = `자리를 비운 동안\n+${g.toLocaleString()} G`;
            document.getElementById('offline-popup').classList.add('open');
        }
    }
});
window.addEventListener('beforeunload', () => Idle.persist());
