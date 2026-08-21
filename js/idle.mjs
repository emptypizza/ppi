export const Idle = {
    KEY: 'ppi_idle_save_v1',
    MAX_COMMON: 25,
    MAX_GEAR: 3,
    OFFLINE_CAP_H: 8,
    SKINS: [
        { id: 'classic', name: '클래식', color: '#00BFFF', stage: 1 },
        { id: 'lime', name: '라임', color: '#76FF03', stage: 3 },
        { id: 'gold', name: '골드', color: '#FFD54F', stage: 5 },
        { id: 'violet', name: '바이올렛', color: '#E040FB', stage: 8 },
        { id: 'ghost', name: '고스트', color: '#EEEEEE', stage: 12 }
    ],
    save: null,
    hubFrac: 0,
    lastReport: null,
    names: ['HP', 'ATK', 'SPD', 'STA', 'LUCK', 'IDLE', 'GEAR'],
    playing: false,
    defaultSave() {
        return { gold: 40, stage: 1, levels: [0, 0, 0, 0, 0, 0, 0], skinId: 'classic', lastUnix: 0, lifetimeGold: 0, runs: 0, portalWins: 0, lastStandWins: 0, nick: '' };
    },
    load() {
        try {
            const raw = localStorage.getItem(this.KEY);
            this.save = raw ? JSON.parse(raw) : this.defaultSave();
        } catch (e) { this.save = this.defaultSave(); }
        if (!this.save.levels || this.save.levels.length !== 7) this.save.levels = [0, 0, 0, 0, 0, 0, 0];
        if (this.save.stage < 1) this.save.stage = 1;
        if (!this.save.skinId) this.save.skinId = 'classic';
        if (!this.save.nick) this.save.nick = '';
    },
    persist() {
        this.save.lastUnix = Math.floor(Date.now() / 1000);
        localStorage.setItem(this.KEY, JSON.stringify(this.save));
        this.refreshGold();
    },
    refreshGold() {
        if (!this.save) return;
        const bar = document.getElementById('gold-bar');
        if (bar) bar.textContent = `STAGE ${this.save.stage} · ${this.save.gold.toLocaleString()} G`;
        const g = document.getElementById('lab-gold');
        if (g) g.textContent = `${this.save.gold.toLocaleString()} G`;
    },
    lv(i) { return this.save.levels[i] || 0; },
    hpBonus() { return this.lv(0) * 25; },
    playerAtkMult() { return 1 + this.lv(1) * 0.08; },
    playerSpeedMult() { return 1 + this.lv(2) * 0.06; },
    staminaDrainMult() { return Math.max(0.4, 1 - this.lv(3) * 0.05); },
    staminaRecoverMult() { return 1 + this.lv(3) * 0.06; },
    botHpMult() { return 1 + Math.max(0, this.save.stage - 1) * 0.20; },
    botAtkMult() { return 1 + Math.max(0, this.save.stage - 1) * 0.12; },
    botSpeedMult() { return Math.min(1.6, 1 + Math.max(0, this.save.stage - 1) * 0.04); },
    totalLevels() { return this.save.levels.reduce((a, b) => a + b, 0); },
    goldPerMinute() {
        return (1.2 + this.totalLevels() * 0.4 + Math.max(0, this.save.stage - 1) * 0.7) * (1 + this.lv(5) * 0.25);
    },
    maxLv(i) { return i === 6 ? this.MAX_GEAR : this.MAX_COMMON; },
    cost(i) {
        const lv = this.lv(i);
        if (lv >= this.maxLv(i)) return 0;
        if (i === 6) return lv === 0 ? 80 : lv === 1 ? 250 : 600;
        const base = [15, 20, 20, 18, 25, 20, 20][i];
        return Math.max(1, Math.round(base * Math.pow(1.16, lv)));
    },
    gearLabel(lv) {
        return ['시작: 맨손', '시작: 나이프', '시작: 소총 (30)', '시작: 소총 (45)'][lv] || '시작: 맨손';
    },
    desc(i) {
        const lv = this.lv(i);
        if (i === 0) return `+${this.hpBonus()} 최대 HP`;
        if (i === 1) return `피해 x${this.playerAtkMult().toFixed(2)}`;
        if (i === 2) return `이동 x${this.playerSpeedMult().toFixed(2)}`;
        if (i === 3) return `소모 x${this.staminaDrainMult().toFixed(2)} / 회복 x${this.staminaRecoverMult().toFixed(2)}`;
        if (i === 4) return `상자 운, 시작 파밍 +${Math.floor(lv / 4)}`;
        if (i === 5) return `방치 x${(1 + lv * 0.25).toFixed(2)} (${this.goldPerMinute().toFixed(1)}/분)`;
        return this.gearLabel(lv);
    },
    tryBuy(i) {
        const lv = this.lv(i);
        if (lv >= this.maxLv(i)) return false;
        const c = this.cost(i);
        if (this.save.gold < c) return false;
        this.save.gold -= c;
        this.save.levels[i] = lv + 1;
        this.persist();
        this.refreshUI();
        return true;
    },
    skin() { return this.SKINS.find(s => s.id === this.save.skinId) || this.SKINS[0]; },
    playerColor() { return this.skin().color; },
    selectSkin(id) {
        const s = this.SKINS.find(x => x.id === id);
        if (!s || this.save.stage < s.stage) return;
        this.save.skinId = id;
        this.persist();
        this.refreshUI();
    },
    loadout() {
        return {
            hp: this.lv(0), atk: this.lv(1), spd: this.lv(2), sta: this.lv(3),
            luck: this.lv(4), idle: this.lv(5), gear: this.lv(6),
            color: this.playerColor(),
            nick: (this.save.nick || 'PLAYER').slice(0, 12),
            stage: this.save.stage
        };
    },
    addGold(n) {
        if (n <= 0) return;
        this.save.gold += n;
        this.save.lifetimeGold += n;
        this.persist();
    },
    settle(stats, outcome, survived) {
        this.save.runs++;
        const kills = stats ? stats.kills : 0, loot = stats ? stats.loot : 0;
        let gold = 5 + kills * 10 + loot * 4 + Math.floor(Math.max(0, survived));
        let stageUp = false;
        if (outcome === 'portal') { gold += 40 + this.save.stage * 10; this.save.portalWins++; stageUp = true; }
        else if (outcome === 'last') { gold += 25 + this.save.stage * 6; this.save.lastStandWins++; stageUp = true; }
        else if (outcome === 'time') gold += 12;
        else gold += 3;
        gold = Math.max(1, Math.round(gold * (1 + Math.max(0, this.save.stage - 1) * 0.08)));
        this.addGold(gold);
        if (stageUp) this.save.stage++;
        this.persist();
        this.refreshUI();
        this.lastReport = { gold, stageUp, stage: this.save.stage, total: this.save.gold };
        return this.lastReport;
    },
    collectOffline() {
        const now = Math.floor(Date.now() / 1000);
        if (!this.save.lastUnix) { this.save.lastUnix = now; this.persist(); return 0; }
        const elapsed = now - this.save.lastUnix;
        this.save.lastUnix = now;
        if (elapsed < 60) { this.persist(); return 0; }
        const seconds = Math.min(elapsed, this.OFFLINE_CAP_H * 3600);
        const gold = Math.floor(this.goldPerMinute() * seconds / 60);
        if (gold > 0) this.addGold(gold);
        else this.persist();
        return gold;
    },
    tickHub(dt) {
        if (this.playing) return;
        this.hubFrac += this.goldPerMinute() * dt / 60;
        const whole = Math.floor(this.hubFrac);
        if (whole > 0) { this.hubFrac -= whole; this.addGold(whole); }
    },
    showHub(on) {
        const lab = document.getElementById('lab-panel');
        if (lab && !on) lab.classList.remove('open');
        if (typeof document !== 'undefined' && document.body) {
            document.body.classList.toggle('in-hub', !!on);
            document.body.classList.toggle('in-match', !on);
        }
        try {
            const mm = window.__ppi && window.__ppi.view && window.__ppi.view.minimap;
            if (mm) mm.visible = !on;
        } catch (e) {}
    },
    refreshUI() {
        if (!this.save) return;
        this.refreshGold();
        const st = document.getElementById('lab-stage');
        if (st) st.textContent = `STAGE ${this.save.stage}   봇 HP x${this.botHpMult().toFixed(2)}  ATK x${this.botAtkMult().toFixed(2)}`;
        const stats = document.getElementById('lab-stats');
        if (stats) stats.textContent = `판 ${this.save.runs} · 포탈 ${this.save.portalWins} · 라스트 ${this.save.lastStandWins} · 누적 ${this.save.lifetimeGold.toLocaleString()} G`;
        const nick = document.getElementById('nick-input');
        if (nick && document.activeElement !== nick) nick.value = this.save.nick || '';
        const box = document.getElementById('lab-upgrades');
        if (box) {
            box.innerHTML = '';
            for (let i = 0; i < 7; i++) {
                const lv = this.lv(i), max = this.maxLv(i), c = this.cost(i);
                const maxed = lv >= max, can = !maxed && this.save.gold >= c;
                const row = document.createElement('div');
                row.className = 'upg-row';
                row.innerHTML = `<div class="meta"><b>${this.names[i]} Lv.${lv}/${max}</b><br>${this.desc(i)}</div>`;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.textContent = maxed ? 'MAX' : `${c} G`;
                btn.className = maxed ? 'max' : (can ? 'ok' : 'no');
                btn.disabled = !can;
                btn.onclick = () => this.tryBuy(i);
                row.appendChild(btn);
                box.appendChild(row);
            }
        }
        const skins = document.getElementById('lab-skins');
        if (skins) {
            skins.innerHTML = '';
            this.SKINS.forEach(s => {
                const b = document.createElement('button');
                b.type = 'button';
                const unlocked = this.save.stage >= s.stage;
                b.textContent = unlocked ? s.name : `S${s.stage}`;
                b.disabled = !unlocked;
                if (this.save.skinId === s.id) b.classList.add('on');
                b.style.borderLeft = `4px solid ${s.color}`;
                b.onclick = () => this.selectSkin(s.id);
                skins.appendChild(b);
            });
        }
    },
    init() {
        this.load();
        const afk = this.collectOffline();
        this.refreshUI();
        this.showHub(true);
        if (afk > 0) {
            document.getElementById('offline-msg').textContent = `자리를 비운 동안\n+${afk.toLocaleString()} G`;
            document.getElementById('offline-popup').classList.add('open');
        }
    }
};
