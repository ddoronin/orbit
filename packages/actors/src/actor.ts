/**
 * OrbitActor — Base class for all actors (Durable Objects).
 *
 * Provides:
 * - Typed state management with auto-persist
 * - Message dispatch via @Handle decorators
 * - WebSocket management with Hibernation API
 * - Alarm scheduling
 * - Broadcasting to connected sockets
 */

import {
  ORBIT_ACTOR_META,
  ORBIT_HANDLERS_META,
  ORBIT_ALARM_META,
  type ActorContext,
  type ActorMetadata,
  type HandlerMeta,
  type MessageEnvelope,
  type MessageResult,
} from "./types.js";

export abstract class OrbitActor<S = any> {
  protected state!: S;

  /** @internal */
  __ctx__!: ActorContext;
  /** @internal */
  __dirty__ = false;
  /** @internal */
  private __handlerMap__: Map<string, HandlerMeta> | null = null;
  /** @internal */
  private __sockets__: Set<WebSocket> = new Set();
  /** @internal */
  private __socketData__: WeakMap<WebSocket, Record<string, unknown>> =
    new WeakMap();

  abstract initialState(): S;

  // --- Lifecycle hooks ---

  async onActivate(): Promise<void> {}
  async onDeactivate(): Promise<void> {}

  // --- State management ---

  protected updateState(fn: (state: S) => void): void {
    const next = structuredClone(this.state);
    fn(next);
    this.state = next;
    this.__dirty__ = true;
  }

  protected setState(newState: S): void {
    this.state = newState;
    this.__dirty__ = true;
  }

  get snapshot(): Readonly<S> {
    return this.state;
  }

  // --- Alarm ---

  protected async setAlarm(scheduledTime: number | Date): Promise<void> {
    const time =
      typeof scheduledTime === "number"
        ? new Date(scheduledTime)
        : scheduledTime;
    await this.__ctx__.storage.setAlarm(time);
  }

  protected async deleteAlarm(): Promise<void> {
    await this.__ctx__.storage.deleteAlarm();
  }

  // --- WebSocket / Broadcasting ---

  protected broadcast(event: string, payload: unknown): void {
    const message = JSON.stringify({
      event,
      topic: this.__getActorMeta__().name,
      payload,
      ref: null,
    });
    for (const ws of this.__sockets__) {
      try {
        ws.send(message);
      } catch {
        this.__sockets__.delete(ws);
      }
    }
  }

  protected broadcastExcept(
    excludeWs: WebSocket,
    event: string,
    payload: unknown,
  ): void {
    const message = JSON.stringify({
      event,
      topic: this.__getActorMeta__().name,
      payload,
      ref: null,
    });
    for (const ws of this.__sockets__) {
      if (ws === excludeWs) continue;
      try {
        ws.send(message);
      } catch {
        this.__sockets__.delete(ws);
      }
    }
  }

  protected getConnections(): Set<WebSocket> {
    return this.__sockets__;
  }

  protected getSocketData(ws: WebSocket): Record<string, unknown> {
    return this.__socketData__.get(ws) ?? {};
  }

  protected setSocketData(ws: WebSocket, data: Record<string, unknown>): void {
    this.__socketData__.set(ws, { ...this.getSocketData(ws), ...data });
  }

  // --- Persistence ---

  protected async persist(): Promise<void> {
    await this.__ctx__.storage.put("__orbit_state__", this.state);
    this.__dirty__ = false;
  }

  /** @internal Built-in snapshot handler. Returns the current state. */
  async __orbitSnapshot__(): Promise<S> {
    return this.state;
  }

  // --- Storage access (escape hatch) ---

  protected get storage(): DurableObjectStorage {
    return this.__ctx__.storage;
  }

  // --- Internal methods ---

  /** @internal */
  __initState__(): void {
    this.state = this.initialState();
  }

  /** @internal */
  __hydrate__(saved: unknown): void {
    this.state = saved as S;
  }

  /** @internal */
  __getActorMeta__(): ActorMetadata {
    return (this.constructor as any)[ORBIT_ACTOR_META];
  }

  /** @internal */
  __getHandlerMap__(): Map<string, HandlerMeta> {
    if (this.__handlerMap__) return this.__handlerMap__;
    const handlers: HandlerMeta[] =
      (this.constructor as any)[ORBIT_HANDLERS_META] ?? [];
    this.__handlerMap__ = new Map(handlers.map((h) => [h.type, h]));
    return this.__handlerMap__;
  }

  /** @internal */
  async __dispatch__(
    envelope: MessageEnvelope,
    doState: DurableObjectState,
  ): Promise<Response> {
    const handler = this.__getHandlerMap__().get(envelope.type);
    if (!handler) {
      const knownMessageTypes = [...this.__getHandlerMap__().keys()].sort();
      return Response.json(
        {
          ok: false,
          error: `Unknown message type: ${envelope.type}`,
          details: {
            actorName: this.__ctx__?.actorName ?? this.__getActorMeta__().name,
            actorId: this.__ctx__?.actorId,
            receivedType: envelope.type,
            knownMessageTypes,
          },
        },
        { status: 400 },
      );
    }

    // Validate with schema if provided
    if (handler.schema) {
      const result = handler.schema.safeParse(envelope.payload);
      if (!result.success) {
        return Response.json(
          {
            ok: false,
            error: "Validation failed",
            details: result.error.issues,
          },
          { status: 400 },
        );
      }
    }

    const prevState = structuredClone(this.state);
    try {
      const method = (this as any)[handler.method];
      const result = await method.call(this, envelope.payload, this.__ctx__);

      // Auto-persist if dirty and autoPersist is enabled
      const meta = this.__getActorMeta__();
      if (this.__dirty__ && meta.options.autoPersist) {
        await this.persist();
      }

      return Response.json({ ok: true, data: result ?? null });
    } catch (err: any) {
      // Rollback state on error
      this.state = prevState;
      this.__dirty__ = false;
      return Response.json(
        { ok: false, error: err.message ?? "Handler error" },
        { status: 500 },
      );
    }
  }

  /** @internal */
  async __onAlarm__(): Promise<void> {
    const alarmMethod: string | undefined = (this.constructor as any)[
      ORBIT_ALARM_META
    ];
    if (alarmMethod && typeof (this as any)[alarmMethod] === "function") {
      await (this as any)[alarmMethod].call(this);
      if (this.__dirty__ && this.__getActorMeta__().options.autoPersist) {
        await this.persist();
      }
    }
  }

  /** @internal */
  __handleWebSocketUpgrade__(
    request: Request,
    doState: DurableObjectState,
  ): Response {
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    doState.acceptWebSocket(server);
    this.__sockets__.add(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /** @internal */
  async __webSocketMessage__(
    ws: WebSocket,
    message: string | ArrayBuffer,
  ): Promise<void> {
    // Default: parse as JSON envelope and dispatch
    if (typeof message !== "string") return;

    try {
      const parsed = JSON.parse(message);
      // Channel-level handling is done by the channel layer
      // Default actor just dispatches as a message
      if (parsed.type || parsed.event) {
        const type = parsed.type ?? parsed.event;
        const handler = this.__getHandlerMap__().get(type);
        if (handler) {
          await (this as any)[handler.method].call(
            this,
            parsed.payload,
            this.__ctx__,
          );
          if (this.__dirty__ && this.__getActorMeta__().options.autoPersist) {
            await this.persist();
          }
        }
      }
    } catch {
      // Ignore malformed messages
    }
  }

  /** @internal */
  async __webSocketClose__(
    ws: WebSocket,
    code: number,
    reason: string,
    wasClean: boolean,
  ): Promise<void> {
    this.__sockets__.delete(ws);
  }

  /** @internal */
  async __webSocketError__(ws: WebSocket, error: unknown): Promise<void> {
    this.__sockets__.delete(ws);
  }
}
