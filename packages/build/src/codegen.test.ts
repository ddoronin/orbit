import { describe, it, expect } from 'vitest';
import {
  generateWranglerBindings,
  generateDurableObjectClass,
  generateWorkerEntry,
  type ActorMeta,
  type AppManifest,
} from './codegen.js';

const exampleActor: ActorMeta = {
  name: 'ChatRoom',
  className: 'ChatRoomActor',
  handlers: ['join', 'send'],
  hasAlarm: true,
  hasWebSocket: true,
  persistence: 'auto',
};

describe('generateWranglerBindings', () => {
  it('returns empty string with no actors', () => {
    expect(generateWranglerBindings([])).toBe('');
  });

  it('renders [durable_objects] table with each binding', () => {
    const out = generateWranglerBindings([exampleActor, {
      ...exampleActor,
      name: 'Counter',
      className: 'CounterActor',
    }]);
    expect(out).toContain('[durable_objects]');
    expect(out).toContain('name = "ChatRoom"');
    expect(out).toContain('class_name = "ChatRoomActor"');
    expect(out).toContain('name = "Counter"');
  });

  it('renders a migration tag listing new classes', () => {
    const out = generateWranglerBindings([exampleActor]);
    expect(out).toMatch(/\[\[migrations\]\][\s\S]*tag = "v1"/);
    expect(out).toContain('"ChatRoomActor"');
  });
});

describe('generateDurableObjectClass', () => {
  it('emits a DO class wrapping the actor', () => {
    const src = generateDurableObjectClass(exampleActor);
    expect(src).toContain('export class ChatRoomActor_DO');
    expect(src).toContain('new ChatRoomActor()');
    expect(src).toContain('__handleWebSocketUpgrade__');
    expect(src).toContain('__dispatch__');
    expect(src).toContain('this.#actor.__onAlarm__');
  });
});

describe('generateWorkerEntry', () => {
  it('re-exports every actor under its class name', () => {
    const manifest: AppManifest = {
      actors: [exampleActor, { ...exampleActor, className: 'CounterActor' }],
      controllers: [], channels: [], modules: [],
    };
    const src = generateWorkerEntry(manifest);
    expect(src).toContain("export { ChatRoomActor_DO as ChatRoomActor }");
    expect(src).toContain("export { CounterActor_DO as CounterActor }");
    expect(src).toContain('export default app.handler');
  });
});
