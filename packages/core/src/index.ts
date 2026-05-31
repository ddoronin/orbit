// @orbitstack/core — public API

export {
  Container,
  type Scope,
  type Provider,
  type ProviderDefinition,
  type ValueProvider,
} from './container.js';

export {
  OrbitApp,
  Injectable,
  Inject,
  getAppMeta,
  getInjectableMeta,
  getInjectTokens,
  ORBIT_APP_META,
  ORBIT_INJECTABLE_META,
  ORBIT_INJECT_TOKENS,
  type AppMetadata,
  type AppOptions,
  type InjectableMetadata,
  type ChannelRoute,
  type EnvBindings,
} from './decorators.js';

export {
  type Token,
  type TokenDescriptor,
  createToken,
  ENV_TOKEN,
  D1_TOKEN,
  KV_TOKEN,
  R2_TOKEN,
  QUEUE_TOKEN,
  DO_TOKEN,
  EXECUTION_CTX_TOKEN,
  REQUEST_TOKEN,
} from './tokens.js';

export {
  buildAppGraph,
  buildContainer,
  type AppGraph,
  type ProviderRegistration,
} from './app-graph.js';

export {
  OrbitFactory,
  type OrbitHandler,
  type OrbitFactoryOptions,
  type FetchHandler,
  type QueueHandler,
} from './factory.js';

export {
  Logger,
  type TraceContext,
  type LogLevel,
  generateTraceId,
  generateSpanId,
  createTraceContext,
} from './logger.js';

export {
  OrbitError,
  HttpException,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  InternalServerErrorException,
  ActorError,
} from './errors.js';
