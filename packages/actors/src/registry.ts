/**
 * ActorRegistry — resolves actor references by type + ID.
 *
 * Wraps Cloudflare Durable Object namespace stubs to provide
 * typed, ergonomic access to actors.
 */

import { ActorError } from '@orbit/core';
import { ORBIT_ACTOR_META, type MessageEnvelope, type MessageResult } from './types.js';
import { ORBIT_SNAPSHOT_TYPE } from './decorators.js';
import type { OrbitActor } from './actor.js';

export interface ActorRef<T extends OrbitActor<any> = any> {
  /** Send message and await response */
  call<R = any>(type: string, payload?: unknown): Promise<R>;

  /** Send message, don't wait for response data */
  cast(type: string, payload?: unknown): Promise<void>;

  /** Get a WebSocket upgrade response for this actor */
  connect(request: Request): Promise<Response>;

  /** Fetch the actor's current state. */
  snapshot<S = T extends OrbitActor<infer U> ? U : any>(): Promise<S>;

  /** The actor's string ID */
  readonly id: string;

  /** The actor's name */
  readonly name: string;
}

class ActorRefImpl<T extends OrbitActor<any>> implements ActorRef<T> {
  constructor(
    private stub: DurableObjectStub,
    public readonly name: string,
    public readonly id: string,
  ) {}

  async call<R = any>(type: string, payload?: unknown): Promise<R> {
    const envelope: MessageEnvelope = {
      type,
      payload: payload ?? null,
    };

    const response = await this.stub.fetch('https://orbit.internal/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });

    const result: MessageResult = await response.json() as MessageResult;

    if (!result.ok) {
      throw new ActorError(
        result.error ?? 'Actor call failed',
        this.name,
        this.id,
      );
    }

    return result.data as R;
  }

  async cast(type: string, payload?: unknown): Promise<void> {
    await this.call(type, payload);
  }

  async snapshot<S>(): Promise<S> {
    return this.call<S>(ORBIT_SNAPSHOT_TYPE);
  }

  async connect(request: Request): Promise<Response> {
    // Forward the WebSocket upgrade request to the DO
    return this.stub.fetch(request.url, {
      method: 'GET',
      headers: (() => {
        const h = new Headers(request.headers);
        h.set('Upgrade', 'websocket');
        return h;
      })(),
    });
  }
}

export class ActorRegistry {
  private namespaces = new Map<string, DurableObjectNamespace>();

  constructor(private env: any) {}

  /**
   * Register a DO namespace binding for an actor type.
   */
  registerNamespace(actorName: string, namespace: DurableObjectNamespace): void {
    this.namespaces.set(actorName, namespace);
  }

  /**
   * Auto-detect and register all DO namespace bindings from env.
   */
  autoRegister(actorClasses: any[]): void {
    for (const cls of actorClasses) {
      const meta = cls[ORBIT_ACTOR_META];
      if (meta && this.env[meta.name]) {
        this.namespaces.set(meta.name, this.env[meta.name]);
      }
    }
  }

  /**
   * Get a typed reference to an actor instance.
   */
  ref<T extends OrbitActor<any>>(
    actorClass: new (...args: any[]) => T,
    id: string,
  ): ActorRef<T> {
    const meta = (actorClass as any)[ORBIT_ACTOR_META];
    if (!meta) {
      throw new ActorError(`${actorClass.name} is not decorated with @Actor`);
    }

    const namespace = this.namespaces.get(meta.name);
    if (!namespace) {
      throw new ActorError(
        `No namespace registered for actor "${meta.name}". ` +
        `Ensure the DO binding is configured in wrangler.toml.`,
      );
    }

    const doId = namespace.idFromName(id);
    const stub = namespace.get(doId);

    return new ActorRefImpl<T>(stub, meta.name, id);
  }

  /**
   * Get an actor reference by raw name + ID (for dynamic dispatch).
   */
  refByName(actorName: string, id: string): ActorRef {
    const namespace = this.namespaces.get(actorName);
    if (!namespace) {
      throw new ActorError(`No namespace registered for actor "${actorName}"`);
    }

    const doId = namespace.idFromName(id);
    const stub = namespace.get(doId);

    return new ActorRefImpl(stub, actorName, id);
  }
}

export const ACTOR_REGISTRY_TOKEN = Symbol('orbit:actor-registry');
