'use client';

import { useState } from 'react';
import { submitLiveAnswer } from '@/app/live/actions';
import { Button } from '@/components/ui';

type LiveOption = {
  id: string;
  label: string;
  text: string;
};

export function LiveAnswerForm({
  sessionId,
  participantId,
  questionId,
  options,
  autoLockAnswers,
}: {
  sessionId: string;
  participantId: string;
  questionId: string;
  options: LiveOption[];
  autoLockAnswers: boolean;
}) {
  const [selectedId, setSelectedId] = useState('');

  if (autoLockAnswers) {
    return (
      <div className="answers-list">
        {options.map((option) => (
          <form action={submitLiveAnswer} key={option.id}>
            <input type="hidden" name="sessionId" value={sessionId} />
            <input type="hidden" name="participantId" value={participantId} />
            <input type="hidden" name="questionId" value={questionId} />
            <button
              type="submit"
              name="optionId"
              value={option.id}
              className={`answer-option option-${option.label.toLowerCase()} is-default`}
            >
              <span className="answer-letter">{option.label}</span>
              <span className="answer-text">{option.text}</span>
            </button>
          </form>
        ))}
      </div>
    );
  }

  return (
    <form action={submitLiveAnswer}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="participantId" value={participantId} />
      <input type="hidden" name="questionId" value={questionId} />
      <input type="hidden" name="optionId" value={selectedId} />
      <div className="answers-list">
        {options.map((option) => (
          <button
            type="button"
            key={option.id}
            className={`answer-option option-${option.label.toLowerCase()} ${
              selectedId === option.id ? 'is-selected' : 'is-default'
            }`}
            aria-pressed={selectedId === option.id}
            onClick={() => setSelectedId(option.id)}
          >
            <span className="answer-letter">{option.label}</span>
            <span className="answer-text">{option.text}</span>
          </button>
        ))}
      </div>
      <Button type="submit" fullWidth disabled={!selectedId}>
        تثبيت الإجابة
      </Button>
    </form>
  );
}
