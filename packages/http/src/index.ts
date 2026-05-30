export {
  Router,
  router,
  RouteGroup,
  type HttpMethod,
  type RouteMatch,
  type RouteHandler,
  type MiddlewareFn,
  type GuardFn,
  type PipeFn,
  type RequestContext,
  type RouteOpts,
} from './router.js';

export {
  Controller,
  Resource,
  Get,
  Post,
  Put,
  Delete,
  Patch,
  UseGuard,
  UsePipe,
  UseMiddleware,
  Param,
  Query,
  Body,
  Header,
  Ctx,
  Req,
  Auth,
  getControllerMeta,
  getRoutesMeta,
  getParamsMeta,
  ORBIT_CONTROLLER_META,
  ORBIT_ROUTES_META,
  ORBIT_PARAM_META,
  type ControllerMetadata,
  type RouteMetadata,
  type ParamMetadata,
  type ParamType,
  type ResourceOptions,
} from './controller.js';

export { bearer, authOf, type BearerOptions } from './auth.js';

export {
  registerController,
  registerControllers,
} from './controller-loader.js';

export {
  cors,
  requestLogger,
  securityHeaders,
  timing,
  type CorsOptions,
} from './middleware.js';
