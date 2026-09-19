import { isIP } from 'node:net';
import type { Socket } from 'socket.io';

export type LiveConnectionMetadata = {
  socketId: string;
  ipAddress: string | null;
  userAgent: string | null;
  deviceLabel: string;
};

type SocketHandshake = Pick<Socket, 'id' | 'handshake'>;

function firstHeader(value: string | string[] | undefined) {
  const first = Array.isArray(value) ? value[0] : value;
  return first?.split(',')[0]?.trim() || null;
}

function normalizeIp(value: string | null) {
  if (!value) return null;
  const unwrapped = value.startsWith('::ffff:') ? value.slice(7) : value;
  const withoutBrackets = unwrapped.replace(/^\[|\]$/g, '');
  return isIP(withoutBrackets) ? withoutBrackets : null;
}

function sanitizeUserAgent(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const sanitized = Array.from(raw ?? '')
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join('');
  return sanitized.trim().slice(0, 512) || null;
}

export function describeDevice(userAgent: string | null) {
  if (!userAgent) return 'جهاز غير معروف';

  const browser = /Edg\//i.test(userAgent)
    ? 'Edge'
    : /Firefox\//i.test(userAgent)
      ? 'Firefox'
      : /(?:Chrome|CriOS)\//i.test(userAgent)
        ? 'Chrome'
        : /Safari\//i.test(userAgent)
          ? 'Safari'
          : 'متصفح غير معروف';
  const operatingSystem = /Android/i.test(userAgent)
    ? 'Android'
    : /(?:iPhone|iPad|iPod)/i.test(userAgent)
      ? 'iOS'
      : /Windows/i.test(userAgent)
        ? 'Windows'
        : /Mac OS X/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : 'نظام غير معروف';
  const formFactor = /(?:iPad|Tablet)/i.test(userAgent)
    ? 'جهاز لوحي'
    : /(?:Mobile|Android|iPhone|iPod)/i.test(userAgent)
      ? 'جوال'
      : 'جهاز مكتبي';

  return `${browser} على ${operatingSystem} (${formFactor})`.slice(0, 120);
}

export function getLiveConnectionMetadata(
  client: SocketHandshake,
): LiveConnectionMetadata {
  const headers = client.handshake.headers;
  const ipAddress = normalizeIp(
    firstHeader(headers['x-vercel-forwarded-for']) ??
      firstHeader(headers['cf-connecting-ip']) ??
      firstHeader(headers['x-forwarded-for']) ??
      client.handshake.address,
  );
  const userAgent = sanitizeUserAgent(headers['user-agent']);

  return {
    socketId: client.id.slice(0, 64),
    ipAddress,
    userAgent,
    deviceLabel: describeDevice(userAgent),
  };
}
