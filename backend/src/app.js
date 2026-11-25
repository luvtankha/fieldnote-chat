import { createServer } from 'node:http';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import mongoose from 'mongoose';
import { Server } from 'socket.io';
import { createGenerator } from './ai.js';
import { makeAuth, publicUser } from './auth.js';
import { createChat, expireTurns, ownConversation, publicConversation, publicTurn } from './chat.js';
import { Conversation, Session, Turn, User } from './models.js';
import { conversation, errorPayload, HttpError, objectId, pagination, parse, rating, settings } from './validation.js';

const userRoom = (owner) => `user:${owner}`;
const sessionRoom = (id) => `session:${id}`;
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createApp(config, generate = createGenerator(config.ai)) {
  const app = express();
  const server = createServer(app);
  const io = new Server(server, {
    transports: ['websocket'], maxHttpBufferSize: 24000, serveClient: false,
    allowRequest: (req, accept) => accept(null, config.origins.has(req.headers.origin))
  });
  const auth = makeAuth(config);
  const publish = (owner, event, data) => io.to(userRoom(owner)).emit(event, data);
  const chat = createChat({ config, generate, publish });
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);
  app.use(helmet());
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use('/api', cors({ origin: (origin, done) => done(null, config.origins.has(origin)), credentials: true }));
  app.use('/api', (req, _res, next) => {
    const origin = req.get('Origin');
    if ((!safeMethods.has(req.method) || origin) && !config.origins.has(origin)) throw new HttpError(403, 'This origin is not allowed.');
    next();
  });
  app.use('/api', express.json({ limit: '24kb' }), cookieParser());

  const authLimit = rateLimit({
    windowMs: 15 * 60000, limit: 35, standardHeaders: 'draft-8', legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    handler: (_req, res) => res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' })
  });

  app.get('/api/health', (_req, res) => {
    const ready = mongoose.connection.readyState === 1;
    res.status(ready ? 200 : 503).json({ status: ready ? 'ok' : 'unavailable' });
  });
  app.post('/api/auth/signup', authLimit, auth.signup);
  app.post('/api/auth/login', authLimit, auth.login);
  app.post('/api/auth/logout', (req, res) => auth.logout(req, res, (id) => io.in(sessionRoom(id)).disconnectSockets(true)));
  app.use('/api', auth.guard);

  app.get('/api/me', async (req, res) => {
    const user = await User.findById(req.session.user);
    if (!user) throw new HttpError(401, 'Please sign in again.');
    res.json({ user: publicUser(user) });
  });
  app.patch('/api/me/settings', async (req, res) => {
    const user = await User.findByIdAndUpdate(req.session.user, { settings: parse(settings, req.body) }, { returnDocument: 'after' });
    if (!user) throw new HttpError(401, 'Please sign in again.');
    res.json({ user: publicUser(user) });
  });
  app.get('/api/socket-token', (req, res) => res.json({ token: auth.socketToken(req.session) }));

  app.get('/api/conversations', async (req, res) => {
    const { before, limit } = parse(pagination, req.query);
    const filter = { owner: req.session.user };
    if (before) {
      const [date, id, extra] = before.split('~');
      const updatedAt = new Date(date);
      if (extra !== undefined || !Number.isFinite(updatedAt.getTime())) throw new HttpError(400, 'Invalid conversation cursor.');
      filter.$or = [{ updatedAt: { $lt: updatedAt } }, { updatedAt, _id: { $lt: parse(objectId, id) } }];
    }
    const found = await Conversation.find(filter).sort({ updatedAt: -1, _id: -1 }).limit(limit + 1).lean();
    const items = found.slice(0, limit).map(publicConversation);
    const last = items.at(-1);
    res.json({ items, nextCursor: found.length > limit ? `${last.updatedAt.toISOString()}~${last.id}` : null });
  });
  app.post('/api/conversations', async (req, res) => {
    const { category } = parse(conversation, req.body);
    const record = await Conversation.create({ owner: req.session.user, category, title: 'New chat' });
    const data = publicConversation(record);
    publish(req.session.user, 'conversation:update', data);
    res.status(201).json(data);
  });
  app.get('/api/conversations/:id', async (req, res) => {
    const record = await ownConversation(req.session.user, req.params.id);
    const { before, limit } = parse(pagination, req.query);
    await expireTurns(record._id);
    const filter = { conversation: record._id };
    if (before) filter._id = { $lt: parse(objectId, before) };
    const found = await Turn.find(filter).sort({ _id: -1 }).limit(limit + 1).lean();
    const items = found.slice(0, limit).reverse().map(publicTurn);
    res.json({ conversation: publicConversation(record), items, nextCursor: found.length > limit ? items[0].id : null });
  });
  app.post('/api/messages', async (req, res) => {
    const result = await chat.respond(req.session.user, req.body);
    res.status(result.status === 'pending' ? 202 : result.status === 'failed' ? 502 : 200).json(result);
  });
  app.patch('/api/messages/:id/feedback', async (req, res) => {
    const record = await Turn.findOneAndUpdate({ _id: parse(objectId, req.params.id), owner: req.session.user, status: 'complete' },
      parse(rating, req.body), { returnDocument: 'after' });
    if (!record) throw new HttpError(404, 'Reply not found.');
    const data = publicTurn(record);
    publish(req.session.user, 'turn:update', data);
    res.json(data);
  });

  app.get('/api/admin/analytics', async (req, res) => {
    const admin = await User.exists({ _id: req.session.user, role: 'admin' });
    if (!admin) throw new HttpError(403, 'Administrator access is required.');
    const days = Number(req.query.days ?? 7);
    if (![7, 30, 90].includes(days)) throw new HttpError(400, 'Choose 7, 30 or 90 days.');
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - days + 1);
    const [users, newUsers, chats, [usage]] = await Promise.all([
      User.countDocuments(), User.countDocuments({ createdAt: { $gte: since } }),
      Conversation.countDocuments({ createdAt: { $gte: since } }),
      Turn.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $facet: {
          totals: [{ $group: {
            _id: null, requests: { $sum: 1 },
            completed: { $sum: { $cond: [{ $eq: ['$status', 'complete'] }, 1, 0] } },
            failures: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
            cached: { $sum: { $cond: ['$cached', 1, 0] } },
            averageLatencyMs: { $avg: { $cond: [{ $and: [{ $eq: ['$status', 'complete'] }, { $ne: ['$cached', true] }] }, '$latencyMs', null] } },
            positive: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
            negative: { $sum: { $cond: [{ $eq: ['$rating', -1] }, 1, 0] } },
            feedbackCount: { $sum: { $cond: [{ $gt: [{ $strLenCP: { $ifNull: ['$feedback', ''] } }, 0] }, 1, 0] } }
          } }],
          active: [{ $group: { _id: '$owner' } }, { $count: 'users' }],
          daily: [{ $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, requests: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          feedback: [{ $match: { feedback: { $gt: '' } } }, { $sort: { updatedAt: -1 } }, { $limit: 20 }, { $project: { feedback: 1, rating: 1, updatedAt: 1 } }]
        } }
      ])
    ]);
    const { _id, ...totals } = usage.totals[0] || {};
    res.json({ days, users, newUsers, chats, activeUsers: usage.active[0]?.users || 0, totals, daily: usage.daily, feedback: usage.feedback });
  });

  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'Endpoint not found.')));
  app.use((error, _req, res, _next) => {
    const { status, ...body } = errorPayload(error);
    res.status(status).json(body);
  });

  io.use(async (socket, next) => {
    try {
      socket.data.session = await auth.identify(socket.handshake.auth.token, 'socket');
      next();
    } catch {
      next(new Error('Session unavailable.'));
    }
  });
  io.on('connection', (socket) => {
    const { _id, user, expiresAt } = socket.data.session;
    socket.join([userRoom(user), sessionRoom(_id)]);
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, expiresAt.getTime() - Date.now()));
    socket.once('disconnect', () => clearTimeout(expiry));
    socket.on('chat:send', async (payload, acknowledge) => {
      if (typeof acknowledge !== 'function') return;
      if (socket.data.sending) return acknowledge({ status: 409, error: 'Wait for the current reply.' });
      socket.data.sending = true;
      try {
        if (!await Session.exists({ _id, expiresAt: { $gt: new Date() } })) throw new HttpError(401, 'Please sign in again.');
        acknowledge({ turn: await chat.respond(user, payload) });
      } catch (error) {
        acknowledge(errorPayload(error));
      } finally {
        socket.data.sending = false;
      }
    });
  });
  return { app, server, io };
}
