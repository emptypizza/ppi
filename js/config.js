/** Optional WS URL. This PC is not a game host — empty unless ?ws= or localStorage ppi_ws. */
export function wsUrl() {
    const q = new URLSearchParams(location.search).get('ws');
    if (q) return q;
    try {
        const stored = localStorage.getItem('ppi_ws');
        if (stored) return stored;
    } catch (e) {}
    return '';
}
