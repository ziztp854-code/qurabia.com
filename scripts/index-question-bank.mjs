#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const defaultBackupPath = 'C:/tmp/qurabia-db-backups/questions-2026-08-15T21-50-11-475Z.json';
const filePath = process.argv[2] || defaultBackupPath;

if (!fs.existsSync(filePath)) {
  console.error(`❌ File not found at path: ${filePath}`);
  process.exit(1);
}

const raw = fs.readFileSync(filePath, 'utf8');
const backup = JSON.parse(raw);

const questions = backup.data?.Question || [];
const categories = backup.data?.Category || [];
const options = backup.data?.QuestionOption || [];

// Master domains mapping
const DOMAINS = {
  islamic: {
    name: 'ثقافة إسلامية ودين',
    icon: '🕌',
    categories: ['ثقافة إسلامية', 'تاريخ إسلامي'],
  },
  general: {
    name: 'ثقافة عامة ومعلومات',
    icon: '💡',
    categories: ['ثقافة عامة', 'معلومات عامة', 'تقويم', 'معالم عالمية', 'صح وخطأ', 'اختبار مؤقت'],
  },
  geography: {
    name: 'جغرافيا وعوالم',
    icon: '🌍',
    categories: ['جغرافيا', 'جغرافيا عربية', 'جغرافيا السعودية'],
  },
  history: {
    name: 'تاريخ وحضارات',
    icon: '🏛️',
    categories: [
      'تاريخ',
      'تاريخ السعودية',
      'تاريخ عالمي',
      'تاريخ العلوم',
      'تاريخ المعرفة',
      'تاريخ وجغرافيا',
      'تاريخ وثقافة',
    ],
  },
  science: {
    name: 'علوم وطبيعة',
    icon: '🔬',
    categories: ['علوم', 'فيزياء', 'كيمياء', 'أحياء', 'فضاء', 'علوم الأرض'],
  },
  literature: {
    name: 'لغة وأدب وشعر',
    icon: '📖',
    categories: [
      'أدب ولغة',
      'أدب',
      'أدب عربي',
      'لغة',
      'لغة عربية',
      'لغة وثقافة',
      'نحو',
      'بلاغة',
      'مفردات عربية',
      'حروف عربية',
    ],
  },
  sports: {
    name: 'رياضة وبطولات',
    icon: '⚽',
    categories: ['رياضة'],
  },
  logic: {
    name: 'رياضيات وتفكير منطقي',
    icon: '🧮',
    categories: [
      'رياضيات',
      'حساب ذهني',
      'جبر بسيط',
      'هندسة',
      'متتابعات',
      'منطق',
      'منطق ورياضيات',
      'منطق ترتيبي',
    ],
  },
  tech: {
    name: 'تقنية وبرمجة',
    icon: '💻',
    categories: ['ذكاء اصطناعي', 'أمن رقمي', 'تقنية وأمن', 'هندسة برمجيات', 'قواعد بيانات', 'شبكات'],
  },
};

const catToDomain = new Map();
for (const [key, d] of Object.entries(DOMAINS)) {
  for (const c of d.categories) {
    catToDomain.set(c, key);
  }
}

const catNameMap = new Map();
const catStats = new Map();
for (const c of categories) {
  catNameMap.set(c.id, c.name);
  catStats.set(c.name, { count: 0, easy: 0, medium: 0, hard: 0, mc: 0, tf: 0, published: 0, draft: 0 });
}

const domainStats = {};
for (const [key, d] of Object.entries(DOMAINS)) {
  domainStats[key] = {
    ...d,
    total: 0,
    easy: 0,
    medium: 0,
    hard: 0,
    mc: 0,
    tf: 0,
    published: 0,
    draft: 0,
    archived: 0,
    categoryBreakdown: {},
  };
}

for (const q of questions) {
  const catName = catNameMap.get(q.categoryId) || 'عام';
  const domainKey = catToDomain.get(catName) || 'general';
  const d = domainStats[domainKey];

  d.total++;
  if (q.difficulty === 'EASY') d.easy++;
  else if (q.difficulty === 'MEDIUM') d.medium++;
  else if (q.difficulty === 'HARD') d.hard++;

  if (q.type === 'MULTIPLE_CHOICE') d.mc++;
  else if (q.type === 'TRUE_FALSE') d.tf++;

  if (q.status === 'PUBLISHED') d.published++;
  else if (q.status === 'DRAFT') d.draft++;
  else if (q.status === 'ARCHIVED') d.archived++;

  d.categoryBreakdown[catName] = (d.categoryBreakdown[catName] || 0) + 1;

  if (catStats.has(catName)) {
    const cs = catStats.get(catName);
    cs.count++;
    if (q.difficulty === 'EASY') cs.easy++;
    else if (q.difficulty === 'MEDIUM') cs.medium++;
    else if (q.difficulty === 'HARD') cs.hard++;
    if (q.type === 'MULTIPLE_CHOICE') cs.mc++;
    else if (q.type === 'TRUE_FALSE') cs.tf++;
    if (q.status === 'PUBLISHED') cs.published++;
    else if (q.status === 'DRAFT') cs.draft++;
  }
}

console.log('══════════════════════════════════════════════════════════════════');
console.log('         🗂️  فهرس وبنك أسئلة منصة قرابية المركزي (Qurabia Bank)     ');
console.log('══════════════════════════════════════════════════════════════════');
console.log(`📦 إجمالي الأسئلة المفهرسة: ${questions.length.toLocaleString('ar-SA')} سؤال`);
console.log(`📑 إجمالي التصنيفات المعتمدة: ${categories.length.toLocaleString('ar-SA')} تصنيف`);
console.log(`🎯 إجمالي خيارات الإجابة: ${options.length.toLocaleString('ar-SA')} خيار`);
console.log('──────────────────────────────────────────────────────────────────\n');

for (const [key, d] of Object.entries(domainStats)) {
  const pct = ((d.total / questions.length) * 100).toFixed(1);
  console.log(`${d.icon} 【 ${d.name} 】 -> ${d.total.toLocaleString('ar-SA')} سؤال (${pct}%)`);
  console.log(`   ├─ تدرج الصعوبة : سهل: ${d.easy} | متوسط: ${d.medium} | صعب: ${d.hard}`);
  console.log(`   ├─ نمط السؤال  : اختيار متعدد: ${d.mc} | صح وخطأ: ${d.tf}`);
  console.log(`   ├─ حالة النشر  : منشور: ${d.published} | مسودة: ${d.draft} | مؤرشف: ${d.archived}`);
  const catList = Object.entries(d.categoryBreakdown)
    .sort((a, b) => b[1] - a[1])
    .map(([name, cnt]) => `${name}: ${cnt}`)
    .join('، ');
  console.log(`   └─ الفئات الفرعية: [ ${catList} ]\n`);
}
