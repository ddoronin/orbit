/**
 * Test utilities for Orbit applications.
 */

import { Container, buildAppGraph, buildContainer } from '@orbitstack/core';
import { type OrbitActor, ORBIT_ACTOR_META, ORBIT_HANDLERS_META } from '@orbitstack/actors';
import { Router } from '@orbitstack/http';
import {
  MockDurableObjectStorage,
  MockDurableObjectState,
  MockKVNamespace,
  MockR2Bucket,
  MockD1Database,
} from './mock-storage.js';

export interface TestAppOverride {
  provide: any;
  useValue: any;
}

export interface TestContainerOptions {
  overrides?: TestAppOverride[];
}

export interface TestContainer {
  container: Container;
  resolve<T>(token: any): Promise<T>;
  get<T>(token: any): Promise<T>;
}

/**
 * Build a DI container from an @OrbitApp class for tests.
 */
export async function createTestContainer(
  appClass: any,
  options: TestContainerOptions = {},
): Promise<TestContainer> {
  let container: Container;
  try {
    container = buildContainer(buildAppGraph(appClass));
  } catch {
    container = new Container();
  }
  for (const override of options.overrides ?? []) {
    container.registerValue(override.provide, override.useValue);
  }
  return {
    container,
    async resolve<T>(token: any): Promise<T> {
      return container.resolve<T>(token);
    },
    async get<T>(token: any): Promise<T> {
      return container.resolve<T>(token);
    },
  };
}

export interface TestActorHandle<S = any> {
  /** Send a message and get the result */
  call<R = any>(type: string, payload?: unknown): Promise<R>;

  /** Send a message, ignore result */
  cast(type: string, payload?: unknown): Promise<void>;

  /** Current actor state snapshot */
  readonly state: Readonly<S>;

  /** The actor instance (for direct inspection) */
  readonly instance: OrbitActor<S>;

  /** The mock storage */
  readonly storage: MockDurableObjectStorage;

  /** Trigger alarm handler */
  triggerAlarm(): Promise<void>;
}

/**
 * Create a test actor with mock storage.
 */
export async function createTestActor<S>(
  ActorClass: new () => OrbitActor<S>,
): Promise<TestActorHandle<S>> {
  const mockState = new MockDurableObjectState();
  const actor = new ActorClass();

  (actor as any).__ctx__ = {
    actorId: 'test-actor-id',
    actorName: (ActorClass as any)[ORBIT_ACTOR_META]?.name ?? ActorClass.name,
    storage: mockState.storage,
    state: mockState,
    env: {},
  };

  // Initialize state
  (actor as any).__initState__();
  await actor.onActivate();

  return {
    async call<R = any>(type: string, payload?: unknown): Promise<R> {
      const response = await (actor as any).__dispatch__(
        { type, payload: payload ?? null },
        mockState,
      );
      const result = await response.json();
      if (!result.ok) {
        throw new Error(result.error);
      }
      return result.data as R;
    },

    async cast(type: string, payload?: unknown): Promise<void> {
      const response = await (actor as any).__dispatch__(
        { type, payload: payload ?? null },
        mockState,
      );
      const result = await response.json();
      if (!result.ok) {
        throw new Error(result.error);
      }
    },

    get state(): Readonly<S> {
      return (actor as any).state;
    },

    get instance(): OrbitActor<S> {
      return actor;
    },

    get storage(): MockDurableObjectStorage {
      return mockState.storage;
    },

    async triggerAlarm(): Promise<void> {
      await (actor as any).__onAlarm__();
    },
  };
}

export interface TestApp {
  /** Send an HTTP request and get the response */
  request(path: string, options?: TestRequestOptions): Promise<Response>;

  /** The underlying router */
  router: Router;
}

export interface TestRequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}

/**
 * Create a test app with a router for integration testing.
 */
export function createTestApp(routerInstance: Router): TestApp {
  return {
    router: routerInstance,

    async request(path: string, options: TestRequestOptions = {}): Promise<Response> {
      const url = `https://test.local${path}`;
      const init: RequestInit = {
        method: options.method ?? 'GET',
        headers: options.headers,
      };

      if (options.body) {
        init.body = typeof options.body === 'string'
          ? options.body
          : JSON.stringify(options.body);
        if (!options.headers?.['Content-Type']) {
          init.headers = {
            ...init.headers,
            'Content-Type': 'application/json',
          };
        }
      }

      const request = new Request(url, init);
      return routerInstance.handle(request, null);
    },
  };
}
