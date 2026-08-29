import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { SignalingEvent, SignalingStatus, SignalMessage } from '../../types/booth';

/**
 * Signaling for the couple booth, backed by Supabase Realtime.
 *
 * - `Broadcast` relays the opaque signaling payloads (offer/answer/ice) between
 *   the two peers in a room. Server never sees them, the partner does.
 * - `Presence` is what decides polite vs impolite. The first presence key in
 *   the room is impolite (wins glare); everyone else is polite.
 *
 * Replace the old ws-based relay entirely — no separate process to host.
 */

const TOPIC_PREFIX = 'booth:room:';

export class SignalingClient {
  private client: ReturnType<typeof createClient> | null = null;
  private channel: RealtimeChannel | null = null;
  private status: SignalingStatus = 'idle';
  private peerId: string | null = null;
  private onEvent: ((e: SignalingEvent) => void) | null = null;
  private onMessage: ((msg: SignalMessage) => void) | null = null;

  connect(url: string, room: string): void {
    this.close();
    const key =
      (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ??
      (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined);
    if (!url || !key) {
      this.status = 'error';
      this.onEvent?.({ type: 'error', message: 'Supabase URL or key missing in env' });
      return;
    }

    this.status = 'connecting';
    this.client = createClient(url, key, {
      // Realtime works fine without a session for public channels.
      auth: { persistSession: false },
    });
    this.peerId = `peer_${Math.random().toString(36).slice(2, 10)}`;

    const topic = `${TOPIC_PREFIX}${room}`;
    const channel = this.client.channel(topic, {
      config: {
        presence: { key: this.peerId },
        broadcast: { ack: true, self: false },
      },
    });
    this.channel = channel;

    channel
      .on('broadcast', { event: '*' }, (payload) => {
        const msg = payload.payload as { type?: string } & Record<string, unknown>;
        if (!msg || typeof msg.type !== 'string') return;
        this.onMessage?.(msg as unknown as SignalMessage);
      })
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ joinedAt: number }>();
        const peers = Object.keys(state);
        if (peers.length === 1 && peers[0] === this.peerId) {
          // Just us. Not yet paired.
          this.status = 'joined';
          this.onEvent?.({ type: 'joined', polite: true, peers: 1 });
        } else if (peers.length >= 2) {
          // First-arrived by joinedAt is impolite, rest are polite. Everyone
          // computes the same ordering because presence state is identical on
          // every side — this is the deterministic rule the perfect-negotiation
          // pattern needs.
          const ordered = peers.slice().sort((a, b) => {
            const at = state[a]?.[0]?.joinedAt ?? 0;
            const bt = state[b]?.[0]?.joinedAt ?? 0;
            return at - bt;
          });
          const myIndex = this.peerId ? ordered.indexOf(this.peerId) : -1;
          const polite = myIndex !== 0;
          const wasAlone = this.status === 'joined' || this.status === 'connecting';
          this.status = 'paired';
          this.onEvent?.({ type: 'joined', polite, peers: ordered.length });
          if (wasAlone) this.onEvent?.({ type: 'peer-joined' });
        }
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key === this.peerId) return;
        this.onEvent?.({ type: 'peer-left' });
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ joinedAt: Date.now() });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          this.status = 'error';
          this.onEvent?.({ type: 'error', message: `channel ${status.toLowerCase()}` });
        } else if (status === 'CLOSED') {
          if (this.status !== 'error') {
            this.status = 'closed';
            this.onEvent?.({ type: 'error', message: 'connection closed' });
          }
        }
      });
  }

  get currentStatus(): SignalingStatus {
    return this.status;
  }

  setHandlers(handlers: {
    onEvent?: (e: SignalingEvent) => void;
    onMessage?: (msg: SignalMessage) => void;
  }): void {
    this.onEvent = handlers.onEvent ?? null;
    this.onMessage = handlers.onMessage ?? null;
  }

  async send(msg: SignalMessage): Promise<boolean> {
    if (!this.channel) return false;
    const result = await this.channel.send({
      type: 'broadcast',
      event: msg.type,
      payload: msg as unknown as Record<string, unknown>,
    });
    return result === 'ok';
  }

  close(): void {
    if (this.channel && this.client) {
      void this.channel.untrack();
      this.client.removeChannel(this.channel);
    }
    this.channel = null;
    this.client = null;
    this.peerId = null;
    this.status = 'idle';
  }
}

export function makeRoomCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
