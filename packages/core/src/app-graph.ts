/**
 * App graph: flatten an @OrbitApp class into a single dependency-resolution
 * unit. No module imports/exports — every provider is global within the app.
 */

import { Container, type Scope } from './container.js';
import { getAppMeta, getInjectableMeta, getInjectTokens, type AppMetadata } from './decorators.js';
import type { Token } from './tokens.js';

export interface AppGraph {
  appClass: any;
  metadata: AppMetadata;
  providers: Map<Token, ProviderRegistration>;
}

export interface ProviderRegistration {
  target: any;
  inject: Token[];
  scope: Scope;
  isFactory: boolean;
}

export function buildAppGraph(appClass: any): AppGraph {
  const meta = getAppMeta(appClass);
  if (!meta) {
    throw new Error(`${appClass.name} is not decorated with @OrbitApp`);
  }

  const providers = new Map<Token, ProviderRegistration>();
  const all = [
    ...meta.providers,
    ...meta.controllers,
    ...meta.actors,
  ];

  for (const provider of all) {
    if (typeof provider === 'function') {
      const injectMeta = getInjectableMeta(provider);
      const scope: Scope = injectMeta?.scope ?? 'SINGLETON';
      const inject = getInjectTokens(provider);
      providers.set(provider, { target: provider, inject, scope, isFactory: false });
    } else if (provider && typeof provider === 'object' && provider.provide) {
      const target = provider.useFactory ?? provider.useClass ?? provider.useValue;
      providers.set(provider.provide, {
        target,
        inject: provider.inject ?? [],
        scope: provider.scope ?? 'SINGLETON',
        isFactory: provider.useFactory !== undefined,
      });
    }
  }

  return { appClass, metadata: meta, providers };
}

export function buildContainer(graph: AppGraph): Container {
  const container = new Container();

  for (const [token, reg] of graph.providers) {
    if (reg.isFactory && typeof reg.target === 'function') {
      container.registerFactory(token, reg.target, reg.inject, reg.scope);
    } else if (typeof reg.target === 'function' && reg.target.prototype) {
      container.registerFactory(
        token,
        (...deps: any[]) => new reg.target(...deps),
        reg.inject,
        reg.scope,
      );
    } else if (typeof reg.target === 'function') {
      container.registerFactory(token, reg.target, reg.inject, reg.scope);
    } else {
      container.registerValue(token, reg.target);
    }
  }

  return container;
}
