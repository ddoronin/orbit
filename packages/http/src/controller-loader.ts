/**
 * Controller loader — registers controller routes on a Router instance.
 */

import { Container } from '@orbitstack/core';
import { Router, type RequestContext } from './router.js';
import {
  getControllerMeta,
  getRoutesMeta,
  getParamsMeta,
  type ParamMetadata,
} from './controller.js';

/**
 * Registers all routes from a controller class onto a router.
 * The controller is resolved from the DI container per-request.
 */
export function registerController(
  router: Router,
  controllerClass: any,
  container: Container,
): void {
  const meta = getControllerMeta(controllerClass);
  if (!meta) {
    throw new Error(`${controllerClass.name} is not decorated with @Controller`);
  }

  const routes = getRoutesMeta(controllerClass);
  const prefix = meta.prefix === '/' ? '' : meta.prefix;

  for (const route of routes) {
    const fullPath = prefix + (route.path === '/' ? '' : route.path);
    const paramsMeta = getParamsMeta(controllerClass, route.handlerName);

    const handler = async (ctx: RequestContext): Promise<Response> => {
      // Resolve controller from container
      const controller = await container.resolve(controllerClass) as Record<string, any>;

      // Resolve parameters
      const args = await resolveParams(paramsMeta, ctx);

      // Call handler
      const result = await controller[route.handlerName](...args);

      // If result is already a Response, return it
      if (result instanceof Response) {
        return result;
      }

      // Auto-serialize non-Response returns as JSON
      if (result !== undefined && result !== null) {
        return Response.json(result);
      }

      return new Response(null, { status: 204 });
    };

    router.add(route.method, fullPath || '/', handler, {
      guards: [...meta.guards, ...route.guards],
      pipes: route.pipes,
      middleware: [...meta.middleware, ...route.middleware],
    });
  }
}

async function resolveParams(
  paramsMeta: ParamMetadata[],
  ctx: RequestContext,
): Promise<unknown[]> {
  if (paramsMeta.length === 0) {
    // Default: pass ctx as first argument
    return [ctx];
  }

  const maxIndex = Math.max(...paramsMeta.map(p => p.index));
  const args: unknown[] = new Array(maxIndex + 1).fill(undefined);

  for (const param of paramsMeta) {
    switch (param.type) {
      case 'param':
        args[param.index] = param.name ? ctx.params[param.name] : ctx.params;
        break;
      case 'query':
        if (param.name) {
          args[param.index] = ctx.query.get(param.name);
        } else {
          const obj: Record<string, string> = {};
          ctx.query.forEach((v, k) => { obj[k] = v; });
          args[param.index] = obj;
        }
        break;
      case 'body':
        args[param.index] = await ctx.body();
        break;
      case 'header':
        args[param.index] = param.name ? ctx.header(param.name) : null;
        break;
      case 'ctx':
        args[param.index] = ctx;
        break;
      case 'request':
        args[param.index] = ctx.request;
        break;
      case 'auth':
        args[param.index] = (ctx as any).auth;
        break;
    }
  }

  return args;
}

/**
 * Registers multiple controllers on a router.
 */
export function registerControllers(
  router: Router,
  controllers: any[],
  container: Container,
): void {
  for (const ctrl of controllers) {
    registerController(router, ctrl, container);
  }
}
