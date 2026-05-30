/**
 * Code generator for Orbit decorators.
 *
 * Transforms decorator metadata into static properties that work
 * without Reflect.metadata in the workerd runtime.
 *
 * This is a source-level transform that runs as an esbuild plugin.
 * It parses TypeScript source and generates metadata arrays.
 */

export interface ActorMeta {
  name: string;
  className: string;
  handlers: string[];
  hasAlarm: boolean;
  hasWebSocket: boolean;
  persistence: 'auto' | 'manual';
}

export interface ControllerMeta {
  prefix: string;
  className: string;
  routes: RouteMeta[];
}

export interface RouteMeta {
  method: string;
  path: string;
  handlerName: string;
  guards: string[];
  pipes: string[];
}

export interface ChannelMeta {
  topic: string;
  className: string;
  actorClassName: string;
  events: string[];
}

export interface AppManifest {
  actors: ActorMeta[];
  controllers: ControllerMeta[];
  channels: ChannelMeta[];
  modules: string[];
}

/**
 * Generates wrangler.toml Durable Object bindings from actor metadata.
 */
export function generateWranglerBindings(actors: ActorMeta[]): string {
  if (actors.length === 0) return '';

  const bindings = actors.map(a => {
    return `{ name = "${a.name}", class_name = "${a.className}" }`;
  });

  return `
[durable_objects]
bindings = [
  ${bindings.join(',\n  ')}
]

[[migrations]]
tag = "v1"
new_classes = [${actors.map(a => `"${a.className}"`).join(', ')}]
`;
}

/**
 * Generates the DO class wrapper code for an actor.
 */
export function generateDurableObjectClass(actor: ActorMeta): string {
  return `
export class ${actor.className}_DO {
  #state;
  #env;
  #actor;
  #initialized = false;

  constructor(state, env) {
    this.#state = state;
    this.#env = env;
    this.#actor = new ${actor.className}();
    this.#actor.__ctx__ = { state, env, storage: state.storage };

    state.blockConcurrencyWhile(async () => {
      const saved = await state.storage.get('__orbit_state__');
      if (saved) {
        this.#actor.__hydrate__(saved);
      } else {
        this.#actor.__initState__();
      }
      this.#initialized = true;
      if (this.#actor.onActivate) {
        await this.#actor.onActivate();
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    // WebSocket upgrade
    if (request.headers.get('Upgrade') === 'websocket') {
      return this.#actor.__handleWebSocketUpgrade__(request, this.#state);
    }

    // Message dispatch
    const envelope = await request.json();
    return this.#actor.__dispatch__(envelope, this.#state);
  }

  async alarm() {
    await this.#actor.__onAlarm__();
  }

  // WebSocket Hibernation API handlers
  async webSocketMessage(ws, message) {
    await this.#actor.__webSocketMessage__(ws, message);
  }

  async webSocketClose(ws, code, reason, wasClean) {
    await this.#actor.__webSocketClose__(ws, code, reason, wasClean);
  }

  async webSocketError(ws, error) {
    await this.#actor.__webSocketError__(ws, error);
  }
}
`;
}

/**
 * Generates the worker entry point that exports all DO classes.
 */
export function generateWorkerEntry(manifest: AppManifest): string {
  const doExports = manifest.actors.map(a =>
    `export { ${a.className}_DO as ${a.className} } from './__orbit_do_${a.className}__.js';`
  );

  return `
import { app } from './main.js';

export default app.handler;

${doExports.join('\n')}
`;
}
