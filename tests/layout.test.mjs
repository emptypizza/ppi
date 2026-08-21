import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONSTANTS } from '../js/sim.mjs';
import { DEFAULT_VIEW, LAYOUT, layoutFor, worldZoom, cameraOffset } from '../js/layout.mjs';

function log(...a) { console.log(...a); }

log('--- layout metrics (shipped js/layout.mjs) ---');

assert.equal(DEFAULT_VIEW.width, 1280);
assert.equal(DEFAULT_VIEW.height, 720);

const W = DEFAULT_VIEW.width;
const H = DEFAULT_VIEW.height;
const L = layoutFor(W, H);
log('layout', JSON.stringify({
    minimap: L.minimap,
    phase: { cx: L.phase.cx, y: L.phase.y },
    leaderboard: L.leaderboard,
    hp: L.hp,
    lab: L.lab
}));

assert.ok(L.minimap.x + L.minimap.w / 2 < W / 2, 'minimap in left half');
assert.ok(L.minimap.y + L.minimap.h / 2 < H / 2, 'minimap in top half');
assert.ok(L.minimap.size <= H * 0.20 + 1e-6, 'minimap ≤ 20% of short side');
assert.ok(LAYOUT.minimapFrac <= 0.20);

assert.ok(Math.abs(L.phase.cx - W / 2) < W * 0.08, 'phase near horizontal center');
assert.ok(L.phase.y < H / 3, 'phase in top third');

assert.ok(L.leaderboard.x + L.leaderboard.w / 2 > W / 2, 'leaderboard in right half');
assert.ok(L.leaderboard.y + 8 < H / 2, 'leaderboard in top half');

assert.ok(L.hp.x + L.hp.w / 2 < W / 2, 'HP in left half');
assert.ok(L.hp.y + L.hp.h / 2 > H / 2, 'HP in bottom half');

assert.ok(L.lab.w <= W * 0.32 + 1e-6, '훈련소 width ≤ 32% of view');
assert.ok(LAYOUT.labWidthFrac <= 0.32);

const zGround = worldZoom(W, H, 0);
const visGround = W / zGround;
assert.ok(visGround < CONSTANTS.MAP_SIZE * 0.55, 'landed camera is zoomed into the world, not a map island');
const zDrop = worldZoom(W, H, 1000);
const visDrop = W / zDrop;
assert.ok(visDrop <= CONSTANTS.MAP_SIZE, 'drop camera still covers view without shrinking the map to an island');
log('zoom landed', zGround.toFixed(3), 'visW', visGround.toFixed(0));
log('zoom drop', zDrop.toFixed(3), 'visW', visDrop.toFixed(0));

{
    const z = worldZoom(W, H, 0);
    const cam = cameraOffset(W, H, 40, 40, z);
    const worldLeft = -cam.x / z;
    const worldTop = -cam.y / z;
    assert.ok(worldLeft >= -1e-4, 'clamped camera does not show left of the map');
    assert.ok(worldTop >= -1e-4, 'clamped camera does not show above the map');
    log('ok camera clamp at edge', cam.x, cam.y);
}

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
for (const id of ['hud-minimap', 'hud-phase', 'hud-top-right', 'hud-hp', 'leaderboard', 'lab-panel', 'auto-btn', 'center-panel']) {
    assert.ok(html.includes('id="' + id + '"'), 'page has #' + id);
}
assert.ok(html.includes('자동전투'));
assert.ok(html.includes('훈련소'));
assert.match(html, /file:\/\/|emptypizza\.github\.io\/ppi/);
log('ok HUD nodes in index.html');

log('ALL LAYOUT TESTS PASSED');
