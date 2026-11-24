import type { AccessTokenClaims } from '../modules/auth/tokens';

// Teaches TypeScript about the property the authenticate middleware adds to every request.
declare global {
  namespace Express {
    interface Request {
      /** Who is calling. Set by middleware/authenticate.ts; undefined on public routes. */
      auth?: AccessTokenClaims;
    }
  }
}

export {};
