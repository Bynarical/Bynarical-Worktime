# Supabase 설정 가이드

앱을 여러 직원이 공유하는 실 DB(계정·권한·중앙관리)로 연결합니다. 5~10분이면 됩니다.

## 1. 계정 & 프로젝트 생성
1. https://supabase.com → **Start your project** → GitHub 또는 이메일로 가입 (무료)
2. **New project**
   - Name: `bynarical-worktime`
   - Database Password: 강한 비밀번호 생성 후 **따로 보관** (앱엔 안 넣습니다)
   - Region: **Northeast Asia (Seoul)** 있으면 선택, 없으면 Tokyo
   - **Create new project** (프로비저닝 1~2분)

## 2. 스키마 생성
1. 좌측 **SQL Editor** → **New query**
2. [`schema.sql`](./schema.sql) 전체를 붙여넣고 **Run**
3. "Success" 확인 (테이블 7개 + RLS 정책 생성)

## 3. 이메일 로그인 설정
1. 좌측 **Authentication → Sign In / Providers → Email** 활성화 확인
2. 사내용으로 즉시 로그인되게 하려면 **Authentication → Settings → "Confirm email"** 을 **끄기**
   (켜두면 가입 후 이메일 인증 링크를 눌러야 로그인됩니다)

## 4. API 키 복사 (앱에 넣을 값)
1. 좌측 **Project Settings → API**
2. 두 값을 복사:
   - **Project URL** (예: `https://abcdefgh.supabase.co`)
   - **Project API keys → `anon` `public`** (긴 문자열)
3. 이 두 값을 알려주시면 앱 `lib/supabaseConfig.ts` 에 넣고 빌드·배포합니다.
   - ⚠️ **`service_role` 키와 DB 비밀번호는 절대 공유하지 마세요.** 앱엔 `anon` 키만 들어갑니다(공개돼도 RLS로 안전).

## 5. 첫 관리자 지정
본인이 앱에서 **가입**한 뒤, SQL Editor에서 한 줄 실행:
```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = '본인이메일@회사.com');
```
이러면 그 계정이 관리자(연차 승인·근무지/정책 설정·전체 조회)로 승격됩니다.

## 무료 한도 (참고)
- DB 500MB, 인증 5만 MAU, 저장소 1GB, 전송 5GB/월 — 근태 앱엔 충분.
- 1주 이상 아무 접속이 없으면 프로젝트가 일시정지될 수 있음(매일 쓰는 앱이면 무관, 정지 시 대시보드에서 재개).

## 6. 관리자만 계정 생성 (일반 직원 가입 차단)
직원 자가 가입을 막고, 관리자만 계정을 만들 수 있게 하려면:

**(1) 이름 로그인 함수 추가** — SQL Editor에서 실행 (직원은 이름+비밀번호로 로그인)
```sql
create or replace function public.login_email_for_name(p_name text)
returns text language plpgsql security definer stable
set search_path = public, auth as $$
declare c int; e text;
begin
  select count(*) into c from public.profiles where trim(name) = trim(p_name);
  if c <> 1 then return null; end if;
  select u.email into e from auth.users u
    join public.profiles pr on pr.id = u.id where trim(pr.name) = trim(p_name);
  return e;
end; $$;
grant execute on function public.login_email_for_name(text) to anon, authenticated;
```

**(2) 첫 관리자 지정** — (공개 가입을 끄기 전에 최소 1명은 관리자여야 함)
```sql
update public.profiles set is_admin = true
where id = (select id from auth.users where email = '관리자이메일');
```

**(3) Edge Function 배포** — 관리자만 계정 생성 (service 권한 서버측)
- 대시보드 **Edge Functions → Create a function** → 이름 `create-employee`
- [`functions/create-employee/index.ts`](./functions/create-employee/index.ts) 내용을 붙여넣고 **Deploy**
- (CLI를 쓰면: `supabase functions deploy create-employee`)
- 환경변수(SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY)는 자동 주입되어 별도 설정 불필요

**(4) 공개 가입 끄기** — **Authentication → Sign In / Providers → "Allow new users to sign up" OFF**
- 이제 누구도 스스로 가입 불가. 계정은 관리자가 앱(연차 탭 → 신규 직원 등록)에서만 생성.
- 로그인(이름+비밀번호)·비밀번호 변경은 계속 정상 동작.

## 세션 유지
클라이언트가 세션을 localStorage에 저장하고 토큰을 자동 갱신하므로, 한 번 로그인하면 브라우저를 닫았다 열어도 로그인이 유지됩니다. 더 오래 유지하려면 **Authentication → Sessions** 에서 "Time-box user sessions"·"Inactivity timeout"을 비활성(0)으로 둡니다.

## 보안 요약
- 데이터는 Supabase(Postgres)에 저장, **RLS**로 "직원은 본인 것만, 관리자는 전체"가 DB 레벨에서 강제됩니다.
- 앱에는 공개 가능한 `anon` 키만 포함. 비밀번호는 Supabase Auth가 해시로 관리.
