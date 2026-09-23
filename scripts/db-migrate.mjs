// supabase/*.sql 마이그레이션을 원격 Supabase DB에 자동 적용한다.
// ------------------------------------------------------------------
// 예전엔 SQL Editor에 파일을 하나씩 붙여넣었는데, 어느 파일을 어느 컴퓨터에서 돌렸는지
// 기록이 없어서 anomaly_review.sql·leave_category.sql이 빠진 채로 몇 주가 지났다.
// 이제 적용 이력을 DB(app_private.sql_migrations)에 파일명+체크섬으로 남기고,
// 이력에 없는 파일만 순서대로 실행한다. `npm run deploy:web`도 배포 전에 이걸 먼저 돌린다.
//
// 인증: Supabase CLI 로그인(`npx supabase login`, 컴퓨터당 1회)을 그대로 쓴다.
//       토큰은 저장소·스크립트에 두지 않는다. 프로젝트는 supabase/config.toml의 project_id.
//
// 실행:
//   node scripts/db-migrate.mjs                  # 대기 중인 마이그레이션 적용
//   node scripts/db-migrate.mjs --status         # 적용 상태만 출력
//   node scripts/db-migrate.mjs --dry-run        # 무엇을 실행할지만 출력
//   node scripts/db-migrate.mjs --mark a.sql …   # 실행하지 않고 '적용됨'으로 기록
//                                                #  (SQL Editor로 이미 돌린 파일, 또는 적용된 파일을
//                                                #   참고용으로만 고쳤을 때 — 예: schema.sql 갱신)
//   node scripts/db-migrate.mjs --rerun a.sql …  # 이미 적용된 파일을 다시 실행
//
// 새 마이그레이션 추가: supabase/에 .sql을 만들고 아래 MIGRATIONS 끝에 파일명을 추가한다.
// 목록에 없는 .sql이 있으면 실패한다 — 빠뜨려서 영영 안 돌아가는 일을 막기 위해.
//
// 각 파일은 이력 기록과 함께 한 트랜잭션으로 실행된다(중간에 실패하면 통째로 롤백).
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SQL_DIR = path.join(ROOT, 'supabase');

// 적용 순서. 새 파일은 반드시 맨 끝에 추가한다(이미 적용된 파일의 순서는 바꾸지 않는다).
const MIGRATIONS = [
  'schema.sql',
  'pending.sql',
  'admin_edit.sql',
  'consent.sql',
  'meals.sql',
  'holidays.sql',
  'archive.sql',
  'away_logs.sql',
  'confirm_lock.sql',
  'sign_auth_method.sql',
  'leave_category.sql',
  'anomaly_review.sql',
  'trip.sql',
];

const TRACK = 'app_private.sql_migrations';
// public이 아닌 스키마라 PostgREST(API)로 노출되지 않는다. anon/authenticated 접근도 막는다.
const BOOTSTRAP = `
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;
create table if not exists ${TRACK} (
  name text primary key,
  checksum text not null,
  applied_at timestamptz not null default now(),
  applied_by text
);`;

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const listAfter = (f) => {
  const i = argv.indexOf(f);
  if (i < 0) return [];
  const out = [];
  for (const a of argv.slice(i + 1)) {
    if (a.startsWith('--')) break;
    out.push(path.basename(a));
  }
  return out;
};
const statusOnly = flag('--status');
const dryRun = flag('--dry-run');
const markList = listAfter('--mark');
const rerunList = listAfter('--rerun');

const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`;

// --- 프로젝트 ------------------------------------------------------
const toml = fs.readFileSync(path.join(SQL_DIR, 'config.toml'), 'utf8');
const PROJECT_REF = toml.match(/^\s*project_id\s*=\s*"([^"]+)"/m)?.[1];
if (!PROJECT_REF) fail('supabase/config.toml에서 project_id를 찾지 못했습니다.');

// --- Supabase CLI 호출 ---------------------------------------------
// Windows에선 npx가 .cmd라 셸을 거쳐야 한다(Node 24는 execFile+shell 조합을 경고하므로
// 명령 문자열을 직접 만들어 execSync). 공백 있는 인자는 따옴표로 감싼다.
// SQL은 전부 임시 파일(-f)로 넘겨 셸 따옴표 문제를 원천 차단한다.
const isWin = process.platform === 'win32';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbmig-'));
// process.exit()는 finally를 건너뛰므로 종료 훅에서 정리한다.
process.on('exit', () => fs.rmSync(tmpDir, { recursive: true, force: true }));
let tmpSeq = 0;

function runSql(sql) {
  const file = path.join(tmpDir, `q${++tmpSeq}.sql`);
  fs.writeFileSync(file, sql, 'utf8');
  const args = ['--yes', 'supabase', 'db', 'query', '--linked', '--project-ref', PROJECT_REF, '--agent', 'no', '-o', 'json', '-f', file];
  const opts = { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 };
  try {
    const out = isWin
      ? execSync(['npx', ...args].map((a) => (/[\s&|<>^()"]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a)).join(' '), opts)
      : execFileSync('npx', args, opts);
    const start = out.search(/[[{]/);
    return start >= 0 ? JSON.parse(out.slice(start)) : [];
  } catch (e) {
    const err = `${e.stderr || ''}${e.stdout || ''}`.trim();
    if (/access token|supabase login|not logged in/i.test(err)) {
      fail('Supabase CLI 로그인이 필요합니다. 터미널에서 `npx supabase login`을 한 번 실행하세요.');
    }
    const m = err.match(/"message":"((?:[^"\\]|\\.)*)"/);
    const detail = m ? JSON.parse(`"${m[1]}"`).trim() : err.split('\n').filter((l) => !/^Initialising|--debug/.test(l)).join('\n');
    throw new Error(detail || `supabase db query 실패 (exit ${e.status})`);
  }
}

// --- 로컬 파일 -----------------------------------------------------
// 체크섬은 줄바꿈을 LF로 맞춰 계산 — 컴퓨터마다 CRLF/LF가 달라도 같은 파일로 본다.
const checksum = (text) => crypto.createHash('sha256').update(text.replace(/\r\n/g, '\n')).digest('hex').slice(0, 16);

const onDisk = fs.readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql'));
const unlisted = onDisk.filter((f) => !MIGRATIONS.includes(f));
if (unlisted.length) {
  fail(
    `scripts/db-migrate.mjs의 MIGRATIONS 목록에 없는 SQL 파일이 있습니다: ${unlisted.join(', ')}\n` +
      '  적용 순서대로 목록 끝에 추가하세요.'
  );
}
const missing = MIGRATIONS.filter((f) => !onDisk.includes(f));
if (missing.length) fail(`목록에는 있지만 supabase/에 없는 파일: ${missing.join(', ')}`);
for (const f of [...markList, ...rerunList]) {
  if (!MIGRATIONS.includes(f)) fail(`알 수 없는 마이그레이션: ${f}`);
}

const local = MIGRATIONS.map((name) => {
  const text = fs.readFileSync(path.join(SQL_DIR, name), 'utf8');
  return { name, text, sum: checksum(text) };
});

// --- 원격 이력 -----------------------------------------------------
// 이력 테이블이 없으면(첫 실행) 빈 이력. 없는 테이블을 참조하는 쿼리는 조건과 무관하게
// 파싱 단계에서 실패하므로 존재 여부를 먼저 따로 묻는다.
function fetchApplied() {
  const [{ present } = {}] = runSql(`select to_regclass('${TRACK}') is not null as present`);
  if (!present) return new Map();
  const rows = runSql(`select name, checksum, applied_at, applied_by from ${TRACK}`);
  return new Map(rows.map((r) => [r.name, r]));
}

const by = `${os.userInfo().username}@${os.hostname()}`;
const recordSql = (m) =>
  `insert into ${TRACK} (name, checksum, applied_by) values (${sqlStr(m.name)}, ${sqlStr(m.sum)}, ${sqlStr(by)})
   on conflict (name) do update set checksum = excluded.checksum, applied_at = now(), applied_by = excluded.applied_by;`;

let applied;
try {
  applied = fetchApplied();
} catch (e) {
  fail(`적용 이력을 읽지 못했습니다: ${e.message}`);
}

const plan = local.map((m) => {
  const rec = applied.get(m.name);
  const state = !rec ? 'pending' : rec.checksum === m.sum ? 'applied' : 'changed';
  return { ...m, rec, state };
});

const icon = { applied: '✅', pending: '⏳', changed: '⚠️' };
const label = { applied: '적용됨', pending: '대기', changed: '적용 후 파일 변경됨' };
console.log(`Supabase ${PROJECT_REF} — 마이그레이션 ${plan.filter((p) => p.state === 'applied').length}/${plan.length} 적용됨`);
for (const p of plan) {
  const day = p.rec ? new Date(p.rec.applied_at).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) : '';
  const when = p.rec ? `  (${day} · ${p.rec.applied_by || '?'})` : '';
  console.log(`  ${icon[p.state]} ${p.name.padEnd(22)} ${label[p.state]}${when}`);
}
if (statusOnly) process.exit(0);

// --mark: 실행 없이 기록만
if (markList.length) {
  const names = plan.filter((p) => markList.includes(p.name));
  if (dryRun) {
    console.log(`\n(dry-run) 실행 없이 적용됨으로 기록: ${names.map((p) => p.name).join(', ')}`);
    process.exit(0);
  }
  runSql(`${BOOTSTRAP}\n${names.map(recordSql).join('\n')}`);
  console.log(`\n✓ 실행 없이 적용됨으로 기록: ${names.map((p) => p.name).join(', ')}`);
  process.exit(0);
}

// 적용 후 수정된 파일은 자동으로 다시 돌리지 않는다.
// (예: schema.sql을 다시 돌리면 뒤 파일들이 만든 RLS 정책까지 지워진다)
const changed = plan.filter((p) => p.state === 'changed' && !rerunList.includes(p.name));
if (changed.length) {
  fail(
    `이미 적용된 뒤 내용이 바뀐 파일: ${changed.map((p) => p.name).join(', ')}\n` +
      '  · 스키마를 바꾸려면 변경분을 새 .sql 파일로 만들어 MIGRATIONS 끝에 추가하세요.\n' +
      '  · 참고용 수정(이미 DB에 반영됨)이면: node scripts/db-migrate.mjs --mark <파일>\n' +
      '  · 정말 다시 실행하려면:               node scripts/db-migrate.mjs --rerun <파일>'
  );
}

const todo = plan.filter((p) => p.state === 'pending' || rerunList.includes(p.name));
if (!todo.length) {
  console.log('\n✓ 적용할 마이그레이션이 없습니다.');
  process.exit(0);
}
if (dryRun) {
  console.log(`\n(dry-run) 실행 예정: ${todo.map((p) => p.name).join(' → ')}`);
  process.exit(0);
}

runSql(BOOTSTRAP);
for (const m of todo) {
  process.stdout.write(`\n▶ ${m.name} 실행 중… `);
  try {
    // 파일 본문 + 이력 기록을 한 요청(한 트랜잭션)으로 — 실패하면 기록도 남지 않는다.
    runSql(`${m.text}\n;\n${recordSql(m)}`);
    console.log('완료');
  } catch (e) {
    console.log('실패');
    fail(`${m.name}: ${e.message}\n  이 파일은 롤백되었습니다(변경 없음). 이후 파일은 실행하지 않았습니다.`);
  }
}
console.log(`\n✓ ${todo.length}개 적용 완료`);
