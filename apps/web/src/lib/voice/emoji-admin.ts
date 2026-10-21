import { getOptionalAdminConsoleUser } from '@/lib/auth/session';
import { hasPermission } from '@/lib/auth/authorization';
import { voiceRateLimit } from './identity';
import { VoiceHttpError } from './http';
export async function emojiAdmin() {
  const user = await getOptionalAdminConsoleUser();
  if (!user || !hasPermission(user.role, 'MANAGE_CONTENT'))
    throw new VoiceHttpError(403, 'إدارة الفيسات تتطلب صلاحية إدارة المحتوى.');
  await voiceRateLimit(user.id, true, 'emoji-admin');
  return user;
}
