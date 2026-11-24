import cookieParser from 'cookie-parser';
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { requireTrustedOrigin } from '../../middleware/require-trusted-origin';
import * as auth from './auth.controller';

/**
 * /api/v1/auth. Two kinds of credential:
 *   - the dc_rt cookie (refresh token): register, login and refresh set it; logout uses it.
 *     Cookies are sent automatically by browsers, so these routes check the Origin (CSRF).
 *   - the access token (Authorization header): logout-all and me.
 */
export const authRouter = Router();

// Fills req.cookies. Mounted here only: no other route reads cookies (the cookie's Path is
// /api/v1/auth anyway, so browsers send it nowhere else).
authRouter.use(cookieParser());

authRouter.post('/register', requireTrustedOrigin, auth.register);
authRouter.post('/login', requireTrustedOrigin, auth.login);
authRouter.post('/refresh', requireTrustedOrigin, auth.refresh);
authRouter.post('/logout', requireTrustedOrigin, auth.logout);
authRouter.post('/logout-all', authenticate, auth.logoutAll);
authRouter.get('/me', authenticate, auth.me);
