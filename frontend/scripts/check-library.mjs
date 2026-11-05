// Cross-checks the built-in opening library (src/data/openingLibrary.ts)
// against the Lichess opening explorer and writes a report.
//
//   cd frontend
//   npm run check-library
//
// Needs internet access to explorer.lichess.ovh. Takes roughly 15–25 minutes
// the first time (about one request per second, to respect Lichess' rate
// limit); answers are cached in scripts/.explorer-cache.json, so a rerun after
// editing the library only asks for the new positions.
//
// Optional env:
//   LICHESS_TOKEN      personal API token (https://lichess.org/account/oauth/token,
//                      no scopes needed) — only if the explorer answers 401.
//   EXPLORER_URL       override the explorer host (testing).
//   EXPLORER_DELAY_MS  pause between requests, default 1100.

import { parsePgn } from 'chessops/pgn';
import { parseSan } from 'chessops/san';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OPENING_LIBRARY } from '../src/data/openingLibrary.ts';

const BASE = (process.env.EXPLORER_URL || 'https://explorer.lichess.ovh').replace(/\/$/, '');
const TOKEN = process.env.LICHESS_TOKEN;
const DELAY = Number(process.env.EXPLORER_DELAY_MS ?? 1100);
const here = (f) => fileURLToPath(new URL(f, import.meta.url));
const REPORT_MD = here('./library-report.md');
const REPORT_JSON = here('./library-report.json');
const CACHE_FILE = here('./.explorer-cache.json');

// Below this many master games a position's stats are too thin to judge,
// so the Lichess database (club/online games, 1800+) is asked as well.
const MIN_GAMES = 50;
// Our move is fine if it is among the top 3 or played in at least this share.
const OK_SHARE = 0.1;
// An opponent reply at least this common should have a branch in the tree.
const MISSING_SHARE = 0.1;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (x) => `${Math.round(x * 100)}%`;

let cache = {};
if (existsSync(CACHE_FILE)) {
  try {
    cache = JSON.parse(readFileSync(CACHE_FILE, 'utf8'));
  } catch {
    cache = {};
  }
}
let unsaved = 0;
const saveCache = () => {
  writeFileSync(CACHE_FILE, JSON.stringify(cache));
  unsaved = 0;
};

// Keep only what the report needs: totals and per-move counts.
function slim(data, whiteToMove) {
  const score = (w, d, b) => {
    const n = w + d + b;
    if (!n) return null;
    return ((whiteToMove ? w : b) + d / 2) / n;
  };
  const total = data.white + data.draws + data.black;
  return {
    total,
    moves: (data.moves ?? []).map((m) => ({
      san: m.san,
      games: m.white + m.draws + m.black,
      score: score(m.white, m.draws, m.black),
    })),
  };
}

let requests = 0;
async function explore(db, fen) {
  const key = `${db} ${fen}`;
  if (cache[key]) return cache[key];

  const params = new URLSearchParams({ fen, moves: '20', topGames: '0', recentGames: '0' });
  if (db === 'lichess') {
    params.set('speeds', 'blitz,rapid,classical');
    params.set('ratings', '1800,2000,2200,2500');
  }
  const headers = { 'User-Agent': 'chesspractice-library-check' };
  if (TOKEN) headers.Authorization = `Bearer ${TOKEN}`;

  for (let attempt = 1; ; attempt++) {
    await sleep(DELAY);
    let res;
    try {
      res = await fetch(`${BASE}/${db}?${params}`, { headers });
    } catch (e) {
      if (attempt < 4) {
        await sleep(5000);
        continue;
      }
      throw new Error(`Không kết nối được ${BASE} (${e.cause?.code ?? e.message}). Mạng có chặn Lichess không?`);
    }
    if (res.status === 429) {
      console.log('  Lichess báo quá nhiều request (429), chờ 60 giây rồi chạy tiếp…');
      await sleep(61_000);
      continue;
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        'Explorer yêu cầu đăng nhập. Tạo token tại https://lichess.org/account/oauth/token ' +
          '(không cần tick quyền nào) rồi chạy lại với biến môi trường LICHESS_TOKEN.',
      );
    }
    if (!res.ok) {
      if (attempt < 4) continue;
      throw new Error(`${db}: HTTP ${res.status} cho FEN ${fen}`);
    }
    const out = slim(await res.json(), fen.split(' ')[1] === 'w');
    cache[key] = out;
    requests++;
    if (++unsaved >= 20) saveCache();
    return out;
  }
}

// "1.e4 c6 2.d4" for the moves leading to a position.
function lineText(sans) {
  return sans
    .map((san, i) => (i % 2 === 0 ? `${i / 2 + 1}.${san}` : san))
    .join(' ');
}
// "3...Bf5" / "4.Nf3" for the move played from a position after `ply` moves.
const moveLabel = (ply, san) => (ply % 2 === 0 ? `${ply / 2 + 1}.${san}` : `${(ply + 1) / 2}...${san}`);

// Every position in the chapter that has at least one move after it.
function positionsOf(entry) {
  const game = parsePgn(entry.pgn)[0];
  const out = [];
  const walk = (node, pos, line) => {
    if (node.children.length) {
      out.push({
        fen: makeFen(pos.toSetup()),
        turn: pos.turn,
        line,
        children: node.children.map((c) => c.data.san),
      });
    }
    for (const c of node.children) {
      const mv = parseSan(pos, c.data.san);
      if (!mv) throw new Error(`${entry.name}: nước không hợp lệ ${c.data.san} sau ${lineText(line)}`);
      const next = pos.clone();
      next.play(mv);
      walk(c, next, [...line, c.data.san]);
    }
  };
  walk(game.moves, Chess.default(), []);
  return out;
}

// Which database to judge a position by: masters when it has enough games,
// otherwise the Lichess database, otherwise "too little data".
async function statsFor(fen) {
  const masters = await explore('masters', fen);
  if (masters.total >= MIN_GAMES) return { db: 'masters', ...masters, masters };
  const lichess = await explore('lichess', fen);
  if (lichess.total >= MIN_GAMES) return { db: 'lichess', ...lichess, masters };
  return { db: 'thin', ...(lichess.total > masters.total ? lichess : masters), masters };
}

function judgeOurMove(stats, san) {
  const ranked = [...stats.moves].sort((a, b) => b.games - a.games);
  const idx = ranked.findIndex((m) => m.san === san);
  const mine = idx >= 0 ? ranked[idx] : null;
  const share = mine && stats.total ? mine.games / stats.total : 0;
  const top = ranked[0] ?? null;
  let status;
  if (stats.db === 'thin') status = 'thin';
  else if (!mine || mine.games === 0) status = 'absent';
  else if (idx < 3 || share >= OK_SHARE) status = 'ok';
  else status = 'rare';
  return { status, rank: idx >= 0 ? idx + 1 : null, games: mine?.games ?? 0, share, score: mine?.score ?? null, top };
}

const ICON = { ok: '✅', rare: '⚠️', absent: '❌', thin: 'ℹ️' };
const DB_NAME = { masters: 'Masters', lichess: 'Lichess 1800+', thin: 'ít dữ liệu' };

const results = [];
const totalPositions = OPENING_LIBRARY.reduce((n, e) => n + positionsOf(e).length, 0);
let done = 0;
console.log(`Đối chiếu ${OPENING_LIBRARY.length} chương, ${totalPositions} thế cờ với ${BASE}`);

try {
  for (const entry of OPENING_LIBRARY) {
    console.log(`\n${entry.name}`);
    const ourMoves = [];
    const missing = [];
    for (const p of positionsOf(entry)) {
      done++;
      process.stdout.write(`  ${done}/${totalPositions}\r`);
      const stats = await statsFor(p.fen);
      const ply = p.line.length;
      if (p.turn === entry.trainAs) {
        const san = p.children[0];
        ourMoves.push({ line: lineText(p.line), move: moveLabel(ply, san), san, fen: p.fen, db: stats.db, total: stats.total, ...judgeOurMove(stats, san) });
      } else if (stats.db !== 'thin') {
        for (const m of stats.moves) {
          const share = m.games / stats.total;
          if (share >= MISSING_SHARE && !p.children.includes(m.san)) {
            missing.push({ line: lineText(p.line), move: moveLabel(ply, m.san), san: m.san, share, games: m.games, db: stats.db, fen: p.fen });
          }
        }
      }
    }
    results.push({ id: entry.id, name: entry.name, trainAs: entry.trainAs, ourMoves, missing });
  }
} finally {
  saveCache();
}

// ---------- report ----------
const all = results.flatMap((r) => r.ourMoves);
const count = (s) => all.filter((m) => m.status === s).length;
const md = [];
md.push('# Đối chiếu thư viện khai cuộc với Lichess');
md.push('');
md.push(`Chạy lúc ${new Date().toISOString()} · nguồn: ${BASE}`);
md.push('');
md.push(
  `- **Masters**: ván của kỳ thủ mạnh (OTB, Elo cao). Nếu thế cờ có dưới ${MIN_GAMES} ván Masters thì dùng ` +
    '**Lichess 1800+** (blitz/rapid/classical, Elo 1800 trở lên).',
);
md.push(`- Nước của bạn được coi là ổn khi nằm trong top 3 hoặc chiếm từ ${pct(OK_SHARE)} số ván ở thế cờ đó.`);
md.push(`- "Nhánh đối thủ còn thiếu": nước đối thủ chiếm từ ${pct(MISSING_SHARE)} số ván trở lên mà cây chưa có.`);
md.push('- Điểm (%) là tỉ lệ điểm của bên đi nước đó trong database (thắng = 1, hòa = 0.5).');
md.push('');
md.push(
  `**Tổng ${all.length} nước của bạn:** ✅ ${count('ok')} · ⚠️ ít phổ biến ${count('rare')} · ` +
    `❌ không có trong database ${count('absent')} · ℹ️ ít dữ liệu ${count('thin')}. ` +
    `**Nhánh đối thủ còn thiếu:** ${results.reduce((n, r) => n + r.missing.length, 0)}.`,
);

for (const r of results) {
  md.push('');
  md.push(`## ${r.name}`);
  const flagged = r.ourMoves.filter((m) => m.status !== 'ok');
  md.push('');
  if (!flagged.length) {
    md.push(`Cả ${r.ourMoves.length} nước của bạn đều là lựa chọn phổ biến. ✅`);
  } else {
    md.push(`### Nước của bạn cần xem lại (${flagged.length}/${r.ourMoves.length})`);
    md.push('');
    md.push('| | Sau | Nước trong thư viện | Số ván (tỉ lệ, hạng) | Phổ biến nhất | Nguồn |');
    md.push('|---|---|---|---|---|---|');
    for (const m of flagged) {
      const mine = m.games ? `${m.games} (${pct(m.share)}, #${m.rank})` : '0';
      const top = m.top ? `${m.top.san} (${pct(m.top.games / m.total)}${m.top.score != null ? `, điểm ${pct(m.top.score)}` : ''})` : '—';
      md.push(`| ${ICON[m.status]} | ${m.line || '(đầu ván)'} | **${m.move}** | ${mine} | ${top} | ${DB_NAME[m.db]}, ${m.total} ván |`);
    }
  }
  if (r.missing.length) {
    md.push('');
    md.push(`### Nhánh đối thủ phổ biến còn thiếu (${r.missing.length})`);
    md.push('');
    md.push('| Sau | Nước thiếu | Tỉ lệ | Nguồn |');
    md.push('|---|---|---|---|');
    for (const m of r.missing) md.push(`| ${m.line} | **${m.move}** | ${pct(m.share)} (${m.games} ván) | ${DB_NAME[m.db]} |`);
  }
  md.push('');
  md.push('<details><summary>Toàn bộ nước của bạn</summary>');
  md.push('');
  md.push('| | Sau | Nước | Số ván | Tỉ lệ | Điểm | Nguồn |');
  md.push('|---|---|---|---|---|---|---|');
  for (const m of r.ourMoves) {
    md.push(`| ${ICON[m.status]} | ${m.line || '(đầu ván)'} | ${m.move} | ${m.games} | ${pct(m.share)} | ${m.score != null ? pct(m.score) : '—'} | ${DB_NAME[m.db]} |`);
  }
  md.push('');
  md.push('</details>');
}
md.push('');

writeFileSync(REPORT_MD, md.join('\n'));
writeFileSync(REPORT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, results }, null, 2));
console.log(`\n\nXong (${requests} request mới). Báo cáo: scripts/library-report.md (+ library-report.json)`);
console.log(`✅ ${count('ok')}  ⚠️ ${count('rare')}  ❌ ${count('absent')}  ℹ️ ${count('thin')}`);
