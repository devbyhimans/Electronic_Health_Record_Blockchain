import { useEffect, useState } from 'react';
import { fetchApi, hasDashboardAuth } from '../services/api';

export function useDashboardSocket() {
  const [isConnected, setConnected] = useState(false); const [lastBlock, setLastBlock] = useState(null); const [events, setEvents] = useState([]);
  useEffect(() => {
    let socket; let stopped = false; let retry;
    async function connect() {
      if (stopped || !hasDashboardAuth()) return;
      try {
        const ticketResponse = await fetchApi('/stream-ticket', { method: 'POST' });
        const ticket = ticketResponse.ticket;
        if (!ticket || stopped) return;
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        socket = new WebSocket(`${protocol}//${location.host}/api/dashboard/ws?ticket=${encodeURIComponent(ticket)}`);
        socket.onopen = () => setConnected(true);
        socket.onmessage = ({ data }) => {
          try { const payload = JSON.parse(data); const event = payload.event || payload.data || payload; if (event.blockNumber != null) setLastBlock(event.blockNumber); setEvents(previous => [event, ...previous].slice(0, 100)); }
          catch { /* Ignore malformed stream frames; never surface untrusted raw payloads. */ }
        };
        socket.onclose = () => { setConnected(false); if (!stopped) retry = setTimeout(connect, 3000); };
        socket.onerror = () => socket?.close();
      } catch (error) { if (error.status !== 401 && !stopped) retry = setTimeout(connect, 5000); }
    }
    connect();
    return () => { stopped = true; clearTimeout(retry); socket?.close(); };
  }, []);
  return { isConnected, lastBlock, events };
}
