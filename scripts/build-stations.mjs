// 전국 지하철역 좌표 데이터 빌드 스크립트
// ------------------------------------------------------------------
// 입력(택1):
//   1) scripts/stations.source.json5  — 커뮤니티 수집본(기본, 전국 ~600역)
//      출처: https://gist.github.com/jhj0517/9bd253175c4410493af024d5e0a1c01f
//      ⚠ 제작자가 "일부 좌표가 부정확할 수 있음"을 명시. 초기 시드로만 사용 권장.
//   2) 공식 표준데이터 CSV (권장 · 정확도 높음)
//      "전국도시철도역사정보표준데이터" https://www.data.go.kr/data/15013205/standard.do
//      → CSV 다운로드 후 `node scripts/build-stations.mjs <경로.csv>` 로 재생성
//
// 출력: assets/subway/stations.json  (앱에 번들되는 정규화 JSON)
//   [{ id, name, city, lines: string[], lat, lng }]
//
// 실행:  node scripts/build-stations.mjs [source.(json5|csv)]
// ------------------------------------------------------------------
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'subway', 'stations.json');
const DEFAULT_SRC = path.join(__dirname, 'stations.source.json5');

const srcPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_SRC;
if (!fs.existsSync(srcPath)) {
  console.error(`소스 파일을 찾을 수 없습니다: ${srcPath}`);
  process.exit(1);
}
const raw = fs.readFileSync(srcPath, 'utf8');
const isCsv = /\.csv$/i.test(srcPath);

/** JSON5(주석·홑따옴표·후행쉼표)을 관대하게 파싱 → 표준 JSON.
 *  한글 역명/노선명에는 따옴표가 없으므로 홑→겹따옴표 치환이 안전하다. */
function parseJson5(text) {
  const noComments = text.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const doubled = noComments.replace(/'/g, '"');
  const noTrailingComma = doubled.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(noTrailingComma);
}

/** 공식 표준데이터 CSV → 레코드. 컬럼명이 버전마다 달라 유연하게 매칭한다. */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length);
  const split = (l) => l.match(/("([^"]|"")*"|[^,]*)(,|$)/g).slice(0, -1).map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"').trim());
  const header = split(lines[0]);
  const idx = (cands) => header.findIndex((h) => cands.some((c) => h.includes(c)));
  const iName = idx(['역사명', '역명', '지하철역명', '역이름']);
  const iLat = idx(['위도', 'lat', 'LAT', 'Y좌표', 'YCRD']);
  const iLng = idx(['경도', 'lng', 'LON', 'X좌표', 'XCRD']);
  const iLine = idx(['노선명', '노선', '선명']);
  const iCity = idx(['운영기관명', '시도', '시군구', '도시']);
  if (iName < 0 || iLat < 0 || iLng < 0) {
    throw new Error(`CSV 컬럼 인식 실패. 헤더: ${header.join(' | ')}`);
  }
  return lines.slice(1).map((l) => {
    const c = split(l);
    return {
      name: c[iName],
      city: iCity >= 0 ? c[iCity] : '',
      lines: iLine >= 0 && c[iLine] ? [c[iLine]] : [],
      lat: parseFloat(c[iLat]),
      lng: parseFloat(c[iLng]),
    };
  });
}

const records = isCsv ? parseCsv(raw) : parseJson5(raw);

// 정규화 + (도시+역명) 기준 중복 병합(노선 합침)
const norm = (s) => String(s || '').replace(/\s+/g, '').replace(/역$/, '');
const byKey = new Map();
let dropped = 0;
for (const r of records) {
  const lat = Number(r.lat);
  const lng = Number(r.lng);
  const name = String(r.name || '').trim();
  // 대한민국 좌표 범위 밖 / 결측 제거
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng) || lat < 33 || lat > 39 || lng < 124 || lng > 132) {
    dropped++;
    continue;
  }
  const city = String(r.city || '').trim();
  const key = `${city}|${norm(name)}`;
  const lines = Array.isArray(r.lines) ? r.lines.filter(Boolean).map(String) : [];
  if (byKey.has(key)) {
    const prev = byKey.get(key);
    prev.lines = [...new Set([...prev.lines, ...lines])];
  } else {
    byKey.set(key, { id: `${city}:${name}`.replace(/\s+/g, ''), name, city, lines, lat, lng });
  }
}

const out = [...byKey.values()].sort((a, b) => (a.city + a.name).localeCompare(b.city + b.name, 'ko'));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out) + '\n', 'utf8');

const cities = [...new Set(out.map((s) => s.city).filter(Boolean))];
console.log(`✓ ${out.length}개 역 → ${path.relative(ROOT, OUT)}  (제외 ${dropped}건)`);
console.log(`  도시: ${cities.join(', ') || '(미분류)'}`);
console.log(`  예시: ${out.slice(0, 3).map((s) => `${s.name}(${s.lines.join('·')})`).join(', ')}`);
