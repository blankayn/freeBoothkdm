import type { ClockSample, PartnerStatus, SignalingEvent, SignalMessage } from '../../types/booth';
import { SignalingClient, makeRoomCode } from './SignalingClient';
import { BoothSession } from './BoothSession';
import { ICE_SERVERS, supabaseUrl } from './coupleConfig';

export interface ConnectionCallbacks {
  onStateChange?: (state: ConnectionState) => void;
  onRemoteStream?: (stream: MediaStream) => void;
  onClock?: (sample: ClockSample) => void;
  onSharedFire?: (fireAt: number, slot: number) => void;
  onCancelFire?: () => void;
  onRemoteShot?: (slot: number, blob: Blob) => void;
  onPartnerGesture?: (gesture: string, heldFor: number) => void;
}

export interface ConnectionState {
  roomCode: string;
  partner: PartnerStatus;
  polite: boolean;
  offset: number;
  rtt: number;
}

const IDLE_STATE: ConnectionState = {
  roomCode: '',
  partner: 'waiting',
  polite: true,
  offset: 0,
  rtt: 0,
};

/**
 * One instance per couple-booth session. Owns the signaling socket and the
 * RTCPeerConnection, and nothing else — capture and rendering stay in the
 * engine where they already live.
 */
export class CoupleConnection {
  private signaling = new SignalingClient();
  private session: BoothSession | null = null;
  private localStream: MediaStream | null = null;
  private remoteVideo: HTMLVideoElement | null = null;
  private callbacks: ConnectionCallbacks = {};
  private state: ConnectionState = { ...IDLE_STATE };

  get current(): ConnectionState {
    return this.state;
  }

  get rtc(): BoothSession | null {
    return this.session;
  }

  setCallbacks(callbacks: ConnectionCallbacks): void {
    this.callbacks = callbacks;
  }

  /** A muted, hidden <video> that decodes the incoming stream for the engine. */
  get remoteVideoElement(): HTMLVideoElement | null {
    return this.remoteVideo;
  }

  host(): string {
    const room = makeRoomCode();
    this.enter(room);
    return room;
  }

  join(room: string): void {
    this.enter(room.toUpperCase());
  }

  private enter(room: string): void {
    this.leave();
    this.patch({ roomCode: room, partner: 'waiting' });

    this.signaling.setHandlers({
      onEvent: (e) => this.onSignalingEvent(e, room),
      onMessage: (msg) => void this.session?.handleSignaling(msg),
    });
    this.signaling.connect(supabaseUrl() ?? '', room);
  }

  private onSignalingEvent(e: SignalingEvent, room: string): void {
    switch (e.type) {
      case 'joined': {
        const polite = e.polite ?? true;
        this.patch({ polite });
        if (!this.session) {
          this.session = new BoothSession({
            polite,
            signalingSend: (msg: SignalMessage) => {
              void this.signaling.send(msg);
              return true;
            },
            iceServers: ICE_SERVERS,
          });
          this.session.setCallbacks({
            onRemoteStream: (stream) => this.attachRemote(stream),
            onPartnerGone: () => {
              this.patch({ partner: 'gone' });
              this.callbacks.onStateChange?.(this.state);
            },
            onClock: (sample) => {
              this.patch({ offset: sample.offset, rtt: sample.rtt });
              this.callbacks.onClock?.(sample);
            },
            onSharedFire: (at, slot) => this.callbacks.onSharedFire?.(at, slot),
            onCancelFire: () => this.callbacks.onCancelFire?.(),
            onRemoteShot: (slot, blob) => this.callbacks.onRemoteShot?.(slot, blob),
            onGesture: (g, held) => this.callbacks.onPartnerGesture?.(g, held),
          });
          if (polite) this.session.wireIncomingChannels();
        }
        break;
      }
      case 'peer-joined': {
        this.patch({ partner: 'connecting' });
        // The impolite peer (host) initiates media; the joiner answers.
        void this.publishLocal().then(() => {
          if (!this.state.polite) void this.session?.startOffer();
        });
        break;
      }
      case 'peer-left': {
        this.patch({ partner: 'gone' });
        break;
      }
      case 'room-full':
        this.patch({ partner: 'waiting' });
        break;
      case 'error':
        if (this.state.partner !== 'live') this.patch({ partner: 'waiting' });
        break;
    }
    this.callbacks.onStateChange?.(this.state);
    void room;
  }

  /** Camera + mic; audio matters — they are on a date and need to laugh. */
  private async publishLocal(): Promise<void> {
    if (this.localStream) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 1280, height: 720, facingMode: 'user' },
        audio: true,
      });
      this.localStream = stream;
      if (this.session) {
        for (const track of stream.getTracks()) this.session.addTrack(track, stream);
      }
    } catch {
      // The booth's own CameraManager owns the preview camera; this stream is a
      // second getUserMedia for the partner. Failure here just means no video
      // for the partner — the session's DataChannels still work for sync.
    }
  }

  private attachRemote(stream: MediaStream): void {
    if (!this.remoteVideo) {
      const video = document.createElement('video');
      video.playsInline = true;
      video.muted = true; // both streams playing audio = feedback loop
      video.autoplay = true;
      video.setAttribute('playsinline', '');
      video.style.position = 'fixed';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.left = '-10px';
      video.style.top = '-10px';
      document.body.appendChild(video);
      this.remoteVideo = video;
    }
    this.remoteVideo.srcObject = stream;
    void this.remoteVideo.play().catch(() => {
      /* autoplay policies; the engine reads readyState, not play() */
    });
    this.patch({ partner: 'live' });
    this.callbacks.onStateChange?.(this.state);
  }

  private patch(next: Partial<ConnectionState>): void {
    this.state = { ...this.state, ...next };
    this.callbacks.onStateChange?.(this.state);
  }

  leave(): void {
    this.session?.dispose();
    this.session = null;
    this.signaling.close();
    if (this.remoteVideo) {
      this.remoteVideo.srcObject = null;
      this.remoteVideo.remove();
      this.remoteVideo = null;
    }
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) track.stop();
      this.localStream = null;
    }
    this.state = { ...IDLE_STATE };
    this.callbacks.onStateChange?.(this.state);
  }
}
