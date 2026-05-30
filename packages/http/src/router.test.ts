import { describe, it, expect } from 'vitest';
import { Router, router } from './router.js';

describe('Router', () => {
  it('matches static routes', () => {
    const r = router()
      .get('/users', async () => new Response('users list'))
      .get('/posts', async () => new Response('posts list'));

    const match = r.match('GET', '/users');
    expect(match).not.toBeNull();
  });

  it('matches parameterized routes', () => {
    const r = router()
      .get('/users/:id', async () => new Response('user'));

    const match = r.match('GET', '/users/42');
    expect(match).not.toBeNull();
    expect(match!.params.id).toBe('42');
  });

  it('matches nested parameters', () => {
    const r = router()
      .get('/users/:userId/posts/:postId', async () => new Response('post'));

    const match = r.match('GET', '/users/1/posts/2');
    expect(match).not.toBeNull();
    expect(match!.params.userId).toBe('1');
    expect(match!.params.postId).toBe('2');
  });

  it('returns null for unmatched routes', () => {
    const r = router()
      .get('/users', async () => new Response('users'));

    expect(r.match('GET', '/posts')).toBeNull();
    expect(r.match('POST', '/users')).toBeNull();
  });

  it('matches different methods on same path', () => {
    const r = router()
      .get('/users', async () => new Response('GET'))
      .post('/users', async () => new Response('POST'));

    expect(r.match('GET', '/users')).not.toBeNull();
    expect(r.match('POST', '/users')).not.toBeNull();
    expect(r.match('DELETE', '/users')).toBeNull();
  });

  it('supports route groups with prefix', () => {
    const r = router();
    r.group('/api/v1', g => {
      g.get('/users', async () => new Response('users'));
      g.get('/posts', async () => new Response('posts'));
    });

    expect(r.match('GET', '/api/v1/users')).not.toBeNull();
    expect(r.match('GET', '/api/v1/posts')).not.toBeNull();
    expect(r.match('GET', '/users')).toBeNull();
  });

  it('applies group guards to all routes', async () => {
    let guardCalled = false;
    const guard = () => { guardCalled = true; return true; };

    const r = router();
    r.group('/admin', g => {
      g.useGuard(guard);
      g.get('/stats', async () => new Response('stats'));
    });

    const match = r.match('GET', '/admin/stats');
    expect(match).not.toBeNull();
    expect(match!.guards).toContain(guard);
  });

  it('handles requests end-to-end', async () => {
    const r = router()
      .get('/hello', (ctx) => ctx.json({ message: 'world' }));

    const request = new Request('https://test.local/hello');
    const response = await r.handle(request, null);

    expect(response.status).toBe(200);
    const body = await response.json() as any;
    expect(body.message).toBe('world');
  });

  it('returns 404 for unmatched requests', async () => {
    const r = router();
    const request = new Request('https://test.local/nothing');
    const response = await r.handle(request, null);
    expect(response.status).toBe(404);
  });

  it('executes middleware in order', async () => {
    const order: string[] = [];

    const r = router()
      .use(async (ctx, next) => {
        order.push('before-1');
        const res = await next();
        order.push('after-1');
        return res;
      })
      .get('/test', async (ctx) => {
        order.push('handler');
        return ctx.text('ok');
      });

    const request = new Request('https://test.local/test');
    await r.handle(request, null);

    expect(order).toEqual(['before-1', 'handler', 'after-1']);
  });

  it('guards can reject requests', async () => {
    const denyGuard = () => false;

    const r = router()
      .get('/protected', async (ctx) => ctx.text('secret'), {
        guards: [denyGuard],
      });

    const request = new Request('https://test.local/protected');
    const response = await r.handle(request, null);
    expect(response.status).toBe(403);
  });

  it('parses query parameters', async () => {
    let capturedQuery: URLSearchParams | null = null;

    const r = router()
      .get('/search', (ctx) => {
        capturedQuery = ctx.query;
        return ctx.json({ q: ctx.query.get('q') });
      });

    const request = new Request('https://test.local/search?q=hello&limit=10');
    await r.handle(request, null);

    expect(capturedQuery!.get('q')).toBe('hello');
    expect(capturedQuery!.get('limit')).toBe('10');
  });

  it('matches wildcard routes', () => {
    const r = router()
      .get('/files/*path', async () => new Response('file'));

    const match = r.match('GET', '/files/docs/readme.md');
    expect(match).not.toBeNull();
    expect(match!.params.path).toBe('docs/readme.md');
  });
});
