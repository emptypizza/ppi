import assert from 'node:assert/strict';
import { GameSim, CONSTANTS } from '../js/sim.mjs';

function log(...a) { console.log(...a); }

log('--- sim tests (shipped js/sim.mjs) ---');

{
    const sim = new GameSim({
        humans: [{ id: 0, nick: 'A', color: '#00BFFF', loadout: { nick: 'A' } }],
        seed: 7,
        stage: 1
    });
    const bots = sim.entities.filter((e) => e.bot);
    const humans = sim.entities.filter((e) => !e.bot);
    assert.equal(sim.entities.length, 10, '1 human + default bots = 10');
    assert.equal(humans.length, 1);
    assert.equal(bots.length, 9, '10-N bots when no remotes');
    assert.equal(CONSTANTS.SLOTS, 10);
    log('ok 1 human + 9 bots => 10 slots');
}

{
    const sim = new GameSim({
        humans: [
            { id: 0, nick: 'Ann' },
            { id: 1, nick: 'Bob' }
        ],
        bots: CONSTANTS.SLOTS - 2,
        seed: 9,
        stage: 1
    });
    assert.equal(sim.entities.length, 10);
    assert.equal(sim.entities.filter((e) => e.bot).length, 8);
    assert.equal(sim.entities.filter((e) => !e.bot).length, 2);
    log('ok 2 remotes occupy slots, rest bots');
}

{
    const sim = new GameSim({
        humans: [{ id: 0, nick: 'A' }],
        bots: 9,
        seed: 3,
        stage: 1
    });
    assert.equal(sim.phase, 'DROPPING');
    let n = 0;
    while (sim.phase === 'DROPPING' && n < 500) {
        sim.tick(0.05);
        n++;
    }
    assert.equal(sim.phase, 'GROUND', 'air drop reaches ground');
    const r0 = sim.safeZone.currentR;
    assert.ok(r0 > 0, 'zone has radius');
    for (let i = 0; i < 80; i++) sim.tick(0.5);
    assert.ok(sim.safeZone.currentR < r0, 'blue zone shrinks over ground time');
    log('ok drop -> ground and zone shrinks', r0, '->', sim.safeZone.currentR);
}

{
    const sim = new GameSim({
        humans: [{ id: 0, nick: 'A' }],
        bots: 9,
        seed: 11,
        stage: 1
    });
    const human = sim.entities.find((e) => !e.bot);
    sim.entities.forEach((e) => {
        if (e !== human) e.takeDamage(1e9, human);
    });
    assert.equal(sim.ended, true);
    assert.equal(sim.endInfo.outcome, 'last');
    log('ok last-standing finish path');
}

{
    const sim = new GameSim({
        humans: [{ id: 0, nick: 'A' }],
        bots: 9,
        seed: 13,
        stage: 1
    });
    const human = sim.entities.find((e) => !e.bot);
    human.z = 0;
    human.lootCount = CONSTANTS.WIN_LOOT_COUNT;
    sim.hasFirstLanded = true;
    sim.phase = 'GROUND';
    sim.time = 40;
    sim.portal.active = true;
    sim.portal.timer = CONSTANTS.PORTAL_DURATION;
    sim.portal.x = human.x;
    sim.portal.y = human.y;
    sim.portal.radius = 80;
    sim.tick(0.05);
    assert.equal(sim.ended, true);
    assert.equal(sim.endInfo.outcome, 'portal');
    log('ok portal finish path');
}

{
    const sim = new GameSim({
        humans: [{ id: 0, nick: 'A' }],
        bots: 0,
        seed: 15,
        stage: 1
    });
    const human = sim.entities.find((e) => !e.bot);
    human.takeDamage(1e9, null);
    assert.equal(sim.ended, true);
    assert.equal(sim.endInfo.outcome, 'death');
    log('ok death finish path');
}

{
    const sim = new GameSim({
        humans: [{ id: 0, nick: 'A' }],
        bots: 9,
        seed: 21,
        stage: 1
    });
    const human = sim.entities.find((e) => !e.bot);
    human.z = 0;
    human.x = 400;
    human.y = 400;
    sim.entities.forEach((e) => {
        if (e !== human) { e.x = 2800; e.y = 2800; }
    });
    sim.setInput(human.id, { dx: 0, dy: 0, aim: 0, attack: false, sprint: false });
    assert.equal(!!human.auto, false);
    const x0 = human.x, y0 = human.y;
    for (let i = 0; i < 24; i++) sim.tick(0.05);
    assert.equal(human.x, x0, 'auto off does not volunteer-move x');
    assert.equal(human.y, y0, 'auto off does not volunteer-move y');
    log('ok auto off still', x0, y0);

    sim.setAuto(human.id, true);
    assert.equal(human.auto, true);
    let acted = false;
    for (let i = 0; i < 80; i++) {
        sim.tick(0.05);
        const ev = sim.drainEvents();
        if (human.x !== x0 || human.y !== y0) acted = true;
        if (ev.some((e) => e.id === human.id && (e.type === 'shot' || e.type === 'hit' || e.type === 'loot' || e.type === 'equip'))) acted = true;
        if (sim.bullets.some((b) => b.ownerId === human.id)) acted = true;
        if (acted) break;
    }
    assert.ok(acted, 'auto on changes position and/or attacks/loots');
    log('ok auto on acts', x0, y0, '->', human.x, human.y);

    sim.setAuto(human.id, false);
    assert.equal(human.auto, false);
    sim.entities.forEach((e) => {
        if (e !== human) { e.x = 2800; e.y = 2800; }
    });
    const x1 = human.x, y1 = human.y;
    for (let i = 0; i < 24; i++) sim.tick(0.05);
    assert.equal(human.x, x1, 'auto off again stops volunteer x');
    assert.equal(human.y, y1, 'auto off again stops volunteer y');
    log('ok auto off again still', x1, y1);
}

log('ALL SIM TESTS PASSED');
