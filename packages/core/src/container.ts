/**
 * Dependency Injection Container.
 *
 * Supports three scopes:
 * - SINGLETON: one instance per container (Worker isolate lifetime)
 * - REQUEST: one instance per child scope (per HTTP request)
 * - TRANSIENT: new instance every resolve() call
 */

import type { Token } from "./tokens.js";

export type Scope = "SINGLETON" | "REQUEST" | "TRANSIENT";

export interface ProviderDefinition<T = any> {
  token: Token<T>;
  factory: (...deps: any[]) => T | Promise<T>;
  inject?: Token[];
  scope?: Scope;
}

export interface ValueProvider<T = any> {
  token: Token<T>;
  value: T;
}

export type Provider<T = any> = ProviderDefinition<T> | ValueProvider<T>;

function isValueProvider<T>(p: Provider<T>): p is ValueProvider<T> {
  return "value" in p;
}

function tokenToString(token: Token): string {
  if (typeof token === "function" && token.name) {
    return token.name;
  }
  if (typeof token === "symbol") {
    return token.toString();
  }
  return String(token);
}

function withDependencyContext(
  ownerToken: Token,
  depToken: Token,
  depIndex: number,
  err: unknown,
): Error {
  const baseMessage = err instanceof Error ? err.message : String(err);
  return new Error(
    `Failed to resolve dependency at index ${depIndex} for provider ${tokenToString(ownerToken)} (token: ${tokenToString(depToken)}). ${baseMessage}`,
  );
}

interface Registration {
  factory: (...deps: any[]) => any;
  inject: Token[];
  scope: Scope;
}

export class Container {
  private registrations = new Map<Token, Registration>();
  private singletons = new Map<Token, any>();
  private scopedInstances = new Map<Token, any>();
  private parent: Container | null = null;
  private resolving = new Set<Token>();

  register<T>(provider: Provider<T>): this {
    if (isValueProvider(provider)) {
      this.registrations.set(provider.token, {
        factory: () => provider.value,
        inject: [],
        scope: "SINGLETON",
      });
      this.singletons.set(provider.token, provider.value);
    } else {
      this.registrations.set(provider.token, {
        factory: provider.factory,
        inject: provider.inject ?? [],
        scope: provider.scope ?? "SINGLETON",
      });
    }
    return this;
  }

  registerValue<T>(token: Token<T>, value: T): this {
    return this.register({ token, value });
  }

  registerFactory<T>(
    token: Token<T>,
    factory: (...deps: any[]) => T,
    inject: Token[] = [],
    scope: Scope = "SINGLETON",
  ): this {
    return this.register({ token, factory, inject, scope });
  }

  async resolve<T>(token: Token<T>): Promise<T> {
    // Check scoped instances first (REQUEST scope in child containers)
    if (this.scopedInstances.has(token)) {
      return this.scopedInstances.get(token) as T;
    }

    // Check singletons
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }

    // Check parent singletons
    if (this.parent?.singletons.has(token)) {
      return this.parent.singletons.get(token) as T;
    }

    // Find registration (local first, then parent)
    const reg =
      this.registrations.get(token) ?? this.parent?.registrations.get(token);
    if (!reg) {
      const tokenStr = tokenToString(token);
      throw new Error(`No provider registered for token: ${tokenStr}`);
    }

    // Circular dependency detection
    if (this.resolving.has(token)) {
      const tokenStr = tokenToString(token);
      throw new Error(`Circular dependency detected for token: ${tokenStr}`);
    }

    this.resolving.add(token);
    try {
      // Resolve dependencies
      const deps: any[] = [];
      for (let i = 0; i < reg.inject.length; i++) {
        const dep = reg.inject[i];
        try {
          deps.push(await this.resolve(dep));
        } catch (err) {
          throw withDependencyContext(token, dep, i, err);
        }
      }
      const instance = await reg.factory(...deps);

      // Cache based on scope
      switch (reg.scope) {
        case "SINGLETON":
          // Store on the container that owns the registration
          if (this.registrations.has(token)) {
            this.singletons.set(token, instance);
          } else if (this.parent) {
            this.parent.singletons.set(token, instance);
          }
          break;
        case "REQUEST":
          this.scopedInstances.set(token, instance);
          break;
        case "TRANSIENT":
          // no caching
          break;
      }

      return instance as T;
    } finally {
      this.resolving.delete(token);
    }
  }

  resolveSync<T>(token: Token<T>): T {
    // Check scoped instances first
    if (this.scopedInstances.has(token)) {
      return this.scopedInstances.get(token) as T;
    }
    if (this.singletons.has(token)) {
      return this.singletons.get(token) as T;
    }
    if (this.parent?.singletons.has(token)) {
      return this.parent.singletons.get(token) as T;
    }

    const reg =
      this.registrations.get(token) ?? this.parent?.registrations.get(token);
    if (!reg) {
      const tokenStr = tokenToString(token);
      throw new Error(`No provider registered for token: ${tokenStr}`);
    }

    if (this.resolving.has(token)) {
      const tokenStr = tokenToString(token);
      throw new Error(`Circular dependency detected for token: ${tokenStr}`);
    }

    this.resolving.add(token);
    try {
      const deps: any[] = [];
      for (let i = 0; i < reg.inject.length; i++) {
        const dep = reg.inject[i];
        try {
          deps.push(this.resolveSync(dep));
        } catch (err) {
          throw withDependencyContext(token, dep, i, err);
        }
      }
      const instance = reg.factory(...deps);

      if (instance instanceof Promise) {
        throw new Error(
          "Cannot resolveSync an async provider. Use resolve() instead.",
        );
      }

      switch (reg.scope) {
        case "SINGLETON":
          if (this.registrations.has(token)) {
            this.singletons.set(token, instance);
          } else if (this.parent) {
            this.parent.singletons.set(token, instance);
          }
          break;
        case "REQUEST":
          this.scopedInstances.set(token, instance);
          break;
      }

      return instance as T;
    } finally {
      this.resolving.delete(token);
    }
  }

  has(token: Token): boolean {
    return (
      this.registrations.has(token) ||
      this.singletons.has(token) ||
      this.scopedInstances.has(token) ||
      (this.parent?.has(token) ?? false)
    );
  }

  createScope(): Container {
    const child = new Container();
    child.parent = this;
    // Copy registrations so child can see all providers
    for (const [token, reg] of this.registrations) {
      if (!child.registrations.has(token)) {
        child.registrations.set(token, reg);
      }
    }
    return child;
  }

  dispose(): void {
    this.scopedInstances.clear();
    this.resolving.clear();
  }
}
