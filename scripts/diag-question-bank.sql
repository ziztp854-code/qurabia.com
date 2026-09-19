-- =====================================================================
-- 📋 الخطوة 1: تشخيص أسماء الجداول الفعلية
-- =====================================================================
-- شغّل هذا أولاً، وأرسل لي النتيجة، ثم أوفر لك سكربت التنفيذ.
-- =====================================================================

-- 1.1 قائمة كل الجداول في public schema
SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns c
   WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- 1.2 أعمدة جدول الأسئلة المحتمل (User أو users)
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND LOWER(table_name) IN ('user', 'users', 'question', 'questions',
                            'category', 'categories', 'questionoption', 'question_options')
ORDER BY table_name, ordinal_position;

-- 1.3 عيّنة من الأسئلة الحالية
SELECT id, prompt, status, "categoryId", "ownerId"
FROM "Question"
LIMIT 5;
