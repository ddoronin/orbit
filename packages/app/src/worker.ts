/**
 * createWorker — single-call bootstrap for an Orbit application.
 *
 * Given an @OrbitApp class, returns a value that:
 *   - is the Worker `default export` (has `fetch`, optional `queue`)
 *   - additionally carries every Durable Object class as a named property
 *     matching the actor's @Actor name
 *
 * Usage:
 *   const worker = createWorker(App);
 *   export default worker;
 *   export const { Page, Workspace } = worker;
 */

import {
  Container,
  OrbitFactory,
  ENV_TOKEN,
  KV_TOKEN,
  D1_TOKEN,
  R2_TOKEN,
  QUEUE_TOKEN,
  DO_TOKEN,
  buildAppGraph,
  type AppGraph,
  type OrbitHandler,
  type EnvBindings,
  type ChannelRoute,
} from '@orbit/core';
import {
  ActorRegistry,
  ACTOR_REGISTRY_TOKEN,
  composeDurableObject,
  ORBIT_ACTOR_META,
  type DurableObjectLike,
} from '@orbit/actors';
import {
  Router,
  registerControllers,
  cors,
  requestLogger,
  securityHeaders,
  type RequestContext,
} from '@orbit/http';
import { ChannelHandler } from '@orbit/channels';

export type OrbitWorker = OrbitHandler & Record<string, DurableObjectLike>;

export interface CreateWorkerOptions {
  /** Disable the default middleware stack (cors, requestLogger, securityHeaders). */
  bareMiddleware?: boolean;
}

export function createWorker(appClass: any, options: CreateWorkerOptions = {}): OrbitWorker {
  const graph = buildAppGraph(appClass);

  const handler = OrbitFactory.create(appClass, {
    registerEnvBindings: (container, env) => registerBindings(container, env, graph),
    fetchHandler: async (request, container) => {
      const router = getRouter(graph, container, options);
      return router.handle(request, container);
    },
  });

  const doClasses = composeActors(graph);
  return Object.assign(handler, doClasses) as OrbitWorker;
}

function registerBindings(container: Container, env: any, graph: AppGraph): void {
  const bindings: EnvBindings = graph.metadata.bindings ?? {};

  registerNamedBinding(container, env, KV_TOKEN, bindings.KV);
  registerNamedBinding(container, env, D1_TOKEN, bindings.D1);
  registerNamedBinding(container, env, R2_TOKEN, bindings.R2);

  if (bindings.Queue) {
    for (const [logical, envKey] of Object.entries(bindings.Queue)) {
      container.registerFactory(QUEUE_TOKEN(logical), (e: any) => e[envKey], [ENV_TOKEN]);
    }
  }
  if (bindings.DO) {
    for (const [logical, envKey] of Object.entries(bindings.DO)) {
      container.registerFactory(DO_TOKEN(logical), (e: any) => e[envKey], [ENV_TOKEN]);
    }
  }

  container.registerFactory(
    ACTOR_REGISTRY_TOKEN,
    (e: any) => {
      const registry = new ActorRegistry(e);
      registry.autoRegister(graph.metadata.actors);
      return registry;
    },
    [ENV_TOKEN],
  );
}

function registerNamedBinding(
  container: Container,
  env: any,
  token: any,
  binding: string | Record<string, string> | undefined,
): void {
  if (!binding) return;
  if (typeof binding === 'string') {
    container.registerFactory(token, (e: any) => e[binding], [ENV_TOKEN]);
    return;
  }
  for (const [logical, envKey] of Object.entries(binding)) {
    container.registerFactory(`env:${logical}`, (e: any) => e[envKey], [ENV_TOKEN]);
    if (logical === 'default') {
      container.registerFactory(token, (e: any) => e[envKey], [ENV_TOKEN]);
    }
  }
}

// Cache router per app graph (one isolate may serve many requests).
const ROUTER_CACHE = new WeakMap<AppGraph, Router>();

function getRouter(graph: AppGraph, container: Container, options: CreateWorkerOptions): Router {
  const cached = ROUTER_CACHE.get(graph);
  if (cached) return cached;

  const router = new Router();
  if (!options.bareMiddleware) {
    router.use(requestLogger());
    router.use(securityHeaders());
    router.use(cors({ origin: '*', credentials: true }));
  }

  registerControllers(router, graph.metadata.controllers, container);

  for (const channel of graph.metadata.channels) {
    router.ws(channel.url, makeChannelRouteHandler(channel), {
      guards: channel.guards ?? [],
    });
  }

  router.get('/__orbit__/health', (ctx) => ctx.json({ ok: true }));

  ROUTER_CACHE.set(graph, router);
  return router;
}

function makeChannelRouteHandler(channel: ChannelRoute) {
  return async (ctx: RequestContext): Promise<Response> => {
    const registry = (await ctx.container.resolve(ACTOR_REGISTRY_TOKEN)) as ActorRegistry;
    const idParam = channel.idParam ?? 'id';
    const id = ctx.params[idParam];
    if (!id) {
      return new Response(`Missing path parameter "${idParam}"`, { status: 400 });
    }
    const ref = registry.ref(channel.actor, id);
    return ref.connect(ctx.request);
  };
}

function composeActors(graph: AppGraph): Record<string, DurableObjectLike> {
  const channelsByActor = new Map<any, any[]>();
  for (const route of graph.metadata.channels) {
    if (!route.channels) continue;
    const list = channelsByActor.get(route.actor) ?? [];
    list.push(...route.channels);
    channelsByActor.set(route.actor, list);
  }

  const result: Record<string, DurableObjectLike> = {};
  for (const ActorClass of graph.metadata.actors) {
    const meta = (ActorClass as any)[ORBIT_ACTOR_META];
    if (!meta) continue;
    const channels = channelsByActor.get(ActorClass) ?? [];
    if (channels.length > 0) {
      result[meta.name] = composeDurableObject(ActorClass, {
        channels,
        buildHandler: (_actor, _doState) => {
          return new ChannelHandler(channels, null as any);
        },
      });
    } else {
      result[meta.name] = composeDurableObject(ActorClass);
    }
  }
  return result;
}
