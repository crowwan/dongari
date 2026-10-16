// 안내 말풍선(CoachMark) 자리 계산 (SPEC-008 "모양")

export type CoachSide = 'above' | 'below'

export type Box = { top: number; left: number; width: number; height: number }

export type CoachPlacement = {
  side: CoachSide // 말풍선이 버튼 위(꼬리 아래)인지 아래(꼬리 위)인지
  anchor: number // 위면 틀 아래에서 버튼 위 가장자리까지, 아래면 틀 위에서 버튼 아래 가장자리까지 (px)
  tailX: number // 말풍선 왼쪽에서 꼬리 가운데까지 (px)
}

// 꼬리가 말풍선 둥근 모서리(16) 밖으로 나가지 않게 양 끝에서 이만큼 띄운다
const TAIL_EDGE = 26

// 버튼이 틀 아래쪽 절반에 있으면 말풍선은 버튼 위, 위쪽 절반이면 버튼 아래. 꼬리는 버튼 가운데 쪽으로 (SPEC-008 "모양")
export function coachPlacement(target: Box, frameHeight: number, bubble: Pick<Box, 'left' | 'width'>): CoachPlacement {
  const centerY = target.top + target.height / 2
  const side: CoachSide = centerY >= frameHeight / 2 ? 'above' : 'below'
  const anchor = side === 'above' ? frameHeight - target.top : target.top + target.height
  const centerX = target.left + target.width / 2 - bubble.left
  const tailX = Math.min(Math.max(centerX, TAIL_EDGE), Math.max(bubble.width - TAIL_EDGE, TAIL_EDGE))
  return { side, anchor, tailX }
}
