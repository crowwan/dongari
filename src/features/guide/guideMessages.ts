// 처음 쓰는 분 안내 말풍선 문구 (SPEC-008 "말풍선 네 개" 표)
import type { GuideNumber } from './guideRules'

// 3번 말풍선(올해 결산)이 가리키는 버튼. 결산 보내기(SPEC-003 v2.6 보강)는 기술 검증(#114) 뒤에 생기므로
// 그 전까지는 지금 있는 [사진으로 저장] 을 가리킨다. 결산 보내기 이슈에서 이 값과 아래 문구를 보내기 버튼으로 바꾼다
export type YearGuideTarget = 'save-picture'
export const YEAR_GUIDE_TARGET: YearGuideTarget = 'save-picture'

export const GUIDE_MESSAGES: Record<GuideNumber, string> = {
  1: '돈이 들어오거나 나가면 여기를 눌러 한 줄씩 적어요',
  2: '이번 달에 얼마 쓰고 남았는지 여기서 봐요',
  // 보내기 버튼이 생기면 "카톡·문자로 보낼 수 있어요" (SPEC-008 열린 질문)
  3: '사진으로 저장해 카톡·문자로 보낼 수 있어요',
  4: '폰을 바꿔도 기록이 돌아오게 복구 코드를 보내 두세요',
}

// 가리키는 버튼이 화면을 여는지 (내역 적기·월 정리·설정). 화면을 열면 말풍선 방문 기록 칸을 그 화면 칸으로 바꿔 끼우고,
// 아니면(3번 사진으로 저장) 말풍선 칸을 되돌린다
export const GUIDE_OPENS_SCREEN: Record<GuideNumber, boolean> = { 1: true, 2: true, 3: false, 4: true }
