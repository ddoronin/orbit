import {
  Resource,
  Post,
  Body,
  Inject,
  KV_TOKEN,
  BadRequestException,
  InternalServerErrorException,
} from "@orbitstack/app";
import type { Session } from "./types.js";

/**
 * Passwordless dev login. Mints a session token, writes
 * `session:<token>` → {userId, displayName} into the ORBIT_NOTION_SESSIONS KV,
 * and returns the token. Suitable for local development; production
 * apps should plug in their real auth provider here.
 */
@Resource("/auth")
export class AuthController {
  constructor(@Inject(KV_TOKEN) private sessions: KVNamespace | undefined) {}

  @Post("/login")
  async login(
    @Body() body: { displayName?: string; userId?: string },
  ): Promise<{ token: string; session: Session }> {
    const displayName = (body.displayName ?? "").trim();
    if (!displayName) throw new BadRequestException("displayName is required");

    const userId = (body.userId ?? slugify(displayName)) || crypto.randomUUID();
    const session: Session = { userId, displayName };
    const token = crypto.randomUUID().replace(/-/g, "");

    if (!this.sessions) {
      throw new InternalServerErrorException(
        "No KV binding configured for sessions",
      );
    }

    await this.sessions.put(`session:${token}`, JSON.stringify(session), {
      expirationTtl: 60 * 60 * 24 * 30,
    });

    return { token, session };
  }
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
