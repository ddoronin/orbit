/**
 * Actor decorators.
 */

import {
  ORBIT_ACTOR_META,
  ORBIT_HANDLERS_META,
  ORBIT_ALARM_META,
  type ActorOptions,
  type HandlerMeta,
} from './types.js';

/**
 * Marks a class as an Orbit Actor (Durable Object).
 */
export const ORBIT_SNAPSHOT_TYPE = '__orbit.snapshot__';

export function Actor(name: string, options?: ActorOptions): ClassDecorator {
  return (target: any) => {
    target[ORBIT_ACTOR_META] = {
      name,
      options: {
        autoPersist: true,
        ...options,
      },
    };
    if (!target[ORBIT_HANDLERS_META]) {
      target[ORBIT_HANDLERS_META] = [];
    }
    const handlers: HandlerMeta[] = target[ORBIT_HANDLERS_META];
    if (!handlers.some((h) => h.type === ORBIT_SNAPSHOT_TYPE)) {
      handlers.push({
        type: ORBIT_SNAPSHOT_TYPE,
        method: '__orbitSnapshot__',
      });
    }
    return target;
  };
}

/**
 * Marks a method as a message handler.
 */
export function Handle(type: string, opts?: { schema?: any }): MethodDecorator {
  return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
    const ctor = target.constructor;
    if (!ctor[ORBIT_HANDLERS_META]) {
      ctor[ORBIT_HANDLERS_META] = [];
    }
    const meta: HandlerMeta = {
      type,
      method: String(propertyKey),
      schema: opts?.schema,
    };
    ctor[ORBIT_HANDLERS_META].push(meta);
  };
}

/**
 * Marks a method as the alarm handler.
 */
export function OnAlarm(): MethodDecorator {
  return (target: any, propertyKey: string | symbol, _descriptor: PropertyDescriptor) => {
    const ctor = target.constructor;
    ctor[ORBIT_ALARM_META] = String(propertyKey);
  };
}
