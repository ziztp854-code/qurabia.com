import { requirePermission } from '@/lib/auth/session';
import { VoiceEmojiAdmin } from '@/components/voice/emoji-admin';
export default async function VoiceEmojiAdminPage() {
  await requirePermission('MANAGE_CONTENT', '/admin/voice-emojis');
  return <VoiceEmojiAdmin />;
}
