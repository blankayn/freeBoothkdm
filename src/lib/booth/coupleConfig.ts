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

export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  // TURN is what saves the ~1-in-6 connections that STUN cannot punch. Shipping
  // without one means some couples simply never connect — set these env vars.
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

export function defaultSignalingUrl(): string {
  // Vite dev runs on 5173; the signaling server defaults to 8787. In prod the
  // host should put them behind one origin (or set VITE_SIGNALING_URL).
  const envUrl = import.meta.env.VITE_SIGNALING_URL as string | undefined;
  if (envUrl) return envUrl;
  if (import.meta.env.DEV) return `ws://${location.hostname}:8787`;
  return `wss://${location.host}/ws`;
}
