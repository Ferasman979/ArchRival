import { useEffect, useRef, useCallback } from 'react';

export function useWebSocket(onMessage, onAudioChunk, onDone) {
  const wsRef = useRef(null);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    const wsUrl = (import.meta.env.VITE_WS_URL || 'ws://localhost:8000') + '/ws/session';
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      console.log('[ArchRival] WebSocket connected');
    };

    ws.onmessage = (event) => {
      if (event.data instanceof ArrayBuffer) {
        onAudioChunk?.(event.data);
      } else {
        try {
          const data = JSON.parse(event.data);
          if (data.done) {
            onDone?.();
          } else {
            onMessage?.(data);
          }
        } catch (e) {
          console.error('[ArchRival] WS parse error', e);
        }
      }
    };

    ws.onerror = (e) => console.error('[ArchRival] WS error', e);

    ws.onclose = () => {
      console.log('[ArchRival] WS closed — reconnecting in 2s');
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    wsRef.current = ws;
  }, [onMessage, onAudioChunk, onDone]);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  return { send };
}