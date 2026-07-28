import passport from "passport";
import { Strategy as JwtStrategy, ExtractJwt } from "passport-jwt";
import { env } from "./env.js";

/**
 * Configures Passport's JWT strategy. Extracts the token from the
 * Authorization header ("Bearer <token>"), verifies its signature against
 * JWT_SECRET, and passes the decoded payload (containing the wallet
 * address as `sub`) to downstream middleware via req.user.
 *
 * Deliberately does NOT check on-chain identity status here — that's a
 * separate concern handled by requireActiveIdentity middleware, since not
 * every authenticated route needs an active identity (e.g. checking your
 * own pending registration status).
 */
passport.use(
  new JwtStrategy(
    {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: env.JWT_SECRET,
    },
    (payload: { sub: string }, done) => {
      if (!payload?.sub) {
        return done(null, false);
      }
      return done(null, { address: payload.sub });
    }
  )
);

export default passport;
