/**
 * Decorators for the Orbit app system.
 *
 * No module concept. An app is a flat declaration of actors, controllers,
 * channels, providers, and env bindings.
 *
 * All metadata is stored as static properties so the framework runs
 * without `Reflect.metadata` (unsupported in workerd).
 */

import type { Token } from './tokens.js';
import type { Scope } from './container.js';

export const ORBIT_APP_META = '__orbit_app__';
export const ORBIT_INJECTABLE_META = '__orbit_injectable__';
export const ORBIT_INJECT_TOKENS = '__orbit_inject_tokens__';

export interface ChannelRoute {
  url: string;
  actor: any;
  idParam?: string;
  channels?: any[];
  guards?: any[];
}

export type EnvBindings = {
  KV?: string | Record<string, string>;
  D1?: string | Record<string, string>;
  R2?: string | Record<string, string>;
  Queue?: Record<string, string>;
  DO?: Record<string, string>;
};

export interface AppMetadata {
  providers: any[];
  actors: any[];
  controllers: any[];
  channels: ChannelRoute[];
  bindings: EnvBindings;
}

export interface AppOptions {
  providers?: any[];
  actors?: any[];
  controllers?: any[];
  channels?: ChannelRoute[];
  bindings?: EnvBindings;
}

export interface InjectableMetadata {
  scope?: Scope;
}

export function OrbitApp(metadata: AppOptions): ClassDecorator {
  return (target: any) => {
    target[ORBIT_APP_META] = {
      providers: metadata.providers ?? [],
      actors: metadata.actors ?? [],
      controllers: metadata.controllers ?? [],
      channels: metadata.channels ?? [],
      bindings: metadata.bindings ?? {},
    } satisfies AppMetadata;
    return target;
  };
}

export function Injectable(metadata?: InjectableMetadata): ClassDecorator {
  return (target: any) => {
    target[ORBIT_INJECTABLE_META] = {
      scope: metadata?.scope ?? 'SINGLETON',
    };
    if (!target[ORBIT_INJECT_TOKENS]) {
      target[ORBIT_INJECT_TOKENS] = [];
    }
    return target;
  };
}

export function Inject(token: Token): ParameterDecorator {
  return (target: any, _propertyKey: unknown, parameterIndex: number) => {
    const ctor = typeof target === 'function' ? target : target.constructor;
    if (!ctor[ORBIT_INJECT_TOKENS]) {
      ctor[ORBIT_INJECT_TOKENS] = [];
    }
    ctor[ORBIT_INJECT_TOKENS][parameterIndex] = token;
  };
}

export function getAppMeta(target: any): AppMetadata | undefined {
  return target[ORBIT_APP_META];
}

export function getInjectableMeta(target: any): InjectableMetadata | undefined {
  return target[ORBIT_INJECTABLE_META];
}

export function getInjectTokens(target: any): Token[] {
  return target[ORBIT_INJECT_TOKENS] ?? [];
}
