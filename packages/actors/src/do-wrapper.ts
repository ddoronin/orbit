/**
 * DurableObject wrapper generator.
 *
 * Creates a standard Cloudflare Durable Object class from an OrbitActor class.
 * This is used at runtime (not codegen) for simpler setups.
 */

import { ORBIT_ACTOR_META } from './types.js';
import type { OrbitActor } from './actor.js';

export interface DurableObjectClass {
  new (state: DurableObjectState, env: any): DurableObject;
}

/**
 * Wraps an OrbitActor class into a Cloudflare Durable Object class.
 *
 * Usage:
 *   export const ChatRoom = wrapActor(ChatRoomActor);
 */
export function wrapActor<S>(
  ActorClass: new () => OrbitActor<S>,
): DurableObjectClass {
  const meta = (ActorClass as any)[ORBIT_ACTOR_META];
  if (!meta) {
    throw new Error(`${ActorClass.name} is not decorated with @Actor`);
  }

  return class OrbitDurableObject implements DurableObject {
    private actor: OrbitActor<S>;

    constructor(private doState: DurableObjectState, private env: any) {
      this.actor = new ActorClass();
      this.actor.__ctx__ = {
        actorId: doState.id.toString(),
        actorName: meta.name,
        storage: doState.storage,
        state: doState,
        env,
      };

      doState.blockConcurrencyWhile(async () => {
        const saved = await doState.storage.get('__orbit_state__');
        if (saved !== undefined) {
          this.actor.__hydrate__(saved);
        } else {
          this.actor.__initState__();
        }
        await this.actor.onActivate();
      });
    }

    async fetch(request: Request): Promise<Response> {
      // WebSocket upgrade
      if (request.headers.get('Upgrade') === 'websocket') {
        return this.actor.__handleWebSocketUpgrade__(request, this.doState);
      }

      // Message dispatch
      try {
        const envelope = await request.json();
        return this.actor.__dispatch__(envelope as any, this.doState);
      } catch (err: any) {
        return Response.json(
          { ok: false, error: err.message ?? 'Internal error' },
          { status: 500 },
        );
      }
    }

    async alarm(): Promise<void> {
      await this.actor.__onAlarm__();
    }

    async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
      await this.actor.__webSocketMessage__(ws, message);
    }

    async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
      await this.actor.__webSocketClose__(ws, code, reason, wasClean);
    }

    async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
      await this.actor.__webSocketError__(ws, error);
    }
  } as unknown as DurableObjectClass;
}
