import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LiveDisplayExperience, LiveWaitingLobby } from './live-display-experience';

const question = {
  questionId: 'question-1',
  prompt: 'ما هي عاصمة المملكة العربية السعودية؟',
  options: [
    { id: 'a', text: 'الرياض', position: 0 },
    { id: 'b', text: 'جدة', position: 1 },
    { id: 'c', text: 'الدمام', position: 2 },
    { id: 'd', text: 'مكة المكرمة', position: 3 },
  ],
  media: [],
  questionStartedAt: Date.now(),
  questionEndsAt: Date.now() + 15_000,
  questionNumber: 5,
  totalQuestions: 15,
};

const leaderboard = [
  { id: 'p1', name: 'سارة عبدالله', score: 3_250, rank: 1, connected: true },
  { id: 'p2', name: 'عبدالعزيز محمد', score: 2_875, rank: 2, connected: true },
  { id: 'p3', name: 'محمد العتيبي', score: 2_410, rank: 3, connected: false },
];

const stats = {
  questionId: question.questionId,
  answeredCount: 4,
  participantCount: 6,
  options: question.options.map((option, index) => ({
    optionId: option.id,
    count: index === 0 ? 3 : index === 1 ? 1 : 0,
    percentage: index === 0 ? 75 : index === 1 ? 25 : 0,
  })),
};

describe('LiveDisplayExperience', () => {
  it('renders the waiting lobby with the real room access and contestants', () => {
    const { container } = render(
      <LiveWaitingLobby
        quizTitle="مسابقة الثقافة العامة"
        roomCode="123456"
        joinUrl="https://example.test/join/123456"
        participants={[
          { id: 'p1', name: 'سارة' },
          { id: 'p2', name: 'محمد' },
          { id: 'p3', name: 'نورة' },
        ]}
        totalQuestions={10}
        questionTimeLimit={30}
      />,
    );

    expect(screen.getByRole('heading', { name: 'قاعة الانتظار' })).toBeVisible();
    expect(screen.getByText('بانتظار بدء الجولة القادمة')).toBeVisible();
    expect(screen.getByText('شارك رمز الغرفة مع أصدقائك للانضمام')).toBeVisible();
    expect(screen.getByText('مسابقة الثقافة العامة')).toBeVisible();
    expect(screen.getAllByText('123456')).toHaveLength(2);
    expect(screen.getByLabelText('رمز QR للدخول إلى المسابقة')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'المتسابقون (3)' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'كيف تلعب؟' })).toBeVisible();
    expect(screen.getByText('سارة')).toBeVisible();
    expect(screen.getByText('محمد')).toBeVisible();
    expect(screen.getByText('نورة')).toBeVisible();
    expect(screen.getByText('استعد، ستبدأ الجولة قريبًا!')).toBeVisible();
    expect(container.querySelector('main.royal-lobby-main')).toBeInTheDocument();
    expect(container.querySelector('.royal-lobby-screen')).toBeInTheDocument();
    expect(container.querySelector('.royal-lobby-participants')).toBeInTheDocument();
    expect(container.querySelector('.competition-status-bar')).toBeInTheDocument();
  });

  it('renders a focused public question screen without host controls or room QR', () => {
    const { container } = render(
      <LiveDisplayExperience
        quizTitle="مسابقة الثقافة العامة"
        roomCode="ABC123"
        phase="QUESTION"
        question={question}
        reveal={null}
        stats={stats}
        leaderboard={leaderboard}
        questionType="اختيار من متعدد"
        roundStats={{ correctCount: 3, averageResponseTimeMs: 6_200 }}
      />,
    );

    expect(screen.getByLabelText('السؤال 5 من 15')).toBeVisible();
    expect(screen.getByLabelText('تحدّي — منصة التحديات الذكية')).toBeVisible();
    expect(screen.getByLabelText('6 متسابق')).toBeVisible();
    expect(screen.getByRole('heading', { name: question.prompt })).toBeVisible();
    expect(screen.getByText('أجاب 4 من 6 لاعبين')).toBeVisible();
    expect(screen.queryByText('رمز الغرفة')).not.toBeInTheDocument();
    expect(screen.queryByText('أدوات المضيف')).not.toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'ترتيب المتسابقين' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'الإجابات المباشرة' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'أفضل ثلاثة متسابقين' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'إحصائيات الجولة' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'حالة الجولة' })).toBeVisible();
    expect(screen.getByText('اختيار من متعدد')).toBeVisible();
    expect(screen.getAllByText('سارة عبدالله').length).toBeGreaterThan(0);
    expect(screen.queryByText(/الإجابة الصحيحة:/)).not.toBeInTheDocument();
    expect(screen.queryByText('إنهاء الجولة')).not.toBeInTheDocument();
    expect(screen.queryByText('تنبيهات النظام')).not.toBeInTheDocument();
    expect(container.querySelector('.royal-question-screen')).toBeInTheDocument();
    expect(container.querySelector('.competition-status-bar')).toBeInTheDocument();
    expect(container.querySelector('.royal-question-grid')).toBeInTheDocument();
    expect(container.querySelector('.royal-timer')).toBeInTheDocument();
    expect(container.querySelector('main')).not.toBeInTheDocument();
  });

  it('reveals the correct answer only after answers close', () => {
    const { container } = render(
      <LiveDisplayExperience
        quizTitle="مسابقة الثقافة العامة"
        roomCode="ABC123"
        phase="REVEAL"
        question={question}
        reveal={{
          questionId: question.questionId,
          correctOptionId: 'a',
          explanation: null,
          stats,
        }}
        stats={stats}
        leaderboard={leaderboard}
        questionType="اختيار من متعدد"
        roundStats={{ correctCount: 3, averageResponseTimeMs: 6_200 }}
      />,
    );

    expect(screen.getByText('الإجابة الصحيحة: الرياض')).toBeVisible();
    expect(container.querySelector('.royal-answer-option.is-correct')).toHaveTextContent('الرياض');
    expect(container.querySelectorAll('.royal-answer-option.is-correct')).toHaveLength(1);
  });

  it('handles empty, complete, disconnected, and long live states without fabricated fallbacks', () => {
    const longName = 'سارة عبدالله محمد العبدالله القحطاني';
    const longQuestion = {
      ...question,
      prompt:
        'في رحلة علمية طويلة لدراسة الكواكب، أي كوكب يُعرف باسم الكوكب الأحمر بسبب أكاسيد الحديد المنتشرة على سطحه؟',
    };
    const emptyStats = {
      ...stats,
      answeredCount: 0,
      options: stats.options.map((option) => ({ ...option, count: 0, percentage: 0 })),
    };
    const { rerender } = render(
      <LiveDisplayExperience
        quizTitle="مسابقة الثقافة العامة"
        roomCode="ABC123"
        phase="QUESTION"
        question={longQuestion}
        reveal={null}
        stats={emptyStats}
        leaderboard={[{ ...leaderboard[0], name: longName }, ...leaderboard.slice(1)]}
      />,
    );

    expect(screen.getByRole('heading', { name: longQuestion.prompt })).toBeVisible();
    expect(screen.getAllByText(longName).length).toBeGreaterThan(0);
    expect(screen.getByText('غير متصل')).toBeVisible();
    expect(screen.getByRole('img', { name: 'إجمالي الإجابات 0' })).toBeVisible();
    expect(screen.getByText('بانتظار بقية الإجابات')).toBeVisible();

    rerender(
      <LiveDisplayExperience
        quizTitle="مسابقة الثقافة العامة"
        roomCode="ABC123"
        phase="QUESTION"
        question={question}
        reveal={null}
        stats={{ ...stats, answeredCount: 6 }}
        leaderboard={leaderboard}
      />,
    );

    expect(screen.getByText('اكتملت جميع الإجابات')).toBeVisible();
  });
});
