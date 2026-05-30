import {
  Resource, Post, Body, Inject, ENV_TOKEN,
  BadRequestException,
} from '@orbit/app';
import type { Session } from './types.js';

interface Env {
  SESSIONS: KVNamespace;
}

/**
 * Passwordless dev login. Mints a session token, writes
 * `session:<token>` → {userId, displayName} into the SESSIONS KV,
 * and returns the token. Suitable for local development; production
 * apps should plug in their real auth provider here.
 */
@Resource('/auth')
export class AuthController {
  constructor(@Inject(ENV_TOKEN) private env: Env) {}

  @Post('/login')
  async login(
    @Body() body: { displayName?: string; userId?: string },
  ): Promise<{ token: string; session: Session }> {
    const displayName = (body.displayName ?? '').trim();
    if (!displayName) throw new BadRequestException('displayName is required');

    const userId = (body.userId ?? slugify(displayName)) || crypto.randomUUID();
    const session: Session = { userId, displayName };
    const token = crypto.randomUUID().replace(/-/g, '');

    await this.env.SESSIONS.put(`session:${token}`, JSON.stringify(session), {
      expirationTtl: 60 * 60 * 24 * 30,
    });

    return { token, session };
  }
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
