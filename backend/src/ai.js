import OpenAI from 'openai';

const guides = {
  casual: 'Use a friendly, conversational tone and clear everyday language.',
  professional: 'Use a concise, practical tone. Provide structured, actionable information.',
  creative: 'Use an imaginative tone and offer varied, concrete ideas.'
};

export function instructions(name, category) {
  return `You are a helpful AI assistant. The user's preferred display name for you is ${JSON.stringify(name)}. `
    + `${guides[category]} Reply in the user's language when practical. Use Markdown when helpful. `
    + 'If you are unsure, say so. Never claim that you performed external actions.';
}

export function createGenerator(config) {
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: 35000, maxRetries: 0 });
  return async (messages, onDelta) => {
    const stream = await client.chat.completions.create({ model: config.model, messages, stream: true }, {
      signal: AbortSignal.timeout(45000)
    });
    let answer = '';
    for await (const part of stream) {
      const delta = part.choices[0]?.delta?.content;
      if (delta) {
        answer += delta;
        onDelta(answer);
        if (answer.length > 16000) {
          answer = answer.slice(0, 16000);
          break;
        }
      }
    }
    if (!answer.trim()) throw new Error('The AI returned an empty response.');
    return answer;
  };
}
