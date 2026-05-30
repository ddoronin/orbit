import { describe, it, expect } from 'vitest';
import {
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

describe('Error types', () => {
  it('OrbitError carries name + message', () => {
    const e = new OrbitError('boom');
    expect(e.name).toBe('OrbitError');
    expect(e.message).toBe('boom');
    expect(e).toBeInstanceOf(Error);
  });

  it('HttpException stores status code and serializes via toResponse()', async () => {
    const e = new HttpException(418, "I'm a teapot");
    expect(e.statusCode).toBe(418);
    const res = e.toResponse();
    expect(res.status).toBe(418);
    expect(await res.json()).toEqual({ statusCode: 418, message: "I'm a teapot" });
  });

  it('HttpException includes details when provided', async () => {
    const e = new HttpException(400, 'Bad', { field: 'name' });
    const body = await e.toResponse().json();
    expect(body).toEqual({ statusCode: 400, message: 'Bad', details: { field: 'name' } });
  });

  it('NotFoundException defaults to 404', () => {
    const e = new NotFoundException();
    expect(e.statusCode).toBe(404);
    expect(e.message).toBe('Not Found');
  });

  it('BadRequestException default + details', async () => {
    const e = new BadRequestException('No', [{ field: 'x' }]);
    const body = await e.toResponse().json();
    expect(body.statusCode).toBe(400);
    expect(body.details).toEqual([{ field: 'x' }]);
  });

  it('UnauthorizedException is 401', () => {
    expect(new UnauthorizedException().statusCode).toBe(401);
  });

  it('ForbiddenException is 403', () => {
    expect(new ForbiddenException().statusCode).toBe(403);
  });

  it('ConflictException is 409', () => {
    expect(new ConflictException().statusCode).toBe(409);
  });

  it('InternalServerErrorException is 500', () => {
    expect(new InternalServerErrorException().statusCode).toBe(500);
  });

  it('ActorError carries actorName and actorId', () => {
    const e = new ActorError('handler failed', 'Page', 'p-1');
    expect(e.actorName).toBe('Page');
    expect(e.actorId).toBe('p-1');
    expect(e).toBeInstanceOf(OrbitError);
  });
});
