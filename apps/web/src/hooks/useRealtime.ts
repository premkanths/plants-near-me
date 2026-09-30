'use client';

import { useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';
import { connectRealtime } from '@/lib/realtime';

export type ConnectionState = 'connecting' | 'live' | 'offline';

interface Options {
  /** Order to watch, if any. The server checks you are a party to it. */
  watchOrder?: string;
  /**
   * Event name → handler. Kept in a ref so re-renders do not re-subscribe.
   * Payloads are typed at the call site; `any` here is what socket.io hands us.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handlers: Record<string, (payload: any) => void>;
}

/**
 * One authenticated socket per component tree that needs live updates.
 *
 * Tickets are single-use, so reconnection is handled here rather than by
 * socket.io: on an unexpected drop we mint a fresh ticket and dial again with a
 * backoff, and we give up quietly rather than hammering the API. Realtime is an
 * enhancement — the page already rendered correctly from the server.
 */
export function useRealtime({ watchOrder, handlers }: Options): ConnectionState {
  const [state, setState] = useState<ConnectionState>('connecting');
  const handlersRef = useRef(handlers);

  // Keep the latest handlers reachable from the long-lived socket without
  // tearing the connection down on every render. Assigning in an effect (not
  // during render) keeps React's concurrent rendering rules happy.
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    let socket: Socket | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let disposed = false;

    const dial = async () => {
      try {
        socket = await connectRealtime();
        if (disposed) {
          socket.disconnect();
          return;
        }

        socket.on('ready', () => {
          attempt = 0;
          setState('live');
          if (watchOrder) socket?.emit('watchOrder', { masterOrderId: watchOrder });
        });

        for (const event of Object.keys(handlersRef.current)) {
          socket.on(event, (payload: unknown) => handlersRef.current[event]?.(payload));
        }

        socket.on('disconnect', () => {
          if (disposed) return;
          setState('offline');
          retry();
        });
        socket.on('connect_error', () => {
          if (!disposed) retry();
        });
      } catch {
        if (!disposed) retry();
      }
    };

    const retry = () => {
      attempt += 1;
      if (attempt > 5) {
        setState('offline');
        return;
      }
      retryTimer = setTimeout(() => void dial(), Math.min(1_000 * 2 ** attempt, 15_000));
    };

    void dial();

    return () => {
      disposed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.disconnect();
    };
  }, [watchOrder]);

  return state;
}

/** Small "live / reconnecting" pill shared by the customer and vendor views. */
export function connectionLabel(state: ConnectionState): { text: string; tone: string } {
  if (state === 'live') {
    return {
      text: 'Live',
      tone: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
    };
  }
  if (state === 'connecting') {
    return {
      text: 'Connecting…',
      tone: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
    };
  }
  return {
    text: 'Offline',
    tone: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  };
}
