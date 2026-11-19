import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import type { DuelMsg } from './duel';

/**
 * A phone-to-phone connection for duels. The host registers a short numeric code with the PeerJS
 * matchmaking service; the guest connects to that code. After the handshake, messages go directly
 * between the two devices (WebRTC), relayed through TURN servers only if a direct path isn't
 * possible (see ICE_SERVERS).
 */

const PREFIX = 'ccr-duel-';
/** Codes are 5 digits: easy to read out and type on a keypad. */
export const CODE_LENGTH = 5;

/**
 * Ways for two devices to find a path to each other. STUN servers let most home Wi-Fi and phone
 * networks link directly; when they can't (strict office or school Wi-Fi, some phone carriers), the
 * TURN relays pass the messages along. PeerJS's own relays are tried over UDP and over TCP, since
 * many networks block UDP outright.
 */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  {
    urls: [
      'turn:eu-0.turn.peerjs.com:3478',
      'turn:us-0.turn.peerjs.com:3478',
      'turn:eu-0.turn.peerjs.com:3478?transport=tcp',
      'turn:us-0.turn.peerjs.com:3478?transport=tcp',
    ],
    username: 'peerjs',
    credential: 'peerjsp',
  },
];

/** Test hook: point at a local PeerJS server instead of the public one. */
function peerOptions(): PeerOptions {
  try {
    const raw = localStorage.getItem('ccr-peer-server');
    if (raw) return { ...(JSON.parse(raw) as PeerOptions), debug: 0 };
  } catch {
    /* default */
  }
  return { debug: 0, config: { iceServers: ICE_SERVERS } };
}

/** How long a guest waits for the link before giving up (relayed links can take a while). */
const JOIN_TIMEOUT = 25000;

const LINK_FAILED =
  'Found the duel, but the two devices couldn\u2019t link up. Their networks may be blocking it: try both on the same Wi-Fi, or turn off any VPN, then join again.';

export type SessionStatus = 'idle' | 'hosting' | 'connecting' | 'connected' | 'lost' | 'error';

/** A message and the peer it came from (the host's peer id, for a guest). */
type Listener = (msg: DuelMsg, from: string) => void;

/** Most guests one host takes (8 players in all, for a battle royale). */
export const MAX_GUESTS = 7;

/** This device's player id for the session: lets the host recognize a guest that reconnects. */
export const myPid = Math.random().toString(36).slice(2, 10);

class Session {
  role: 'host' | 'guest' | null = null;
  code = '';
  status: SessionStatus = 'idle';
  error = '';
  private peer: Peer | null = null;
  /** Guest: the link to the host. */
  private conn: DataConnection | null = null;
  /** Host: a link to each guest, by peer id. */
  private conns = new Map<string, DataConnection>();
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(s: SessionStatus) => void>();
  /** Host: called whenever a guest (re)connects. */
  onGuestJoined: ((peer: string) => void) | null = null;
  /** Host: one guest's link closed (others may still be connected). */
  onGuestLost: ((peer: string) => void) | null = null;

  private setStatus(s: SessionStatus, error = '') {
    this.status = s;
    this.error = error;
    for (const f of this.statusListeners) f(s);
  }

  onStatus(f: (s: SessionStatus) => void): () => void {
    this.statusListeners.add(f);
    return () => this.statusListeners.delete(f);
  }

  onMessage(f: Listener): () => void {
    this.listeners.add(f);
    return () => this.listeners.delete(f);
  }

  /** Guest: to the host. Host: to every guest. */
  send(msg: DuelMsg) {
    if (this.role === 'host') for (const c of this.conns.values()) c.open && c.send(msg);
    else if (this.conn?.open) this.conn.send(msg);
  }

  /** Host: to one guest. */
  sendTo(peer: string, msg: DuelMsg) {
    const c = this.conns.get(peer);
    if (c?.open) c.send(msg);
  }

  /** Host: drop one guest's link. */
  drop(peer: string) {
    const c = this.conns.get(peer);
    this.conns.delete(peer);
    c?.close();
  }

  /** Host: guests linked right now. */
  guests(): string[] {
    return [...this.conns.entries()].filter(([, c]) => c.open).map(([p]) => p);
  }

  get connected() {
    return this.role === 'host' ? this.guests().length > 0 : !!this.conn?.open;
  }

  /** Start hosting: registers a fresh code and waits for a guest. */
  host(): Promise<string> {
    this.close();
    this.role = 'host';
    return new Promise((resolve) => {
      const attempt = (tries: number) => {
        const code = String(Math.floor(Math.random() * 10 ** CODE_LENGTH)).padStart(CODE_LENGTH, '0');
        const peer = new Peer(PREFIX + code, peerOptions());
        this.peer = peer;
        peer.on('open', () => {
          this.code = code;
          this.setStatus('hosting');
          resolve(code);
        });
        // Every guest gets its own link (the runtime turns away extras and replaces reconnects).
        peer.on('connection', (conn) => this.wire(conn));
        peer.on('error', (err: Error & { type?: string }) => {
          if (err.type === 'unavailable-id' && tries < 5) {
            peer.destroy();
            attempt(tries + 1);
          } else if (err.type !== 'peer-unavailable') this.setStatus('error', friendly(err));
        });
        peer.on('disconnected', () => {
          // Lost the matchmaker (not the guest): try to stay registered under the same code.
          if (!peer.destroyed) peer.reconnect();
        });
      };
      attempt(0);
    });
  }

  /** Join a host's code. Resolves true once connected. */
  join(code: string): Promise<boolean> {
    this.close();
    this.role = 'guest';
    this.code = code;
    this.setStatus('connecting');
    return this.connectGuest();
  }

  /** Guest: (re)connect to the current code. */
  connectGuest(): Promise<boolean> {
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok: boolean, err = '') => {
        if (done) return;
        done = true;
        if (!ok) this.setStatus('error', err);
        resolve(ok);
      };
      const start = () => {
        const conn = this.peer!.connect(PREFIX + this.code, { reliable: true });
        conn.on('open', () => finish(true));
        this.wire(conn);
        // The code answered but no network path could be found: say so, instead of waiting it out.
        watchLink(conn, () => finish(false, LINK_FAILED));
        setTimeout(() => finish(false, linkStarted(conn) ? LINK_FAILED : 'No answer from that code. Check it and try again.'), JOIN_TIMEOUT);
      };
      if (this.peer && !this.peer.destroyed && this.peer.open) return start();
      this.peer?.destroy();
      const peer = new Peer(peerOptions());
      this.peer = peer;
      peer.on('open', start);
      peer.on('error', (err: Error & { type?: string }) =>
        finish(false, err.type === 'peer-unavailable' ? 'No duel found with that code.' : friendly(err)),
      );
    });
  }

  private wire(conn: DataConnection) {
    const host = this.role === 'host';
    if (host) this.conns.set(conn.peer, conn);
    else this.conn = conn;
    conn.on('open', () => {
      this.setStatus('connected');
      if (host) this.onGuestJoined?.(conn.peer);
    });
    conn.on('data', (data) => {
      for (const f of this.listeners) f(data as DuelMsg, conn.peer);
    });
    const lost = () => {
      if (host) {
        if (this.conns.get(conn.peer) !== conn) return;
        this.conns.delete(conn.peer);
        this.onGuestLost?.(conn.peer);
        // The host only counts as cut off once no guest is left.
        if (this.role && !this.guests().length) this.setStatus('lost');
        return;
      }
      if (this.conn !== conn) return;
      this.conn = null;
      if (this.role) this.setStatus('lost');
    };
    conn.on('close', lost);
    conn.on('error', lost);
  }

  /** Leave, with a reason to show (e.g. the host turned us away). */
  fail(why: string) {
    this.close();
    this.setStatus('error', why);
  }

  /** Leave the duel and free the code. */
  close() {
    this.conn?.close();
    this.conn = null;
    const all = [...this.conns.values()];
    this.conns.clear();
    for (const c of all) c.close();
    this.peer?.destroy();
    this.peer = null;
    this.role = null;
    this.code = '';
    this.setStatus('idle');
  }
}

/** Calls `onFail` if the connection's network path fails (WebRTC ICE "failed"). */
function watchLink(conn: DataConnection, onFail: () => void) {
  const check = () => {
    const pc = conn.peerConnection;
    if (!pc) return void setTimeout(check, 250);
    const on = () => {
      if (pc.iceConnectionState === 'failed') onFail();
    };
    pc.addEventListener('iceconnectionstatechange', on);
    on();
  };
  check();
}

/** The host answered (the devices started looking for a path), as opposed to silence. */
function linkStarted(conn: DataConnection): boolean {
  const st = conn.peerConnection?.iceConnectionState;
  return !!st && st !== 'new';
}

function friendly(err: Error & { type?: string }): string {
  switch (err.type) {
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return "Couldn't reach the duel service. Check your internet connection.";
    case 'browser-incompatible':
      return "This browser can't do live duels.";
    case 'webrtc':
    case 'negotiation-failed':
      return LINK_FAILED;
    default:
      return err.message || 'Connection problem.';
  }
}

/** The one duel connection the app has at a time. */
export const session = new Session();
