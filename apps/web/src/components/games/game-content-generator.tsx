'use client';

import { Check, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { Button, Input } from '@/components/ui';

export type AiGame = 'parallel-world' | 'reverse-time' | 'infiltrator' | 'mafia';
export type MafiaAiContent = {
  title: string;
  intro: string;
  clues: string[];
  hostBrief: string;
};

type Draft =
  | { game: 'mafia'; content: MafiaAiContent }
  | { game: Exclude<AiGame, 'mafia'>; content: { rounds: Array<Record<string, unknown>> } };

export function GameContentGenerator({
  game,
  onApprove,
  hiddenInputName,
}: {
  game: AiGame;
  onApprove?: (approvalToken: string | undefined) => void;
  hiddenInputName?: string;
}) {
  const [topic, setTopic] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftToken, setDraftToken] = useState('');
  const [approvedToken, setApprovedToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const generate = async () => {
    if (topic.trim().length < 3) {
      setError('اكتب موضوعًا من ثلاثة أحرف على الأقل.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/ai/games/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ game, topic, roundCount: 3 }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        draft?: Draft;
        approvalToken?: string;
        message?: string;
      };
      if (!response.ok || !payload.ok || !payload.draft || !payload.approvalToken)
        throw new Error(payload.message || 'تعذّر التوليد.');
      setDraft(payload.draft);
      setDraftToken(payload.approvalToken);
      setApprovedToken('');
      onApprove?.(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذّر التوليد.');
    } finally {
      setLoading(false);
    }
  };

  const approve = () => {
    if (!draft || !draftToken) return;
    setApprovedToken(draftToken);
    onApprove?.(draftToken);
  };

  return (
    <div className="stack-form" aria-label="مساعد Grok لمحتوى اللعبة">
      <Input
        id={`ai-game-topic-${game}`}
        label="موضوع محتوى Grok (اختياري)"
        value={topic}
        onChange={(event) => setTopic(event.target.value)}
        maxLength={120}
        placeholder="مثال: رحلات الفضاء أو ليلة في قصر قديم"
      />
      <Button type="button" variant="outline" loading={loading} onClick={generate}>
        <Sparkles aria-hidden="true" />
        ولّد مسودة للمراجعة
      </Button>
      {error && (
        <p className="special-error" role="alert">
          {error}
        </p>
      )}
      {draft && (
        <div className="notice-card" aria-live="polite">
          <strong>
            {draft.game === 'mafia'
              ? draft.content.title
              : `${draft.content.rounds.length} جولات مقترحة`}
          </strong>
          {draft.game === 'mafia' ? (
            <>
              <p>{draft.content.intro}</p>
              <ul>
                {draft.content.clues.map((clue) => (
                  <li key={clue}>{clue}</li>
                ))}
              </ul>
              <p className="muted">للمضيف: {draft.content.hostBrief}</p>
            </>
          ) : (
            <ol>
              {draft.content.rounds.map((round, index) => (
                <li key={index}>{String(round.answer || `الجولة ${index + 1}`)}</li>
              ))}
            </ol>
          )}
          <Button type="button" variant="gold" onClick={approve} disabled={Boolean(approvedToken)}>
            <Check aria-hidden="true" />
            {approvedToken ? 'تم اعتماد المحتوى' : 'اعتمد المحتوى لهذه الغرفة'}
          </Button>
        </div>
      )}
      {hiddenInputName && (
        <input
          type="hidden"
          name={hiddenInputName}
          value={approvedToken}
        />
      )}
    </div>
  );
}
