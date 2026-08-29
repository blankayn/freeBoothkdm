import { create } from 'zustand';
import type { PartnerStatus } from '../types/booth';
import { CoupleConnection } from '../lib/booth/CoupleConnection';

/**
 * Couple-booth state. The connection object itself lives outside the store
 * (one instance, mutated in place); the store mirrors its observable state so
 * React can subscribe narrowly.
 */

let connection: CoupleConnection | null = null;

function ensureConnection(): CoupleConnection {
  if (!connection) {
    connection = new CoupleConnection();
    connection.setCallbacks({
      onStateChange: (state) => {
        useCouple.setState({
          roomCode: state.roomCode,
          partner: state.partner,
          polite: state.polite,
          offset: state.offset,
          rtt: state.rtt,
        });
      },
      onSharedFire: (at, slot) => useCouple.setState({ fireAt: at, fireSlot: slot }),
      onCancelFire: () => useCouple.setState({ fireAt: null }),
      onRemoteShot: (slot, blob) =>
        useCouple.setState((s) => ({
          partnerShots: new Map(s.partnerShots).set(slot, blob),
        })),
      onPartnerGesture: (gesture, heldFor) =>
        useCouple.setState({ partnerGesture: { gesture, heldFor } }),
    });
  }
  return connection;
}

export interface CoupleStore {
  active: boolean;
  roomCode: string;
  partner: PartnerStatus;
  polite: boolean;
  offset: number;
  rtt: number;
  fireAt: number | null;
  fireSlot: number;
  partnerShots: Map<number, Blob>;
  partnerGesture: { gesture: string; heldFor: number } | null;

  host: () => string;
  join: (room: string) => void;
  leave: () => void;
  rtc: () => CoupleConnection | null;
  clearFire: () => void;
}

export const useCouple = create<CoupleStore>((set) => ({
  active: false,
  roomCode: '',
  partner: 'waiting',
  polite: true,
  offset: 0,
  rtt: 0,
  fireAt: null,
  fireSlot: 0,
  partnerShots: new Map(),
  partnerGesture: null,

  host: () => {
    const conn = ensureConnection();
    const room = conn.host();
    set({ active: true, roomCode: room, partner: 'waiting', partnerShots: new Map() });
    return room;
  },

  join: (room) => {
    const conn = ensureConnection();
    conn.join(room);
    set({
      active: true,
      roomCode: room.toUpperCase(),
      partner: 'waiting',
      partnerShots: new Map(),
    });
  },

  leave: () => {
    connection?.leave();
    set({
      active: false,
      roomCode: '',
      partner: 'waiting',
      fireAt: null,
      partnerShots: new Map(),
      partnerGesture: null,
    });
  },

  rtc: () => connection,

  clearFire: () => set({ fireAt: null }),
}));

/** Debug overlay (?debug=sync) reads this live without subscribing. */
export function coupleDebugInfo(): { offset: number; rtt: number } {
  const s = useCouple.getState();
  return { offset: s.offset, rtt: s.rtt };
}
