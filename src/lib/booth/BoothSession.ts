import type { ClockSample, ControlFrame, SignalMessage, WarpFrame } from '../../types/booth';

/**
 * The couple-booth connection: WebRTC media, two DataChannels, NTP-style clock
 * sync, and chunked HD frame exchange.
 *
 * Perfect negotiation (polite/impolite) so two people mashing buttons at once
 * cannot deadlock the offer/answer dance. The first peer in the room is
 * impolite — it wins glare — and the second is polite and rolls over.
 */

const CHUNK_BYTES = 16 * 1024; // wire budget note; see sendShot for actual sizing
void CHUNK_BYTES;
const SYNC_SAMPLES = 10;
const RESYNC_EVERY_MS = 30_000;

export interface BoothSessionCallbacks {
  onRemoteStream?: (stream: MediaStream) => void;
  onPartnerGone?: () => void;
  onClock?: (sample: ClockSample) => void;
  onSharedFire?: (fireAt: number, slot: number) => void;
  onCancelFire?: () => void;
  onRemoteShot?: (slot: number, blob: Blob) => void;
  onStripLayout?: (layout: string) => void;
  onGesture?: (gesture: string, heldFor: number) => void;
  /** DataChannels ready — media may still be negotiating. */
  onChannelsReady?: () => void;
}

interface PeerState {
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
}

export class BoothSession {
  readonly pc: RTCPeerConnection;
  readonly control: RTCDataChannel;
  readonly warp: RTCDataChannel;

  private signaling: { send: (msg: SignalMessage) => boolean };
  private callbacks: BoothSessionCallbacks = {};
  private peer: PeerState;
  private disposed = false;

  /** Best offset so far — from the lowest-RTT sample, per the classic NTP trick. */
  private clockOffset = 0;
  private bestRtt = Infinity;
  private syncSamples = 0;
  private syncTimer = 0;

  /** Inbound chunked shot assembly. */
  private incoming = new Map<
    number,
    { slot: number; chunks: string[]; received: number; total: number }
  >();

  constructor(opts: {
    polite: boolean;
    signalingSend: (msg: SignalMessage) => boolean;
    iceServers: RTCIceServer[];
  }) {
    this.peer = { makingOffer: false, ignoreOffer: false, polite: opts.polite };

    this.pc = new RTCPeerConnection({ iceServers: opts.iceServers });
    this.signaling = { send: opts.signalingSend };

    // 'control' first so it wins the negotiated id; both are ordered+reliable
    // because warp state accumulates and a dropped packet desyncs views forever.
    this.control = this.pc.createDataChannel('control', { ordered: true });
    this.warp = this.pc.createDataChannel('warp', { ordered: true });
    if (opts.polite) {
      // The polite peer is the answerer: channels arrive via ondatachannel.
    }

    this.pc.onicecandidate = (e) => {
      if (e.candidate) this.signaling.send({ type: 'ice', candidate: e.candidate.toJSON() });
    };
    this.pc.onconnectionstatechange = () => {
      if (this.pc.connectionState === 'failed') {
        this.pc.restartIce();
      }
      if (this.pc.connectionState === 'disconnected' || this.pc.connectionState === 'closed') {
        if (!this.disposed) this.callbacks.onPartnerGone?.();
      }
    };
    this.pc.ontrack = (e) => {
      if (e.streams[0]) this.callbacks.onRemoteStream?.(e.streams[0]);
    };

    this.control.onopen = () => {
      this.callbacks.onChannelsReady?.();
      this.beginSync();
    };
    this.control.onmessage = (e) => this.onControl(String(e.data));
    this.warp.onmessage = (e) => this.onWarp(e.data);
  }

  setCallbacks(callbacks: BoothSessionCallbacks): void {
    this.callbacks = callbacks;
  }

  // --- perfect negotiation --------------------------------------------------

  async handleSignaling(msg: SignalMessage): Promise<void> {
    try {
      if (msg.type === 'offer') {
        const offerCollision = this.peer.makingOffer || this.pc.signalingState !== 'stable';
        this.peer.ignoreOffer = !this.peer.polite && offerCollision;
        if (this.peer.ignoreOffer) return;

        await this.pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        await this.pc.setLocalDescription();
        this.signaling.send({ type: 'answer', sdp: this.pc.localDescription!.sdp! });
      } else if (msg.type === 'answer') {
        await this.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
      } else if (msg.type === 'ice') {
        try {
          await this.pc.addIceCandidate(msg.candidate);
        } catch (err) {
          if (!this.peer.ignoreOffer) throw err;
        }
      }
    } catch (err) {
      // A malformed relay should never kill the session.
      if (import.meta.env.DEV) console.warn('[session] signaling error:', err);
    }
  }

  /** Called by the impolite peer (the joiner waits for offers). */
  async startOffer(): Promise<void> {
    if (this.peer.polite) return;
    await this.makeOffer();
  }

  private async makeOffer(): Promise<void> {
    try {
      this.peer.makingOffer = true;
      await this.pc.setLocalDescription();
      this.signaling.send({ type: 'offer', sdp: this.pc.localDescription!.sdp! });
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[session] offer failed:', err);
    } finally {
      this.peer.makingOffer = false;
    }
  }

  /** Attach a locally-created track (both peers can add media). */
  addTrack(track: MediaStreamTrack, stream: MediaStream): RTCRtpSender {
    return this.pc.addTrack(track, stream);
  }

  /** The polite peer receives the channels the impolite peer created. */
  wireIncomingChannels(): void {
    this.pc.ondatachannel = (e) => {
      if (e.channel.label === 'control') {
        (this as { control: RTCDataChannel }).control = e.channel;
        this.control.onopen = () => {
          this.callbacks.onChannelsReady?.();
          this.beginSync();
        };
        this.control.onmessage = (ev) => this.onControl(String(ev.data));
      } else if (e.channel.label === 'warp') {
        (this as { warp: RTCDataChannel }).warp = e.channel;
        this.warp.onmessage = (ev) => this.onWarp(ev.data);
      }
    };
  }

  // --- clock sync ----------------------------------------------------------

  /** ms to add to local performance.now() for the shared wall clock. */
  sharedNow(): number {
    return performance.now() + this.clockOffset;
  }

  get measuredRtt(): number {
    return this.bestRtt === Infinity ? 0 : this.bestRtt;
  }

  private beginSync(): void {
    this.syncSamples = 0;
    this.bestRtt = Infinity;
    this.sendPing();
    if (this.syncTimer) window.clearInterval(this.syncTimer);
    this.syncTimer = window.setInterval(() => {
      if (this.disposed) return;
      this.syncSamples = 0;
      this.sendPing();
    }, RESYNC_EVERY_MS);
  }

  private sendPing(): void {
    if (this.control.readyState !== 'open') return;
    this.control.send(
      JSON.stringify({ type: 'ping', t0: performance.now() } satisfies ControlFrame),
    );
  }

  private onControl(raw: string): void {
    let frame: ControlFrame;
    try {
      frame = JSON.parse(raw) as ControlFrame;
    } catch {
      return;
    }

    switch (frame.type) {
      case 'ping': {
        const t1 = performance.now();
        // Echo all four stamps so the sender can compute offset and RTT.
        this.control.send(
          JSON.stringify({
            type: 'pong',
            t0: frame.t0,
            t1,
            t2: performance.now(),
          } satisfies ControlFrame),
        );
        return;
      }
      case 'pong': {
        const t3 = performance.now();
        const offset = (frame.t1 - frame.t0 + (frame.t2 - t3)) / 2;
        const rtt = t3 - frame.t0 - (frame.t2 - frame.t1);
        // Keep the sample from the fastest round trip — the least time spent
        // queuing, so the least distortion of the offset estimate.
        if (rtt < this.bestRtt) {
          this.bestRtt = rtt;
          this.clockOffset = offset;
        }
        this.syncSamples++;
        this.callbacks.onClock?.({ offset, rtt });
        if (this.syncSamples < SYNC_SAMPLES) this.sendPing();
        return;
      }
      case 'fire-at':
        this.callbacks.onSharedFire?.(frame.at, frame.slot);
        return;
      case 'cancel-fire':
        this.callbacks.onCancelFire?.();
        return;
      case 'shot':
        this.acceptChunk(frame);
        return;
      case 'shot-done':
      case 'shot-missed':
        return;
      case 'strip-layout':
        this.callbacks.onStripLayout?.(frame.layout);
        return;
      case 'gesture':
        this.callbacks.onGesture?.(frame.gesture, frame.heldFor);
        return;
      default:
        return;
    }
  }

  // --- shared shutter --------------------------------------------------------

  /**
   * The initiator picks a fire moment ~3s out in *shared* time and both peers
   * count down against their own corrected clocks. Never send "capture now".
   */
  scheduleSharedShot(slot: number, countdownMs: number): number {
    const fireAt = this.sharedNow() + countdownMs;
    if (this.control.readyState === 'open') {
      this.control.send(
        JSON.stringify({ type: 'fire-at', at: fireAt, slot } satisfies ControlFrame),
      );
    }
    return fireAt;
  }

  cancelSharedShot(): void {
    if (this.control.readyState === 'open') {
      this.control.send(JSON.stringify({ type: 'cancel-fire' } satisfies ControlFrame));
    }
  }

  // --- frame exchange --------------------------------------------------------

  /** JPEG bytes → 16KB base64 chunks over the control channel. */
  async sendShot(slot: number, blob: Blob): Promise<void> {
    if (this.control.readyState !== 'open') return;
    const buffer = new Uint8Array(await blob.arrayBuffer());
    let byteCursor = 0;
    let seq = 0;
    // Base64 inflates by 4/3; 16KB binary ≈ 22KB of string — comfortably under
    // the 256KB message cap browsers buffer before choking.
    const chunkSize = 12 * 1024;
    while (byteCursor < buffer.length) {
      const slice = buffer.subarray(byteCursor, byteCursor + chunkSize);
      let binary = '';
      for (const byte of slice) binary += String.fromCharCode(byte);
      seq++;
      this.control.send(
        JSON.stringify({
          type: 'shot',
          slot,
          seq,
          total: Math.ceil(buffer.length / chunkSize),
          bytes: buffer.length,
          data: btoa(binary),
        } satisfies ControlFrame),
      );
      byteCursor += chunkSize;
    }
    this.control.send(JSON.stringify({ type: 'shot-done', slot } satisfies ControlFrame));
  }

  private acceptChunk(frame: Extract<ControlFrame, { type: 'shot' }>): void {
    let entry = this.incoming.get(frame.slot);
    if (!entry || entry.total !== frame.total) {
      entry = {
        slot: frame.slot,
        chunks: new Array(frame.total).fill(''),
        received: 0,
        total: frame.total,
      };
      this.incoming.set(frame.slot, entry);
    }
    if (entry.chunks[frame.seq - 1] === '') {
      entry.chunks[frame.seq - 1] = frame.data;
      entry.received++;
    }
    if (entry.received === entry.total) {
      this.incoming.delete(frame.slot);
      let binary = '';
      for (const chunk of entry.chunks) {
        try {
          binary += atob(chunk);
        } catch {
          return; // corrupt exchange; the slot stays empty
        }
      }
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      this.callbacks.onRemoteShot?.(frame.slot, new Blob([bytes], { type: 'image/jpeg' }));
    }
  }

  // --- phase-2 warp channel ---------------------------------------------------

  sendWarp(frame: WarpFrame): void {
    if (this.warp.readyState === 'open') this.warp.send(JSON.stringify(frame));
  }

  private onWarp(raw: unknown): void {
    // Phase 2 will subscribe here. Parsing now would be speculative.
    void raw;
  }

  // --- misc -------------------------------------------------------------------

  broadcastLayout(layout: string): void {
    if (this.control.readyState === 'open') {
      this.control.send(JSON.stringify({ type: 'strip-layout', layout } satisfies ControlFrame));
    }
  }

  broadcastGesture(gesture: string, heldFor: number): void {
    if (this.control.readyState === 'open') {
      this.control.send(
        JSON.stringify({ type: 'gesture', gesture, heldFor } satisfies ControlFrame),
      );
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.syncTimer) window.clearInterval(this.syncTimer);
    try {
      if (this.control.readyState === 'open') {
        this.control.send(JSON.stringify({ type: 'bye' } satisfies ControlFrame));
      }
    } catch {
      /* closing anyway */
    }
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.ondatachannel = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
  }
}
