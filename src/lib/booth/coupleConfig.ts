/**
 * Coordinates SignalingClient + BoothSession into one connection lifecycle:
 * join a room, negotiate, publish local media, and expose connection status.
 *
 * The hook layer above this only sees `state` and a handful of actions.
 */

export interface CoupleConnectionState {
  phase:
    | 'idle'
    | 'connecting'
    | 'waiting-for-partner'
    | 'connecting-to-partner'
    | 'live'
    | 'partner-gone'
    | 'error';
  roomCode: string;
  isPolite: boolean;
  syncOffset: number;
  rtt: number;
}

export type CoupleAction =
  { type: 'host'; room: string } | { type: 'join'; room: string } | { type: 'leave' };

/** WebRTC ICE servers. TURN is required for ~1-in-6 connections. */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  ...(import.meta.env.VITE_TURN_URL
    ? [
        {
          urls: import.meta.env.VITE_TURN_URL as string,
          username: import.meta.env.VITE_TURN_USER as string | undefined,
          credential: import.meta.env.VITE_TURN_CRED as string | undefined,
        },
      ]
    : []),
];

/** Supabase project URL. Set VITE_SUPABASE_URL in .env.local. */
export function supabaseUrl(): string | undefined {
  return import.meta.env.VITE_SUPABASE_URL as string | undefined;
}
