export class RetryableMapRequestError extends Error {}

/** Transport outages do not revoke an already-authorized snapshot; its own expiry still does. */
export async function mapRequest(url: string, signal: AbortSignal): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (signal.aborted) throw error;
    if (error instanceof TypeError) throw new RetryableMapRequestError('Map network unavailable');
    throw error;
  }
  if (response.status === 429 || response.status >= 500)
    throw new RetryableMapRequestError('Map request temporarily unavailable');
  if (!response.ok) throw new Error('Map request unavailable');
  return response;
}
