import type Redis from 'ioredis';

let redisCloseRejectionHandlerInstalled = false;

export function isClosedConnectionError(error: unknown) {
  return (
    error instanceof Error && error.message.includes('Connection is closed')
  );
}

export function handleRedisCloseRejection(reason: unknown, label: string) {
  if (!isClosedConnectionError(reason)) return false;

  console.warn(`[${label}] Ignored Redis close rejection during shutdown.`);
  return true;
}

export function installRedisCloseRejectionHandler(label: string) {
  if (redisCloseRejectionHandlerInstalled) return;
  redisCloseRejectionHandlerInstalled = true;

  process.on('unhandledRejection', (reason) => {
    if (handleRedisCloseRejection(reason, label)) return;

    console.error(
      '[Unhandled Rejection]',
      reason instanceof Error ? reason.message : reason,
    );
  });
}

export async function closeRedisClient(
  client: Redis | undefined,
  label: string,
) {
  if (!client || client.status === 'end') return;

  try {
    if (client.status !== 'ready') {
      client.disconnect(false);
      return;
    }

    await client.quit();
  } catch (error) {
    client.disconnect(false);
    if (!isClosedConnectionError(error)) {
      console.error(
        `[${label}] Redis shutdown error:`,
        error instanceof Error ? error.message : error,
      );
    }
  }
}
