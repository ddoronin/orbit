import { describe, it, expect } from 'vitest';
import { Container } from '@orbitstack/core';
import { Router } from './router.js';
import { Controller, Get, Post, Param, Body, Query, Header, Ctx, Auth } from './controller.js';
import { registerController, registerControllers } from './controller-loader.js';

@Controller('/posts')
class PostsController {
  @Get('/:id')
  async show(@Param('id') id: string) {
    return { id };
  }

  @Post('/')
  async create(@Body() body: { title: string }) {
    return { created: body };
  }
}

@Controller('/echo')
class EchoController {
  @Get('/q')
  async echoQuery(@Query('name') name: string) {
    return { name };
  }

  @Get('/h')
  async echoHeader(@Header('x-foo') v: string) {
    return { v };
  }

  @Get('/ctx')
  async echoCtx(@Ctx() ctx: any) {
    return { path: ctx.url.pathname };
  }

  @Get('/auth')
  async echoAuth(@Auth() auth: any) {
    return { auth };
  }
}

function setup() {
  const container = new Container();
  container.registerFactory(PostsController, () => new PostsController());
  container.registerFactory(EchoController, () => new EchoController());
  const router = new Router();
  return { container, router };
}

async function call(router: Router, container: Container, method: string, path: string, init?: RequestInit, extra?: (ctx: any) => void) {
  const req = new Request('https://test.local' + path, { method, ...init });
  if (extra) {
    const origHandle = router.handle.bind(router);
    return origHandle(req, container);
  }
  return router.handle(req, container);
}

describe('registerController', () => {
  it('registers routes from a @Controller class onto the router', async () => {
    const { container, router } = setup();
    registerController(router, PostsController, container);
    const res = await call(router, container, 'GET', '/posts/42');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: '42' });
  });

  it('throws on classes without @Controller', () => {
    const { container, router } = setup();
    class Bare {}
    expect(() => registerController(router, Bare, container)).toThrow('not decorated with @Controller');
  });

  it('resolves @Body parameter', async () => {
    const { container, router } = setup();
    registerController(router, PostsController, container);
    const res = await call(router, container, 'POST', '/posts/', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'hi' }),
    });
    expect(await res.json()).toEqual({ created: { title: 'hi' } });
  });
});

describe('parameter resolution', () => {
  it('@Query reads from URL search params', async () => {
    const { container, router } = setup();
    registerControllers(router, [EchoController], container);
    const res = await call(router, container, 'GET', '/echo/q?name=alice');
    expect(await res.json()).toEqual({ name: 'alice' });
  });

  it('@Header reads from request headers', async () => {
    const { container, router } = setup();
    registerControllers(router, [EchoController], container);
    const res = await call(router, container, 'GET', '/echo/h', { headers: { 'x-foo': 'bar' } });
    expect(await res.json()).toEqual({ v: 'bar' });
  });

  it('@Ctx injects the full request context', async () => {
    const { container, router } = setup();
    registerControllers(router, [EchoController], container);
    const res = await call(router, container, 'GET', '/echo/ctx');
    expect(await res.json()).toEqual({ path: '/echo/ctx' });
  });

  it('@Auth resolves ctx.auth attached by guards', async () => {
    const { container, router } = setup();
    // Manually monkey-patch a guard-like middleware that sets ctx.auth
    router.use(async (ctx, next) => {
      (ctx as any).auth = { userId: 'u1' };
      return next();
    });
    registerControllers(router, [EchoController], container);
    const res = await call(router, container, 'GET', '/echo/auth');
    expect(await res.json()).toEqual({ auth: { userId: 'u1' } });
  });
});

describe('204 fallback', () => {
  it('returns 204 when handler returns void/null', async () => {
    @Controller('/v')
    class V {
      @Get('/')
      async noop() { /* nothing */ }
    }
    const container = new Container();
    container.registerFactory(V, () => new V());
    const router = new Router();
    registerController(router, V, container);
    const res = await router.handle(new Request('https://test.local/v/'), container);
    expect(res.status).toBe(204);
  });
});
