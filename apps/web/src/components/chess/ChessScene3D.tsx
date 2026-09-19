'use client';

import { memo, useMemo } from 'react';
import { ChessBoard3D } from './ChessBoard3D';
import { ChessCamera } from './ChessCamera';
import { ChessEnvironment } from './ChessEnvironment';
import { ChessLights } from './ChessLights';
import { ChessPieces3D } from './ChessPieces3D';
import { CheckHighlight } from './CheckHighlight';
import { LastMoveHighlight } from './LastMoveHighlight';
import { LegalMoveMarkers } from './LegalMoveMarkers';
import { SelectedPieceHighlight } from './SelectedPieceHighlight';
import { parseFenPieces, type Chess3DPresentationProps } from './chess-3d-model';

function ChessScene3DComponent({
  fen,
  orientation,
  selected,
  legal,
  lastMove,
  check,
  interactive,
  onSquarePress,
  cameraMode,
  quality,
  reducedMotion,
  useClassicBoard,
}: Chess3DPresentationProps) {
  const pieces = useMemo(() => parseFenPieces(fen), [fen]);

  return (
    <>
      <ChessCamera
        orientation={orientation}
        cameraMode={cameraMode}
        reducedMotion={reducedMotion}
      />
      <ChessEnvironment quality={quality} />
      <ChessLights quality={quality} />
      <ChessBoard3D
        interactive={interactive}
        onSquarePress={onSquarePress}
        useClassicBoard={useClassicBoard}
      />
      <LastMoveHighlight lastMove={lastMove} />
      <LegalMoveMarkers legal={legal} />
      <SelectedPieceHighlight selected={selected} />
      <CheckHighlight check={check} reducedMotion={reducedMotion} />
      <ChessPieces3D
        pieces={pieces}
        lastMove={lastMove}
        quality={quality}
        reducedMotion={reducedMotion}
      />
    </>
  );
}

export const ChessScene3D = memo(ChessScene3DComponent);
