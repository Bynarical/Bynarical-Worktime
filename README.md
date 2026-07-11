# BYnarical Worktime 🕒

코어타임 근무제 · 위치 기반 근태 · 연차(반반차) 관리 앱.
Expo(React Native) 기반으로 **웹 + iOS + Android** 를 하나의 코드베이스로 지원합니다.

> 이전 `BYnarical-Attendance`(위치 기반 출퇴근)를 근로계약서 **제4조(코어타임)** · **제6조(연차·반반차)** 에 맞춰 재구축·확장한 v2.

## 주요 기능

### 근태 (제4조 · 코어타임 근무제)
- **코어타임 10:00–16:00** 필수 근무, **휴게 12:00–13:00** 자동 제외
- **출근 시각 선택**: 07:00~10:00, 30분 단위(00/30) — 계약서 3항
- **예상 퇴근 시각 자동 계산**: 출근 + 소정근로 8시간 + 휴게 1시간
- **GPS 반경 검증** 출퇴근, **출장 모드**(반경 검증 생략)
- 실시간 근무시간, 진행률, 휴게시간 안내
- 자동 판정: **지각 / 코어타임 미충족 / 조기퇴근 / 근로부족 / 초과근무 / 퇴근 미기록** (계약서 6~8항)
- **월별 집계** + **주간 전자서명 확인**(제4조 7항)
- **무결성 해시 체인**(각 기록·서명이 이전 해시에 연결) · **CSV 내보내기**

### 연차 (제6조 · 반반차)
- **2시간 단위 분할 사용**: 2h(반반차) / 4h(반차) / 6h / 8h(종일)
- 오전(늦게 출근) · 오후(일찍 퇴근) · 종일 · 직접 지정
- **근로기준법 기반 자동 발생**: 입사 1년 미만 월 1일(최대 11일), 1년 이상 15일 + 근속 가산(상한 25일)
- **선사용 금지 검증**(발생 범위 내에서만 신청)
- **신청 → 관리자 승인/반려** 워크플로 + 잔액 실시간 반영
- 연차 사용일은 그날 소정근로가 자동 감소

### 관리자
- 관리자 비밀번호(해시 저장) 잠금
- 근무 정책 편집(코어타임/휴게/출근단위/소정근로), 연차 정책(기본/상한 일수)
- 연차 승인·반려, 연차 수동 가감

### 저장/동기화
- 오프라인 우선(localStorage/AsyncStorage), 온라인 시 **Google Apps Script + Sheets** 동기화
- 서버 없이도 완전 동작 (백엔드 설정은 [`server/README.md`](./server/README.md))

## 개발

```bash
npm install
npm run web       # 웹 개발 서버 (http://localhost:8081)
npm run ios       # iOS 시뮬레이터
npm run android   # Android 에뮬레이터
npm run typecheck # 타입 체크
```

## 웹 배포 (GitHub Pages)

```bash
npm run export:web   # dist/ 에 정적 웹 빌드(SPA)
npm run deploy:web   # gh-pages 브랜치로 배포
```

## 구조

```
app/                라우트 (expo-router)
  (auth)/login      로그인/계정등록
  (tabs)/index      오늘(출퇴근)
  (tabs)/history    이력·집계·주간서명
  (tabs)/leave      연차 잔액·신청·승인
  (tabs)/settings   프로필·근무지·정책·동기화
lib/                도메인 로직
  config, types, storage, time, hash, geo, backend, store, theme, csv
  attendance.ts     코어타임·휴게·근로시간·플래그·집계
  leave.ts          연차 발생·잔액·검증(반반차)
components/ui.tsx   재사용 UI
server/Code.gs      Google Apps Script 백엔드
```

## 기술 스택
Expo SDK 57 · React Native 0.86 · React 19 · expo-router · TypeScript · expo-location · AsyncStorage

---
데이터는 기본적으로 기기에 저장되며, 설정 시 회사 Google Sheets로 동기화됩니다.
