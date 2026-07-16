import React from 'react';
import { Modal, View, Text, ScrollView, Pressable } from 'react-native';
import { Card, Row, Body, Muted, Button, Divider, Badge } from './ui';
import { useTheme } from '@/lib/theme';
import { useStore } from '@/lib/store';

function Section({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: 4, marginTop: 4 }}>
      <Text style={{ fontWeight: '800', color: t.text, fontSize: 15 }}>
        {emoji} {title}
      </Text>
      <View style={{ gap: 3, paddingLeft: 2 }}>{children}</View>
    </View>
  );
}

function Step({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Row style={{ gap: 6, alignItems: 'flex-start' }}>
      <Text style={{ color: t.primary, fontSize: 13, marginTop: 1 }}>•</Text>
      <Text style={{ color: t.textDim, fontSize: 13, flex: 1, lineHeight: 19 }}>{children}</Text>
    </Row>
  );
}

export function HelpManual({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const s = useStore();
  const wp = s.settings.workPolicy;

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ maxHeight: '92%', backgroundColor: t.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden' }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 }}>
            <Body style={{ fontWeight: '800', fontSize: 18 }}>📋 근태 관련 안내사항</Body>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ fontSize: 22, color: t.textDim }}>✕</Text>
            </Pressable>
          </Row>
          <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 4, gap: 8 }} showsVerticalScrollIndicator={false}>
            <Muted size={13}>
              앱 사용법과 근태 규칙을 정리했습니다. 처음이시면 순서대로 한 번 읽어보시고, 필요할 때 다시 열어보세요. 🙂
            </Muted>

            <Card style={{ borderColor: t.primary, borderWidth: 1 }}>
              <Section emoji="📌" title="꼭 알아두세요">
                <Step>여기 기록되는 <Text style={{ fontWeight: '700' }}>근태 자료는 인사고과·연봉협상의 기초자료</Text>로 사용됩니다.</Step>
                <Step><Text style={{ fontWeight: '700' }}>코어타임 준수·시간 내 성실 근무</Text>만 해주셔도 불이익이 없고, 더 열심히 근무한 분은 점수로 <Text style={{ fontWeight: '700' }}>더 챙겨드립니다</Text>.</Step>
                <Step>지각·근로부족·조기퇴근·무단이탈 등은 관리자가 기록·관리하며 근태점수에 반영됩니다.</Step>
              </Section>
            </Card>

            <Card>
              <Section emoji="⏰" title="근무 규칙 (근로계약 기준)">
                <Step><Text style={{ fontWeight: '700' }}>코어타임 {wp.coreStart}–{wp.coreEnd}</Text>은 반드시 근무해야 합니다.</Step>
                <Step>출근은 <Text style={{ fontWeight: '700' }}>{wp.earliestClockIn}~{wp.latestClockIn}</Text> 사이, {wp.clockInStepMinutes}분 단위로 선택합니다. {wp.latestClockIn}을 넘겨 출근하면 <Text style={{ fontWeight: '700' }}>지각</Text>입니다.</Step>
                <Step>하루 소정근로는 <Text style={{ fontWeight: '700' }}>{wp.dailyWorkMinutes / 60}시간</Text>, 휴게 <Text style={{ fontWeight: '700' }}>{wp.breakStart}–{wp.breakEnd}</Text>(1시간)는 근로시간에서 제외됩니다.</Step>
                <Step>예상 퇴근 = 출근 + 소정근로 + 휴게. 그전에 퇴근하면 <Text style={{ fontWeight: '700' }}>조기퇴근/근로부족</Text>으로 기록됩니다.</Step>
                <Step>휴식은 점심 휴게시간을 최대한 활용해 주세요.</Step>
              </Section>
            </Card>

            <Card>
              <Section emoji="🕒" title="출근 · 퇴근 (오늘 탭)">
                <Step>회사 근무지 <Text style={{ fontWeight: '700' }}>반경 안</Text>에서 <Text style={{ fontWeight: '700' }}>출근</Text> 버튼을 누르면 위치와 함께 출근이 기록됩니다.</Step>
                <Step>코어타임 <Text style={{ fontWeight: '700' }}>{wp.coreStart}–{wp.coreEnd}</Text>는 반드시 근무, 휴게 <Text style={{ fontWeight: '700' }}>{wp.breakStart}–{wp.breakEnd}</Text>는 근로시간에서 자동 제외됩니다.</Step>
                <Step>출근하면 <Text style={{ fontWeight: '700' }}>예상 퇴근 시각</Text>과 남은 시간이 표시됩니다. 소정근로({wp.dailyWorkMinutes / 60}시간)를 채우면 퇴근 가능.</Step>
                <Step>퇴근할 때 <Text style={{ fontWeight: '700' }}>퇴근</Text> 버튼을 꼭 눌러주세요. (안 누르면 '퇴근 미기록')</Step>
                <Step>외근·현장 근무는 <Text style={{ fontWeight: '700' }}>출장 모드</Text>로 출근하면 위치 검증을 생략합니다.</Step>
              </Section>
            </Card>

            <Card>
              <Section emoji="🚶" title="외출 · 복귀 (근무 중)">
                <Step>근무 중 잠깐 나갈 땐 <Text style={{ fontWeight: '700' }}>외출</Text>을 누르고, 돌아오면 <Text style={{ fontWeight: '700' }}>복귀</Text>를 누르세요.</Step>
                <Step>외출한 시간은 중간 연차로 처리되며 관리자 승인 후 반영됩니다.</Step>
              </Section>
            </Card>

            <Card>
              <Section emoji="🍚" title="저녁식대 (야근)">
                <Step>야근 시 관리자에게 별도 통보 없이 <Text style={{ fontWeight: '700' }}>법인카드 사용이 가능</Text>합니다.</Step>
                <Step>식사 후 퇴근 체크할 때 오늘 탭의 <Text style={{ fontWeight: '700' }}>저녁식대</Text> 스위치를 켜주세요.</Step>
              </Section>
            </Card>

            <Card>
              <Section emoji="🚸" title="무단이탈 안내">
                <Step>회사는 근태 관리를 위해 <Text style={{ fontWeight: '700' }}>20분 이상 통보 없이 임의로</Text> 자리를 비우는 경우(무단이탈)도 기록·관리하고 있습니다.</Step>
                <Step>가끔 개인 사정으로 <Text style={{ fontWeight: '700' }}>일시적으로 발생</Text>하는 것은 이해하며 큰 불이익은 없지만, <Text style={{ fontWeight: '700' }}>정기적·자주</Text> 발생하면 종합 근태점수에 불이익이 될 수 있습니다.</Step>
                <Step><Text style={{ fontWeight: '700' }}>관리자에게 미리 말하고</Text> 자리를 비우면 무단이탈로 잡히지 않습니다.</Step>
                <Step>개인 휴식은 <Text style={{ fontWeight: '700' }}>점심 휴게 1시간</Text>({wp.breakStart}–{wp.breakEnd})을 최대한 활용해 주세요.</Step>
              </Section>
            </Card>

            <Card>
              <Section emoji="🌴" title="연차 · 휴가 신청 (연차 탭)">
                <Step><Text style={{ fontWeight: '700' }}>연차는 눈치 보지 말고 자유롭게 사용하세요.</Text> 관리자에게 승인 요청만 하면 됩니다.</Step>
                <Step>연차는 <Text style={{ fontWeight: '700' }}>2시간 단위</Text>(반반차 2h · 반차 4h · 종일 8h)로 신청합니다.</Step>
                <Step>오전(늦게 출근)/오후(일찍 퇴근)/종일/직접지정 중 선택 → 날짜·시간 고르고 <Text style={{ fontWeight: '700' }}>신청</Text>.</Step>
                <Step>예비군·경조사·공가 등은 <Text style={{ fontWeight: '700' }}>유급휴가</Text>로 신청(연차 잔여 차감 없음).</Step>
                <Step>신청은 <Text style={{ fontWeight: '700' }}>관리자 승인</Text> 후 확정됩니다. 상단에서 잔여 연차를 확인하세요.</Step>
                <Step><Text style={{ fontWeight: '700' }}>3일 이상 연속 장기 출타</Text>는 업무 조율을 위해 <Text style={{ fontWeight: '700' }}>1주일 전</Text>에 관리자에게 미리 알려주시길 권고합니다.</Step>
              </Section>
            </Card>

            <Card>
              <Section emoji="📊" title="이력 · 달력 (이력 탭)">
                <Step>월별 근무 요약과 날짜별 기록을 달력/목록으로 볼 수 있습니다.</Step>
                <Step>달력 색: 초록=정상 근무, 빨강=지각·부족, 보라=연차, 초록=유급휴가.</Step>
              </Section>
            </Card>

            <Card>
              <Section emoji="✍️" title="주간 확인 서명 (이력 탭)">
                <Step>한 주가 지나면 그 주 근무기록을 확인하고 <Text style={{ fontWeight: '700' }}>이름으로 서명</Text>해 주세요.</Step>
                <Step>시스템 기록을 기준으로 근로시간이 산정됩니다.</Step>
              </Section>
            </Card>

            <Card>
              <Section emoji="🔒" title="비밀번호 · 문의 (설정 탭)">
                <Step>처음 로그인하면 관리자가 준 초기 비밀번호를 <Text style={{ fontWeight: '700' }}>본인만 아는 것으로 변경</Text>하세요.</Step>
                <Step>이름·비밀번호로 로그인합니다. 로그인이 안 되면 관리자에게 문의하세요.</Step>
              </Section>
            </Card>

            <Divider />
            <Muted size={12}>궁금한 점은 관리자에게 문의해 주세요. 좋은 하루 되세요! ☕</Muted>
            <Button label="닫기" variant="primary" onPress={onClose} />
            <View style={{ height: 8 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
