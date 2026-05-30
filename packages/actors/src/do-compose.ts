/**
 * Compose an actor with optional WebSocket channels into a single DO class.
 *
 * - HTTP fetch (non-WS) → actor message dispatch
 * - WS upgrade + frames → channel handler (when channels provided)
 * - WS upgrade with no channels → actor's built-in WS handling
 */

import { ORBIT_ACTOR_META } from './types.js';
import { OrbitActor } from './actor.js';

export interface DurableObjectLike {
  new (state: DurableObjectState, env: any): DurableObject;
}

export interface ChannelHandlerLike {
  handleUpgrade(request: Request, doState: DurableObjectState): Response;
  handleMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
  handleClose(ws: WebSocket): Promise<void>;
  handleError(ws: WebSocket): Promise<void>;
}

export interface ChannelComposeOptions {
  /** Channel classes to mount in this DO */
  channels: any[];
  /** Factory that builds a ChannelHandler given the actor instance */
  buildHandler: (actor: OrbitActor<any>, doState: DurableObjectState) => ChannelHandlerLike;
}

/**
 * Wrap an OrbitActor class into a Cloudflare DurableObject class.
 * Optionally compose with channels for WebSocket routing.
 */
export function composeDurableObject<S>(
  ActorClass: new () => OrbitActor<S>,
  options?: ChannelComposeOptions,
): DurableObjectLike {
  const meta = (ActorClass as any)[ORBIT_ACTOR_META];
  if (!meta) {
    throw new Error(`${ActorClass.name} is not decorated with @Actor`);
  }

  return class OrbitDurableObject implements DurableObject {
    private actor: OrbitActor<S>;
    private channels: ChannelHandlerLike | null = null;

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

      if (options) {
        this.channels = options.buildHandler(this.actor, doState);
      }
    }

    async fetch(request: Request): Promise<Response> {
      if (request.headers.get('Upgrade') === 'websocket') {
        if (this.channels) {
          return this.channels.handleUpgrade(request, this.doState);
        }
        return this.actor.__handleWebSocketUpgrade__(request, this.doState);
      }

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
      if (this.channels) return this.channels.handleMessage(ws, message);
      await this.actor.__webSocketMessage__(ws, message);
    }

    async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
      if (this.channels) return this.channels.handleClose(ws);
      await this.actor.__webSocketClose__(ws, code, reason, wasClean);
    }

    async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
      if (this.channels) return this.channels.handleError(ws);
      await this.actor.__webSocketError__(ws, error);
    }
  } as unknown as DurableObjectLike;
}
