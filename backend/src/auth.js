import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import jwt from 'jsonwebtoken';
import { Session, User } from './models.js';
import { HttpError, login, objectId, parse, signup } from './validation.js';

const scrypt = promisify(scryptCallback);
const saltForUnknownUser = randomBytes(16).toString('hex');
const sessionLifetime = 7 * 24 * 60 * 60 * 1000;
const issuer = 'fieldnote';

async function derivePassword(password, salt) {
  return scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.email, role: user.role, settings: user.settings };
}

export function makeAuth(config) {
  const { jwtSecret, production } = config;
  const cookieName = production ? '__Host-fieldnote' : 'fieldnote';
  const cookie = { httpOnly: true, sameSite: 'lax', secure: production, path: '/' };

  function sign(session, audience, expiresIn) {
    return jwt.sign({ sid: String(session._id) }, jwtSecret, {
      algorithm: 'HS256', issuer, audience, expiresIn, subject: String(session.user)
    });
  }

  async function identify(token, audience) {
    let claims;
    try {
      claims = jwt.verify(token, jwtSecret, { issuer, audience, algorithms: ['HS256'] });
      parse(objectId, claims.sub);
      parse(objectId, claims.sid);
    } catch {
      throw new HttpError(401, 'Please sign in again.');
    }
    const session = await Session.findOne({ _id: claims.sid, user: claims.sub, expiresAt: { $gt: new Date() } }).lean();
    if (!session) throw new HttpError(401, 'Please sign in again.');
    return session;
  }

  async function issue(res, user) {
    const session = await Session.create({ user: user._id, expiresAt: new Date(Date.now() + sessionLifetime) });
    res.cookie(cookieName, sign(session, 'web', '7d'), { ...cookie, maxAge: sessionLifetime });
    return publicUser(user);
  }

  return {
    identify,
    async guard(req, _res, next) {
      req.session = await identify(req.cookies[cookieName], 'web');
      next();
    },
    async signup(req, res) {
      const { name, email, password } = parse(signup, req.body);
      const salt = randomBytes(16).toString('hex');
      const key = await derivePassword(password, salt);
      let user;
      try {
        user = await User.create({ name, email, password: `${salt}:${key.toString('hex')}` });
      } catch (error) {
        if (error.code === 11000) throw new HttpError(409, 'An account already uses that email address.');
        throw error;
      }
      res.status(201).json({ user: await issue(res, user) });
    },
    async login(req, res) {
      const { email, password } = parse(login, req.body);
      const user = await User.findOne({ email }).select('+password');
      const [salt, digest] = user?.password.split(':') || [saltForUnknownUser, '00'.repeat(64)];
      const key = await derivePassword(password, salt);
      if (!timingSafeEqual(Buffer.from(digest, 'hex'), key) || !user) throw new HttpError(401, 'Email or password is incorrect.');
      res.json({ user: await issue(res, user) });
    },
    async logout(req, res, disconnect) {
      const session = await identify(req.cookies[cookieName], 'web').catch((error) => {
        if (error instanceof HttpError && error.status === 401) return null;
        throw error;
      });
      if (session) {
        await Session.deleteOne({ _id: session._id });
        disconnect(String(session._id));
      }
      res.clearCookie(cookieName, cookie).status(204).end();
    },
    socketToken(session) { return sign(session, 'socket', '2m'); }
  };
}
