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

type Listener = (msg: DuelMsg) => void;

class Session {
  role: 'host' | 'guest' | null = null;
  code = '';
  status: SessionStatus = 'idle';
  error = '';
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(s: SessionStatus) => void>();
  /** Host: called whenever a guest (re)connects. */
  onGuestJoined: (() => void) | null = null;

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

  send(msg: DuelMsg) {
    if (this.conn?.open) this.conn.send(msg);
  }

  get connected() {
    return !!this.conn?.open;
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
        peer.on('connection', (conn) => {
          // One guest at a time; a reconnecting guest replaces the old link.
          this.conn?.close();
          this.wire(conn);
        });
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
    this.conn = conn;
    conn.on('open', () => {
      this.setStatus('connected');
      if (this.role === 'host') this.onGuestJoined?.();
    });
    conn.on('data', (data) => {
      for (const f of this.listeners) f(data as DuelMsg);
    });
    const lost = () => {
      if (this.conn !== conn) return;
      this.conn = null;
      if (this.role) this.setStatus('lost');
    };
    conn.on('close', lost);
    conn.on('error', lost);
  }

  /** Leave the duel and free the code. */
  close() {
    this.conn?.close();
    this.conn = null;
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
