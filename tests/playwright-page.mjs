import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const url = process.argv[2] || 'http://127.0.0.1:8080/?solo=1';
const shot = process.argv[3] || 'page.png';
const INTENDED = { width: 1280, height: 720 };

function log(...a) { console.log(...a); }

const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist']
});
const page = await browser.newPage({
    viewport: { width: INTENDED.width, height: INTENDED.height }
});
const pageErrors = [];
page.on('pageerror', (err) => pageErrors.push(String(err)));

try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('#game-root canvas', { timeout: 30000 });
    await page.waitForFunction(() => window.__ppi && window.__ppi.view, { timeout: 25000 });
    await page.waitForTimeout(300);

    const size = await page.evaluate(() => {
        const c = document.querySelector('#game-root canvas');
        const r = c.getBoundingClientRect();
        return { width: c.width, height: c.height, cssW: r.width, cssH: r.height };
    });
    log('canvas size', JSON.stringify(size));
    if (size.width !== INTENDED.width || size.height !== INTENDED.height) {
        throw new Error('canvas size ' + size.width + 'x' + size.height + ' != ' + INTENDED.width + 'x' + INTENDED.height);
    }

    const fill = await page.evaluate(() => {
        const c = document.querySelector('#game-root canvas');
        const tmp = document.createElement('canvas');
        tmp.width = c.width;
        tmp.height = c.height;
        const ctx = tmp.getContext('2d');
        ctx.drawImage(c, 0, 0);
        const img = ctx.getImageData(0, 0, tmp.width, tmp.height).data;
        let painted = 0, nonBlack = 0, minX = tmp.width, minY = tmp.height, maxX = 0, maxY = 0;
        const w = tmp.width, h = tmp.height;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                const r = img[i], g = img[i + 1], b = img[i + 2], a = img[i + 3];
                if (a > 8) painted++;
                if (r + g + b > 40) {
                    nonBlack++;
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }
        const total = w * h;
        const bboxW = Math.max(0, maxX - minX + 1);
        const bboxH = Math.max(0, maxY - minY + 1);
        return {
            frac: nonBlack / total,
            paintedFrac: painted / total,
            bboxW, bboxH, w, h,
            bboxCover: (bboxW * bboxH) / total
        };
    });
    log('fill', JSON.stringify(fill));
    if (fill.frac < 0.5) throw new Error('surface not substantially filled frac=' + fill.frac);
    if (fill.bboxCover < 0.8) throw new Error('painted bbox too small cover=' + fill.bboxCover);

    await page.locator('#start-btn').click();
    await page.waitForFunction(() => {
        const el = document.getElementById('center-panel');
        return el && el.style.display === 'none';
    }, { timeout: 20000 });
    await page.waitForTimeout(400);

    const auto = page.getByRole('button', { name: '자동전투' });
    await auto.waitFor({ state: 'visible', timeout: 10000 });
    const pressed0 = await auto.getAttribute('aria-pressed');
    log('auto pressed before', pressed0);
    if (pressed0 === 'true') throw new Error('자동전투 should start off');
    await auto.click();
    const pressed1 = await auto.getAttribute('aria-pressed');
    log('auto pressed after click', pressed1);
    if (pressed1 !== 'true') throw new Error('click did not turn 자동전투 on');

    const before = await page.evaluate(() => {
        const c = document.querySelector('#game-root canvas');
        const tmp = document.createElement('canvas');
        tmp.width = 160; tmp.height = 90;
        tmp.getContext('2d').drawImage(c, 0, 0, 160, 90);
        return tmp.toDataURL('image/png');
    });
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => {
        const c = document.querySelector('#game-root canvas');
        const tmp = document.createElement('canvas');
        tmp.width = 160; tmp.height = 90;
        tmp.getContext('2d').drawImage(c, 0, 0, 160, 90);
        return tmp.toDataURL('image/png');
    });
    if (before === after) throw new Error('auto-on still frame did not change without input');
    log('ok auto-on frame changed without WASD');

    await page.screenshot({ path: shot, fullPage: true });
    log('screenshot', shot);

    if (pageErrors.length) {
        throw new Error('page errors: ' + pageErrors.join(' | '));
    }
    log('PLAYWRIGHT PAGE OK');
} finally {
    await browser.close();
}
