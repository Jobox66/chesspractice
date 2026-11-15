import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Line, Path, Polyline, Rect, Stop } from 'react-native-svg';
import { SvgXml } from 'react-native-svg';
import { router } from 'expo-router';
import type { Color } from '../core/types';
import { PIECE_SVGS } from '../data/pieces';
import {
  accuracy,
  evalText,
  JUDGMENT_COLOR,
  JUDGMENT_LABEL,
  JUDGMENT_ORDER,
  JUDGMENT_SYMBOL,
  judgmentCounts,
  type Judgment,
  type MoveReview,
  type PlyEval,
  winPct,
} from '../play/analysis';
import type { OpeningMatch } from '../play/openings';
import type { PieceRole } from '../play/game';
import { useApp } from '../store/app';
import { theme } from './theme';

const ROLE_TO_SVG: Record<PieceRole, string> = {
  p: 'P',
  n: 'N',
  b: 'B',
  r: 'R',
  q: 'Q',
};

const MiniPiece = memo(function MiniPiece({ id, size }: { id: string; size: number }) {
  const xml = PIECE_SVGS[id];
  if (!xml) return null;
  return <SvgXml xml={xml} width={size} height={size} />;
});

export function CapturedPieces({
  pieces,
  color,
  advantage,
}: {
  pieces: PieceRole[];
  color: Color;
  advantage: number;
}) {
  if (pieces.length === 0 && advantage <= 0) return null;
  const prefix = color === 'white' ? 'w' : 'b';
  // Group consecutive identical roles
  const groups: { role: PieceRole; count: number }[] = [];
  for (const r of pieces) {
    const last = groups[groups.length - 1];
    if (last && last.role === r) last.count++;
    else groups.push({ role: r, count: 1 });
  }
  return (
    <View style={styles.capRow}>
      {groups.map((group) => (
        <View key={group.role} style={styles.capGroup}>
          {Array.from({ length: group.count }).map((_, i) => (
            <View key={i} style={[styles.capIconWrap, i > 0 && { marginLeft: -8 }]}>
              <MiniPiece id={prefix + ROLE_TO_SVG[group.role]} size={18} />
            </View>
          ))}
        </View>
      ))}
      {advantage > 0 && <Text style={styles.capScore}>+{advantage}</Text>}
    </View>
  );
}

export function BoardPlayerBar({
  color,
  isUser,
  elo,
  active,
  thinking,
  captured,
  advantage,
}: {
  color: Color;
  isUser: boolean;
  elo: number;
  active: boolean;
  thinking: boolean;
  captured: PieceRole[];
  advantage: number;
}) {
  const capturedPieceColor: Color = color === 'white' ? 'black' : 'white';
  return (
    <View style={[styles.playerBar, active && styles.playerBarActive]}>
      <View style={styles.playerLeft}>
        <View style={[styles.colorSwatch, color === 'white' ? styles.swatchWhite : styles.swatchBlack]} />
        <Text style={styles.playerName}>{isUser ? 'You' : 'Stockfish'}</Text>
        {!isUser && <Text style={styles.eloPill}>{elo}</Text>}
        {thinking && <ActivityIndicator size="small" color={theme.primary} style={{ marginLeft: 4 }} />}
      </View>
      <CapturedPieces pieces={captured} color={capturedPieceColor} advantage={advantage} />
    </View>
  );
}

export function VerticalEvalBar({
  evalPoint,
  flipped,
  height,
  width = 24,
}: {
  evalPoint?: PlyEval;
  flipped: boolean;
  height: number;
  width?: number;
}) {
  const whitePct = evalPoint ? Math.max(4, Math.min(96, winPct(evalPoint))) : 50;
  const whiteAdvantage = evalPoint?.mate != null ? evalPoint.mate >= 0 : (evalPoint?.cp ?? 0) >= 0;
  const label = evalPoint ? evalText(evalPoint, 'white').replace(/^\+/, '') : '0.0';

  const topIsWhite = flipped;
  const topPct = topIsWhite ? whitePct : 100 - whitePct;
  const bottomPct = 100 - topPct;
  const labelAtBottom = (whiteAdvantage && !flipped) || (!whiteAdvantage && flipped);

  return (
    <View style={[styles.evalBar, { width, height }]}>
      <View
        style={{
          width: '100%',
          height: `${topPct}%`,
          backgroundColor: topIsWhite ? '#f1f5f9' : '#262930',
        }}
      />
      <View
        style={{
          width: '100%',
          height: `${bottomPct}%`,
          backgroundColor: topIsWhite ? '#262930' : '#f1f5f9',
        }}
      />
      <View style={[styles.evalMidline, { top: height / 2 }]} />
      <Text
        style={[
          styles.evalLabel,
          labelAtBottom ? styles.evalLabelBottom : styles.evalLabelTop,
          { color: whiteAdvantage ? '#1e293b' : '#f8fafc' },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

export function OpeningBanner({
  opening,
  inBook,
}: {
  opening: OpeningMatch | null;
  inBook: boolean;
}) {
  const repertoire = useApp((s) => s.repertoire);
  if (!opening) return null;

  const chapterName = opening.chapter?.name;
  const tip = opening.chapter?.tip;

  const openChapter = () => {
    if (!chapterName) {
      router.push('/');
      return;
    }
    const found = repertoire.find(
      (c) =>
        c.name.toLowerCase() === chapterName.toLowerCase() ||
        c.name.toLowerCase().includes(opening.name.toLowerCase()),
    );
    if (found) {
      router.push({ pathname: '/train/[id]', params: { id: found.uuid, mode: 'learn' } });
    } else {
      router.push('/');
    }
  };

  return (
    <View style={styles.openingCard}>
      <View style={styles.openingTop}>
        <Text style={styles.ecoBadge}>{opening.eco}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.openingName}>
            {opening.name}
            {opening.variation ? <Text style={styles.openingVar}> · {opening.variation}</Text> : null}
          </Text>
        </View>
        <View style={[styles.bookBadge, inBook ? styles.bookBadgeIn : styles.bookBadgeOut]}>
          <Text style={[styles.bookBadgeText, inBook ? styles.bookTextIn : styles.bookTextOut]}>
            {inBook ? '📖 Book' : '⚡ Out of Book'}
          </Text>
        </View>
      </View>

      {(chapterName || tip) && (
        <View style={styles.openingMeta}>
          {chapterName && (
            <View style={styles.chapterRow}>
              <Text style={styles.chapterLabel} numberOfLines={1}>
                📚 Giáo trình: <Text style={{ fontWeight: '700', color: theme.text }}>{chapterName}</Text>
              </Text>
              <Pressable onPress={openChapter} style={styles.trainBtn}>
                <Text style={styles.trainBtnText}>Luyện tập ↗</Text>
              </Pressable>
            </View>
          )}
          {tip && <Text style={styles.openingTip}>💡 {tip}</Text>}
        </View>
      )}
    </View>
  );
}

export function AnalysisSummary({
  reviewed,
  userColor,
}: {
  reviewed: MoveReview[];
  userColor: Color;
}) {
  const sideBlock = (side: Color, title: string, tag: string) => {
    const acc = accuracy(reviewed, side);
    const c = judgmentCounts(reviewed, side);
    const isWhite = side === 'white';
    return (
      <View style={[styles.sumCard, isWhite ? styles.sumCardWhite : styles.sumCardBlack]}>
        <View style={styles.sumHeader}>
          <View style={styles.sumSideWrap}>
            <View style={[styles.colorSwatch, isWhite ? styles.swatchWhite : styles.swatchBlack]} />
            <Text style={[styles.sumSideTitle, !isWhite && { color: '#f8fafc' }]}>{title}</Text>
          </View>
          <Text style={[styles.sumTag, isWhite ? styles.sumTagWhite : styles.sumTagBlack]}>{tag}</Text>
        </View>
        <View style={styles.sumAccRow}>
          <Text style={[styles.sumAccVal, !isWhite && { color: '#ffffff' }]}>{acc ?? '—'}%</Text>
          <Text style={[styles.sumAccLbl, !isWhite && { color: '#94a3b8' }]}>ACCURACY</Text>
        </View>
        <View style={styles.sumChips}>
          {JUDGMENT_ORDER.map((j) => {
            const count = c[j];
            if (count === 0 && j !== 'mistake' && j !== 'blunder' && j !== 'best') return null;
            return (
              <View
                key={j}
                style={[
                  styles.sumChip,
                  { backgroundColor: JUDGMENT_COLOR[j] + '24', borderColor: JUDGMENT_COLOR[j] + '66' },
                ]}
              >
                <Text style={[styles.sumChipText, { color: JUDGMENT_COLOR[j] }]}>
                  {JUDGMENT_SYMBOL[j]} {count}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.sumGrid}>
      {sideBlock('white', 'WHITE', userColor === 'white' ? 'YOU' : 'BOT')}
      {sideBlock('black', 'BLACK', userColor === 'black' ? 'YOU' : 'BOT')}
    </View>
  );
}

export function EvalGraph({
  evals,
  reviewed,
  ply,
  onSelect,
  width,
  height = 84,
}: {
  evals: PlyEval[];
  reviewed: MoveReview[];
  ply: number;
  onSelect: (ply: number) => void;
  width: number;
  height?: number;
}) {
  if (evals.length < 2 || width <= 0) return null;
  const maxPly = evals.length - 1;
  const xOf = (i: number) => (i / maxPly) * width;
  const yOf = (e: PlyEval) => (1 - winPct(e) / 100) * height;

  const linePts = evals.map((e, i) => `${xOf(i).toFixed(1)},${yOf(e).toFixed(1)}`);
  const whiteArea = `M 0,${height} L ${linePts.join(' L ')} L ${width},${height} Z`;
  const blackArea = `M 0,0 L ${linePts.join(' L ')} L ${width},0 Z`;
  const curX = xOf(Math.min(ply, maxPly));

  return (
    <Pressable
      onPress={(e) => {
        const x = e.nativeEvent.locationX;
        const p = Math.round((x / width) * maxPly);
        onSelect(Math.max(0, Math.min(maxPly, p)));
      }}
      style={[styles.evalGraphWrap, { width, height }]}
    >
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="whiteFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#ffffff" stopOpacity="0.96" />
            <Stop offset="100%" stopColor="#e2e8f0" stopOpacity="0.9" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill="#1e2430" />
        <Path d={blackArea} fill="#1e2430" />
        <Path d={whiteArea} fill="url(#whiteFill)" />
        <Line x1={0} y1={height / 2} x2={width} y2={height / 2} stroke="#64748b" strokeWidth={1} strokeDasharray="3,3" />
        <Polyline points={linePts.join(' ')} fill="none" stroke="#94a3b8" strokeWidth={1.5} />
        {reviewed.map((m) => {
          if (!m.judgment || m.judgment === 'good' || m.judgment === 'best' || m.judgment === 'book') return null;
          if (!evals[m.ply]) return null;
          return (
            <Circle
              key={m.ply}
              cx={xOf(m.ply)}
              cy={yOf(evals[m.ply])}
              r={4}
              fill={JUDGMENT_COLOR[m.judgment]}
              stroke="#ffffff"
              strokeWidth={1}
            />
          );
        })}
        <Line x1={curX} y1={0} x2={curX} y2={height} stroke={theme.primary} strokeWidth={2} />
      </Svg>
    </Pressable>
  );
}

export function RatingSparkline({
  values,
  width,
  height = 56,
}: {
  values: number[];
  width: number;
  height?: number;
}) {
  if (values.length < 2 || width <= 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(20, max - min);
  const pad = 6;
  const w = width - pad * 2;
  const h = height - pad * 2;
  const pts = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + (1 - (v - min) / span) * h;
    return { x, y };
  });
  const line = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const area = `${pad},${height - pad} ${line} ${width - pad},${height - pad}`;
  const last = pts[pts.length - 1];
  const up = values[values.length - 1] >= values[0];
  const color = up ? theme.success : theme.danger;

  return (
    <Svg width={width} height={height}>
      <Polyline points={area} fill={color + '20'} stroke="none" />
      <Polyline points={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={last.x} cy={last.y} r={3.5} fill={color} />
    </Svg>
  );
}

export function JudgmentPill({ judgment, showLabel }: { judgment: Judgment | null | undefined; showLabel?: boolean }) {
  if (!judgment) return null;
  const color = JUDGMENT_COLOR[judgment];
  return (
    <View style={[styles.jPill, { backgroundColor: color + '22', borderColor: color + '66' }]}>
      <Text style={[styles.jPillText, { color }]}>
        {JUDGMENT_SYMBOL[judgment]}
        {showLabel ? ` ${JUDGMENT_LABEL[judgment]}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'nowrap',
  },
  capGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  capIconWrap: {
    width: 18,
    height: 18,
  },
  capScore: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.muted,
    backgroundColor: '#e2e8f0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    marginLeft: 2,
  },
  playerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.card,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.border,
  },
  playerBarActive: {
    borderColor: theme.primary,
    backgroundColor: '#f0f6ff',
  },
  playerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  colorSwatch: {
    width: 12,
    height: 12,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: '#64748b',
  },
  swatchWhite: { backgroundColor: '#ffffff' },
  swatchBlack: { backgroundColor: '#1e293b' },
  playerName: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.text,
  },
  eloPill: {
    fontSize: 11,
    fontWeight: '600',
    color: theme.muted,
    backgroundColor: '#e8edf5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  evalBar: {
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#94a3b8',
    position: 'relative',
  },
  evalMidline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: '#f59e0b',
  },
  evalLabel: {
    position: 'absolute',
    left: 1,
    right: 1,
    textAlign: 'center',
    fontSize: 8.5,
    fontWeight: '800',
  },
  evalLabelTop: { top: 4 },
  evalLabelBottom: { bottom: 4 },
  openingCard: {
    backgroundColor: theme.card,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 6,
  },
  openingTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ecoBadge: {
    fontSize: 11,
    fontWeight: '800',
    color: theme.primary,
    backgroundColor: '#e0ecff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  openingName: {
    fontSize: 13.5,
    fontWeight: '700',
    color: theme.text,
  },
  openingVar: {
    fontWeight: '500',
    color: theme.muted,
  },
  bookBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 99,
  },
  bookBadgeIn: { backgroundColor: '#fef3c7' },
  bookBadgeOut: { backgroundColor: '#f1f5f9' },
  bookBadgeText: { fontSize: 11, fontWeight: '700' },
  bookTextIn: { color: '#b45309' },
  bookTextOut: { color: '#64748b' },
  openingMeta: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.border,
    paddingTop: 6,
    gap: 4,
  },
  chapterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  chapterLabel: {
    flex: 1,
    fontSize: 12,
    color: theme.muted,
  },
  trainBtn: {
    backgroundColor: '#e0ecff',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  trainBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: theme.primary,
  },
  openingTip: {
    fontSize: 12,
    color: theme.muted,
    lineHeight: 17,
  },
  sumGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  sumCard: {
    flex: 1,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    gap: 6,
  },
  sumCardWhite: {
    backgroundColor: '#ffffff',
    borderColor: '#cbd5e1',
  },
  sumCardBlack: {
    backgroundColor: '#1e2430',
    borderColor: '#334155',
  },
  sumHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sumSideWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sumSideTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1e293b',
  },
  sumTag: {
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  sumTagWhite: {
    backgroundColor: '#dbeafe',
    color: '#1d4ed8',
  },
  sumTagBlack: {
    backgroundColor: '#334155',
    color: '#e2e8f0',
  },
  sumAccRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  sumAccVal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
  },
  sumAccLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748b',
  },
  sumChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  sumChip: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
    borderWidth: 1,
  },
  sumChipText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  evalGraphWrap: {
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#334155',
  },
  jPill: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
  },
  jPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
});
