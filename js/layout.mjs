import { CONSTANTS } from './sim.mjs';

/** Intended match view (itch embed / Playwright). */
export const DEFAULT_VIEW = { width: 1280, height: 720 };

/**
 * Viewport-relative HUD + camera. CSS vars, Pixi minimap/camera, and tests
 * all read this — do not copy the numbers elsewhere.
 *
 * 1280×720 mismatches vs RETRO ROYALE (before this module):
 * - drop zoom 1/(1+z/300) shrank the 3000 map into a tan island
 * - 160px minimap + flex row + 320×86vh lab sat in the middle of the world
 * - hub stacked in-match chrome under a full-bleed dimmer next to a tall lab
 */
export const LAYOUT = {
    padFrac: 0.022,
    minimapFrac: 0.168,
    labWidthFrac: 0.26,
    hpWidthFrac: 0.168,
    leaderboardWidthFrac: 0.148,
    hpHeightFrac: 0.088,
    groundSpan: 960,
    dropAlt: 1600
};

export function layoutFor(width = DEFAULT_VIEW.width, height = DEFAULT_VIEW.height) {
    const w = Math.max(1, Math.floor(Number(width) || DEFAULT_VIEW.width));
    const h = Math.max(1, Math.floor(Number(height) || DEFAULT_VIEW.height));
    const short = Math.min(w, h);
    const pad = Math.max(8, Math.round(short * LAYOUT.padFrac));
    const minimapSize = Math.round(short * LAYOUT.minimapFrac);
    const labW = Math.round(w * LAYOUT.labWidthFrac);
    const hpW = Math.round(w * LAYOUT.hpWidthFrac);
    const hpH = Math.round(short * LAYOUT.hpHeightFrac);
    const lbW = Math.round(w * LAYOUT.leaderboardWidthFrac);
    const lbH = Math.round(short * 0.30);
    const phaseH = Math.round(short * 0.14);
    return {
        width: w,
        height: h,
        pad,
        short,
        minimap: { x: pad, y: pad, w: minimapSize, h: minimapSize, size: minimapSize },
        phase: {
            x: w / 2,
            y: pad,
            cx: w / 2,
            cy: pad + phaseH / 2,
            w: Math.round(w * 0.28),
            h: phaseH
        },
        leaderboard: { x: w - pad - lbW, y: pad, w: lbW, h: lbH },
        hp: { x: pad, y: h - pad - hpH, w: hpW, h: hpH },
        lab: { w: labW, x: w - pad - labW, y: pad, h: h - pad * 2 }
    };
}

/** Camera scale so the grounded world covers the view; drop never makes a map island. */
export function worldZoom(viewW, viewH, altitude = 0) {
    const w = Math.max(1, Number(viewW) || DEFAULT_VIEW.width);
    const h = Math.max(1, Number(viewH) || DEFAULT_VIEW.height);
    const long = Math.max(w, h);
    const ground = long / LAYOUT.groundSpan;
    const drop = 1 / (1 + Math.max(0, Number(altitude) || 0) / LAYOUT.dropAlt);
    const z = ground * drop;
    const fillMin = long / CONSTANTS.MAP_SIZE;
    return Math.max(z, fillMin * 1.08);
}

/** Keep the 3000 map covering the view; do not pan into empty tan outside. */
export function cameraOffset(viewW, viewH, px, py, zoom) {
    const w = Math.max(1, Number(viewW) || DEFAULT_VIEW.width);
    const h = Math.max(1, Number(viewH) || DEFAULT_VIEW.height);
    const z = Math.max(1e-6, Number(zoom) || 1);
    let x = w / 2 - (Number(px) || 0) * z;
    let y = h / 2 - (Number(py) || 0) * z;
    const mapPx = CONSTANTS.MAP_SIZE * z;
    if (mapPx >= w) x = Math.min(0, Math.max(w - mapPx, x));
    if (mapPx >= h) y = Math.min(0, Math.max(h - mapPx, y));
    return { x, y };
}

export function applyLayoutCss(root, layout) {
    const el = root || (typeof document !== 'undefined' ? document.documentElement : null);
    if (!el || !el.style || typeof el.style.setProperty !== 'function') return layout;
    const L = layout || layoutFor(DEFAULT_VIEW.width, DEFAULT_VIEW.height);
    el.style.setProperty('--hud-pad', L.pad + 'px');
    el.style.setProperty('--hud-minimap', L.minimap.size + 'px');
    el.style.setProperty('--hud-lab-w', L.lab.w + 'px');
    el.style.setProperty('--hud-hp-w', L.hp.w + 'px');
    el.style.setProperty('--hud-lb-w', L.leaderboard.w + 'px');
    el.style.setProperty('--view-w', L.width + 'px');
    el.style.setProperty('--view-h', L.height + 'px');
    return L;
}
