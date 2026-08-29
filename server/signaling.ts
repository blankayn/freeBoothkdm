import type { Duplex } from 'node:stream';
import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';

/**
 * Relay-only signaling for the couple booth.
 *
 * It sees room codes and SDP/ICE blobs; it never sees media or photos. Rooms
 * live in memory and evaporate on restart, which is fine — a room only needs
 * to exist for the two minutes it takes two people to wave at each other.
 */

const PORT = Number(process.env.PORT ?? 8787);
const IDLE_EVICT_MS = 30 * 60 * 1000;
const MAX_PEERS = 2;

/** No O/0/I/1 — couples read these aloud across a room. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 5;

interface Peer {
  socket: WebSocket;
  joinedAt: number;
  /** Set once the peer has been paired; used for polite/impolite assignment. */
  polite: boolean;
  lastSeen: number;
}

interface Room {
  peers: Set<Peer>;
  lastActivity: number;
}

const rooms = new Map<string, Room>();

function makeCode(): string {
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  // 32^5 ≈ 33M codes; the birthday odds at traffic this server expects are nil,
  // but colliding with a live room would join a stranger into a date.
  return rooms.has(code) ? makeCode() : code;
}

function touch(room: Room): void {
  room.lastActivity = Date.now();
}

function evictIdle(): void {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (room.peers.size === 0 || now - room.lastActivity > IDLE_EVICT_MS) {
      for (const peer of room.peers) peer.socket.close(1000, 'room closed');
      rooms.delete(code);
    }
  }
}

function send(socket: WebSocket, type: string, payload: Record<string, unknown>): void {
  if (socket.readyState !== socket.OPEN) return;
  socket.send(JSON.stringify({ type, ...payload }));
}

function relayFrom(from: Peer, type: string, payload: Record<string, unknown>): void {
  for (const peer of roomOf(from)?.peers ?? []) {
    if (peer !== from) send(peer.socket, type, payload);
  }
}

function roomOf(peer: Peer): Room | undefined {
  for (const room of rooms.values()) if (room.peers.has(peer)) return room;
  return undefined;
}

const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', (socket) => {
  const peer: Peer = { socket, joinedAt: Date.now(), polite: false, lastSeen: Date.now() };
  let roomCode: string | null = null;

  socket.on('message', (raw) => {
    peer.lastSeen = Date.now();
    let msg: { type: string; room?: string; polite?: boolean; [k: string]: unknown };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      send(socket, 'error', { message: 'unparseable message' });
      return;
    }

    switch (msg.type) {
      case 'join': {
        const requested = typeof msg.room === 'string' ? msg.room.toUpperCase() : '';
        if (roomCode) {
          send(socket, 'error', { message: 'already in a room' });
          return;
        }
        if (!/^[A-Z2-9]{5}$/.test(requested)) {
          send(socket, 'error', { message: 'room codes are 5 characters' });
          return;
        }

        let room = rooms.get(requested);
        if (!room) {
          room = { peers: new Set(), lastActivity: Date.now() };
          rooms.set(requested, room);
        }
        if (room.peers.size >= MAX_PEERS) {
          send(socket, 'room-full', { room: requested });
          return;
        }

        roomCode = requested;
        // First peer in is impolite; the joiner yields on glare. The client
        // learns its role from the count, not from a race-condition flag.
        peer.polite = room.peers.size === 1;
        room.peers.add(peer);
        touch(room);

        send(socket, 'joined', {
          room: roomCode,
          polite: peer.polite,
          peers: room.peers.size,
        });
        if (room.peers.size === MAX_PEERS) {
          for (const p of room.peers) send(p.socket, 'peer-joined', { room: roomCode });
        }
        return;
      }

      case 'ping':
        send(socket, 'pong', { t: msg.t });
        return;

      case 'offer':
      case 'answer':
      case 'ice': {
        if (!roomCode) {
          send(socket, 'error', { message: 'join a room first' });
          return;
        }
        const room = rooms.get(roomCode);
        if (room) touch(room);
        relayFrom(peer, msg.type, {
          sdp: msg.sdp,
          candidate: msg.candidate,
        });
        return;
      }

      default:
        send(socket, 'error', { message: `unknown type ${String(msg.type)}` });
    }
  });

  socket.on('close', () => {
    if (!roomCode) return;
    const room = rooms.get(roomCode);
    if (!room) return;
    room.peers.delete(peer);
    touch(room);
    for (const other of room.peers) send(other.socket, 'peer-left', {});
    if (room.peers.size === 0) rooms.delete(roomCode);
  });
});

// Keep the Set warm and the memory honest.
setInterval(evictIdle, 60_000).unref();

server.listen(PORT, () => {
  process.stdout.write(`signaling on :${PORT}\n`);
});

// ws attaches the socket to the request; silence unused-var lint for streams.
export type { Duplex };
