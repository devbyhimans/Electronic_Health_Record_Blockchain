import { useState, useEffect, useRef } from 'react';

const USE_MOCK = import.meta.env.VITE_USE_MOCK === 'true';

export function useDashboardSocket() {
  const [isConnected, setIsConnected] = useState(USE_MOCK ? true : false);
  const [lastBlock, setLastBlock] = useState(10482);
  const [emergencyAlert, setEmergencyAlert] = useState(false);
  const [events, setEvents] = useState([]);
  
  const wsRef = useRef(null);
  const bufferRef = useRef([]);
  const bufferTimerRef = useRef(null);

  useEffect(() => {
    if (USE_MOCK) {
      const mockInterval = setInterval(() => {
        setLastBlock(prev => prev + 1);
        // Occasionally trigger mock emergency alert
        if (Math.random() > 0.95) {
           setEmergencyAlert(true);
           setTimeout(() => setEmergencyAlert(false), 5000);
        }
      }, 5000);
      return () => clearInterval(mockInterval);
    }

    function connect() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/api/dashboard/ws`;
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => setIsConnected(true);
      
      wsRef.current.onclose = () => {
        setIsConnected(false);
        setTimeout(connect, 15000);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.eventType === 'EMERGENCY_ACCESS_INVOKED') {
            setEmergencyAlert(true);
            return;
          }

          if (data.lastBlock) {
             setLastBlock(data.lastBlock);
          }

          bufferRef.current.push(data);
          
          if (!bufferTimerRef.current) {
            bufferTimerRef.current = setTimeout(() => {
              setEvents(prev => {
                const newEvents = [...bufferRef.current, ...prev].slice(0, 200);
                return newEvents;
              });
              bufferRef.current = [];
              bufferTimerRef.current = null;
            }, 500);
          }
        } catch (e) {
          console.error("Failed to parse websocket message", e);
        }
      };
    }

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (bufferTimerRef.current) {
         clearTimeout(bufferTimerRef.current);
      }
    };
  }, []);

  return { isConnected, lastBlock, emergencyAlert, events };
}
