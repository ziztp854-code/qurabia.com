import { Flag, Lightbulb, ListOrdered, Quote } from 'lucide-react';
import type { GameGuide } from './game-guides';

/**
 * Beginner guide card shared by every game: goal, ordered steps,
 * a worked example, and a quick tip. Server-component friendly.
 */
export function GameHowTo({
  guide,
  headingId = `game-how-to-${guide.id}`,
}: {
  guide: GameGuide;
  headingId?: string;
}) {
  return (
    <section className="game-how-to" data-game={guide.id} aria-labelledby={headingId}>
      <h2 id={headingId} className="game-how-to__title">
        كيف تلعب؟
      </h2>

      <div className="game-how-to__goal">
        <Flag aria-hidden="true" />
        <div>
          <strong>هدف اللعبة</strong>
          <p>{guide.goal}</p>
        </div>
      </div>

      <div className="game-how-to__steps">
        <span className="game-how-to__label">
          <ListOrdered aria-hidden="true" />
          خطوات اللعب
        </span>
        <ol>
          {guide.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </div>

      <p className="game-how-to__example">
        <Quote aria-hidden="true" />
        {guide.example}
      </p>

      <p className="game-how-to__tip">
        <Lightbulb aria-hidden="true" />
        <span>
          <strong>نصيحة سريعة: </strong>
          {guide.tip}
        </span>
      </p>
    </section>
  );
}
