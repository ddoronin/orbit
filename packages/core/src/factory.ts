/**
 * Lower-level worker factory. Most users want `createWorker(App)` instead.
 * This is kept as an escape hatch for custom fetch/queue handlers.
 */

import { Container } from './container.js';
import { buildAppGraph, buildContainer, type AppGraph } from './app-graph.js';
import { ENV_TOKEN, EXECUTION_CTX_TOKEN, REQUEST_TOKEN } from './tokens.js';

export interface OrbitHandler {
  fetch(request: Request, env: any, ctx: any): Promise<Response>;
  queue?(batch: any, env: any, ctx: any): Promise<void>;
  scheduled?(controller: any, env: any, ctx: any): Promise<void>;
}

export type FetchHandler = (
  request: Request,
  container: Container,
) => Promise<Response>;

export type QueueHandler = (
  batch: any,
  container: Container,
) => Promise<void>;

export interface OrbitFactoryOptions {
  fetchHandler?: FetchHandler;
  queueHandler?: QueueHandler;
  /**
   * Hook called once per isolate when the container is first built.
   * Use for env-derived token registration before any provider resolves.
   */
  registerEnvBindings?: (container: Container, env: any) => void;
}

export class OrbitFactory {
  static create(appClass: any, options: OrbitFactoryOptions = {}): OrbitHandler {
    const graph = buildAppGraph(appClass);

    return {
      async fetch(request: Request, env: any, ctx: any): Promise<Response> {
        const container = buildIsolateContainer(graph, env, ctx, request, options);
        const scope = container.createScope();
        scope.registerValue(REQUEST_TOKEN, request);

        try {
          if (options.fetchHandler) {
            return await options.fetchHandler(request, scope);
          }
          return new Response('Not Found', { status: 404 });
        } finally {
          scope.dispose();
        }
      },

      async queue(batch: any, env: any, ctx: any): Promise<void> {
        if (!options.queueHandler) return;
        const container = buildIsolateContainer(graph, env, ctx, undefined, options);
        const scope = container.createScope();
        try {
          await options.queueHandler(batch, scope);
        } finally {
          scope.dispose();
        }
      },
    };
  }
}

function buildIsolateContainer(
  graph: AppGraph,
  env: any,
  ctx: any,
  request: Request | undefined,
  options: OrbitFactoryOptions,
): Container {
  const container = buildContainer(graph);
  container.registerValue(ENV_TOKEN, env);
  container.registerValue(EXECUTION_CTX_TOKEN, ctx);
  if (request) container.registerValue(REQUEST_TOKEN, request);
  options.registerEnvBindings?.(container, env);
  return container;
}
