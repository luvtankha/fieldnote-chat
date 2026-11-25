export async function api(path, options = {}) {
  const { body, ...rest } = options;
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...rest,
      ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
      cache: 'no-store', signal: AbortSignal.timeout(59000)
    });
  } catch {
    throw new Error('The server could not be reached. Please try again.');
  }
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || 'The server is temporarily unavailable.');
    error.status = response.status;
    throw error;
  }
  return data;
}

export function pagePath(path, cursor) {
  return cursor ? `${path}?before=${encodeURIComponent(cursor)}` : path;
}
