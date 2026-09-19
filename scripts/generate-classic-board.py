"""Generate a chess board PNG that matches the supplied reference.

Produces apps/web/public/chess/classic-board.png with:
  - 800x800 canvas
  - 40px navy frame
  - 8x8 grid (90px per square) with light/dark blue squares
  - Dark-blue pieces on rank 8 / rank 7 (top), cream pieces on rank 1 / rank 2
  - Greek-key style hatching on dark squares
  - Rank labels (1-8) on the left, file labels (a-h) on the bottom
"""
from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SIZE = 800
FRAME = 40
BOARD_START = FRAME
BOARD_END = SIZE - FRAME
SQUARE = (BOARD_END - BOARD_START) / 8

LIGHT = (217, 233, 247, 255)
DARK = (170, 198, 230, 255)
NAVY = (10, 44, 92, 255)
NAVY_DARK = (6, 20, 43, 255)
TEXT_BLUE = (60, 110, 200, 255)
DARK_PIECE = (16, 52, 100, 255)
DARK_PIECE_EDGE = (6, 26, 64, 255)
LIGHT_PIECE = (250, 235, 198, 255)
LIGHT_PIECE_EDGE = (212, 175, 90, 255)


def load_font(size: int) -> ImageFont.ImageFont:
    candidates = [
        r"C:\Windows\Fonts\segoeui.ttf",
        r"C:\Windows\Fonts\arialbd.ttf",
        r"C:\Windows\Fonts\arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def load_piece_font(size: int) -> ImageFont.ImageFont:
    """Segoe UI Symbol has the full chess block U+2654..U+265F."""
    candidates = [
        r"C:\Windows\Fonts\seguisym.ttf",
        r"C:\Windows\Fonts\seguisb.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return load_font(size)


def greek_key_pattern(square_size: int) -> Image.Image:
    """Return a tileable Greek-key motif sized to a single dark square."""
    tile = Image.new("RGBA", (square_size, square_size), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    line = max(2, square_size // 22)
    s = square_size
    # Outer Greek-key spiral
    margin = s * 0.12
    # Draw concentric broken rectangles to evoke a meander
    points = [
        (margin, margin, s - margin, s - margin),
        (margin + s * 0.13, margin + s * 0.13, s - margin - s * 0.13, s - margin - s * 0.13),
    ]
    for x0, y0, x1, y1 in points:
        d.rectangle([x0, y0, x1, y1], outline=(190, 215, 245, 90), width=line)
    # Inner cross
    cx, cy = s / 2, s / 2
    arm = s * 0.18
    d.rectangle([cx - arm / 2, cy - s * 0.32, cx + arm / 2, cy + s * 0.32], outline=(190, 215, 245, 80), width=line)
    d.rectangle([cx - s * 0.32, cy - arm / 2, cx + s * 0.32, cy + arm / 2], outline=(190, 215, 245, 80), width=line)
    return tile


def draw_piece(d: ImageDraw.ImageDraw, cx: float, cy: float, color_main, color_edge, glyph: str, size: int) -> None:
    font = load_piece_font(int(size * 1.4))
    # Drop shadow
    shadow_offset = size * 0.04
    d.text(
        (cx + shadow_offset, cy + shadow_offset),
        glyph,
        font=font,
        fill=(0, 0, 0, 140),
        anchor="mm",
    )
    # Edge (offset layers create a bevel look)
    d.text((cx, cy), glyph, font=font, fill=color_edge, anchor="mm")
    d.text((cx - size * 0.005, cy - size * 0.005), glyph, font=font, fill=color_main, anchor="mm")


PIECE_GLYPHS = {
    "K": "\u2654",  # ♔
    "Q": "\u2655",  # ♕
    "R": "\u2656",  # ♖
    "B": "\u2657",  # ♗
    "N": "\u2658",  # ♘
    "P": "\u2659",  # ♙
}


def main() -> None:
    img = Image.new("RGBA", (SIZE, SIZE), NAVY)
    draw = ImageDraw.Draw(img)

    # Frame gradient (darker outer ring)
    for i in range(FRAME):
        alpha = int(255 * (1 - i / (FRAME * 1.6)))
        draw.rectangle([i, i, SIZE - i - 1, SIZE - i - 1], outline=(6, 20, 43, alpha))

    # Inner soft border
    draw.rectangle([FRAME - 6, FRAME - 6, SIZE - FRAME + 5, SIZE - FRAME + 5], outline=(60, 110, 200, 200), width=2)
    draw.rectangle([FRAME - 2, FRAME - 2, SIZE - FRAME + 1, SIZE - FRAME + 1], outline=(8, 38, 78, 255), width=2)

    # Squares
    greek = greek_key_pattern(int(SQUARE))
    for row in range(8):
        for col in range(8):
            x0 = BOARD_START + col * SQUARE
            y0 = BOARD_START + row * SQUARE
            x1 = x0 + SQUARE
            y1 = y0 + SQUARE
            is_dark = (row + col) % 2 == 1
            fill = DARK if is_dark else LIGHT
            draw.rectangle([x0, y0, x1, y1], fill=fill)
            if is_dark:
                img.paste(greek, (int(x0), int(y0)), greek)

    # Rank labels (1-8) on the left side
    label_font = load_font(int(FRAME * 0.6))
    for row in range(8):
        rank = str(8 - row)
        cy = BOARD_START + row * SQUARE + SQUARE / 2
        draw.text((FRAME / 2, cy), rank, font=label_font, fill=TEXT_BLUE, anchor="mm")

    # File labels (a-h) on the bottom
    for col in range(8):
        file = chr(ord("a") + col)
        cx = BOARD_START + col * SQUARE + SQUARE / 2
        draw.text((cx, SIZE - FRAME / 2), file, font=label_font, fill=TEXT_BLUE, anchor="mm")

    # Pieces
    piece_size = int(SQUARE * 0.78)
    back_row = ["R", "N", "B", "Q", "K", "B", "N", "R"]
    for col, glyph_letter in enumerate(back_row):
        # Top row (rank 8) - dark pieces
        cx = BOARD_START + col * SQUARE + SQUARE / 2
        cy = BOARD_START + SQUARE / 2
        draw_piece(draw, cx, cy, DARK_PIECE, DARK_PIECE_EDGE, PIECE_GLYPHS[glyph_letter], piece_size)
        # Top pawns (rank 7)
        cy_pawn = BOARD_START + SQUARE + SQUARE / 2
        draw_piece(draw, cx, cy_pawn, DARK_PIECE, DARK_PIECE_EDGE, PIECE_GLYPHS["P"], piece_size)
        # Bottom pawns (rank 2)
        cy_pawn_b = BOARD_START + 6 * SQUARE + SQUARE / 2
        draw_piece(draw, cx, cy_pawn_b, LIGHT_PIECE, LIGHT_PIECE_EDGE, PIECE_GLYPHS["P"], piece_size)
        # Bottom row (rank 1) - light pieces
        cy_bottom = BOARD_START + 7 * SQUARE + SQUARE / 2
        draw_piece(draw, cx, cy_bottom, LIGHT_PIECE, LIGHT_PIECE_EDGE, PIECE_GLYPHS[glyph_letter], piece_size)

    # Slight overall blur to match the rendered look of the reference
    img = img.filter(__import__("PIL.ImageFilter", fromlist=["SMOOTH"]).SMOOTH)

    out = Path("apps/web/public/chess/classic-board.png")
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)
    print(f"Wrote {out} ({out.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
