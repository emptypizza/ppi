export class NetClient {
    constructor(url) {
        this.url = url;
        this.ws = null;
        this.handlers = {};
        this.opened = false;
    }
    on(type, fn) { this.handlers[type] = fn; }
    send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(msg));
        }
    }
    connect() {
        return new Promise((resolve, reject) => {
            let settled = false;
            const timer = setTimeout(() => {
                if (settled) return;
                settled = true;
                try { this.ws.close(); } catch (e) {}
                reject(new Error('timeout'));
            }, 2500);
            try {
                this.ws = new WebSocket(this.url);
            } catch (e) {
                clearTimeout(timer);
                reject(e);
                return;
            }
            this.ws.onopen = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.opened = true;
                resolve();
            };
            this.ws.onerror = () => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(new Error('ws error'));
            };
            this.ws.onmessage = (ev) => {
                let msg;
                try { msg = JSON.parse(ev.data); } catch (e) { return; }
                const fn = this.handlers[msg.type];
                if (fn) fn(msg);
            };
            this.ws.onclose = () => {
                this.opened = false;
                const fn = this.handlers.close;
                if (fn) fn();
            };
        });
    }
    close() {
        try { if (this.ws) this.ws.close(); } catch (e) {}
        this.opened = false;
    }
}
