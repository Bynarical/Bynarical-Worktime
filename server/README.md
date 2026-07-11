# Google Apps Script 백엔드 설정

앱은 **백엔드가 없어도 완전히 동작**합니다(모든 데이터는 기기의 localStorage/AsyncStorage에 저장). Google Sheets 동기화를 원할 때만 아래를 설정하세요.

## 1. 스프레드시트 준비
1. 새 Google 스프레드시트를 만듭니다. (탭은 자동 생성됩니다)
2. **확장 프로그램 → Apps Script** 를 엽니다.
3. 기본 `Code.gs` 내용을 지우고 [`Code.gs`](./Code.gs) 전체를 붙여넣습니다.
4. 저장합니다.

## 2. 웹 앱 배포
1. **배포 → 새 배포** 클릭
2. 유형: **웹 앱**
3. 설정:
   - 설명: `worktime`
   - 실행 계정: **나**
   - 액세스 권한: **모든 사용자** (익명 포함)
4. **배포** → 권한 승인
5. 나오는 URL `https://script.google.com/macros/s/.../exec` 을 복사

## 3. 앱에 연결
- 앱 → **설정 → 동기화 → Google Apps Script 웹앱 URL** 에 붙여넣고 **URL 저장**
- **지금 동기화** 를 누르면 대기 중이던 기록이 전송됩니다.

## 시트 구조 (자동 생성)
| 시트 | 내용 |
|------|------|
| `Settings` | `adminPasswordHash` 등 키/값 |
| `Workplaces` | 근무지(이름/위도/경도/반경) |
| `Records` | 근태 기록(출퇴근·위치·해시) |
| `Leaves` | 연차 신청/승인(반반차 포함) |
| `Confirmations` | 주간 전자서명 |

## 통신 방식
- **읽기**: `GET ?action=getSettings` / `GET ?action=getUserData&userId=...`
- **쓰기**: `POST` body `{ action:'sync', ops:[{action, payload}] }`
  - CORS 프리플라이트를 피하려고 `Content-Type: text/plain` 으로 전송합니다.
  - `ops[].action`: `upsertRecord` · `upsertLeave` · `upsertConfirmation` · `saveSettings`

## 재배포 주의
Apps Script 코드를 수정하면 **배포 관리 → 기존 배포 편집 → 새 버전** 으로 갱신해야 URL이 유지됩니다. (새 배포를 만들면 URL이 바뀝니다.)
