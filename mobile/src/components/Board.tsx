// Chessboard drawn with plain Views + react-native-svg. Moves by tap
// (piece, then square) or drag. Reports only legal moves; whether a move
// is "right" is the caller's business.
import { memo, useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import { SvgXml } from 'react-native-svg';
import type { Role } from 'chessops';
import { makeSquare, parseSquare } from 'chessops';
import { PIECE_SVGS } from '../data/pieces';
import { isPromotion, legalDests, positionFromFen, type Square } from '../core/chess';
import type { Color } from '../core/types';
import { theme } from './theme';

export type Arrow = { from: Square; to?: Square; color: string };

type Props = {
  fen: string;
  orientation: Color;
  size: number;
  lastMove?: [Square, Square] | null;
  arrows?: Arrow[];
  // squares tinted with a color (e.g. a wrong guess)
  marks?: { square: Square; color: string }[];
  movable: boolean;
  // when set, only this move is accepted (learn mode / after a miss)
  onlyMove?: [Square, Square] | null;
  onMove: (from: Square, to: Square, promotion?: Role) => void;
};

const ROLE_LETTER: Record<string, string> = { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' };

const Piece = memo(function Piece({ id, size }: { id: string; size: number }) {
  return <SvgXml xml={PIECE_SVGS[id]} width={size} height={size} />;
});

function squareAt(x: number, y: number, sq: number, orientation: Color): Square | null {
  const col = Math.floor(x / sq);
  const row = Math.floor(y / sq);
  if (col < 0 || col > 7 || row < 0 || row > 7) return null;
  const file = orientation === 'white' ? col : 7 - col;
  const rank = orientation === 'white' ? 7 - row : row;
  return String.fromCharCode(97 + file) + (rank + 1);
}

function squareXY(s: Square, sq: number, orientation: Color) {
  const file = s.charCodeAt(0) - 97;
  const rank = Number(s[1]) - 1;
  const col = orientation === 'white' ? file : 7 - file;
  const row = orientation === 'white' ? 7 - rank : rank;
  return { x: col * sq, y: row * sq };
}

export function Board({ fen, orientation, size, lastMove, arrows, marks, movable, onlyMove, onMove }: Props) {
  const sq = size / 8;
  const pos = useMemo(() => positionFromFen(fen), [fen]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [drag, setDrag] = useState<{ from: Square; x: number; y: number } | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);

  // Reset selection whenever the position changes.
  const fenRef = useRef(fen);
  if (fenRef.current !== fen) {
    fenRef.current = fen;
    if (selected) setSelected(null);
    if (promo) setPromo(null);
  }

  const dests = useMemo(() => {
    if (!pos || !movable) return new Map<Square, Square[]>();
    const all = legalDests(pos);
    if (!onlyMove) return all;
    const [f, t] = onlyMove;
    const allowed = (all.get(f) ?? []).filter((d) => d === t || sameCastle(f, t, d));
    return new Map(allowed.length ? [[f, allowed]] : []);
  }, [pos, movable, onlyMove]);

  const pieces = useMemo(() => {
    const out: { square: Square; id: string }[] = [];
    if (!pos) return out;
    for (const [s, piece] of pos.board) {
      out.push({ square: makeSquare(s), id: (piece.color === 'white' ? 'w' : 'b') + ROLE_LETTER[piece.role] });
    }
    return out;
  }, [pos]);

  // Latest values for the responder callbacks (the responder is created
  // once, so it must never close over render-time values directly).
  const live = useRef({ dests, selected, sq, orientation, pos, onMove });
  live.current = { dests, selected, sq, orientation, pos, onMove };
  const dragRef = useRef<{ from: Square } | null>(null);

  const tryMove = (from: Square, to: Square) => {
    const { dests: d, pos: p, onMove: move } = live.current;
    if (!d.get(from)?.includes(to)) return false;
    setSelected(null);
    if (p && isPromotion(p, from, to)) {
      setPromo({ from, to });
      return true;
    }
    move(from, to);
    return true;
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const { sq: s, orientation: o, dests: d, selected: sel } = live.current;
          const { locationX: x, locationY: y } = e.nativeEvent;
          const target = squareAt(x, y, s, o);
          if (!target) return;
          if (sel && sel !== target && tryMove(sel, target)) return;
          if (d.has(target)) {
            setSelected(target);
            dragRef.current = { from: target };
            setDrag({ from: target, x, y });
          } else {
            setSelected(null);
          }
        },
        onPanResponderMove: (e) => {
          const dr = dragRef.current;
          if (dr) setDrag({ from: dr.from, x: e.nativeEvent.locationX, y: e.nativeEvent.locationY });
        },
        onPanResponderRelease: (e) => {
          const { sq: s, orientation: o } = live.current;
          const dr = dragRef.current;
          dragRef.current = null;
          setDrag(null);
          if (!dr) return;
          const target = squareAt(e.nativeEvent.locationX, e.nativeEvent.locationY, s, o);
          // releasing on the start square is a tap: keep it selected
          if (target && target !== dr.from) tryMove(dr.from, target);
        },
        onPanResponderTerminate: () => {
          dragRef.current = null;
          setDrag(null);
        },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const light = (row + col) % 2 === 0;
      squares.push(
        <View
          key={`${row}${col}`}
          style={{
            position: 'absolute',
            left: col * sq,
            top: row * sq,
            width: sq,
            height: sq,
            backgroundColor: light ? theme.boardLight : theme.boardDark,
          }}
        />,
      );
    }
  }

  const tint = (s: Square, color: string, key: string) => {
    const { x, y } = squareXY(s, sq, orientation);
    return <View key={key} style={{ position: 'absolute', left: x, top: y, width: sq, height: sq, backgroundColor: color }} />;
  };

  const selDests = selected ? (dests.get(selected) ?? []) : [];
  const files = orientation === 'white' ? 'abcdefgh' : 'hgfedcba';
  const ranks = orientation === 'white' ? '87654321' : '12345678';

  return (
    <View style={{ width: size, height: size }}>
      <View style={StyleSheet.absoluteFill} {...responder.panHandlers}>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          {squares}
          {lastMove?.map((s, i) => tint(s, theme.lastMove, `lm${i}`))}
          {marks?.map((m, i) => tint(m.square, m.color, `mk${i}`))}
          {selected && tint(selected, theme.selected, 'sel')}
          {/* coordinates */}
          {[...files].map((f, i) => (
            <Text
              key={`f${f}`}
              style={[styles.coord, { left: i * sq + sq - 9, top: size - 13, color: (7 + i) % 2 === 0 ? theme.boardDark : theme.boardLight }]}
            >
              {f}
            </Text>
          ))}
          {[...ranks].map((r, i) => (
            <Text key={`r${r}`} style={[styles.coord, { left: 2, top: i * sq + 1, color: i % 2 === 0 ? theme.boardDark : theme.boardLight }]}>
              {r}
            </Text>
          ))}
          {pieces.map(({ square, id }) => {
            const { x, y } = squareXY(square, sq, orientation);
            const dragging = drag?.from === square;
            return (
              <View key={square + id} style={{ position: 'absolute', left: x, top: y, opacity: dragging ? 0.3 : 1 }}>
                <Piece id={id} size={sq} />
              </View>
            );
          })}
          <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
            {selDests.map((d) => {
              const { x, y } = squareXY(d, sq, orientation);
              const occupied = !!pos?.board.get(parseSquare(d)!);
              return occupied ? (
                <Circle key={d} cx={x + sq / 2} cy={y + sq / 2} r={sq * 0.46} stroke={theme.dest} strokeWidth={sq * 0.08} fill="none" />
              ) : (
                <Circle key={d} cx={x + sq / 2} cy={y + sq / 2} r={sq * 0.15} fill={theme.dest} />
              );
            })}
            {arrows?.map((a, i) => <ArrowShape key={i} arrow={a} sq={sq} orientation={orientation} />)}
          </Svg>
          {drag && (
            <View style={{ position: 'absolute', left: drag.x - sq * 0.6, top: drag.y - sq * 0.9 }}>
              <Piece id={pieces.find((p) => p.square === drag.from)?.id ?? 'wP'} size={sq * 1.2} />
            </View>
          )}
        </View>
      </View>
      {promo && (
        <PromotionPicker
          color={pos?.turn ?? 'white'}
          onPick={(role) => {
            const p = promo;
            setPromo(null);
            if (role) onMove(p.from, p.to, role);
          }}
        />
      )}
    </View>
  );
}

// e1->h1 and e1->g1 are the same castle (likewise a/c files).
function sameCastle(from: Square, target: Square, d: Square) {
  if (from[0] !== 'e' || target[1] !== from[1] || d[1] !== from[1]) return false;
  const kingSide = (s: Square) => s[0] === 'g' || s[0] === 'h';
  const queenSide = (s: Square) => s[0] === 'c' || s[0] === 'a';
  return (kingSide(target) && kingSide(d)) || (queenSide(target) && queenSide(d));
}

function ArrowShape({ arrow, sq, orientation }: { arrow: Arrow; sq: number; orientation: Color }) {
  const a = squareXY(arrow.from, sq, orientation);
  const ax = a.x + sq / 2;
  const ay = a.y + sq / 2;
  if (!arrow.to) {
    return <Circle cx={ax} cy={ay} r={sq * 0.45} stroke={arrow.color} strokeWidth={sq * 0.08} fill="none" />;
  }
  const b = squareXY(arrow.to, sq, orientation);
  const bx = b.x + sq / 2;
  const by = b.y + sq / 2;
  const len = Math.hypot(bx - ax, by - ay);
  const ux = (bx - ax) / len;
  const uy = (by - ay) / len;
  const head = sq * 0.4;
  const w = sq * 0.16;
  const ex = bx - ux * head;
  const ey = by - uy * head;
  const pts = [
    `${bx},${by}`,
    `${ex - uy * head * 0.6},${ey + ux * head * 0.6}`,
    `${ex + uy * head * 0.6},${ey - ux * head * 0.6}`,
  ].join(' ');
  return (
    <>
      <Line x1={ax} y1={ay} x2={ex} y2={ey} stroke={arrow.color} strokeWidth={w} strokeLinecap="round" />
      <Polygon points={pts} fill={arrow.color} />
    </>
  );
}

function PromotionPicker({ color, onPick }: { color: Color; onPick: (r: Role | null) => void }) {
  const roles: Role[] = ['queen', 'rook', 'bishop', 'knight'];
  const c = color === 'white' ? 'w' : 'b';
  return (
    <Pressable style={styles.promoBackdrop} onPress={() => onPick(null)}>
      <View style={styles.promoBox}>
        {roles.map((r) => (
          <Pressable key={r} onPress={() => onPick(r)} style={styles.promoItem}>
            <Piece id={c + ROLE_LETTER[r]} size={56} />
          </Pressable>
        ))}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  coord: { position: 'absolute', fontSize: 10, fontWeight: '700' },
  promoBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoBox: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 6 },
  promoItem: { padding: 4 },
});
