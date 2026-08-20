import { WebSocket } from 'ws';

function client(nick) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket('ws://127.0.0.1:8787');
        const got = { welcome: null, start: null, states: 0 };
        const t = setTimeout(() => reject(new Error(nick + ' timeout')), 6000);
        ws.on('open', () => ws.send(JSON.stringify({ type: 'join', nick, color: '#00BFFF' })));
        ws.on('message', (buf) => {
            const m = JSON.parse(String(buf));
            if (m.type === 'welcome') got.welcome = m;
            if (m.type === 'start') got.start = m;
            if (m.type === 'state') got.states++;
            if (got.start && got.states >= 3) {
                clearTimeout(t);
                const snap = got.start.snapshot;
                const humans = snap.entities.filter(e => !e.bot).length;
                const bots = snap.entities.filter(e => e.bot).length;
                ws.close();
                resolve({ nick, id: got.welcome.id, humans, bots, n: snap.entities.length, phase: snap.phase });
            }
        });
        ws.on('error', reject);
    });
}

const [a, b] = await Promise.all([client('Ann'), client('Bob')]);
console.log(JSON.stringify({ a, b }));
if (a.n !== 10 || b.n !== 10) throw new Error('not 10');
if (a.humans !== 2 || b.humans !== 2) throw new Error('humans ' + a.humans);
if (a.bots !== 8) throw new Error('bots ' + a.bots);
if (a.id === b.id) throw new Error('same id');
console.log('multi ok');
