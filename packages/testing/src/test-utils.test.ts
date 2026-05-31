import { describe, it, expect } from "vitest";
import { OrbitApp, Injectable, Inject, createToken } from "@orbitstack/core";
import { Actor, Handle, OnAlarm, OrbitActor } from "@orbitstack/actors";
import { Resource, Get, Router, registerControllers } from "@orbitstack/http";
import {
  createTestContainer,
  createTestActor,
  createTestApp,
} from "./test-utils.js";

const GREETING = createToken<string>("greeting");

@Injectable()
class Greeter {
  constructor(@Inject(GREETING) private msg: string) {}
  say() {
    return this.msg;
  }
}

@OrbitApp({
  providers: [
    { provide: GREETING, useFactory: () => "hello", inject: [] },
    Greeter,
  ],
})
class App {}

describe("createTestContainer", () => {
  it("returns a working container from an @OrbitApp", async () => {
    const { container, resolve, get } = await createTestContainer(App);
    expect(await container.resolve(GREETING)).toBe("hello");
    expect((await resolve<Greeter>(Greeter)).say()).toBe("hello");
    expect((await get<Greeter>(Greeter)).say()).toBe("hello");
  });

  it("applies overrides", async () => {
    const { resolve } = await createTestContainer(App, {
      overrides: [{ provide: GREETING, useValue: "override" }],
    });
    expect((await resolve<Greeter>(Greeter)).say()).toBe("override");
  });

  it("returns a bare container if class is not @OrbitApp", async () => {
    class NotAnApp {}
    const { container } = await createTestContainer(NotAnApp);
    expect(container).toBeDefined();
  });
});

@Actor("Counter")
class CounterActor extends OrbitActor<{ n: number; swept: boolean }> {
  initialState() {
    return { n: 0, swept: false };
  }
  @Handle("inc") async inc() {
    this.updateState((s) => {
      s.n++;
    });
    return this.state.n;
  }
  @Handle("boom") async boom() {
    throw new Error("explode");
  }
  @OnAlarm() async sweep() {
    this.updateState((s) => {
      s.swept = true;
    });
  }
}

describe("createTestActor", () => {
  it("exposes call/cast/state", async () => {
    const h = await createTestActor(CounterActor);
    expect(h.state.n).toBe(0);
    await h.call("inc");
    expect(h.state.n).toBe(1);
    await h.cast("inc");
    expect(h.state.n).toBe(2);
  });

  it("throws when a handler errors", async () => {
    const h = await createTestActor(CounterActor);
    await expect(h.call("boom")).rejects.toThrow("explode");
  });

  it("triggerAlarm runs the @OnAlarm handler", async () => {
    const h = await createTestActor(CounterActor);
    await h.triggerAlarm();
    expect(h.state.swept).toBe(true);
  });

  it("exposes the underlying actor instance and storage", async () => {
    const h = await createTestActor(CounterActor);
    expect(h.instance).toBeInstanceOf(CounterActor);
    expect(h.storage).toBeDefined();
  });
});

describe("createTestApp", () => {
  it("routes HTTP requests through a Router", async () => {
    const router = new Router().get("/ping", (ctx) => ctx.json({ ok: true }));
    const app = createTestApp(router);
    const res = await app.request("/ping");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it("serializes JSON bodies and sets Content-Type", async () => {
    const router = new Router().post("/echo", async (ctx) =>
      ctx.json(await ctx.body()),
    );
    const app = createTestApp(router);
    const res = await app.request("/echo", {
      method: "POST",
      body: { greet: "hi" },
    });
    expect(await res.json()).toEqual({ greet: "hi" });
  });

  it("supports controller integration tests with container overrides", async () => {
    @Injectable()
    class UsersService {
      async list(): Promise<string[]> {
        return ["real-user"];
      }
    }

    @Resource("/users")
    class UsersController {
      constructor(@Inject(UsersService) private users: UsersService) {}

      @Get("/")
      async list() {
        return { users: await this.users.list() };
      }
    }

    @OrbitApp({
      providers: [UsersService],
      controllers: [UsersController],
    })
    class UsersApp {}

    const fakeUsersService: UsersService = {
      async list() {
        return ["override-user"];
      },
    };

    const { container } = await createTestContainer(UsersApp, {
      overrides: [{ provide: UsersService, useValue: fakeUsersService }],
    });

    const router = new Router();
    registerControllers(router, [UsersController], container);

    const app = createTestApp(router);
    const res = await app.request("/users");

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ users: ["override-user"] });
  });
});
