-- NextAuth/Prisma owns authorization. These application tables are server-only.
-- No auth.uid() policies: NextAuth IDs are not Supabase Auth UUIDs.
-- Preserve table owner and service_role. Do not FORCE RLS.
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $hardening$
DECLARE
  target text;
  api_role text;
  targets text[] := ARRAY['AuditLog', 'Category', 'CommunityBadge', 'CommunityVoiceRoom', 'KingdomReportEntry', 'LadderQuestion', 'LadderRoom', 'LadderTeam', 'LiveAnswer', 'LiveParticipant', 'LiveParticipantConnection', 'LiveSession', 'MafiaAction', 'MafiaGame', 'MafiaMessage', 'MafiaParticipant', 'MafiaVote', 'ProfileCosmetic', 'QuestionTag', 'ScrambledWordsPuzzle', 'SubscriptionStamp', 'UsageCounter', 'UserBadge', 'UserCosmetic', 'UserSubscription', 'VoiceChatCommand', 'VoiceCover', 'VoiceDirectMessage', 'VoiceEmoji', 'VoiceEmojiPack', 'VoicePreference', 'VoiceReport', 'VoiceRoom', '_AnalysisSnapshot', '_CurationReport', '_prisma_migrations'];
  relation oid;
BEGIN
  FOREACH target IN ARRAY targets LOOP
    relation := to_regclass(format('public.%I', target));
    IF relation IS NULL OR NOT EXISTS (
      SELECT 1 FROM pg_class c WHERE c.oid = relation AND c.relkind = 'r'
      AND pg_get_userbyid(c.relowner) = 'postgres' AND NOT c.relforcerowsecurity
    ) THEN
      RAISE EXCEPTION 'Unexpected owner, type, forced RLS or missing table: %', target;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target);
    EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC', target);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM %I', target, api_role);
        IF has_table_privilege(api_role, relation, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          OR has_any_column_privilege(api_role, relation, 'SELECT,INSERT,UPDATE,REFERENCES') THEN
          RAISE EXCEPTION 'Client privileges remain for % on %', api_role, target;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $hardening$;
-- Prevent new Prisma-owned public tables from receiving default client grants.
-- Keep platform-managed owner defaults and service_role untouched.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL PRIVILEGES ON TABLES FROM anon, authenticated;
