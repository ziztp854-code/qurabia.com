'use client';

import { CHESS_PIECE_DESIGN_SPEC, ChessPieceSvg, getPieceLabel } from './chess-piece';

const PIECE_TYPES = ['K', 'Q', 'R', 'B', 'N', 'P'] as const;
const COLORS = ['white', 'black'] as const;
const SQUARE_BG = ['light', 'dark'] as const;
const SIZES = CHESS_PIECE_DESIGN_SPEC.sizes;
const MATRIX_LABELS = {
  'white-light': 'أبيض على فاتح',
  'white-dark': 'أبيض على داكن',
  'black-light': 'أسود على فاتح',
  'black-dark': 'أسود على داكن',
} as const;

/**
 * Visual specimen for the Qurabia chess piece family.
 *
 * Renders every piece on every combination of:
 *   - color (white, black)
 *   - background (light, dark)
 *   - rendered size (18, 20, 24, 26, 32, 40, 48, 64, 96 px)
 *
 * No game logic, no interactivity — pure visual reference.
 */
export function ChessPieceSpecimen() {
  return (
    <div className="chess-piece-specimen" data-game="chess">
      <header className="chess-piece-specimen__header">
        <h2>مجموعة قطع الشطرنج</h2>
        <p>أصول WebP مستقلة وشفافة، محاذية على y=94، مع baseline مشترك</p>
        <dl className="chess-piece-specimen__spec" aria-label="مواصفات عائلة القطع">
          <div>
            <dt>Baseline</dt>
            <dd dir="ltr">y=94</dd>
          </div>
          <div>
            <dt>Renderer</dt>
            <dd dir="ltr">WebP / Next Image</dd>
          </div>
          <div>
            <dt>Sizes</dt>
            <dd dir="ltr">18–96px</dd>
          </div>
        </dl>
      </header>

      <section
        className="chess-piece-specimen__matrix"
        aria-label="مصفوفة القطع، مرر أفقياً لعرض جميع العينات"
        role="region"
        tabIndex={0}
      >
        <table className="chess-piece-specimen__table">
          <thead>
            <tr>
              <th scope="col">القطعة</th>
              <th scope="col">أبيض على فاتح</th>
              <th scope="col">أبيض على داكن</th>
              <th scope="col">أسود على فاتح</th>
              <th scope="col">أسود على داكن</th>
            </tr>
          </thead>
          <tbody>
            {PIECE_TYPES.map((type) => {
              const label = getPieceLabel(type);
              return (
                <tr key={type} id={`row-${type.toLowerCase()}`}>
                  <th scope="row">{label}</th>
                  {COLORS.flatMap((color) =>
                    SQUARE_BG.map((bg) => (
                      <td
                        key={`${color}-${bg}`}
                        className={`chess-piece-specimen__cell chess-piece-specimen__cell--${bg}`}
                        data-label={MATRIX_LABELS[`${color}-${bg}`]}
                      >
                        <div className="chess-piece-specimen__art">
                          <ChessPieceSvg piece={type} color={color} />
                        </div>
                      </td>
                    )),
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section
        className="chess-piece-specimen__sizes"
        aria-label="اختبار الأحجام"
        id="sizes-section"
      >
        <h3>اختبار القراءة على الأحجام</h3>
        <div className="chess-piece-specimen__sizes-grid">
          {PIECE_TYPES.flatMap((type) =>
            COLORS.flatMap((color) =>
              SQUARE_BG.flatMap((background) =>
                SIZES.map((size) => (
                  <div
                    key={`${type}-${color}-${background}-${size}`}
                    className="chess-piece-specimen__size"
                    id={`size-${type.toLowerCase()}-${color}-${background}-${size}`}
                  >
                    <div
                      className={`chess-piece-specimen__size-art chess-piece-specimen__size-art--${background}`}
                      style={{ width: `${size}px`, height: `${size}px` }}
                      data-piece={type}
                      data-color={color}
                      data-background={background}
                      data-size={size}
                    >
                      <ChessPieceSvg piece={type} color={color} />
                    </div>
                    <small>
                      {type} · {color === 'white' ? 'أبيض' : 'أسود'} ·{' '}
                      {background === 'light' ? 'فاتح' : 'داكن'} · {size}px
                    </small>
                  </div>
                )),
              ),
            ),
          )}
        </div>
      </section>
    </div>
  );
}
