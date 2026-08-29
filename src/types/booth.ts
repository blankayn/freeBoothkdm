/** Wire types shared by the signaling client, the WebRTC session, and the UI. */

export type SignalingStatus =
  'idle' | 'connecting' | 'joined' | 'paired' | 'full' | 'error' | 'closed';

export interface SignalingEvent {
  type: 'joined' | 'peer-joined' | 'peer-left' | 'room-full' | 'error';
  polite?: boolean;
  peers?: number;
  message?: string;
}

/** Messages relayed through the server. Media never touches it. */
export type SignalMessage =
  | { type: 'join'; room: string }
  | { type: 'offer'; sdp: string }
  | { type: 'answer'; sdp: string }
  | { type: 'ice'; candidate: RTCIceCandidateInit }
  | { type: 'ping'; t: number };

/** Control-channel frames. Ordered, reliable — commands must not arrive twice. */
export type ControlFrame =
  | { type: 'ping'; t0: number }
  | { type: 'pong'; t0: number; t1: number; t2: number }
  | { type: 'fire-at'; at: number; slot: number }
  | { type: 'cancel-fire' }
  | { type: 'shot'; slot: number; seq: number; total: number; bytes: number; data: string }
  | { type: 'shot-done'; slot: number }
  | { type: 'shot-missed'; slot: number }
  | { type: 'strip-layout'; layout: string }
  | { type: 'gesture'; gesture: string; heldFor: number }
  | { type: 'reset-face' }
  | { type: 'bye' };

/** Warp-channel frames. Phase 2; declared now so the channel shape is stable. */
export type WarpFrame =
  | { type: 'face-space'; ox: number; oy: number; scale: number; rot: number; t: number }
  | { type: 'deformers'; bornAt: number; items: unknown[] }
  | { type: 'checkpoint'; items: unknown[] };

export interface ClockSample {
  offset: number;
  rtt: number;
}

export interface SharedShot {
  /** Slot in the 4-shot roll this exchange belongs to. */
  slot: number;
  /** My own full-resolution frame, captured locally. */
  local: Blob | null;
  /** Partner's frame once every chunk arrived. */
  remote: Blob | null;
}

export type PartnerStatus = 'waiting' | 'connecting' | 'live' | 'gone';
