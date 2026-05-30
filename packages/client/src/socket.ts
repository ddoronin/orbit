/**
 * OrbitSocket — Browser/Node WebSocket client for Orbit Channels.
 * Implements the Phoenix-compatible wire protocol.
 */

export interface OrbitSocketOptions {
  params?: Record<string, string>;
  heartbeatIntervalMs?: number;
  reconnect?: boolean;
  reconnectMaxAttempts?: number;
  reconnectIntervalMs?: number;
}

export type ConnectionState = 'connecting' | 'open' | 'closing' | 'closed';

export class OrbitSocket {
  private ws: WebSocket | null = null;
  private channels = new Map<string, OrbitChannel>();
  private refCounter = 0;
  private pendingReplies = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private listeners = new Map<string, Set<(data: any) => void>>();
  private _state: ConnectionState = 'closed';

  constructor(
    private url: string,
    private options: OrbitSocketOptions = {},
  ) {}

  get state(): ConnectionState {
    return this._state;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._state = 'connecting';
      const urlObj = new URL(this.url);

      if (this.options.params) {
        for (const [key, value] of Object.entries(this.options.params)) {
          urlObj.searchParams.set(key, value);
        }
      }

      this.ws = new WebSocket(urlObj.toString());

      this.ws.onopen = () => {
        this._state = 'open';
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.emit('open', null);
        resolve();
      };

      this.ws.onclose = (event) => {
        this._state = 'closed';
        this.stopHeartbeat();
        this.emit('close', { code: event.code, reason: event.reason });
        this.maybeReconnect();
      };

      this.ws.onerror = (event) => {
        this.emit('error', event);
        if (this._state === 'connecting') {
          reject(new Error('WebSocket connection failed'));
        }
      };

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data);
      };
    });
  }

  disconnect(): void {
    this._state = 'closing';
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.ws?.close();
    this.ws = null;
    this._state = 'closed';
  }

  channel(topic: string, params?: Record<string, unknown>): OrbitChannel {
    const existing = this.channels.get(topic);
    if (existing) return existing;

    const ch = new OrbitChannel(this, topic, params ?? {});
    this.channels.set(topic, ch);
    return ch;
  }

  /** @internal */
  send(msg: { event: string; topic: string; payload: unknown; ref: string }): void {
    if (this.ws && this._state === 'open') {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /** @internal */
  nextRef(): string {
    return String(++this.refCounter);
  }

  /** @internal */
  waitForReply(ref: string, timeoutMs = 10000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingReplies.delete(ref);
        reject(new Error('Reply timeout'));
      }, timeoutMs);

      this.pendingReplies.set(ref, {
        resolve: (v: any) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e: any) => {
          clearTimeout(timer);
          reject(e);
        },
      });
    });
  }

  on(event: string, callback: (data: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
    return () => this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      for (const cb of callbacks) cb(data);
    }
  }

  private handleMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Handle reply
    if (msg.event === 'phx_reply' && msg.ref) {
      const pending = this.pendingReplies.get(msg.ref);
      if (pending) {
        this.pendingReplies.delete(msg.ref);
        if (msg.payload?.status === 'ok') {
          pending.resolve(msg.payload.response);
        } else {
          pending.reject(new Error(msg.payload?.response?.reason ?? 'error'));
        }
      }
      return;
    }

    // Route to channel
    const channel = this.channels.get(msg.topic);
    if (channel) {
      channel.__handleMessage__(msg.event, msg.payload);
    }
  }

  private startHeartbeat(): void {
    const interval = this.options.heartbeatIntervalMs ?? 30000;
    this.heartbeatTimer = setInterval(() => {
      this.send({
        event: 'heartbeat',
        topic: 'phoenix',
        payload: {},
        ref: this.nextRef(),
      });
    }, interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private maybeReconnect(): void {
    if (!this.options.reconnect) return;
    const maxAttempts = this.options.reconnectMaxAttempts ?? 10;
    if (this.reconnectAttempts >= maxAttempts) return;

    const interval = this.options.reconnectIntervalMs ?? 1000;
    const backoff = Math.min(interval * Math.pow(2, this.reconnectAttempts), 30000);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch(() => {});
    }, backoff);
  }

  /** @internal */
  __removeChannel__(topic: string): void {
    this.channels.delete(topic);
  }
}

/**
 * OrbitChannel — client-side channel handle.
 */
export class OrbitChannel {
  private eventHandlers = new Map<string, Set<(payload: any) => void>>();
  private joined = false;

  constructor(
    private socket: OrbitSocket,
    readonly topic: string,
    private params: Record<string, unknown>,
  ) {}

  async join(): Promise<any> {
    const ref = this.socket.nextRef();
    this.socket.send({
      event: 'phx_join',
      topic: this.topic,
      payload: this.params,
      ref,
    });
    const result = await this.socket.waitForReply(ref);
    this.joined = true;
    return result;
  }

  async leave(): Promise<void> {
    const ref = this.socket.nextRef();
    this.socket.send({
      event: 'phx_leave',
      topic: this.topic,
      payload: {},
      ref,
    });
    await this.socket.waitForReply(ref);
    this.joined = false;
    this.socket.__removeChannel__(this.topic);
  }

  push(event: string, payload: unknown = {}): Promise<any> {
    const ref = this.socket.nextRef();
    this.socket.send({ event, topic: this.topic, payload, ref });
    return this.socket.waitForReply(ref);
  }

  pushNoReply(event: string, payload: unknown = {}): void {
    const ref = this.socket.nextRef();
    this.socket.send({ event, topic: this.topic, payload, ref });
  }

  on(event: string, callback: (payload: any) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(callback);
    return () => this.eventHandlers.get(event)?.delete(callback);
  }

  /** @internal */
  __handleMessage__(event: string, payload: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) handler(payload);
    }
  }
}
