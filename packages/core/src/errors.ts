/**
 * Framework error types.
 */

export class OrbitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrbitError';
  }
}

export class HttpException extends OrbitError {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpException';
  }

  toResponse(): Response {
    return Response.json(
      {
        statusCode: this.statusCode,
        message: this.message,
        ...(this.details ? { details: this.details } : {}),
      },
      { status: this.statusCode },
    );
  }
}

export class NotFoundException extends HttpException {
  constructor(message = 'Not Found') {
    super(404, message);
    this.name = 'NotFoundException';
  }
}

export class BadRequestException extends HttpException {
  constructor(message = 'Bad Request', details?: unknown) {
    super(400, message, details);
    this.name = 'BadRequestException';
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = 'Unauthorized') {
    super(401, message);
    this.name = 'UnauthorizedException';
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = 'Forbidden') {
    super(403, message);
    this.name = 'ForbiddenException';
  }
}

export class ConflictException extends HttpException {
  constructor(message = 'Conflict') {
    super(409, message);
    this.name = 'ConflictException';
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(message = 'Internal Server Error') {
    super(500, message);
    this.name = 'InternalServerErrorException';
  }
}

export class ActorError extends OrbitError {
  constructor(
    message: string,
    public readonly actorName?: string,
    public readonly actorId?: string,
  ) {
    super(message);
    this.name = 'ActorError';
  }
}
