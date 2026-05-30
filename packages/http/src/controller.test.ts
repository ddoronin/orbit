import { describe, it, expect } from 'vitest';
import {
  Controller,
  Resource,
  Get,
  Post,
  Patch,
  Delete,
  Put,
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
  ORBIT_PARAM_META,
} from './controller.js';
import { ORBIT_INJECTABLE_META } from '@orbit/core';

describe('@Controller', () => {
  it('stores prefix with leading slash', () => {
    @Controller('users') class A {}
    expect(getControllerMeta(A)!.prefix).toBe('/users');
  });

  it('preserves existing leading slash', () => {
    @Controller('/v1/users') class A {}
    expect(getControllerMeta(A)!.prefix).toBe('/v1/users');
  });

  it('defaults to empty prefix', () => {
    @Controller() class A {}
    expect(getControllerMeta(A)!.prefix).toBe('/');
  });
});

describe('@Resource', () => {
  it('sets controller prefix, @Injectable, and class-level guards', () => {
    const guardA = async () => true;
    const mwA = async (_ctx: any, next: any) => next();

    @Resource('/posts', { guards: [guardA], middleware: [mwA] })
    class Posts {}

    const ctrl = getControllerMeta(Posts)!;
    expect(ctrl.prefix).toBe('/posts');
    expect(ctrl.guards).toContain(guardA);
    expect(ctrl.middleware).toContain(mwA);
    expect((Posts as any)[ORBIT_INJECTABLE_META]).toBeDefined();
  });

  it('does not double-decorate @Injectable when already present', () => {
    @Resource('/x')
    class X {}
    const meta = (X as any)[ORBIT_INJECTABLE_META];
    expect(meta).toBeDefined();
  });
});

describe('Route method decorators', () => {
  it('@Get/@Post/@Put/@Patch/@Delete each register a route', () => {
    @Controller('/x')
    class C {
      @Get('/') a() {}
      @Post('/p') b() {}
      @Put('/u') c() {}
      @Patch('/pa') d() {}
      @Delete('/d') e() {}
    }
    const routes = getRoutesMeta(C);
    expect(routes.map((r) => r.method).sort()).toEqual(['DELETE', 'GET', 'PATCH', 'POST', 'PUT']);
  });

  it('@UseGuard, @UsePipe, @UseMiddleware attach per-route', () => {
    const guard = async () => true;
    const pipe = (v: any) => v;
    const mw = async (_c: any, n: any) => n();

    @Controller('/x')
    class C {
      @UseGuard(guard)
      @UsePipe(pipe)
      @UseMiddleware(mw)
      @Get('/')
      handler() {}
    }
    const route = getRoutesMeta(C)[0];
    expect(route.guards).toEqual([guard]);
    expect(route.pipes).toEqual([pipe]);
    expect(route.middleware).toEqual([mw]);
  });
});

describe('Parameter decorators', () => {
  it('store metadata keyed by method name', () => {
    @Controller('/x')
    class C {
      @Get('/:id/:other')
      handler(
        @Param('id') _id: string,
        @Query('q') _q: string,
        @Body() _b: unknown,
        @Header('x-trace') _t: string,
        @Ctx() _ctx: any,
        @Req() _req: Request,
        @Auth() _auth: any,
      ) {}
    }

    const params = getParamsMeta(C, 'handler');
    const types = params.map((p) => p.type).sort();
    expect(types).toEqual(['auth', 'body', 'ctx', 'header', 'param', 'query', 'request']);
  });

  it('captures index per parameter', () => {
    @Controller('/x')
    class C {
      @Get('/:id')
      handler(@Param('id') _id: string, @Body() _b: unknown) {}
    }
    const params = getParamsMeta(C, 'handler');
    const indexed = Object.fromEntries(params.map((p) => [p.type, p.index]));
    expect(indexed.param).toBe(0);
    expect(indexed.body).toBe(1);
  });
});

describe('getRoutesMeta', () => {
  it('returns empty array when no routes defined', () => {
    class Bare {}
    expect(getRoutesMeta(Bare)).toEqual([]);
  });
});
