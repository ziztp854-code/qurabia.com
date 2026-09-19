-- =====================================================================
-- 📊 استعلام التقرير النهائي الموحد
-- شغّل هذا الاستعلام في Supabase SQL Editor لرؤية النتيجة كاملة
-- =====================================================================

-- ملخص الأرقام الرئيسية
SELECT
  'الإجماليات الرئيسية' AS القسم,
  jsonb_build_object(
    'الأسئلة_قبل', (SELECT total FROM "_CurationReport" WHERE phase='before'),
    'الأسئلة_بعد', (SELECT total FROM "_CurationReport" WHERE phase='after'),
    'الأسئلة_المنشورة_قبل', (SELECT published FROM "_CurationReport" WHERE phase='before'),
    'الأسئلة_المنشورة_بعد', (SELECT published FROM "_CurationReport" WHERE phase='after'),
    'الأسئلة_المؤرشفة_قبل', (SELECT archived FROM "_CurationReport" WHERE phase='before'),
    'الأسئلة_المؤرشفة_بعد', (SELECT archived FROM "_CurationReport" WHERE phase='after'),
    'الأسئلة_الجديدة_المضافة', (SELECT "newQuestionsAdded" FROM "_CurationReport" WHERE phase='after'),
    'الأسئلة_المؤرشفة_في_الجولة', (SELECT "archivedByThisRun" FROM "_CurationReport" WHERE phase='after')
  ) AS البيانات
UNION ALL
SELECT
  'الفئات_الإشكالية_المتبقية' AS القسم,
  COALESCE((SELECT "problematicCategories" FROM "_CurationReport" WHERE phase='after'), '[]'::jsonb)
UNION ALL
SELECT
  'توزيع_المجالات_بعد' AS القسم,
  (SELECT "byDomain" FROM "_CurationReport" WHERE phase='after')
UNION ALL
SELECT
  'توزيع_الأنماط_بعد' AS القسم,
  (SELECT "byPattern" FROM "_CurationReport" WHERE phase='after')
UNION ALL
SELECT
  'توزيع_الفئات_بعد' AS القسم,
  (SELECT "byCategory" FROM "_CurationReport" WHERE phase='after');
