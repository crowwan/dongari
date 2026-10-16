// 연습 끝에 "홈 화면에 추가하시겠어요?" 를 묻는 조건 (SPEC-009 B "언제 묻나")
import { shouldOfferInstall } from '../install/installRules'

type AskCondition = {
  // 첫 실행 물음에서 연 연습인지 (설정 [연습해 보기] 는 설정에 [홈 화면에 추가] 줄이 있어 묻지 않는다)
  firstRun: boolean
  // 홈 화면 아이콘으로 열었는지 (display-mode: standalone)
  standalone: boolean
  // 이 화면에서 이미 설치를 마쳤는지 (appinstalled)
  installed: boolean
  // 카톡 안 브라우저인지 (거기서는 설치할 수 없다, SPEC-009 C)
  inApp: boolean
}

// [그만하기] 로 끝낸 연습은 끝 화면에 오지 않아 여기서 따로 보지 않는다
export function asksInstallAfterPractice({ firstRun, standalone, installed, inApp }: AskCondition): boolean {
  return firstRun && shouldOfferInstall({ standalone, installed }) && !inApp
}
