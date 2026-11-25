import { createHash } from 'node:crypto';
import { Conversation, RateBucket, Turn, User } from './models.js';
import { instructions } from './ai.js';
import { HttpError, message, objectId, parse } from './validation.js';

export function publicConversation(record) {
  return { id: String(record._id), title: record.title, titled: record.titled, category: record.category, updatedAt: record.updatedAt };
}

export function publicTurn(record) {
  return {
    id: String(record._id), conversationId: String(record.conversation), requestId: record.requestId,
    input: record.input, answer: record.answer || '', status: record.status, error: record.error,
    rating: record.rating, feedback: record.feedback, createdAt: record.createdAt, updatedAt: record.updatedAt
  };
}

export async function ownConversation(owner, value) {
  const record = await Conversation.findOne({ _id: parse(objectId, value), owner }).lean();
  if (!record) throw new HttpError(404, 'Conversation not found.');
  return record;
}

export function expireTurns(conversation) {
  return Turn.updateMany({ conversation, status: 'pending', leasedUntil: { $lte: new Date() } }, {
    $set: { status: 'failed', error: 'The response was interrupted. Try again.' }, $unset: { leasedUntil: 1 }
  });
}

async function consumeQuota(scope, limit, minute) {
  const _id = `${scope}:${minute}`;
  try {
    const result = await RateBucket.updateOne({ _id, count: { $lt: limit } }, {
      $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((minute + 2) * 60000) }
    }, { upsert: true, setDefaultsOnInsert: false });
    return Boolean(result.matchedCount || result.upsertedCount);
  } catch (error) {
    if (error.code !== 11000) throw error;
    const result = await RateBucket.updateOne({ _id, count: { $lt: limit } }, { $inc: { count: 1 } });
    return Boolean(result.matchedCount);
  }
}

export function createChat({ config, generate, publish }) {
  const cache = new Map();

  async function respond(owner, payload) {
    const { conversationId, requestId, text } = parse(message, payload);
    const conversation = await ownConversation(owner, conversationId);
    const key = { conversation: conversation._id, requestId };
    await expireTurns(conversation._id);
    const previous = await Turn.findOne(key).lean();
    if (previous && previous.input !== text) throw new HttpError(409, 'This request ID belongs to another message.');
    if (previous?.status === 'complete' || previous?.status === 'pending') return publicTurn(previous);

    const minute = Math.floor(Date.now() / 60000);
    if (!await consumeQuota(owner, config.userLimit, minute) || !await consumeQuota('global', config.globalLimit, minute)) {
      throw new HttpError(429, 'The message limit was reached. Please try again in a minute.');
    }

    const newState = { status: 'pending', leasedUntil: new Date(Date.now() + 60000) };
    let turn;
    try {
      turn = previous
        ? await Turn.findOneAndUpdate({ ...key, status: 'failed' }, { $set: newState, $unset: { error: 1 } }, { returnDocument: 'after' })
        : await Turn.create({ ...key, ...newState, owner, input: text });
    } catch (error) {
      if (error.code !== 11000) throw error;
    }
    if (!turn) {
      const duplicate = await Turn.findOne(key).lean();
      if (duplicate?.input === text) return publicTurn(duplicate);
      throw new HttpError(409, 'Wait for the current reply before sending another message.');
    }
    publish(owner, 'turn:update', publicTurn(turn));

    const start = performance.now();
    let result;
    try {
      const [user, history] = await Promise.all([
        User.findById(owner).select('settings').lean(),
        Turn.find({ conversation: conversation._id, _id: { $lt: turn._id }, status: 'complete' })
          .sort({ _id: -1 }).limit(10).select('input answer').lean()
      ]);
      if (!user) throw new Error('Account unavailable');
      const title = text.replace(/\s+/g, ' ').trim();
      const titleCharacters = Array.from(title);
      const newTitle = titleCharacters.length > 48 ? `${titleCharacters.slice(0, 47).join('')}…` : title;
      const changed = await Conversation.findOneAndUpdate({ _id: conversation._id, titled: false }, { title: newTitle, titled: true }, { returnDocument: 'after' });
      const record = changed || await Conversation.findByIdAndUpdate(conversation._id, { $currentDate: { updatedAt: true } }, { timestamps: false, returnDocument: 'after' });
      if (record) publish(owner, 'conversation:update', publicConversation(record));

      const context = [];
      let remaining = 18000;
      for (const entry of history) {
        remaining -= entry.input.length + entry.answer.length;
        if (remaining < 0) break;
        context.unshift({ role: 'user', content: entry.input }, { role: 'assistant', content: entry.answer });
      }
      const messages = [
        { role: 'system', content: instructions(user.settings.assistantName, conversation.category) },
        ...context,
        { role: 'user', content: text }
      ];
      const cacheKey = createHash('sha256').update(JSON.stringify([String(owner), config.ai.model, messages])).digest('hex');
      const hit = cache.get(cacheKey);
      const cached = Boolean(hit && hit.expiresAt > Date.now());
      let lastUpdate = 0;
      const answer = cached ? hit.answer : await generate(messages, (answerSoFar) => {
        if (performance.now() - lastUpdate < 90) return;
        lastUpdate = performance.now();
        publish(owner, 'turn:delta', { conversationId, requestId, answer: answerSoFar });
      });
      if (!cached) {
        cache.delete(cacheKey);
        cache.set(cacheKey, { answer, expiresAt: Date.now() + 10 * 60000 });
        if (cache.size > 300) cache.delete(cache.keys().next().value);
      }
      result = { status: 'complete', answer, cached };
    } catch (error) {
      console.error('Generation unavailable:', error.name, error.code || '');
      result = { status: 'failed', error: 'The assistant could not reply. Try again.' };
    }

    const saved = await Turn.findOneAndUpdate({ _id: turn._id, status: 'pending', leasedUntil: turn.leasedUntil }, {
      $set: { ...result, latencyMs: Math.round(performance.now() - start) }, $unset: { leasedUntil: 1 }
    }, { returnDocument: 'after' });
    if (!saved) throw new HttpError(409, 'This reply expired. Try again.');
    const data = publicTurn(saved);
    publish(owner, 'turn:update', data);
    return data;
  }

  return { respond };
}
