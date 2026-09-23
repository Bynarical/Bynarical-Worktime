// dist/ 를 gh-pages 브랜치로 배포한다.
// ------------------------------------------------------------------
// 예전엔 `gh-pages` 패키지를 썼지만, 이 저장소가 OneDrive 안에 있어서
// 그 패키지가 node_modules/.cache 에 만드는 임시 clone이 파일 잠금·동기화와
// 부딪혀 계속 실패했다("destination path already exists", remote URL 불일치).
// 그래서 OS 임시 폴더(OneDrive 밖)에 git worktree를 잠깐 만들어 직접 푸시한다.
//
// 실행:
//   node scripts/deploy-web.mjs                  # 커밋 제목을 main HEAD에서 가져옴
//   node scripts/deploy-web.mjs "야근식대 내역"    # 설명 직접 지정
//   node scripts/deploy-web.mjs --allow-dirty    # 커밋 안 된 변경이 있어도 진행
//   node scripts/deploy-web.mjs --skip-db        # DB 마이그레이션(scripts/db-migrate.mjs) 건너뛰기
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BRANCH = 'gh-pages';
const REMOTE = 'origin';

const argv = process.argv.slice(2);
const allowDirty = argv.includes('--allow-dirty');
const skipDb = argv.includes('--skip-db');
const desc = argv.find((a) => !a.startsWith('--'));

const git = (args, opts = {}) => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', ...opts })?.trim() ?? '';
  } catch (e) {
    // execFileSync의 기본 에러는 stderr를 삼켜서 원인을 알 수 없다. 붙여서 다시 던진다.
    const detail = (e.stderr || '').toString().trim();
    throw new Error(`git ${args.join(' ')} 실패 (exit ${e.status})${detail ? `\n${detail}` : ''}`);
  }
};
const fail = (msg) => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

// --- 1. dist 검증 -------------------------------------------------
if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  fail('dist/index.html이 없습니다. 먼저 `npm run export:web`을 실행하세요.');
}
// postexport-web.mjs가 안 돌았으면 배포해도 앱이 안 뜬다. 여기서 잡는다.
for (const f of ['.nojekyll', '404.html']) {
  if (!fs.existsSync(path.join(DIST, f))) {
    fail(`dist/${f}이 없습니다. \`npm run export:web\`으로 다시 빌드하세요 (postexport-web.mjs가 만듭니다).`);
  }
}

// --- 2. 소스 상태 확인 --------------------------------------------
// gh-pages 커밋 메시지에 main의 커밋 해시를 남기므로, 커밋 안 된 변경이 섞이면
// 그 해시가 실제 배포된 코드와 어긋난다.
const dirty = git(['status', '--porcelain']);
if (dirty && !allowDirty) {
  fail(
    '커밋되지 않은 변경이 있습니다. 커밋 후 배포하거나 --allow-dirty를 붙이세요.\n' +
      dirty.split('\n').slice(0, 10).map((l) => `    ${l}`).join('\n')
  );
}
const sha = git(['rev-parse', '--short', 'HEAD']);
const subject = desc || git(['log', '-1', '--pretty=%s']);
const message = `Deploy: ${subject} (${sha})`;

// --- 2.5 DB 마이그레이션 ------------------------------------------
// 새 앱이 기대하는 컬럼·테이블이 먼저 있어야 하므로 웹을 올리기 전에 DB부터 맞춘다.
// (옛 앱은 컬럼이 더 있어도 괜찮지만, 새 앱은 컬럼이 없으면 깨질 수 있다.)
// 실패하면 배포하지 않는다 — DB와 앱이 어긋난 채로 올라가는 것보다 낫다.
if (skipDb) {
  console.log('ℹ --skip-db: DB 마이그레이션을 건너뜁니다.');
} else {
  try {
    execFileSync(process.execPath, [path.join(__dirname, 'db-migrate.mjs')], { cwd: ROOT, stdio: 'inherit' });
  } catch {
    fail('DB 마이그레이션이 실패해 배포를 중단했습니다. 위 메시지를 확인하거나, 급하면 --skip-db로 건너뛰세요.');
  }
  console.log('');
}

// --- 3. 임시 worktree 준비 (OneDrive 밖) ---------------------------
// `git worktree add`는 이미 있는 경로를 거부하므로, 임시 폴더 '안'의 아직 없는 경로를 준다.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ghpages-'));
const wt = path.join(tmpRoot, BRANCH);
const wtName = path.basename(wt);
let pushed = false;

try {
  let hasRemoteBranch = true;
  try {
    git(['fetch', REMOTE, BRANCH]);
  } catch {
    hasRemoteBranch = false;
    console.log(`ℹ ${REMOTE}/${BRANCH}가 없습니다. 새로 만듭니다.`);
  }

  if (hasRemoteBranch) {
    git(['worktree', 'add', '--force', wt, '-B', BRANCH, 'FETCH_HEAD']);
  } else {
    git(['worktree', 'add', '--force', '--detach', wt]);
    execFileSync('git', ['checkout', '--orphan', BRANCH], { cwd: wt, stdio: 'inherit' });
  }

  // --- 4. 기존 내용 비우고 새 빌드 복사 ---------------------------
  execFileSync('git', ['rm', '-rq', '--ignore-unmatch', '.'], { cwd: wt });
  for (const entry of fs.readdirSync(wt)) {
    if (entry === '.git') continue; // worktree에서는 디렉터리가 아니라 파일이다
    fs.rmSync(path.join(wt, entry), { recursive: true, force: true });
  }
  fs.cpSync(DIST, wt, { recursive: true });

  // --- 5. 커밋 & 푸시 ---------------------------------------------
  execFileSync('git', ['add', '-A'], { cwd: wt });
  const staged = execFileSync('git', ['status', '--porcelain'], { cwd: wt, encoding: 'utf8' }).trim();
  if (!staged) {
    console.log('ℹ 빌드 결과가 이전 배포와 같습니다. 푸시할 것이 없습니다.');
  } else {
    console.log(staged.split('\n').map((l) => `    ${l}`).join('\n'));
    execFileSync('git', ['commit', '-m', message], { cwd: wt, stdio: 'inherit' });
    execFileSync('git', ['push', REMOTE, BRANCH], { cwd: wt, stdio: 'inherit' });
    pushed = true;
    console.log(`\n✓ 배포 완료 — ${message}`);
  }
} finally {
  // --- 6. 정리 (OneDrive가 .git/worktrees를 잠그는 일이 있어 실패해도 넘어간다) ---
  let removed = false;
  try {
    git(['worktree', 'remove', '--force', wt]);
    removed = true;
  } catch {
    /* 아래에서 직접 지운다 */
  }
  if (!removed) {
    try {
      git(['worktree', 'prune']);
    } catch {
      /* 아래에서 메타데이터를 직접 지운다 */
    }
    const meta = path.join(path.resolve(ROOT, git(['rev-parse', '--git-common-dir'])), 'worktrees', wtName);
    try {
      fs.rmSync(meta, { recursive: true, force: true });
    } catch {
      console.warn(`⚠ 임시 worktree 메타데이터가 남았습니다: ${meta}\n  나중에 \`git worktree prune\`으로 정리하세요.`);
    }
  }
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

if (pushed) {
  console.log('  https://bynarical.github.io/Bynarical-Worktime/  (Pages 반영까지 1~2분)');
}
