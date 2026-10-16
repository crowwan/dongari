import { useId, useRef, type ReactNode } from 'react'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { APP_SHORT_NAME } from '../../pwa/appName'
import { HomeScreenPreview } from '../install/HomeScreenPreview'
import { useScreenHeading } from '../useScreenHeading'
import './practice.css'

// App 밖에서 그리는 한 화면 틀 (첫 실행 물음·연습 끝 화면): App 과 같은 바탕·내용 칸, 화면이 바뀌면 제목에 포커스 (#110)
function StandaloneScreen({ testId, children }: { testId: string; children: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null)
  useScreenHeading(mainRef)
  return (
    <div className="app">
      <main ref={mainRef} className="app__main">
        <div className="screen practice-screen" data-testid={testId}>
          {children}
        </div>
      </main>
    </div>
  )
}

const PRACTICE_PLAN = ['회비 한 줄 적기', '이번 달 정리 보기', '잘못 적은 줄 지우기', '결산 사진 보내 보기']

type FirstRunQuestionProps = {
  onPractice: () => void
  onStart: () => void
  // 제목 위 카드 (SPEC-009 C ③ 카톡에서 옮겨 온 첫 화면의 "카톡에서 쓰던 장부 가져오기"). 있으면 그 카드가 주 버튼이라 [연습해 보기] 는 보조로
  topCard?: ReactNode
}

// 첫 실행 물음 (SPEC-008 컷 0): 장부가 하나도 없는 폰에서 새 장부 만들기보다 먼저 한 번 뜬다
export function FirstRunQuestion({ onPractice, onStart, topCard }: FirstRunQuestionProps) {
  return (
    <StandaloneScreen testId="first-run-question">
      {topCard}
      <h1 className="screen__title practice-screen__title">처음이세요?</h1>
      <p className="practice-screen__lead">돈 적는 법을 한 번 따라 해 볼까요? 연습 장부는 저장되지 않아서 마음대로 눌러 봐도 괜찮아요.</p>
      <section className="practice-card" aria-labelledby="practice-plan-title">
        <h2 className="practice-card__title" id="practice-plan-title">
          따라 해 볼 것
        </h2>
        <ol className="practice-plan">
          {PRACTICE_PLAN.map((step, index) => (
            <li key={step} className="practice-plan__row">
              <span className="practice-plan__number" aria-hidden="true">
                {index + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>
      </section>
      <div className="practice-actions">
        <Button icon="play" variant={topCard ? 'secondary' : 'primary'} onClick={onPractice}>
          연습해 보기
        </Button>
        <Button variant="secondary" onClick={onStart}>
          바로 시작
        </Button>
        <p className="practice-actions__note">쓰던 기록을 옮기려면 [바로 시작] 뒤 위쪽 "불러오기"</p>
      </div>
    </StandaloneScreen>
  )
}

type PracticeEndProps = {
  firstRun: boolean // 첫 실행에서 연 연습이면 진짜 새 장부로, 설정에서 열었으면 진짜 장부로 돌아간다
  asksInstall: boolean // 다음 화면에서 "홈 화면에 추가하시겠어요?" 를 묻는다 (SPEC-009 B, 첫 실행 연습만)
  sent: boolean // 결산 사진 보내기를 마쳤다
  month: number // "[N월 정리 보기]로 한 달 보기" 의 이번 달
  onDone: () => void
}

// 끝 화면 글: 홈 화면에 추가를 물을 차례면 그 말로 (SPEC-009 B ①)
function endLead(firstRun: boolean, asksInstall: boolean): string {
  if (asksInstall) return '연습으로 적은 내역은 지웠어요. 진짜 장부를 만들기 전에 하나만 물어볼게요.'
  return firstRun ? '이제 진짜 장부를 만들어요. 연습으로 적은 내역은 지웠어요.' : '장부로 돌아가요'
}

// 끝 화면 주 버튼: 물을 차례면 [다음], 아니면 첫 실행은 [+ 새 장부 만들기], 설정에서 열었으면 [장부로]
function endButton(firstRun: boolean, asksInstall: boolean): { label: string; icon?: 'plus' } {
  if (asksInstall) return { label: '다음' }
  return firstRun ? { label: '새 장부 만들기', icon: 'plus' } : { label: '장부로' }
}

// 연습 끝 화면 (SPEC-008 컷 6): 연습 띠 없이 체크 동그라미, 제목, 배운 것 네 줄, 아래 주 버튼 하나
export function PracticeEnd({ firstRun, asksInstall, sent, month, onDone }: PracticeEndProps) {
  const button = endButton(firstRun, asksInstall)
  const learned = [
    { text: '[+ 내역 적기]로 한 줄씩 적기', done: true },
    { text: `[${month}월 정리 보기]로 한 달 보기`, done: true },
    { text: '줄을 눌러 고치고 지우기', done: true },
    { text: '결산 사진 보내기', done: sent },
  ]
  return (
    <StandaloneScreen testId="practice-end">
      <div className="practice-done" aria-hidden="true">
        <Icon name="check" />
      </div>
      <h1 className="screen__title practice-screen__title">{firstRun && sent ? '잘 보냈어요!' : '연습 끝!'}</h1>
      <p className="practice-screen__lead">{endLead(firstRun, asksInstall)}</p>
      <section className="practice-card" aria-labelledby="practice-learned-title">
        <h2 className="practice-card__title" id="practice-learned-title">
          배운 것
        </h2>
        <ul className="practice-learned">
          {learned.map(({ text, done }) => (
            <li key={text} className="practice-learned__row" data-done={done}>
              <Icon name={done ? 'check' : 'circle'} />
              {text}
              {!done && <span className="ui-visually-hidden"> (아직 안 해 봤어요)</span>}
            </li>
          ))}
        </ul>
      </section>
      {firstRun && <p className="practice-screen__note">다시 해 보고 싶으면 설정 → 연습해 보기</p>}
      <div className="practice-actions">
        <Button icon={button.icon} onClick={onDone}>
          {button.label}
        </Button>
      </div>
    </StandaloneScreen>
  )
}

const INSTALL_BENEFITS = ['카톡에서 링크를 찾지 않아도 아이콘을 눌러 바로 열려요', '기록이 더 안전하게 지켜져요']

type InstallAskProps = {
  onAdd: () => void // [추가할게요]: 설치 창 또는 그림 안내 창
  onLater: () => void // [다음에 할게요]: 바로 새 장부 만들기
}

// 연습 끝 다음 "홈 화면에 추가하시겠어요?" (SPEC-009 B ②): 홈 화면 모습 그림, 좋은 점 두 줄, 버튼은 화면 흐름 맨 아래.
// 진짜 설치라 연습 띠·말풍선이 없다
export function InstallAsk({ onAdd, onLater }: InstallAskProps) {
  const benefitsTitle = useId()
  return (
    <StandaloneScreen testId="practice-install-ask">
      <h1 className="screen__title practice-screen__title">홈 화면에 추가하시겠어요?</h1>
      <HomeScreenPreview />
      <section className="practice-card" aria-labelledby={benefitsTitle}>
        <h2 className="practice-card__title" id={benefitsTitle}>
          추가하면 좋은 점
        </h2>
        <ul className="practice-learned">
          {INSTALL_BENEFITS.map((text) => (
            <li key={text} className="practice-learned__row" data-wrap="">
              <Icon name="check" />
              {text}
            </li>
          ))}
        </ul>
      </section>
      <div className="practice-actions">
        <Button icon="phone" onClick={onAdd}>
          추가할게요
        </Button>
        <Button variant="secondary" onClick={onLater}>
          다음에 할게요
        </Button>
      </div>
    </StandaloneScreen>
  )
}

type InstallCheckProps = {
  confirmed: boolean // 설치 신호가 왔다. 아니면 그림 안내를 [다 했어요] 로만 닫았다
  onNewBook: () => void
  onRetry: () => void // [다시 따라 하기]: 그림 안내를 1장부터
}

// 설치 확인 (SPEC-009 B ③): 신호가 왔으면 "홈 화면에 추가했어요", 없으면 "홈 화면에 생겼나요?" + [다시 따라 하기].
// 이 화면(이 브라우저)에서 바로 새 장부를 만든다 — 같은 브라우저에서 설치한 홈 화면 앱은 저장 공간이 같다
export function InstallCheck({ confirmed, onNewBook, onRetry }: InstallCheckProps) {
  return (
    <StandaloneScreen testId="practice-install-check">
      <div className="practice-done" aria-hidden="true">
        <Icon name="phone" />
      </div>
      <h1 key={String(confirmed)} className="screen__title practice-screen__title">
        {confirmed ? '홈 화면에 추가했어요' : '홈 화면에 생겼나요?'}
      </h1>
      <p className="practice-screen__lead">
        {confirmed
          ? `다음부터는 홈 화면의 '${APP_SHORT_NAME}' 아이콘으로 열어요. 카톡에서 링크를 찾지 않아도 돼요.`
          : `생겼으면 다음부터는 홈 화면의 '${APP_SHORT_NAME}' 아이콘으로 열어요.`}
      </p>
      <HomeScreenPreview />
      <div className="practice-actions">
        <Button icon="plus" onClick={onNewBook}>
          새 장부 만들기
        </Button>
        {!confirmed && (
          <Button variant="secondary" onClick={onRetry}>
            다시 따라 하기
          </Button>
        )}
      </div>
    </StandaloneScreen>
  )
}
