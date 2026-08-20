/** WebSocket URL. Localhost → :8787. Pages stays solo unless ?ws= or localStorage ppi_ws. */
export function wsUrl() {
    const q = new URLSearchParams(location.search).get('ws');
    if (q) return q;
    try {
        const stored = localStorage.getItem('ppi_ws');
        if (stored) return stored;
    } catch (e) {}
    const host = location.hostname || '127.0.0.1';
    if (host === 'localhost' || host === '127.0.0.1') return `ws://${host}:8787`;
    return '';
}
