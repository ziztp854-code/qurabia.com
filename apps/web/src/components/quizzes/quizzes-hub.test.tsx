import { formatNumber } from '@/lib/utils';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { QuizzesHub } from './quizzes-hub';
import type { PublicQuiz } from '@/app/quizzes/actions';

const quizzes: PublicQuiz[] = [
  {
    id: '1',
    title: 'ليلة المعلومات',
    description: 'جولة عامة للمعرفة.',
    roomCode: 'ABC123',
    ownerName: 'عبدالعزيز بن سلطان العتيبي',
    ownerIsManager: true,
    ownerRoleLabel: 'المدير',
    questionCount: 12,
    createdAt: '2026-08-16T00:00:00.000Z',
  },
  {
    id: '2',
    title: 'شطرنج الملوك',
    description: null,
    roomCode: 'CHESS01',
    ownerName: 'سارة',
    ownerIsManager: false,
    ownerRoleLabel: null,
    questionCount: 8,
    createdAt: '2026-08-15T00:00:00.000Z',
  },
];

describe('QuizzesHub', () => {
  it('يعرض هوية موحّدة ومسارات واضحة دون تكرار الإنشاء', () => {
    render(<QuizzesHub quizzes={quizzes} />);

    expect(screen.getByRole('heading', { level: 1, name: 'المسابقات' })).toBeInTheDocument();
    expect(screen.getByText('مركز البطولات')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'أنشئ مسابقة' })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'انضم برمز' })).toHaveAttribute('href', '/join');
    expect(screen.getByRole('link', { name: /أدر البث/ })).toHaveAttribute('href', '/host');
    expect(screen.getByText('الأحدث')).toBeInTheDocument();
    expect(screen.queryByText('جارية الآن')).not.toBeInTheDocument();
  });

  it('يرتب المسابقات المفتوحة بشبكة متساوية ورمز غرفة', () => {
    render(<QuizzesHub quizzes={quizzes} />);

    expect(screen.getByRole('heading', { name: 'ليلة المعلومات' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /شارك الآن/ })).toHaveAttribute('href', '/join/ABC123');
    expect(screen.getByRole('link', { name: /شطرنج الملوك/ })).toHaveAttribute(
      'href',
      '/join/CHESS01',
    );
    const visibleQuizLinks = screen
      .getAllByRole('link')
      .filter((link) => /^\/join\/.+/.test(link.getAttribute('href') ?? ''));
    expect(visibleQuizLinks).toHaveLength(quizzes.length);
    expect(
      within(screen.getByRole('list')).getByText(formatNumber(quizzes.length)),
    ).toBeInTheDocument();
  });

  it('يعرض شارات المدير بجانب اسمه عند إنشاء المسابقة', () => {
    render(<QuizzesHub quizzes={quizzes} />);

    expect(screen.getAllByText('عبدالعزيز بن سلطان العتيبي').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('مدير موثّق').length).toBeGreaterThan(0);
    expect(screen.getAllByText('المدير').length).toBeGreaterThan(0);
    expect(screen.getAllByText('مدير موثّق').length).toBeGreaterThan(0);
    expect(screen.getByText('سارة')).toBeInTheDocument();
    expect(screen.queryByText('أدمن')).not.toBeInTheDocument();
  });

  it('يعرض حالة فارغة صادقة عند غياب المسابقات', () => {
    render(<QuizzesHub quizzes={[]} />);

    expect(screen.getByText('لا توجد مسابقات عامة منشورة بعد')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'جهّز أول مسابقة' })).toHaveAttribute(
      'href',
      '/quizzes/new',
    );
  });

  it('يوضح خطوات اللعب دون ادعاء أن المسابقات المنشورة جارية', () => {
    render(<QuizzesHub quizzes={quizzes} />);

    expect(
      screen.getByText('اختر مسابقة، أدخل اسمك، وانتظر بدء الجولة من المضيف.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('مفتوحة الآن')).not.toBeInTheDocument();
    expect(screen.queryByText('دخول فوري')).not.toBeInTheDocument();
  });

  it('يتيح إعادة التحميل عند الخطأ ولا يعرضه كصفر مسابقات', () => {
    render(<QuizzesHub quizzes={[]} loadError="تعذر الاتصال" />);

    expect(screen.getByText('تعذّر تحميل المسابقات العامة')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'أعد تحميل المسابقات' })).toHaveAttribute(
      'href',
      '/quizzes',
    );
    expect(within(screen.getByRole('list')).queryByText(formatNumber(0))).not.toBeInTheDocument();
  });
});
