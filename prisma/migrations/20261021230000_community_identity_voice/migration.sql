BEGIN;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "appearance" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "coverUrl" TEXT,
ADD COLUMN     "entranceEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "entranceSound" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "reduceEffects" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showCollection" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "showRooms" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "visibility" VARCHAR(12) NOT NULL DEFAULT 'PUBLIC',
ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- Existing profile usernames and stored avatars remain intact.
ALTER TABLE "Profile" ALTER COLUMN "username" TYPE VARCHAR(30);
ALTER TABLE "Profile" DROP CONSTRAINT "Profile_username_format";

-- CreateTable
CREATE TABLE "CommunityBadge" (
    "id" VARCHAR(80) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "rarity" VARCHAR(16) NOT NULL DEFAULT 'common',
    "assetUrl" TEXT,
    "sensitive" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "effectId" TEXT,
    "frameId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProfileCosmetic" (
    "id" VARCHAR(80) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" VARCHAR(500) NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "tier" VARCHAR(16) NOT NULL DEFAULT 'ordinary',
    "token" VARCHAR(20) NOT NULL DEFAULT 'neutral',
    "assetUrl" TEXT,
    "free" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileCosmetic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCosmetic" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cosmeticId" TEXT NOT NULL,
    "grantedBy" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserCosmetic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunityVoiceRoom" (
    "id" TEXT NOT NULL,
    "code" VARCHAR(9) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "imageUrl" TEXT,
    "ownerId" TEXT NOT NULL,
    "state" JSONB NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityVoiceRoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex

-- CreateIndex
CREATE INDEX "CommunityBadge_category_archived_idx" ON "CommunityBadge"("category", "archived");

-- CreateIndex
CREATE INDEX "UserBadge_userId_revokedAt_expiresAt_idx" ON "UserBadge"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");

-- CreateIndex
CREATE INDEX "ProfileCosmetic_kind_archived_idx" ON "ProfileCosmetic"("kind", "archived");

-- CreateIndex
CREATE INDEX "UserCosmetic_userId_revokedAt_expiresAt_idx" ON "UserCosmetic"("userId", "revokedAt", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserCosmetic_userId_cosmeticId_key" ON "UserCosmetic"("userId", "cosmeticId");

-- CreateIndex
CREATE UNIQUE INDEX "CommunityVoiceRoom_code_key" ON "CommunityVoiceRoom"("code");

-- CreateIndex
CREATE INDEX "CommunityVoiceRoom_status_updatedAt_idx" ON "CommunityVoiceRoom"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "CommunityVoiceRoom_ownerId_idx" ON "CommunityVoiceRoom"("ownerId");

-- AddForeignKey

-- AddForeignKey

-- AddForeignKey
ALTER TABLE "CommunityBadge" ADD CONSTRAINT "CommunityBadge_effectId_fkey" FOREIGN KEY ("effectId") REFERENCES "ProfileCosmetic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityBadge" ADD CONSTRAINT "CommunityBadge_frameId_fkey" FOREIGN KEY ("frameId") REFERENCES "ProfileCosmetic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "CommunityBadge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCosmetic" ADD CONSTRAINT "UserCosmetic_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCosmetic" ADD CONSTRAINT "UserCosmetic_cosmeticId_fkey" FOREIGN KEY ("cosmeticId") REFERENCES "ProfileCosmetic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunityVoiceRoom" ADD CONSTRAINT "CommunityVoiceRoom_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Structural constraints supplement server-side validation.
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_visibility_check" CHECK ("visibility" IN ('PUBLIC','MEMBERS','PRIVATE'));
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_xp_check" CHECK ("xp" >= 0);
ALTER TABLE "Profile" ADD CONSTRAINT "Profile_username_check" CHECK ("username" IS NULL OR "username" ~ '^[a-z0-9_]{3,30}$');
ALTER TABLE "CommunityBadge" ADD CONSTRAINT "CommunityBadge_category_check" CHECK ("category" IN ('ADMIN','DISTINCTION','ACHIEVEMENT','COMMUNITY'));
ALTER TABLE "CommunityBadge" ADD CONSTRAINT "CommunityBadge_rarity_check" CHECK ("rarity" IN ('common','rare','epic','legendary'));
ALTER TABLE "ProfileCosmetic" ADD CONSTRAINT "ProfileCosmetic_kind_check" CHECK ("kind" IN ('FRAME','EFFECT','NAME_CARD','BACKGROUND','GLOW'));
ALTER TABLE "ProfileCosmetic" ADD CONSTRAINT "ProfileCosmetic_tier_check" CHECK ("tier" IN ('ordinary','silver','gold','diamond','royal','legend'));
ALTER TABLE "ProfileCosmetic" ADD CONSTRAINT "ProfileCosmetic_token_check" CHECK ("token" IN ('neutral','silver','gold','diamond','royal','legend'));

-- Reviewed CSS effect catalog: these tiers never execute uploaded scripts.
INSERT INTO "ProfileCosmetic" (id,name,description,kind,tier,token,free,"updatedAt") VALUES
('entrance-ordinary','دخول هادئ','ظهور خفيف يحافظ على وضوح الغرفة.','EFFECT','ordinary','neutral',true,CURRENT_TIMESTAMP),
('entrance-silver','الدخول الفضي','بطاقة فضية قصيرة عند دخول الغرفة.','EFFECT','silver','silver',false,CURRENT_TIMESTAMP),
('entrance-gold','الدخول الذهبي','ومضة ذهبية وبطاقة دخول أنيقة.','EFFECT','gold','gold',false,CURRENT_TIMESTAMP),
('entrance-diamond','الدخول الماسي','إضاءة بلورية زرقاء وبنفسجية.','EFFECT','diamond','diamond',false,CURRENT_TIMESTAMP),
('entrance-royal','الدخول الملكي','بوابة وتاج ذهبيان دون حجب أدوات الصوت.','EFFECT','royal','royal',false,CURRENT_TIMESTAMP),
('entrance-legend','دخول الأسطورة','هالة متدرجة مميزة وخفيفة.','EFFECT','legend','legend',false,CURRENT_TIMESTAMP),
('frame-neutral','إطار هادئ','الإطار الأساسي المتاح للجميع.','FRAME','ordinary','neutral',true,CURRENT_TIMESTAMP),
('frame-silver','إطار فضي','إطار فضي للمقتنيات الممنوحة.','FRAME','silver','silver',false,CURRENT_TIMESTAMP),
('frame-gold','إطار ذهبي','إطار ذهبي للمقتنيات الممنوحة.','FRAME','gold','gold',false,CURRENT_TIMESTAMP),
('frame-diamond','إطار ماسي','إطار بلوري للمقتنيات الممنوحة.','FRAME','diamond','diamond',false,CURRENT_TIMESTAMP),
('frame-royal','إطار ملكي','إطار ملكي لحسابات الهوية المميزة.','FRAME','royal','royal',false,CURRENT_TIMESTAMP),
('frame-legend','إطار الأسطورة','إطار الأسطورة للمقتنيات الممنوحة.','FRAME','legend','legend',false,CURRENT_TIMESTAMP),
('name-card-gold','بطاقة الاسم الذهبية','بطاقة اسم تزيينية لا تمنح أي صلاحيات.','NAME_CARD','gold','gold',false,CURRENT_TIMESTAMP),
('background-royal','خلفية البلاط','خلفية زخرفية داكنة للبروفايل.','BACKGROUND','royal','royal',false,CURRENT_TIMESTAMP),
('glow-silver','إضاءة فضية','إضاءة محيطية هادئة للصورة.','GLOW','silver','silver',false,CURRENT_TIMESTAMP),
('glow-gold','إضاءة ذهبية','إضاءة محيطية ذهبية للصورة.','GLOW','gold','gold',false,CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

INSERT INTO "CommunityBadge" (id,name,description,category,rarity,"assetUrl",sensitive,"effectId","frameId","updatedAt") VALUES
('platform-founder','مؤسس المنصة','تُمنح للحساب الموثق بصفته مالك المنصة؛ العرض لا يمنح صلاحيات.','ADMIN','legendary','/profile/badge-owner.png',true,'entrance-royal','frame-royal',CURRENT_TIMESTAMP),
('general-manager','المدير العام','تمنحها الإدارة العليا للحسابات المخولة؛ الصلاحيات مستقلة عن الشارة.','ADMIN','epic','/profile/badge-verified.png',true,'entrance-gold','frame-gold',CURRENT_TIMESTAMP),
('platform-moderator','مشرف المنصة','تمنحها الإدارة العليا للمشرف المعتمد.','ADMIN','rare',NULL,true,'entrance-silver','frame-silver',CURRENT_TIMESTAMP),
('room-moderator','مشرف الغرفة','شارة عرض يمنحها المدير العام؛ إدارة المقعد تتحقق من دور الغرفة الفعلي.','ADMIN','rare',NULL,true,NULL,NULL,CURRENT_TIMESTAMP),
('diamond-member','العضو الماسي','منحة تميز مراجعة من الإدارة.','DISTINCTION','epic',NULL,false,'entrance-diamond','frame-diamond',CURRENT_TIMESTAMP),
('gold-member','العضو الذهبي','منحة تميز مراجعة من الإدارة.','DISTINCTION','rare',NULL,false,'entrance-gold','frame-gold',CURRENT_TIMESTAMP),
('royal-member','العضو الملكي','منحة هوية ملكية؛ لا تمنح أفضلية في اللعب.','DISTINCTION','legendary',NULL,false,'entrance-royal','frame-royal',CURRENT_TIMESTAMP),
('elite-member','عضو النخبة','تمنح بناءً على مراجعة مساهمات العضو.','DISTINCTION','epic',NULL,false,'entrance-silver','frame-silver',CURRENT_TIMESTAMP),
('vip-member','عضو VIP','منحة هوية خاصة موثقة من الإدارة.','DISTINCTION','rare',NULL,false,'entrance-gold','frame-gold',CURRENT_TIMESTAMP),
('challenge-champion','بطل التحديات','تمنح بعد مراجعة نتيجة تحدٍ موثقة.','ACHIEVEMENT','rare',NULL,false,NULL,NULL,CURRENT_TIMESTAMP),
('weekly-leader','المتصدر الأسبوعي','تمنح بعد التحقق من صدارة أسبوع موثق.','ACHIEVEMENT','epic',NULL,false,'entrance-gold',NULL,CURRENT_TIMESTAMP),
('tournament-winner','الفائز بالبطولات','تمنح بعد مراجعة فوز بطولة موثقة.','ACHIEVEMENT','legendary',NULL,false,'entrance-legend','frame-legend',CURRENT_TIMESTAMP),
('achievement-holder','صاحب الإنجازات','تمنح بعد مراجعة إنجازات حقيقية.','ACHIEVEMENT','rare',NULL,false,NULL,NULL,CURRENT_TIMESTAMP),
('distinguished-member','العضو المميز','تمنح لمشاركة مميزة راجعتها الإدارة.','ACHIEVEMENT','common',NULL,false,NULL,NULL,CURRENT_TIMESTAMP),
('content-creator','صانع المحتوى','تمنح بعد مراجعة محتوى العضو.','COMMUNITY','rare','/profile/badge-builder.png',false,NULL,NULL,CURRENT_TIMESTAMP),
('distinguished-host','المضيف المميز','تمنح بعد مراجعة استضافة غرف ناجحة.','COMMUNITY','rare',NULL,false,'entrance-silver',NULL,CURRENT_TIMESTAMP),
('supporter','الداعم','تمنح لمساهمة موثقة في المجتمع.','COMMUNITY','common',NULL,false,NULL,NULL,CURRENT_TIMESTAMP),
('veteran-member','العضو القديم','تمنح بعد التحقق من تاريخ انضمام العضو.','COMMUNITY','common',NULL,false,NULL,NULL,CURRENT_TIMESTAMP)
ON CONFLICT (id) DO NOTHING;

-- Existing role authority proves only the founder award; no achievements are invented.
INSERT INTO "UserBadge" (id,"userId","badgeId","grantedBy","grantedAt")
SELECT 'founder-' || id,id,'platform-founder',id,CURRENT_TIMESTAMP FROM "User" WHERE role::text='OWNER'
ON CONFLICT ("userId","badgeId") DO NOTHING;

INSERT INTO "AuditLog" (id,"actorId","actorRole",action,"resourceType","resourceId","targetUserId",result,"after")
SELECT 'founder-audit-' || id,id,'OWNER','community.grantBadge','COMMUNITY','platform-founder',id,'SUCCESS','{"source":"owner-role-migration"}'::jsonb
FROM "User" WHERE role::text='OWNER'
ON CONFLICT (id) DO NOTHING;

COMMIT;
