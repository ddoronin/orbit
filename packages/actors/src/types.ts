/**
 * Core actor types.
 */

export interface MessageEnvelope {
  type: string;
  payload: unknown;
  replyTo?: string;
  traceId?: string;
}

export interface MessageResult {
  ok: boolean;
  data?: unknown;
  error?: string;
}

export interface ActorContext {
  actorId: string;
  actorName: string;
  storage: DurableObjectStorage;
  state: DurableObjectState;
  env: any;
}

export interface ActorOptions {
  autoPersist?: boolean;
}

export interface HandlerMeta {
  type: string;
  method: string;
  schema?: any;
}

// Metadata keys
export const ORBIT_ACTOR_META = '__orbit_actor__';
export const ORBIT_HANDLERS_META = '__orbit_handlers__';
export const ORBIT_ALARM_META = '__orbit_alarm__';
export const ORBIT_WS_EVENTS_META = '__orbit_ws_events__';

export interface ActorMetadata {
  name: string;
  options: ActorOptions;
}
