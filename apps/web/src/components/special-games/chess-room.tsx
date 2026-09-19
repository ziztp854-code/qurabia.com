'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import {
  Copy,
  Eye,
  Flag,
  Handshake,
  LogIn,
  LogOut,
  Play,
  QrCode,
  RotateCcw,
  Settings,
  Trophy,
  Undo2,
  X,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { SPECIAL_GAME_META } from '@tahaddi/domain';
import { useChessSocket } from './use-chess-socket';
import { Button, Card, Input } from '@/components/ui';
import { GAME_GUIDES, GameHowTo } from '@/components/games/shared';
import { getAccessibleChessSquareLabel, useChessGridNavigation } from './chess-board-accessibility';
import { ChessBoardFrame } from './chess-board-frame';
import { ChessPieceSvg, getPieceLabel } from './chess-piece';
import {
  CapturedPiecesPanel,
  ChessMoveHistory,
  ChessPlayerBar,
  type ChessColor,
} from './chess-match-ui';
import {
  clearSavedChessRoom,
  getOrCreateChessGuestId,
  getOrCreateChessGuestToken,
  getSavedChessPin,
  getSavedChessSeatGuestId,
  saveChessRoomPin,
  saveChessSeatGuestId,
} from './chess-session-storage';
import { getLegalMoves, getPositionStatus } from '../chess/chess-rules';

const PIECE_LABELS_AR: Record<string, string> = {
  K: 'الملك',
  Q: 'الملكة',
  R: 'الرخ',
  B: 'الفيل',
  N: 'الحصان',
  P: 'الجندي',
};

const CAPTURED_PIECE_ORDER = ['Q', 'R', 'B', 'N', 'P'] as const;
const STARTING_PIECE_COUNTS: Record<(typeof CAPTURED_PIECE_ORDER)[number], number> = {
  Q: 1,
  R: 2,
  B: 2,
  N: 2,
  P: 8,
};

function parseFen(fen: string): {
  board: (string | null)[][];
  turn: 'white' | 'black';
  castling: string;
  enPassant: string | null;
} {
  const [positionPart] = fen.split(' ');
  const rows = positionPart.split('/');
  const board: (string | null)[][] = [];
  for (const row of rows) {
    const boardRow: (string | null)[] = [];
    for (const char of row) {
      if (char >= '1' && char <= '8') {
        for (let i = 0; i < parseInt(char); i++) boardRow.push(null);
      } else {
        boardRow.push(char);
      }
    }
    board.push(boardRow);
  }
  const parts = fen.split(' ');
  return {
    board,
    turn: (parts[1] === 'w' ? 'white' : 'black') as 'white' | 'black',
    castling: parts[2] ?? '-',
    enPassant: parts[3] === '-' ? null : parts[3],
  };
}

function getCapturedPieces(board: (string | null)[][], color: ChessColor) {
  const currentCounts: Record<(typeof CAPTURED_PIECE_ORDER)[number], number> = {
    Q: 0,
    R: 0,
    B: 0,
    N: 0,
    P: 0,
  };

  for (const piece of board.flat()) {
    if (!piece) continue;
    const isWhitePiece = piece === piece.toUpperCase();
    if ((color === 'white' && !isWhitePiece) || (color === 'black' && isWhitePiece)) continue;
    const type = piece.toUpperCase() as (typeof CAPTURED_PIECE_ORDER)[number];
    if (type in currentCounts) currentCounts[type] += 1;
  }

  return CAPTURED_PIECE_ORDER.flatMap((type) => {
    const missingCount = Math.max(0, STARTING_PIECE_COUNTS[type] - currentCounts[type]);
    const piece = color === 'white' ? type : type.toLowerCase();
    return Array.from({ length: missingCount }, () => piece);
  });
}

function squareToCoords(sq: string): { row: number; col: number } {
  const col = sq.charCodeAt(0) - 97;
  const row = 8 - parseInt(sq[1]);
  return { row, col };
}

function coordsToSquare(row: number, col: number): string {
  return String.fromCharCode(97 + col) + (8 - row);
}

export function ChessRoom({ initialPin }: { initialPin: string }) {
  const meta = SPECIAL_GAME_META.chess;
  const [guestIdValue] = useState(() => getOrCreateChessGuestId());
  const [guestTokenValue] = useState(() => getOrCreateChessGuestToken());

  const {
    connected,
    room,
    error,
    errorCode,
    busy,
    opponentDisconnect,
    opponentReconnect,
    gameEnd,
    drawOffered,
    countdown,
    moveAck,
    setError,
    setBusy,
    socketRef,
    clearRoom,
  } = useChessSocket(guestIdValue || undefined, guestTokenValue || undefined);

  useEffect(() => {
    if (!initialPin || !guestIdValue || !connected || room) return;
    const storedGuestId = getSavedChessSeatGuestId();
    if (!storedGuestId) return;
    socketRef.current?.emit('chess:reconnect', {
      pin: initialPin,
      guestId: storedGuestId,
    });
  }, [initialPin, guestIdValue, connected, room, socketRef]);

  useEffect(() => {
    if (typeof window === 'undefined' || !room?.yourGuestId) return;
    saveChessSeatGuestId(room.yourGuestId);
  }, [room?.yourGuestId]);

  const [joinMode, setJoinMode] = useState(Boolean(initialPin));
  const [pin, setPin] = useState(initialPin);
  const [savedPin, setSavedPin] = useState('');
  const [playerName, setPlayerName] = useState(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('tahaddi-chess-player-name') ?? '';
  });
  const resumableSavedPin = errorCode === 'ROOM_NOT_FOUND' ? '' : savedPin;
  const [copied, setCopied] = useState(false);
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [legalSquares, setLegalSquares] = useState<string[]>([]);
  const [promotionFrom, setPromotionFrom] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ from: string; to: string } | null>(null);
  const [showMoveHistory, setShowMoveHistory] = useState(false);
  const [manualBoardFlip, setManualBoardFlip] = useState(false);
  const [showBoardSettings, setShowBoardSettings] = useState(false);
  const [showCoordinates, setShowCoordinates] = useState(true);
  const checkAlert = Boolean(moveAck?.isCheck && !moveAck.isCheckmate);
  const mateAlert = Boolean(moveAck?.isCheckmate);

  useEffect(() => {
    if (initialPin) return;
    let active = true;
    queueMicrotask(() => {
      if (active) setSavedPin(getSavedChessPin());
    });
    return () => {
      active = false;
    };
  }, [initialPin]);

  useEffect(() => {
    const dialogId = drawOffered ? 'chess-draw-dialog' : gameEnd ? 'chess-result-dialog' : null;
    const dialog = dialogId ? document.getElementById(dialogId) : null;
    if (!dialog) return;

    const arena = document.querySelector<HTMLElement>('.chess-play-grid');
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    arena?.setAttribute('inert', '');
    const frame = window.requestAnimationFrame(() => {
      dialog.querySelector<HTMLElement>('button')?.focus();
    });

    return () => {
      window.cancelAnimationFrame(frame);
      arena?.removeAttribute('inert');
      previousFocus?.focus();
    };
  }, [drawOffered, gameEnd]);

  const fen = room?.fen ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const { board, turn } = useMemo(() => parseFen(fen), [fen]);
  const capturedPieces = useMemo(
    () => ({
      white: getCapturedPieces(board, 'white'),
      black: getCapturedPieces(board, 'black'),
    }),
    [board],
  );
  const isHost = room?.isHost ?? false;
  const yourRole = room?.yourRole ?? 'spectator';
  const yourColor = room?.yourColor ?? null;
  const isYourTurn = room ? turn === yourColor : false;

  const boardRef = useRef<HTMLDivElement>(null);

  const shareUrl = useMemo(() => {
    if (!room || typeof window === 'undefined') return '';
    return `${window.location.origin}${window.location.pathname}?join=${room.pin}`;
  }, [room]);

  const copyInvite = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2500);
  };

  const handleSquareClick = (square: string) => {
    if (room?.phase !== 'playing' || !isYourTurn || gameEnd) return;
    const piece = board[squareToCoords(square).row]?.[squareToCoords(square).col];
    if (!piece) {
      setSelectedSquare(null);
      setLegalSquares([]);
      return;
    }
    const isWhitePiece = piece === piece.toUpperCase();
    const isYourPiece =
      (yourColor === 'white' && isWhitePiece) || (yourColor === 'black' && !isWhitePiece);
    if (!isYourPiece) return;

    if (selectedSquare === square) {
      setSelectedSquare(null);
      setLegalSquares([]);
      return;
    }

    const squares = [...new Set(getLegalMoves(fen, square).map((move) => move.to))];
    setSelectedSquare(square);
    setLegalSquares(squares);
  };

  const handleDestinationClick = (square: string) => {
    if (!selectedSquare || !legalSquares.includes(square)) return;
    const isPromotion = getLegalMoves(fen, selectedSquare).some(
      (move) => move.to === square && Boolean(move.promotion),
    );
    if (isPromotion) {
      setPendingMove({ from: selectedSquare, to: square });
      setPromotionFrom(selectedSquare);
      return;
    }
    submitMove(selectedSquare, square);
  };

  const submitMove = (from: string, to: string, promotion?: string) => {
    if (!socketRef.current || !room) return;
    setBusy(true);
    setError('');
    setSelectedSquare(null);
    setLegalSquares([]);
    socketRef.current.emit('chess:move', {
      pin: room.pin,
      from,
      to,
      promotion,
      expectedVersion: room.stateVersion,
    });
  };

  const [timeControl, setTimeControl] = useState('5+0');
  const [colorChoice, setColorChoice] = useState('random');

  const handleCreateRoom = () => {
    if (!socketRef.current) return;
    clearSavedChessRoom();
    setSavedPin('');
    setBusy(true);
    setError('');
    socketRef.current.emit('chess:room:create', {
      playerName,
      timeControl,
      colorChoice,
    });
  };

  const handleResumeSavedRoom = () => {
    if (!socketRef.current || !resumableSavedPin) return;
    const storedGuestId = getSavedChessSeatGuestId();
    if (!storedGuestId) {
      setSavedPin('');
      clearSavedChessRoom();
      return;
    }
    setBusy(true);
    setError('');
    socketRef.current.emit('chess:reconnect', {
      pin: resumableSavedPin,
      guestId: storedGuestId,
    });
  };

  const handleJoinRoom = () => {
    if (!socketRef.current || !pin) return;
    const cleanPin = pin.replace(/\D/g, '').slice(0, 6);
    if (cleanPin.length !== 6 || playerName.trim().length < 2) {
      setError('أدخل رمزًا من 6 أرقام واسمًا من حرفين على الأقل.');
      return;
    }
    localStorage.setItem('tahaddi-chess-player-name', playerName.trim());
    setBusy(true);
    setError('');
    socketRef.current.emit('chess:room:join', {
      pin: cleanPin,
      playerName: playerName.trim(),
    });
  };

  const handleSpectate = () => {
    if (!socketRef.current || !pin) return;
    const cleanPin = pin.replace(/\D/g, '').slice(0, 6);
    setBusy(true);
    setError('');
    socketRef.current.emit('chess:spectate', {
      pin: cleanPin,
      spectatorName: playerName.trim() || undefined,
    });
  };

  const handleResign = () => {
    if (!socketRef.current || !room) return;
    if (!confirm('هل أنت متأكد من الاستسلام؟')) return;
    setBusy(true);
    socketRef.current.emit('chess:resign', { pin: room.pin });
  };

  const handleOfferDraw = () => {
    if (!socketRef.current || !room) return;
    setBusy(true);
    socketRef.current.emit('chess:draw:offer', { pin: room.pin });
  };

  const handleDrawResponse = (accept: boolean) => {
    if (!socketRef.current || !room) return;
    setBusy(true);
    socketRef.current.emit('chess:draw:respond', { pin: room.pin, accept });
  };

  const handleLeave = () => {
    if (!socketRef.current || !room) return;
    const canResumeAfterLeave =
      yourRole !== 'spectator' &&
      !room.result &&
      (room.phase === 'countdown' || room.phase === 'playing');
    if (!canResumeAfterLeave) {
      clearSavedChessRoom();
      setSavedPin('');
    } else {
      saveChessRoomPin(room.pin);
      if (room.yourGuestId) {
        saveChessSeatGuestId(room.yourGuestId);
      }
      setSavedPin(room.pin);
      setPin(room.pin);
      setJoinMode(true);
    }
    socketRef.current.emit('chess:leave', { pin: room.pin });
    clearRoom();
    if (canResumeAfterLeave) {
      setError('خرجت مؤقتًا. يمكنك الرجوع لنفس المباراة من زر الاستئناف.');
    }
  };

  const handleBoardSquarePress = (square: string) => {
    if (selectedSquare && legalSquares.includes(square)) {
      handleDestinationClick(square);
      return;
    }
    handleSquareClick(square);
  };

  const boardFlipped = (yourColor === 'black') !== manualBoardFlip;
  const displayBoard = useMemo(() => {
    if (boardFlipped) return [...board].reverse().map((row) => [...row].reverse());
    return board;
  }, [board, boardFlipped]);
  const orderedSquares = useMemo(
    () =>
      Array.from({ length: 64 }, (_, index) => {
        const rowIdx = Math.floor(index / 8);
        const colIdx = index % 8;
        const actualRow = boardFlipped ? 7 - rowIdx : rowIdx;
        const actualCol = boardFlipped ? 7 - colIdx : colIdx;
        return coordsToSquare(actualRow, actualCol);
      }),
    [boardFlipped],
  );
  const { getSquareTabIndex, handleSquareFocus, handleSquareKeyDown } = useChessGridNavigation({
    orderedSquares,
    orientation: boardFlipped ? 'black' : 'white',
    initialSquare: selectedSquare,
  });

  const { inCheck, kingSquare } = useMemo(() => {
    if (!room || !turn) return { inCheck: false, kingSquare: null };
    return getPositionStatus(room.fen);
  }, [room, turn]);

  const formatDuration = (ms: number) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    if (minutes > 0) {
      return `${minutes} دقيقة ${seconds} ثانية`;
    }
    return `${seconds} ثانية`;
  };

  const opponentDisconnectName = useMemo(() => {
    if (!room || !opponentDisconnect) return 'الخصم';
    if (yourColor === 'white') return room.seats.black?.name ?? 'الخصم';
    return room.seats.white?.name ?? 'الخصم';
  }, [room, opponentDisconnect, yourColor]);

  const isDarkSquare = (row: number, col: number) => (row + col) % 2 === 1;

  const topColor: ChessColor = boardFlipped ? 'white' : 'black';
  const bottomColor: ChessColor = boardFlipped ? 'black' : 'white';
  const currentMoveNumber = Math.floor((room?.moves.length ?? 0) / 2) + 1;
  const playerDetails = room
    ? {
        white: {
          name: room.seats.white?.name ?? '—',
          connected: room.seats.white?.connected ?? false,
          remainingMs: room.whiteClock.remainingMs,
          startedAt: room.whiteClock.startedAt
            ? room.whiteClock.startedAt +
              (room.serverNow && room.receivedAt ? room.receivedAt - room.serverNow : 0)
            : undefined,
        },
        black: {
          name: room.seats.black?.name ?? '—',
          connected: room.seats.black?.connected ?? false,
          remainingMs: room.blackClock.remainingMs,
          startedAt: room.blackClock.startedAt
            ? room.blackClock.startedAt +
              (room.serverNow && room.receivedAt ? room.receivedAt - room.serverNow : 0)
            : undefined,
        },
      }
    : null;

  const getTurnLabel = (color: ChessColor) => {
    if (yourRole === 'spectator') return color === 'white' ? 'دور الأبيض' : 'دور الأسود';
    return yourColor === color ? 'دورك' : 'دور المنافس';
  };

  if (!room) {
    const isValidPin = pin.replace(/\D/g, '').length === 6;
    return (
      <section className="section chess-entry" data-game="chess">
        <div className="container">
          <div className="chess-entry__heading">
            <h1>{meta.title}</h1>
            <p>{meta.description}</p>
            <div className="chess-entry-badges">
              <span className="chess-badge">مباشر</span>
              <span className="chess-badge">2 لاعبين</span>
              <span className="chess-badge">بدون تسجيل</span>
            </div>
          </div>
          <Card className="chess-entry-panel">
            <div className="chess-entry-tabs" role="tablist" aria-label="طريقة الدخول">
              <button
                type="button"
                role="tab"
                aria-selected={!joinMode}
                tabIndex={joinMode ? -1 : 0}
                onClick={() => setJoinMode(false)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    setJoinMode((mode) => !mode);
                  }
                }}
              >
                أنشئ تحدي
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={joinMode}
                tabIndex={joinMode ? 0 : -1}
                onClick={() => setJoinMode(true)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                    event.preventDefault();
                    setJoinMode((mode) => !mode);
                  }
                }}
              >
                انضم برمز
              </button>
            </div>
            {joinMode ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleJoinRoom();
                }}
                className="chess-join-form"
                noValidate
              >
                <Input
                  id="chess-player-name"
                  label="اسم اللاعب"
                  value={playerName}
                  onChange={(e) => {
                    setPlayerName(e.target.value);
                    setError('');
                  }}
                  placeholder="الاسم الظاهر"
                  maxLength={30}
                  autoComplete="nickname"
                />
                <Input
                  id="chess-room-pin"
                  label="رمز الغرفة"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
                    setError('');
                  }}
                  placeholder="000000"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  error={pin && !isValidPin ? 'الرمز يجب أن يكون 6 أرقام' : error || undefined}
                />
                <div className="chess-join-actions">
                  <Button
                    type="submit"
                    size="lg"
                    loading={busy}
                    disabled={!connected || busy || !isValidPin || playerName.trim().length < 2}
                  >
                    <LogIn aria-hidden="true" /> تحدَّ الآن
                  </Button>
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    onClick={handleSpectate}
                    disabled={!connected || busy || !isValidPin}
                  >
                    <Play aria-hidden="true" /> شاهد المباراة
                  </Button>
                </div>
              </form>
            ) : (
              <div className="chess-create-room">
                <QrCode aria-hidden="true" />
                <h2>أنشئ تحديًا جديدًا</h2>
                <p>شارك الرمز مع صديقك لتبدأ المباراة مباشرة.</p>
                <Input
                  id="chess-host-name"
                  label="اسمك"
                  value={playerName}
                  onChange={(e) => {
                    setPlayerName(e.target.value);
                    setError('');
                  }}
                  placeholder="الاسم الظاهر"
                  maxLength={30}
                  autoComplete="nickname"
                />
                <div className="chess-time-controls" role="radiogroup" aria-label="اختيار الوقت">
                  <span className="chess-time-controls__label">اختيار الوقت</span>
                  <div className="chess-time-controls__chips">
                    {['none', '3+2', '5+0', '10+0', '15+10'].map((tc) => (
                      <button
                        key={tc}
                        type="button"
                        role="radio"
                        aria-checked={timeControl === tc}
                        className={`chess-time-chip ${timeControl === tc ? 'active' : ''}`}
                        onClick={() => setTimeControl(tc)}
                      >
                        {tc === 'none' ? 'بدون وقت' : tc}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="chess-color-choice" role="radiogroup" aria-label="اختيار اللون">
                  <span className="chess-color-choice__label">اللون</span>
                  <div className="chess-color-choice__chips">
                    {[
                      { value: 'random', label: 'عشوائي' },
                      { value: 'white', label: 'أبيض' },
                      { value: 'black', label: 'أسود' },
                    ].map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={colorChoice === opt.value}
                        className={`chess-color-chip ${colorChoice === opt.value ? 'active' : ''}`}
                        onClick={() => setColorChoice(opt.value)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <Button
                  variant="gold"
                  size="lg"
                  loading={busy}
                  disabled={!connected || busy || playerName.trim().length < 2}
                  onClick={handleCreateRoom}
                  fullWidth
                >
                  <Play aria-hidden="true" /> إنشاء التحدي
                </Button>
                {resumableSavedPin && (
                  <Button
                    type="button"
                    size="lg"
                    variant="outline"
                    loading={busy}
                    disabled={!connected || busy}
                    onClick={handleResumeSavedRoom}
                    fullWidth
                  >
                    استكمال آخر غرفة ({resumableSavedPin})
                  </Button>
                )}
              </div>
            )}
            {error && (
              <p className="chess-error" role="alert">
                <X aria-hidden="true" />
                {error}
              </p>
            )}
            <GameHowTo guide={GAME_GUIDES.chess} />
          </Card>
        </div>
      </section>
    );
  }

  return (
    <section className="section chess-stage" data-game="chess" data-phase={room.phase}>
      <div className="container">
        <header className="chess-stage-header">
          <div>
            <span className="chess-stage-header__mode">{meta.title}</span>
            <h1>
              {room.phase === 'waiting' && 'غرفة الانتظار'}
              {room.phase === 'ready' && 'جاهز للبدء'}
              {room.phase === 'countdown' && 'جاهز...'}
              {room.phase === 'playing' && 'المباراة'}
              {room.phase === 'finished' && 'انتهت المباراة'}
            </h1>
          </div>
          <div className="chess-stage-header__signals">
            <span className="chess-room-pin">غرفة {room.pin}</span>
          </div>
        </header>

        {room.phase === 'waiting' && (
          <Card className="chess-waiting-panel">
            <div className="chess-waiting-matchup">
              <div
                className={`chess-ready-player ${room.seats.white?.connected ? 'ready' : 'waiting'}`}
              >
                <span className="chess-ready-player__name">
                  {room.seats.white?.name ?? 'بانتظار اللاعب'}
                </span>
                <span className="chess-ready-player__color">
                  <ChessPieceSvg piece="K" color="white" decorative />
                  الأبيض
                </span>
              </div>
              <div className="chess-ready-vs">
                <span>ضد</span>
              </div>
              <div
                className={`chess-ready-player ${room.seats.black?.connected ? 'ready' : 'waiting'}`}
              >
                <span className="chess-ready-player__name">
                  {room.seats.black?.name ?? 'بانتظار المنافس'}
                </span>
                <span className="chess-ready-player__color">
                  <ChessPieceSvg piece="K" color="black" decorative />
                  الأسود
                </span>
              </div>
            </div>
            <div className="chess-qr">
              {shareUrl ? (
                <QRCode
                  value={shareUrl}
                  size={200}
                  bgColor="var(--qr-paper)"
                  fgColor="var(--qr-ink)"
                  aria-label={`رمز QR للانضمام إلى الغرفة ${room.pin}`}
                />
              ) : null}
            </div>
            <div className="chess-invite-copy">
              <span>رمز الدخول</span>
              <strong dir="ltr">{room.pin}</strong>
              <p>امسح QR أو افتح رابط الدعوة من جهاز صديقك.</p>
              <div className="chess-join-actions">
                <Button variant="outline" onClick={copyInvite} disabled={!shareUrl}>
                  {copied ? (
                    <span>✓ نُسخ الرابط</span>
                  ) : (
                    <>
                      <Copy aria-hidden="true" /> انسخ الرابط
                    </>
                  )}
                </Button>
                <Button variant="ghost" onClick={handleLeave}>
                  <LogOut aria-hidden="true" /> خروج
                </Button>
              </div>
            </div>
          </Card>
        )}

        {room.phase === 'ready' && (
          <Card className="chess-ready-panel">
            <div className="chess-ready-matchup">
              <div
                className={`chess-ready-player ${room.seats.white?.connected ? 'ready' : 'waiting'}`}
              >
                <span className="chess-ready-player__name">
                  {room.seats.white?.name ?? 'بانتظار اللاعب'}
                </span>
                <span className="chess-ready-player__color">
                  <ChessPieceSvg piece="K" color="white" decorative />
                  الأبيض
                </span>
                {room.seats.white?.connected && (
                  <span className="chess-ready-player__status">جاهز</span>
                )}
              </div>
              <div className="chess-ready-vs">
                <span>ضد</span>
              </div>
              <div
                className={`chess-ready-player ${room.seats.black?.connected ? 'ready' : 'waiting'}`}
              >
                <span className="chess-ready-player__name">
                  {room.seats.black?.name ?? 'بانتظار اللاعب'}
                </span>
                <span className="chess-ready-player__color">
                  <ChessPieceSvg piece="K" color="black" decorative />
                  الأسود
                </span>
                {room.seats.black?.connected && (
                  <span className="chess-ready-player__status">جاهز</span>
                )}
              </div>
            </div>
            {isHost && (
              <Button
                variant="gold"
                size="lg"
                onClick={() => socketRef.current?.emit('chess:player:ready', { pin: room.pin })}
              >
                بدء المباراة
              </Button>
            )}
          </Card>
        )}

        {room.phase === 'countdown' && countdown && (
          <Card className="chess-countdown-panel">
            <h2>تبدأ المباراة خلال...</h2>
            <div className="chess-countdown-number">{countdown.remaining}</div>
          </Card>
        )}

        {(room.phase === 'playing' || room.phase === 'finished') && (
          <div className="chess-play-grid" role="region" aria-label="واجهة مباراة الشطرنج">
            <aside className="chess-captured-rail" aria-label="القطع المأسورة">
              <header className="chess-captured-rail__header">
                <span>القطع المأسورة</span>
                <small>{capturedPieces.white.length + capturedPieces.black.length}</small>
              </header>
              <CapturedPiecesPanel color={topColor} pieces={capturedPieces[topColor]} />
              <CapturedPiecesPanel color={bottomColor} pieces={capturedPieces[bottomColor]} />
            </aside>
            <div className="chess-board-wrapper">
              {yourRole === 'spectator' && (
                <div className="chess-spectator-header">
                  <span className="chess-spectator-badge">
                    <Eye aria-hidden="true" size={14} /> مشاهدة المباراة
                  </span>
                  <div className="chess-spectator-matchup">
                    <span>{room.seats.white?.name ?? '—'}</span>
                    <span className="chess-spectator-vs">ضد</span>
                    <span>{room.seats.black?.name ?? '—'}</span>
                  </div>
                </div>
              )}
              {playerDetails && (
                <ChessPlayerBar
                  color={topColor}
                  {...playerDetails[topColor]}
                  active={room.phase === 'playing' && turn === topColor}
                  isSelf={yourColor === topColor}
                  turnLabel={getTurnLabel(topColor)}
                  position="opponent"
                  capturedPieces={capturedPieces[topColor]}
                />
              )}
              <div className="chess-board-stage">
                <ChessBoardFrame flipped={boardFlipped} showCoordinates={showCoordinates}>
                  <div
                    className="chess-board chess-board--classic"
                    ref={boardRef}
                    role="grid"
                    aria-label="رقعة الشطرنج الكلاسيكية"
                    aria-rowcount={8}
                    aria-colcount={8}
                    aria-readonly={yourRole === 'spectator' || room.phase === 'finished'}
                    dir="ltr"
                  >
                    {displayBoard.map((row, rowIdx) => (
                      <div
                        key={rowIdx}
                        className="chess-board__row"
                        role="row"
                        aria-rowindex={rowIdx + 1}
                      >
                        {row.map((piece, colIdx) => {
                          const actualRow = boardFlipped ? 7 - rowIdx : rowIdx;
                          const actualCol = boardFlipped ? 7 - colIdx : colIdx;
                          const square = coordsToSquare(actualRow, actualCol);
                          const isSelected = selectedSquare === square;
                          const isLegal = legalSquares.includes(square);
                          const isLastMove =
                            room.lastMove &&
                            (room.lastMove.from === square || room.lastMove.to === square);
                          const isKingInCheckSquare = inCheck && square === kingSquare;
                          const isCheckmateSquare =
                            Boolean(
                              gameEnd?.reason === 'checkmate' ||
                              room.result?.reason === 'checkmate',
                            ) && square === kingSquare;
                          const hasPiece = piece !== null;
                          const pieceColor = hasPiece
                            ? piece === piece.toUpperCase()
                              ? 'white'
                              : 'black'
                            : 'white';
                          const squareLabel = getAccessibleChessSquareLabel({
                            baseLabel: hasPiece
                              ? `${getPieceLabel(piece)} في ${square}`
                              : `مربع ${square}`,
                            selected: isSelected,
                            legal: isLegal,
                            capture: isLegal && hasPiece,
                            lastMove: Boolean(isLastMove),
                            check: isKingInCheckSquare,
                            checkmate: isCheckmateSquare,
                          });
                          return (
                            <div
                              key={square}
                              className="chess-gridcell"
                              role="gridcell"
                              aria-label={squareLabel}
                              aria-selected={isSelected}
                              aria-colindex={colIdx + 1}
                            >
                              <button
                                type="button"
                                className={[
                                  'chess-square',
                                  isDarkSquare(actualRow, actualCol) ? 'dark' : 'light',
                                  isSelected ? 'selected' : '',
                                  isLegal ? 'legal' : '',
                                  isLastMove ? 'last-move' : '',
                                  isKingInCheckSquare ? 'in-check' : '',
                                  isCheckmateSquare ? 'in-checkmate' : '',
                                  hasPiece ? 'occupied' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                onClick={() => handleBoardSquarePress(square)}
                                onFocus={() => handleSquareFocus(square)}
                                onKeyDown={(event) => handleSquareKeyDown(event, square)}
                                aria-label={squareLabel}
                                tabIndex={getSquareTabIndex(square)}
                                data-square={square}
                              >
                                {hasPiece && (
                                  <ChessPieceSvg piece={piece} color={pieceColor} decorative />
                                )}
                                {isLegal && !hasPiece && <span className="chess-legal-dot" />}
                                {isLegal && hasPiece && <span className="chess-legal-ring" />}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </ChessBoardFrame>
              </div>
              {playerDetails && (
                <ChessPlayerBar
                  color={bottomColor}
                  {...playerDetails[bottomColor]}
                  active={room.phase === 'playing' && turn === bottomColor}
                  isSelf={yourColor === bottomColor}
                  turnLabel={getTurnLabel(bottomColor)}
                  position="player"
                  capturedPieces={capturedPieces[bottomColor]}
                />
              )}
              <div
                className="chess-turn-banner"
                data-self-turn={(room.phase === 'playing' && isYourTurn) || undefined}
                aria-live="polite"
              >
                <span className="chess-turn-banner__dot" aria-hidden="true" />
                <span className="chess-turn-banner__copy">
                  <strong>
                    {room.phase === 'finished'
                      ? 'انتهت المباراة'
                      : turn === 'white'
                        ? 'دور الأبيض'
                        : 'دور الأسود'}
                  </strong>
                  <small>الحركة {currentMoveNumber}</small>
                </span>
                <span className="chess-turn-banner__instruction">
                  {room.phase === 'finished'
                    ? 'راجع النتيجة والنقلات'
                    : isYourTurn
                      ? 'حرّك قطعة'
                      : 'بانتظار النقلة التالية'}
                </span>
              </div>
              <div className="chess-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setManualBoardFlip((current) => !current)}
                  aria-label="قلب الرقعة"
                  aria-pressed={manualBoardFlip}
                >
                  <RotateCcw aria-hidden="true" />
                  قلب الرقعة
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowBoardSettings((current) => !current)}
                  aria-label="الإعدادات"
                  aria-expanded={showBoardSettings}
                  aria-controls="chess-board-settings"
                >
                  <Settings aria-hidden="true" />
                  الإعدادات
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="chess-action--mobile-hidden"
                  disabled
                  aria-label="تراجع"
                  title="التراجع غير متاح في اللعب المباشر"
                >
                  <Undo2 aria-hidden="true" />
                  تراجع
                </Button>
                {yourRole !== 'spectator' && room.phase === 'playing' && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleOfferDraw}
                      disabled={busy || !!drawOffered}
                    >
                      <Handshake aria-hidden="true" />
                      عرض تعادل
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleResign} disabled={busy}>
                      <Flag aria-hidden="true" />
                      استسلام
                    </Button>
                  </>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="chess-action--mobile-hidden"
                  onClick={handleLeave}
                >
                  <LogOut aria-hidden="true" />
                  خروج
                </Button>
              </div>
              {showBoardSettings && (
                <section
                  className="chess-board-settings"
                  id="chess-board-settings"
                  aria-label="إعدادات الرقعة"
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={showCoordinates}
                      onChange={(event) => setShowCoordinates(event.target.checked)}
                    />
                    إظهار إحداثيات الرقعة
                  </label>
                </section>
              )}
            </div>
            <ChessMoveHistory
              moves={room.moves}
              open={showMoveHistory}
              onToggle={() => setShowMoveHistory((current) => !current)}
            />
          </div>
        )}

        {opponentDisconnect && !opponentReconnect && (
          <Card className="chess-disconnect-notice" role="status" aria-live="polite">
            <p>انقطع اتصال {opponentDisconnectName}. ننتظر عودته...</p>
            <span className="chess-disconnect-timer">
              متبقي {opponentDisconnect.gracePeriodSeconds} ثانية
            </span>
          </Card>
        )}
        {opponentReconnect && (
          <Card
            className="chess-disconnect-notice chess-reconnect-notice"
            role="status"
            aria-live="polite"
          >
            <p>عاد {opponentDisconnectName} إلى المباراة</p>
          </Card>
        )}

        {drawOffered && yourRole !== 'spectator' && (
          <Card
            id="chess-draw-dialog"
            className="chess-draw-offer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chess-draw-offer-title"
            tabIndex={-1}
          >
            <p id="chess-draw-offer-title">
              عرض تعادل من {drawOffered.by === 'white' ? 'الأبيض' : 'الأسود'}
            </p>
            <div className="chess-join-actions">
              <Button variant="gold" size="sm" onClick={() => handleDrawResponse(true)}>
                قبول
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleDrawResponse(false)}>
                رفض
              </Button>
            </div>
          </Card>
        )}

        {gameEnd && (
          <Card
            id="chess-result-dialog"
            className="chess-result-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="chess-result-title"
            tabIndex={-1}
          >
            <Trophy aria-hidden="true" />
            <h2 id="chess-result-title">
              {gameEnd.winner === 'draw'
                ? 'تعادل'
                : gameEnd.winner === 'white'
                  ? (room.seats.white?.name ?? 'الأبيض')
                  : (room.seats.black?.name ?? 'الأسود')}
            </h2>
            <p className="chess-result-winner">
              {gameEnd.winner === 'draw' ? 'انتهى التحدي بالتعادل' : `يفوز بالتحدي`}
            </p>
            <p className="chess-result-reason">
              {gameEnd.reason === 'checkmate' && 'كش مات'}
              {gameEnd.reason === 'stalemate' && 'تعادل - بات'}
              {gameEnd.reason === 'draw_repetition' && 'تعادل - تكرار ثلاثي'}
              {gameEnd.reason === 'draw_fifty_move' && 'تعادل - قاعدة الخمسين نقلة'}
              {gameEnd.reason === 'draw_insufficient_material' && 'تعادل - عدم كفاية القطع'}
              {gameEnd.reason === 'draw_agreement' && 'تعادل بالاتفاق'}
              {gameEnd.reason === 'resignation' && 'استسلام'}
              {gameEnd.reason === 'timeout' && 'انتهاء الوقت'}
              {gameEnd.reason === 'aborted' && 'ملغاة'}
            </p>
            <div className="chess-result-meta">
              <span>النقلات: {gameEnd.moveCount}</span>
              <span>المدة: {formatDuration(gameEnd.durationMs)}</span>
            </div>
            <div className="chess-result-actions">
              <Button variant="gold" size="sm" onClick={handleLeave}>
                <RotateCcw aria-hidden="true" />
                مباراة جديدة
              </Button>
              <Button variant="outline" size="sm" onClick={handleLeave}>
                العودة للألعاب
              </Button>
            </div>
          </Card>
        )}

        {checkAlert && (
          <div className="chess-check-alert" role="alert" aria-live="assertive">
            كش
          </div>
        )}
        {mateAlert && (
          <div
            className="chess-check-alert chess-check-alert--mate"
            role="alert"
            aria-live="assertive"
          >
            كش مات
          </div>
        )}

        {promotionFrom && pendingMove && (
          <div
            className="chess-promotion-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="اختر الترقية"
          >
            <h3>ترقية الجندي</h3>
            <p className="chess-promotion-hint">اختر القطعة الجديدة</p>
            <div className="chess-promotion-options">
              {['q', 'r', 'b', 'n'].map((p) => {
                const label = PIECE_LABELS_AR[p.toUpperCase()] ?? p;
                return (
                  <button
                    key={p}
                    type="button"
                    className="chess-promotion-btn"
                    onClick={() => {
                      submitMove(pendingMove.from, pendingMove.to, p);
                      setPromotionFrom(null);
                      setPendingMove(null);
                    }}
                  >
                    <ChessPieceSvg
                      piece={p.toUpperCase()}
                      color={yourColor ?? 'white'}
                      decorative
                    />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {error && room && (
          <p className="chess-error" role="alert">
            <X aria-hidden="true" />
            {error}
          </p>
        )}
      </div>
    </section>
  );
}
