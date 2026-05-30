import { describe, it, expect } from 'vitest';
import { OrbitApp, Injectable, Inject } from './decorators.js';
import { buildAppGraph, buildContainer } from './app-graph.js';
import { createToken } from './tokens.js';

describe('App graph', () => {
  it('flattens providers/controllers/actors into one map', () => {
    @Injectable()
    class Svc {}
    @Injectable()
    class Ctrl {}
    @Injectable()
    class Act {}

    @OrbitApp({ providers: [Svc], controllers: [Ctrl], actors: [Act] })
    class App {}

    const graph = buildAppGraph(App);
    expect(graph.providers.has(Svc)).toBe(true);
    expect(graph.providers.has(Ctrl)).toBe(true);
    expect(graph.providers.has(Act)).toBe(true);
  });

  it('accepts useFactory custom providers', async () => {
    const TOKEN = createToken<string>('greeting');

    @OrbitApp({
      providers: [
        { provide: TOKEN, useFactory: () => 'hello', inject: [] },
      ],
    })
    class App {}

    const graph = buildAppGraph(App);
    const container = buildContainer(graph);
    expect(await container.resolve(TOKEN)).toBe('hello');
  });

  it('wires class deps via @Inject', async () => {
    const NAME = createToken<string>('name');

    @Injectable()
    class Greeter {
      constructor(@Inject(NAME) private name: string) {}
      hello() { return `hi ${this.name}`; }
    }

    @OrbitApp({
      providers: [
        { provide: NAME, useFactory: () => 'world', inject: [] },
        Greeter,
      ],
    })
    class App {}

    const container = buildContainer(buildAppGraph(App));
    const g = await container.resolve(Greeter);
    expect(g.hello()).toBe('hi world');
  });

  it('throws when class lacks @OrbitApp', () => {
    class NotAnApp {}
    expect(() => buildAppGraph(NotAnApp)).toThrow('not decorated with @OrbitApp');
  });
});
