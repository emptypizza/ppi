import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { Matchmaker } from './room.mjs';

const PORT = Number(process.env.PORT || 8787);
const mm = new Matchmaker();
const sockets = new Map(); // ws -> room

const http = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('ppi ws ok\n');
});

const wss = new WebSocketServer({ server: http });

wss.on('connection', (ws) => {
    ws.on('message', (buf) => {
        let msg;
        try { msg = JSON.parse(String(buf)); } catch (e) { return; }
        if (msg.type === 'join' && !sockets.has(ws)) {
            const { room } = mm.join(ws, msg);
            sockets.set(ws, room);
            return;
        }
        const room = sockets.get(ws);
        if (!room) return;
        if (msg.type === 'input') room.onInput(ws, msg);
    });
    ws.on('close', () => {
        const room = sockets.get(ws);
        sockets.delete(ws);
        if (room) room.onLeave(ws);
    });
});

http.listen(PORT, () => {
    console.log(`ppi ws listening on ${PORT}`);
});
