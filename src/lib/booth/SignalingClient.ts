import type { SignalingEvent, SignalingStatus, SignalMessage } from '../../types/booth';

/**
 * Thin signaling client. Knows the room code grammar and nothing else — SDP
 * and ICE are opaque blobs handed to the caller.
 */
export class SignalingClient {
  private socket: WebSocket | null = null;
  private status: SignalingStatus = 'idle';
  private onEvent: ((e: SignalingEvent) => void) | null = null;
  private onMessage: ((msg: SignalMessage) => void) | null = null;

  connect(url: string, room: string): void {
    this.close();
    this.status = 'connecting';
    const socket = new WebSocket(url);
    this.socket = socket;

    socket.onopen = () => {
      this.send({ type: 'join', room });
    };
    socket.onmessage = (event) => {
      let parsed: { type: string; [k: string]: unknown };
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }
      const kind = parsed.type;
      switch (kind) {
        case 'joined':
          this.status = 'joined';
          this.onEvent?.({
            type: 'joined',
            polite: parsed.polite as boolean | undefined,
            peers: parsed.peers as number | undefined,
          });
          break;
        case 'peer-joined':
          this.status = 'paired';
          this.onEvent?.({ type: 'peer-joined' });
          break;
        case 'peer-left':
          this.status = 'joined';
          this.onEvent?.({ type: 'peer-left' });
          break;
        case 'room-full':
          this.status = 'full';
          this.onEvent?.({ type: 'room-full' });
          break;
        case 'offer':
        case 'answer':
          this.onMessage?.(parsed as unknown as SignalMessage);
          break;
        case 'ice':
          this.onMessage?.({
            type: 'ice',
            candidate: parsed.candidate as RTCIceCandidateInit,
          });
          break;
        case 'error':
          this.status = 'error';
          this.onEvent?.({
            type: 'error',
            message: String(parsed.message ?? 'signaling error'),
          });
          break;
      }
    };
    socket.onclose = () => {
      if (this.status !== 'full' && this.status !== 'error') this.status = 'closed';
      this.onEvent?.({ type: 'error', message: 'connection closed' });
      this.socket = null;
    };
    socket.onerror = () => {
      this.status = 'error';
      this.onEvent?.({ type: 'error', message: 'could not reach the booth server' });
    };
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

  send(msg: SignalMessage): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(JSON.stringify(msg));
    return true;
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    this.status = 'idle';
    if (socket) {
      socket.onclose = null;
      socket.onmessage = null;
      socket.onerror = null;
      try {
        socket.close();
      } catch {
        /* already closing */
      }
    }
  }
}

export function makeRoomCode(): string {
  // Mirrors the server alphabet: no O/0/I/1.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}
