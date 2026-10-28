import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatNumber } from '@/lib/utils';
import {
  COLOR_RUSH_BANK,
  INSTANT_GAME_META,
  INSTANT_GAME_ORDER,
  MEMORY_DIFFICULTIES,
  QUESTION_WORD_BANK,
  buildRiskDeck,
  RISK_PRESETS,
} from './game-data';
import { InstantGameRoom, MemoryFlash } from './instant-game-room';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('MemoryFlash', () => {
  it('starts the memory game with accessible symbols', async () => {
    render(<MemoryFlash />);

    fireEvent.click(screen.getByRole('button', { name: 'ابدأ التحدّي' }));

    expect(screen.getByRole('button', { name: 'برق' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'نجمة' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/المستوى 1/)).toBeInTheDocument());
  });

  it('escalates the memory sequence after a correct level', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<MemoryFlash />);

    fireEvent.click(screen.getByRole('button', { name: 'ابدأ التحدّي' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });
    fireEvent.click(screen.getByRole('button', { name: 'برق' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_200);
    });

    expect(screen.getByText(/المستوى 2/)).toBeInTheDocument();
  });

  it('locks the symbols while preparing the next level', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<MemoryFlash />);
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ التحدّي' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(900); });
    const symbol = screen.getByRole('button', { name: 'برق' });
    fireEvent.click(symbol);
    expect(symbol).toBeDisabled();
    expect(screen.getByText('استعد للمستوى التالي…')).toBeInTheDocument();
    fireEvent.click(symbol);
    fireEvent.click(screen.getByRole('button', { name: 'خروج' }));
    expect(localStorage.getItem('tahaddi.memory-flash.high-score.medium')).toBe('50');
  });

  it('reveals a growing sequence as one focused flash at a time', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<MemoryFlash />);

    fireEvent.click(screen.getByRole('button', { name: 'ابدأ التحدّي' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByLabelText('الومضة 1 من 1')).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    fireEvent.click(screen.getByRole('button', { name: 'برق' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(screen.getByLabelText('الومضة 1 من 2')).toBeVisible();
    expect(screen.getAllByTestId('memory-active-symbol')).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_100);
    });
    expect(screen.getByLabelText('الومضة 2 من 2')).toBeVisible();
    expect(screen.getAllByTestId('memory-active-symbol')).toHaveLength(1);
  });

  it('freezes the round clock during previews and while preparing the next level', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<MemoryFlash />);

    fireEvent.click(screen.getByRole('button', { name: 'ابدأ التحدّي' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(screen.getByLabelText('حالة اللعبة')).toHaveTextContent('الوقت 75');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    fireEvent.click(screen.getByRole('button', { name: 'برق' }));
    fireEvent.click(screen.getByRole('button', { name: 'إيقاف مؤقت' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByText(/المستوى 1/)).toBeInTheDocument();
    expect(screen.queryByLabelText('الومضة 1 من 2')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'استمرار' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(screen.getByLabelText('الومضة 1 من 2')).toBeVisible();
    expect(screen.getByLabelText('حالة اللعبة')).toHaveTextContent('الوقت 75');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByLabelText('حالة اللعبة')).toHaveTextContent('الوقت 75');
  });

  it('persists a new high score when the player exits manually', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<MemoryFlash />);

    fireEvent.click(screen.getByRole('button', { name: 'ابدأ التحدّي' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    fireEvent.click(screen.getByRole('button', { name: 'برق' }));
    fireEvent.click(screen.getByRole('button', { name: 'خروج' }));

    expect(localStorage.getItem('tahaddi.memory-flash.high-score.medium')).toBe('50');
    expect(screen.getByRole('heading', { name: 'رقم قياسي جديد!' })).toBeInTheDocument();
    expect(screen.getAllByText('50').length).toBeGreaterThan(0);
  });
});

describe('QuestionWord', () => {
  it('يدخل لاعبين ثم يعتمد الإجابات حسب ترتيب المنافسة', () => {
    render(<InstantGameRoom mode="question-word" />);

    expect(screen.getByRole('heading', { level: 1, name: 'كلمة وسؤال' })).toBeInTheDocument();
    expect(screen.getByText(/يتناوب اللاعبون على الجهاز نفسه/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'شاشة العرض في تبويب جديد' })).toHaveAttribute(
      'href',
      '/games/question-word/host',
    );
    expect(screen.getByRole('link', { name: 'بنك أسئلة اللعبة' })).toHaveAttribute(
      'href',
      '/questions?game=QUESTION_WORD',
    );
    expect(screen.getByRole('button', { name: 'ابدأ المنافسة' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('اسم اللاعب'), { target: { value: 'أحمد' } });
    fireEvent.click(screen.getByRole('button', { name: 'دخول' }));
    fireEvent.change(screen.getByLabelText('اسم اللاعب'), { target: { value: 'سارة' } });
    fireEvent.click(screen.getByRole('button', { name: 'دخول' }));
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ المنافسة' }));

    expect(screen.getByText(QUESTION_WORD_BANK[0].question)).toBeInTheDocument();
    const solve = () => {
      for (const letter of QUESTION_WORD_BANK[0].answer) {
        const button = screen
          .getAllByRole('button', { name: `اختر حرف ${letter}` })
          .find((candidate) => !candidate.hasAttribute('disabled'));
        expect(button).toBeDefined();
        fireEvent.click(button!);
      }
    };

    solve();
    expect(screen.getByText(/أحمد · المركز 1/)).toBeInTheDocument();
    expect(screen.getByText(/دور اللاعب سارة/)).toBeInTheDocument();

    solve();

    expect(screen.getByRole('heading', { name: 'ترتيب الجولة' })).toBeInTheDocument();
    expect(screen.getByText(/سارة · المركز 2/)).toBeInTheDocument();
    expect(screen.getByText('1,000 نقطة')).toBeInTheDocument();
    expect(screen.getByText('850 نقطة')).toBeInTheDocument();
  });
  it('accepts typed letters and backspace, then submits the completed word', () => {
    render(<InstantGameRoom mode="question-word" />);
    for (const name of ['أحمد', 'سارة']) {
      fireEvent.change(screen.getByLabelText('اسم اللاعب'), { target: { value: name } });
      fireEvent.click(screen.getByRole('button', { name: 'دخول' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ المنافسة' }));
    const input = screen.getByLabelText('اكتب حرفًا أو اختره من الحروف');
    fireEvent.change(input, { target: { value: 'ع' } });
    expect(screen.getByRole('button', { name: 'اختر حرف ع' })).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(screen.getByRole('button', { name: 'اختر حرف ع' })).toBeEnabled();
    for (const letter of QUESTION_WORD_BANK[0].answer) {
      fireEvent.change(input, { target: { value: letter } });
    }
    expect(screen.getByText(/أحمد · المركز 1/)).toBeInTheDocument();
    expect(screen.getByText(/دور اللاعب سارة/)).toBeInTheDocument();
  });

  it('accepts an answer completed by a revealed letter', () => {
    render(<InstantGameRoom mode="question-word" />);
    for (const name of ['أحمد', 'سارة']) {
      fireEvent.change(screen.getByLabelText('اسم اللاعب'), { target: { value: name } });
      fireEvent.click(screen.getByRole('button', { name: 'دخول' }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ المنافسة' }));
    for (const letter of ['ع', 'ط', 'ا', 'ر']) {
      fireEvent.click(screen.getByRole('button', { name: `اختر حرف ${letter}` }));
    }
    fireEvent.click(screen.getByRole('button', { name: 'كشف حرف' }));
    expect(screen.getByText(/أحمد · المركز 1/)).toBeInTheDocument();
    expect(screen.getByText(/دور اللاعب سارة/)).toBeInTheDocument();
  });

});

describe('ColorRush accessibility and practice', () => {
  it('toggles color-blind symbols and persists the preference', () => {
    render(<InstantGameRoom mode="color-rush" />);

    fireEvent.click(screen.getByRole('button', { name: 'ابدأ التحدّي' }));
    const toggle = screen.getByRole('button', { name: /وضع عمى الألوان/ });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: 'إخفاء رموز الألوان' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText(/رمز الحبر/)).toBeInTheDocument();
    for (const color of COLOR_RUSH_BANK) {
      const option = screen.getByRole('button', { name: color.label });
      expect(option).toHaveTextContent(color.symbol);
    }
    expect(localStorage.getItem('tahaddi.color-rush.color-blind')).toBe('1');
  });

  it('runs an untimed practice round without scoring, then offers the real challenge', async () => {
    vi.useFakeTimers();
    render(<InstantGameRoom mode="color-rush" />);

    fireEvent.click(screen.getByRole('button', { name: 'جولة تدريبية' }));
    expect(screen.getByText(/تدريب بلا وقت ولا نقاط/)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(screen.getByLabelText('حالة اللعبة')).toHaveTextContent('بلا مؤقت');
    expect(screen.getByLabelText('حالة اللعبة')).toHaveTextContent('تدريب بلا نقاط');

    for (let attempt = 0; attempt < 5; attempt++) {
      fireEvent.click(screen.getByRole('button', { name: COLOR_RUSH_BANK[0].label }));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });
    }
    expect(screen.getByLabelText('حالة اللعبة')).toHaveTextContent('تدريب بلا نقاط');
    expect(screen.getByText('انتهى التدريب!')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'ابدأ التحدّي' }));
    expect(screen.getByText('ما لون الحبر؟')).toBeInTheDocument();
  });

  it('locks answers during feedback and exposes accuracy and streak', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.3);
    render(<InstantGameRoom mode="color-rush" />);

    fireEvent.click(screen.getByRole('button', { name: 'ابدأ التحدّي' }));
    const correctAnswer = screen.getByRole('button', { name: 'أزرق' });

    fireEvent.click(correctAnswer);
    fireEvent.click(correctAnswer);

    expect(screen.getByText('إجابة صحيحة')).toBeVisible();
    expect(screen.getByText('الدقة 100٪')).toBeVisible();
    expect(screen.getByText('سلسلة 1')).toBeVisible();
    expect(screen.getByLabelText('حالة اللعبة')).toHaveTextContent('الرصيد 75');
    for (const color of COLOR_RUSH_BANK) {
      expect(screen.getByRole('button', { name: color.label })).toBeDisabled();
    }

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(screen.getByRole('button', { name: COLOR_RUSH_BANK[0].label })).toBeEnabled();
  });

  it('always uses a different ink color from the written color', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { container } = render(<InstantGameRoom mode="color-rush" />);

    fireEvent.click(screen.getByRole('button', { name: 'ابدأ التحدّي' }));
    const challenge = container.querySelector('.color-rush__arena strong');

    expect(challenge).toHaveTextContent(COLOR_RUSH_BANK[0].label);
    expect(challenge).toHaveStyle({ color: COLOR_RUSH_BANK[1].value });
  });

  it('keeps the ink different when replacing a repeated round', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99);
    const { container } = render(<InstantGameRoom mode="color-rush" />);

    fireEvent.click(screen.getByRole('button', { name: 'ابدأ التحدّي' }));
    fireEvent.click(screen.getByRole('button', { name: COLOR_RUSH_BANK[3].label }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    const challenge = container.querySelector('.color-rush__arena strong');
    expect(challenge).toHaveTextContent(COLOR_RUSH_BANK[0].label);
    expect(challenge).not.toHaveStyle({ color: COLOR_RUSH_BANK[0].value });
  });
});

describe('instant mode catalog contract', () => {
  it('يفتح بوابة بلوت مباشرة لأربعة لاعبين دون إدخال نقاط يدوي', () => {
    render(<InstantGameRoom mode="baloot" />);

    expect(screen.getByRole('heading', { level: 1, name: 'البلوت' })).toBeInTheDocument();
    expect(screen.getByText('خادم موثوق · أربعة لاعبين')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'مجلس جديد' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'دخول برمز' })).toBeInTheDocument();
    expect(screen.getByLabelText('اسم اللاعب')).toBeInTheDocument();
    expect(screen.queryByLabelText(/نقاط لنا/)).not.toBeInTheDocument();
  });

  for (const mode of INSTANT_GAME_ORDER.filter(
    (mode) => mode !== 'baloot' && mode !== 'question-word' && mode !== 'risk',
  )) {
    it(`starts, counts down, finishes, and resets ${mode}`, async () => {
      vi.useFakeTimers();
      const meta = INSTANT_GAME_META[mode];
      const isMemory = mode === 'memory-flash';
      const totalSeconds = isMemory ? MEMORY_DIFFICULTIES.medium.totalSeconds : meta.roundSeconds;

      render(<InstantGameRoom mode={mode} />);

      fireEvent.click(screen.getByRole('button', { name: 'ابدأ التحدّي' }));
      expect(screen.getByLabelText('حالة اللعبة')).toHaveTextContent(
        `الوقت ${formatNumber(totalSeconds)}`,
      );

      if (isMemory) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(0);
        });
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000);
        });
      }

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(screen.getByLabelText('حالة اللعبة')).toHaveTextContent(
        `الوقت ${formatNumber(totalSeconds - 1)}`,
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync((totalSeconds - 1) * 1_000);
      });
      const restart = screen.getByRole('button', {
        name: /العب مرة أخرى|جولة جديدة|تحدٍّ جديد/,
      });
      fireEvent.click(restart);

      expect(screen.getByLabelText('حالة اللعبة')).toHaveTextContent('الرصيد 0');
      expect(screen.getByLabelText('حالة اللعبة')).toHaveTextContent(
        `الوقت ${formatNumber(totalSeconds)}`,
      );
    });
  }
});

describe('risk board integrity', () => {
  it('يبني رزمة متوازنة من ٢٤ بطاقة وبثلاث قنابل دون معرّفات مكررة', () => {
    const deck = buildRiskDeck('balanced', () => 0.5);
    expect(deck).toHaveLength(RISK_PRESETS.balanced.cards);
    expect(deck.filter((card) => card.kind === 'bomb')).toHaveLength(3);
    expect(deck.filter((card) => card.kind === 'shield')).toHaveLength(2);
    expect(deck.filter((card) => card.kind === 'double')).toHaveLength(2);
    expect(new Set(deck.map((card) => card.id)).size).toBe(deck.length);
  });
});

describe('RiskGame', () => {
  it('يعرض دورة المجازفة الصحيحة وبطاقات ثلاثية الأبعاد قابلة للوصول', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    render(<InstantGameRoom mode="risk" />);

    expect(screen.getByRole('heading', { level: 1, name: 'المجازفة' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ المباراة' }));
    expect(screen.getByLabelText('حالة المجازفة')).toHaveTextContent('رصيد الدور 0');
    const cards = screen.getAllByRole('button', { name: /بطاقة مخفية/ });
    expect(cards).toHaveLength(24);
    expect(cards[0]).toHaveClass('risk-card-3d');
    expect(cards[0]).toHaveTextContent('تحدّي');

    const deck = buildRiskDeck('balanced', () => 0.5);
    const pointsIndex = deck.findIndex(
      (card) => card.kind === 'points',
    );
    fireEvent.click(cards[pointsIndex]!);
    expect(screen.getByRole('button', { name: 'اكتفِ واجمع الرصيد' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'جازف واختر بطاقة أخرى' })).toBeInTheDocument();
    expect(screen.getByLabelText('حالة المجازفة')).toHaveTextContent(
      `رصيد الدور ${formatNumber(deck[pointsIndex]!.value)}`,
    );

    fireEvent.click(screen.getByRole('button', { name: 'اكتفِ واجمع الرصيد' }));
    expect(screen.getByLabelText('حالة المجازفة')).toHaveTextContent('الدور: اللاعب الثاني');
    expect(screen.getByLabelText('لوحة اللاعبين')).toHaveTextContent(
      `اللاعب الأول${formatNumber(deck[pointsIndex]!.value)}`,
    );
  });

  it('تُنهي القنبلة الدور دون إضافة الرصيد', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const deck = buildRiskDeck('balanced', () => 0.5);
    render(<InstantGameRoom mode="risk" />);
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ المباراة' }));

    const cards = screen.getAllByRole('button', { name: 'بطاقة مخفية' });
    fireEvent.click(cards[deck.findIndex((card) => card.kind === 'bomb')]!);

    expect(screen.getByText('انفجرت القنبلة وضاع رصيد الدور فقط.')).toBeInTheDocument();
    expect(screen.getByLabelText('حالة المجازفة')).toHaveTextContent('الدور: اللاعب الثاني');
  });

  it('يستهلك الدرع عند ظهور القنبلة ويُبقي قرار اللاعب مفتوحًا', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const deck = buildRiskDeck('balanced', () => 0.5);
    render(<InstantGameRoom mode="risk" />);
    fireEvent.click(screen.getByRole('button', { name: 'ابدأ المباراة' }));

    const cards = screen.getAllByRole('button', { name: 'بطاقة مخفية' });
    fireEvent.click(cards[deck.findIndex((card) => card.kind === 'shield')]!);
    fireEvent.click(screen.getByRole('button', { name: 'جازف واختر بطاقة أخرى' }));
    fireEvent.click(cards[deck.findIndex((card) => card.kind === 'bomb')]!);

    expect(screen.getByText('صدّ الدرع القنبلة واستهلكته.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'جازف واختر بطاقة أخرى' })).toBeInTheDocument();
    expect(screen.getByLabelText('حالة المجازفة')).not.toHaveTextContent('الدرع جاهز');
  });
});
