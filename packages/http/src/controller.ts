/**
 * Controller decorators for declarative HTTP route definition.
 */

import { Injectable, ORBIT_INJECTABLE_META } from '@orbit/core';
import type { GuardFn, PipeFn, MiddlewareFn, HttpMethod } from './router.js';

export const ORBIT_CONTROLLER_META = '__orbit_controller__';
export const ORBIT_ROUTES_META = '__orbit_routes__';
export const ORBIT_PARAM_META = '__orbit_params__';

export interface ControllerMetadata {
  prefix: string;
  middleware: MiddlewareFn[];
  guards: GuardFn[];
}

export interface ResourceOptions {
  guards?: GuardFn[];
  middleware?: MiddlewareFn[];
}

export interface RouteMetadata {
  method: HttpMethod;
  path: string;
  handlerName: string;
  guards: GuardFn[];
  pipes: PipeFn[];
  middleware: MiddlewareFn[];
}

export type ParamType = 'param' | 'query' | 'body' | 'header' | 'ctx' | 'request' | 'auth';

export interface ParamMetadata {
  type: ParamType;
  name?: string;
  index: number;
}

// --- Controller decorator ---

export function Controller(prefix = ''): ClassDecorator {
  return (target: any) => {
    target[ORBIT_CONTROLLER_META] = {
      prefix: prefix.startsWith('/') ? prefix : `/${prefix}`,
      middleware: [],
      guards: [],
    };
    if (!target[ORBIT_ROUTES_META]) {
      target[ORBIT_ROUTES_META] = [];
    }
    return target;
  };
}

/**
 * Sugar combining @Controller, @Injectable, and optional class-level
 * guards/middleware. Use when you want one decorator per resource.
 */
export function Resource(prefix: string, options: ResourceOptions = {}): ClassDecorator {
  return (target: any) => {
    Controller(prefix)(target);
    if (!target[ORBIT_INJECTABLE_META]) {
      Injectable()(target);
    }
    const meta = target[ORBIT_CONTROLLER_META] as ControllerMetadata;
    if (options.guards) meta.guards.push(...options.guards);
    if (options.middleware) meta.middleware.push(...options.middleware);
    return target;
  };
}

// --- Route decorators ---

function createRouteDecorator(method: HttpMethod) {
  return (path = ''): MethodDecorator => {
    return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
      const ctor = target.constructor;
      if (!ctor[ORBIT_ROUTES_META]) {
        ctor[ORBIT_ROUTES_META] = [];
      }
      const route: RouteMetadata = {
        method,
        path: path.startsWith('/') ? path : `/${path}`,
        handlerName: String(propertyKey),
        guards: [],
        pipes: [],
        middleware: [],
      };
      ctor[ORBIT_ROUTES_META].push(route);
    };
  };
}

export const Get = createRouteDecorator('GET');
export const Post = createRouteDecorator('POST');
export const Put = createRouteDecorator('PUT');
export const Delete = createRouteDecorator('DELETE');
export const Patch = createRouteDecorator('PATCH');

// --- Guard / Pipe / Middleware decorators ---

export function UseGuard(...guards: GuardFn[]): MethodDecorator {
  return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
    const ctor = target.constructor;
    const routes: RouteMetadata[] = ctor[ORBIT_ROUTES_META] ?? [];
    const route = routes.find(r => r.handlerName === String(propertyKey));
    if (route) {
      route.guards.push(...guards);
    }
  };
}

export function UsePipe(...pipes: PipeFn[]): MethodDecorator {
  return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
    const ctor = target.constructor;
    const routes: RouteMetadata[] = ctor[ORBIT_ROUTES_META] ?? [];
    const route = routes.find(r => r.handlerName === String(propertyKey));
    if (route) {
      route.pipes.push(...pipes);
    }
  };
}

export function UseMiddleware(...middleware: MiddlewareFn[]): MethodDecorator {
  return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
    const ctor = target.constructor;
    const routes: RouteMetadata[] = ctor[ORBIT_ROUTES_META] ?? [];
    const route = routes.find(r => r.handlerName === String(propertyKey));
    if (route) {
      route.middleware.push(...middleware);
    }
  };
}

// --- Parameter decorators ---

export function Param(name: string): ParameterDecorator {
  return createParamDecorator('param', name);
}

export function Query(name?: string): ParameterDecorator {
  return createParamDecorator('query', name);
}

export function Body(): ParameterDecorator {
  return createParamDecorator('body');
}

export function Header(name: string): ParameterDecorator {
  return createParamDecorator('header', name);
}

export function Ctx(): ParameterDecorator {
  return createParamDecorator('ctx');
}

export function Req(): ParameterDecorator {
  return createParamDecorator('request');
}

export function Auth(): ParameterDecorator {
  return createParamDecorator('auth');
}

function createParamDecorator(type: ParamType, name?: string): ParameterDecorator {
  return (target: any, propertyKey: string | symbol | undefined, parameterIndex: number) => {
    const ctor = typeof target === 'function' ? target : target.constructor;
    const key = `${ORBIT_PARAM_META}:${String(propertyKey)}`;
    if (!ctor[key]) {
      ctor[key] = [];
    }
    ctor[key].push({ type, name, index: parameterIndex });
  };
}

// --- Metadata readers ---

export function getControllerMeta(target: any): ControllerMetadata | undefined {
  return target[ORBIT_CONTROLLER_META];
}

export function getRoutesMeta(target: any): RouteMetadata[] {
  return target[ORBIT_ROUTES_META] ?? [];
}

export function getParamsMeta(target: any, methodName: string): ParamMetadata[] {
  return target[`${ORBIT_PARAM_META}:${methodName}`] ?? [];
}
