import { describe, it, expect } from "vitest";
import { Container } from "./container.js";
import { createToken } from "./tokens.js";

describe("Container", () => {
  it("resolves a value provider", async () => {
    const container = new Container();
    const TOKEN = createToken<string>("test");
    container.registerValue(TOKEN, "hello");
    expect(await container.resolve(TOKEN)).toBe("hello");
  });

  it("resolves a factory provider", async () => {
    const container = new Container();
    const TOKEN = createToken<{ value: number }>("test");
    container.registerFactory(TOKEN, () => ({ value: 42 }));
    const result = await container.resolve(TOKEN);
    expect(result.value).toBe(42);
  });

  it("resolves dependencies in order", async () => {
    const container = new Container();
    const A = createToken<string>("A");
    const B = createToken<string>("B");

    container.registerValue(A, "hello");
    container.registerFactory(B, (a: string) => `${a} world`, [A]);

    expect(await container.resolve(B)).toBe("hello world");
  });

  it("caches singleton providers", async () => {
    const container = new Container();
    const TOKEN = createToken<{ id: number }>("test");
    let counter = 0;
    container.registerFactory(
      TOKEN,
      () => ({ id: ++counter }),
      [],
      "SINGLETON",
    );

    const a = await container.resolve(TOKEN);
    const b = await container.resolve(TOKEN);
    expect(a).toBe(b);
    expect(a.id).toBe(1);
  });

  it("creates new instance for transient providers", async () => {
    const container = new Container();
    const TOKEN = createToken<{ id: number }>("test");
    let counter = 0;
    container.registerFactory(
      TOKEN,
      () => ({ id: ++counter }),
      [],
      "TRANSIENT",
    );

    const a = await container.resolve(TOKEN);
    const b = await container.resolve(TOKEN);
    expect(a).not.toBe(b);
    expect(a.id).toBe(1);
    expect(b.id).toBe(2);
  });

  it("scopes REQUEST providers to child container", async () => {
    const container = new Container();
    const TOKEN = createToken<{ id: number }>("test");
    let counter = 0;
    container.registerFactory(TOKEN, () => ({ id: ++counter }), [], "REQUEST");

    const scope1 = container.createScope();
    const scope2 = container.createScope();

    const a1 = await scope1.resolve(TOKEN);
    const a2 = await scope1.resolve(TOKEN);
    const b1 = await scope2.resolve(TOKEN);

    expect(a1).toBe(a2); // same scope = same instance
    expect(a1).not.toBe(b1); // different scope = different instance
  });

  it("detects circular dependencies", async () => {
    const container = new Container();
    const A = createToken("A");
    const B = createToken("B");

    container.registerFactory(A, () => "a", [B]);
    container.registerFactory(B, () => "b", [A]);

    await expect(container.resolve(A)).rejects.toThrow("Circular dependency");
  });

  it("throws on missing provider", async () => {
    const container = new Container();
    const TOKEN = createToken("missing");

    await expect(container.resolve(TOKEN)).rejects.toThrow(
      "No provider registered",
    );
  });

  it("includes provider class and dependency index for async resolve failures", async () => {
    const container = new Container();

    class MissingService {}
    class UsersController {}

    container.registerFactory(UsersController, () => ({}), [MissingService]);

    await expect(container.resolve(UsersController)).rejects.toThrow(
      "Failed to resolve dependency at index 0 for provider UsersController (token: MissingService)",
    );
  });

  it("includes provider class and dependency index for sync resolve failures", () => {
    const container = new Container();

    class MissingService {}
    class UsersController {}

    container.registerFactory(UsersController, () => ({}), [MissingService]);

    expect(() => container.resolveSync(UsersController)).toThrow(
      "Failed to resolve dependency at index 0 for provider UsersController (token: MissingService)",
    );
  });

  it("has() checks registration", () => {
    const container = new Container();
    const TOKEN = createToken("test");
    expect(container.has(TOKEN)).toBe(false);
    container.registerValue(TOKEN, "x");
    expect(container.has(TOKEN)).toBe(true);
  });

  it("child scope inherits parent registrations", async () => {
    const container = new Container();
    const TOKEN = createToken<string>("test");
    container.registerValue(TOKEN, "parent-value");

    const child = container.createScope();
    expect(await child.resolve(TOKEN)).toBe("parent-value");
  });

  it("resolveSync works for synchronous providers", () => {
    const container = new Container();
    const TOKEN = createToken<number>("test");
    container.registerFactory(TOKEN, () => 42);
    expect(container.resolveSync(TOKEN)).toBe(42);
  });
});
