// Builds the puzzle set the app ships (public/puzzles/puzzles.json) from the
// Lichess puzzle database (CC0, https://database.lichess.org/#puzzles).
//
//   cd frontend
//   npm run build-puzzles                      # download + filter, defaults below
//   npm run build-puzzles -- --min 1300 --max 2300 --count 10000
//   npm run build-puzzles -- --file ~/Downloads/lichess_db_puzzle.csv.zst
//
// Without --file the database (~270 MB compressed) is streamed straight from
// database.lichess.org and never written to disk. Reading .zst needs Node
// 22.15+ (zstd support in node:zlib); on older Node, decompress it yourself
// (`zstd -d lichess_db_puzzle.csv.zst`) and pass the .csv with --file.
//
// Selection: only well-tested puzzles (enough plays, settled rating, liked by
// players), spread evenly over 100-point rating bands between --min and
// --max. Picks are deterministic (hash of the puzzle id), so a rerun with the
// same options gives the same set and keeps everyone's progress meaningful.
//
// Options (all optional):
//   --min <n>         lowest puzzle rating            (default 1300)
//   --max <n>         highest puzzle rating           (default 2300)
//   --count <n>       puzzles to keep                 (default 10000)
//   --min-plays <n>   minimum times played            (default 300)
//   --min-pop <n>     minimum popularity, -100..100   (default 80)
//   --max-rd <n>      maximum rating deviation        (default 90)
//   --file <path>     local .csv or .csv.zst instead of downloading
//   --out <path>      output file                     (default public/puzzles/puzzles.json)

import { createReadStream, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { Readable, Transform } from 'node:stream';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseFen } from 'chessops/fen';
import { Chess, normalizeMove } from 'chessops/chess';
import { parseUci } from 'chessops/util';

const DB_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const here = (f) => fileURLToPath(new URL(f, import.meta.url));

function parseArgs(argv) {
  const opts = {
    min: 1300,
    max: 2300,
    count: 10000,
    minPlays: 300,
    minPop: 80,
    maxRd: 90,
    file: null,
    out: here('../public/puzzles/puzzles.json'),
  };
  const keys = {
    '--min': 'min',
    '--max': 'max',
    '--count': 'count',
    '--min-plays': 'minPlays',
    '--min-pop': 'minPop',
    '--max-rd': 'maxRd',
    '--file': 'file',
    '--out': 'out',
  };
  for (let i = 0; i < argv.length; i++) {
    const key = keys[argv[i]];
    if (!key) fail(`Không hiểu tham số "${argv[i]}". Xem phần Options ở đầu file.`);
    const value = argv[++i];
    if (value === undefined) fail(`Thiếu giá trị cho ${argv[i - 1]}`);
    opts[key] = key === 'file' || key === 'out' ? resolve(value) : Number(value);
    if (key !== 'file' && key !== 'out' && !Number.isFinite(opts[key])) fail(`${argv[i - 1]} phải là số`);
  }
  if (opts.min >= opts.max) fail('--min phải nhỏ hơn --max');
  if (opts.count < 100) fail('--count tối thiểu 100');
  return opts;
}

function fail(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

// FNV-1a: stable pseudo-random order, so the same options pick the same set.
function hash(id) {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// RFC 8878 frame parser to find frame boundaries and strip skippable frames
// (0x184D2A50 - 0x184D2A5F) which Lichess inserts between chunked zstd frames,
// and which Node's zlib decompressor would otherwise reject with 'Unknown frame descriptor'.
class ZstdFrameFilter extends Transform {
  constructor() {
    super();
    this.buffer = Buffer.alloc(0);
  }

  _transform(chunk, encoding, callback) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    this._process(callback);
  }

  _process(callback) {
    while (this.buffer.length >= 4) {
      const magic = this.buffer.readUInt32LE(0);

      // Skippable frame: 0x184D2A50 - 0x184D2A5F
      if (magic >= 0x184D2A50 && magic <= 0x184D2A5F) {
        if (this.buffer.length < 8) return callback();
        const frameSize = this.buffer.readUInt32LE(4);
        const totalSize = 8 + frameSize;
        if (this.buffer.length < totalSize) return callback();
        // Drop the skippable frame
        this.buffer = this.buffer.subarray(totalSize);
        continue;
      }

      // Standard Zstandard frame: 0xFD2FB528
      if (magic === 0xFD2FB528) {
        if (this.buffer.length < 5) return callback();
        let offset = 4;
        const descriptor = this.buffer[offset++];
        const fcsFlag = (descriptor >> 6) & 3;
        const singleSegment = (descriptor >> 5) & 1;
        const contentChecksum = (descriptor >> 2) & 1;
        const dictIdFlag = descriptor & 3;

        if (!singleSegment) offset += 1; // window descriptor
        offset += dictIdFlag === 0 ? 0 : dictIdFlag === 1 ? 1 : dictIdFlag === 2 ? 2 : 4;
        const fcsSize = fcsFlag === 0 ? (singleSegment ? 1 : 0) : fcsFlag === 1 ? 2 : fcsFlag === 2 ? 4 : 8;
        offset += fcsSize;

        if (this.buffer.length < offset) return callback();

        let isLast = false;
        while (!isLast) {
          if (this.buffer.length < offset + 3) return callback();
          const b0 = this.buffer[offset];
          const b1 = this.buffer[offset + 1];
          const b2 = this.buffer[offset + 2];
          offset += 3;
          const header = b0 | (b1 << 8) | (b2 << 16);
          isLast = (header & 1) === 1;
          const blockType = (header >> 1) & 3;
          const blockSize = header >> 3;

          const dataSize = blockType === 1 ? 1 : blockSize;
          offset += dataSize;
        }

        if (contentChecksum) offset += 4;
        if (this.buffer.length < offset) return callback();

        this.push(this.buffer.subarray(0, offset));
        this.buffer = this.buffer.subarray(offset);
        continue;
      }

      return callback(new Error(`Unknown zstd magic: 0x${magic.toString(16)}`));
    }
    callback();
  }

  _flush(callback) {
    if (this.buffer.length > 0) {
      this.push(this.buffer);
    }
    callback();
  }
}

async function openInput(opts) {
  let stream;
  let name;
  if (opts.file) {
    stream = createReadStream(opts.file);
    name = opts.file;
    console.log(`Đọc file ${opts.file}`);
  } else {
    console.log(`Tải ${DB_URL} (khoảng 270 MB, không lưu ra đĩa)…`);
    const res = await fetch(DB_URL);
    if (!res.ok || !res.body) fail(`Không tải được database: HTTP ${res.status}`);
    stream = Readable.fromWeb(res.body);
    name = DB_URL;
  }
  if (name.endsWith('.zst')) {
    if (typeof zlib.createZstdDecompress !== 'function') {
      fail(
        `Node ${process.version} chưa đọc được file .zst (cần Node 22.15+).\n` +
          '  Cách 1: cập nhật Node rồi chạy lại.\n' +
          '  Cách 2: tải file về, giải nén bằng `zstd -d lichess_db_puzzle.csv.zst`\n' +
          '          (Mac: brew install zstd), rồi chạy với --file lichess_db_puzzle.csv',
      );
    }
    const decompress = zlib.createZstdDecompress();
    decompress.on('error', (err) => fail(`Lỗi giải nén zstd: ${err.message}`));
    stream = stream.pipe(new ZstdFrameFilter()).pipe(decompress);
  }
  return stream;
}

// Every move must be legal from the given FEN. The database is generated by
// Lichess, so this should never trip; it guards against a truncated download.
function isPlayable(fen, moves) {
  const setup = parseFen(fen);
  if (setup.isErr) return false;
  const pos = Chess.fromSetup(setup.value);
  if (pos.isErr) return false;
  const p = pos.value;
  for (const uci of moves) {
    const parsed = parseUci(uci);
    if (!parsed) return false;
    // Lichess writes castling as king-two-squares (e1g1); chessops wants e1h1.
    const move = normalizeMove(p, parsed);
    if (!p.isLegal(move)) return false;
    p.play(move);
  }
  return true;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const bandLow = Math.floor(opts.min / 100) * 100;
  const bands = Math.ceil((opts.max - bandLow) / 100);
  const perBand = Math.ceil(opts.count / bands);
  console.log(
    `Lọc: rating ${opts.min}–${opts.max}, ${opts.count} bài (~${perBand}/khoảng 100 điểm), ` +
      `≥${opts.minPlays} lượt chơi, độ yêu thích ≥${opts.minPop}, RD ≤${opts.maxRd}`,
  );

  // Per band, keep the candidates with the smallest hash. Trimmed lazily so
  // memory stays around a few × perBand rows per band.
  const keep = Array.from({ length: bands }, () => []);
  const trim = (list) => {
    list.sort((a, b) => a.h - b.h);
    list.length = Math.min(list.length, perBand * 2);
  };

  const input = await openInput(opts);
  const lines = createInterface({ input, crlfDelay: Infinity });
  let header = null;
  let total = 0;
  let eligible = 0;
  for await (const line of lines) {
    if (!header) {
      header = line.split(',');
      const want = ['PuzzleId', 'FEN', 'Moves', 'Rating', 'RatingDeviation', 'Popularity', 'NbPlays', 'Themes'];
      if (want.some((w, i) => header[i] !== w)) fail(`Định dạng file lạ, header: ${line.slice(0, 120)}`);
      continue;
    }
    total++;
    if (total % 500000 === 0) console.log(`  đã đọc ${total.toLocaleString()} bài, giữ ${eligible.toLocaleString()} bài đạt chuẩn`);
    const f = line.split(',');
    if (f.length < 8) continue;
    const rating = Number(f[3]);
    if (!Number.isFinite(rating) || rating < opts.min || rating > opts.max) continue;
    if (Number(f[4]) > opts.maxRd || Number(f[5]) < opts.minPop || Number(f[6]) < opts.minPlays) continue;
    eligible++;
    const band = Math.min(bands - 1, Math.max(0, Math.floor((rating - bandLow) / 100)));
    const list = keep[band];
    if (!list) continue;
    list.push({ h: hash(f[0]), id: f[0], fen: f[1], moves: f[2], rating, themes: f[7] });
    if (list.length > perBand * 4) trim(list);
  }
  if (!header) fail('File rỗng.');
  console.log(`Đọc xong ${total.toLocaleString()} bài, ${eligible.toLocaleString()} bài đạt chuẩn.`);

  const picked = [];
  let invalid = 0;
  for (const list of keep) {
    trim(list);
    let taken = 0;
    for (const p of list) {
      if (taken >= perBand) break;
      if (!isPlayable(p.fen, p.moves.split(' '))) {
        invalid++;
        continue;
      }
      picked.push(p);
      taken++;
    }
  }
  picked.sort((a, b) => a.rating - b.rating);
  picked.length = Math.min(picked.length, opts.count);
  if (picked.length === 0) fail('Không có bài nào đạt chuẩn, hãy nới điều kiện lọc.');

  const themeCount = new Map();
  for (const p of picked) for (const t of p.themes.split(' ')) if (t) themeCount.set(t, (themeCount.get(t) ?? 0) + 1);

  const out = {
    format: 1,
    source: 'Lichess puzzle database',
    license: 'CC0',
    url: 'https://database.lichess.org/#puzzles',
    generatedAt: new Date().toISOString(),
    params: { min: opts.min, max: opts.max, count: opts.count, minPlays: opts.minPlays, minPop: opts.minPop, maxRd: opts.maxRd },
    // [id, fen, moves (uci, space separated), rating, themes (space separated)]
    puzzles: picked.map((p) => [p.id, p.fen, p.moves, p.rating, p.themes]),
  };
  mkdirSync(dirname(opts.out), { recursive: true });
  const json = JSON.stringify(out);
  writeFileSync(opts.out, json);

  console.log(`\n✔ Ghi ${picked.length.toLocaleString()} bài vào ${opts.out} (${(json.length / 1e6).toFixed(1)} MB)`);
  if (invalid) console.log(`  Bỏ ${invalid} bài có nước đi không hợp lệ.`);
  const byBand = keep.map((_, i) => {
    const lo = bandLow + i * 100;
    return `${lo}: ${picked.filter((p) => p.rating >= lo && p.rating < lo + 100).length}`;
  });
  console.log(`  Theo rating: ${byBand.join(', ')}`);
  const top = [...themeCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  console.log(`  Chủ đề nhiều nhất: ${top.map(([t, n]) => `${t} ${n}`).join(', ')}`);
}

main().catch((err) => fail(err?.stack || String(err)));
