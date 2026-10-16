import { useRef, type ReactNode } from 'react'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
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
}

// 첫 실행 물음 (SPEC-008 컷 0): 장부가 하나도 없는 폰에서 새 장부 만들기보다 먼저 한 번 뜬다
export function FirstRunQuestion({ onPractice, onStart }: FirstRunQuestionProps) {
  return (
    <StandaloneScreen testId="first-run-question">
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
        <Button icon="play" onClick={onPractice}>
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
  sent: boolean // 결산 사진 보내기를 마쳤다
  month: number // "[N월 정리 보기]로 한 달 보기" 의 이번 달
  onDone: () => void
}

// 연습 끝 화면 (SPEC-008 컷 6): 연습 띠 없이 체크 동그라미, 제목, 배운 것 네 줄, 아래 주 버튼 하나
export function PracticeEnd({ firstRun, sent, month, onDone }: PracticeEndProps) {
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
      <p className="practice-screen__lead">{firstRun ? '이제 진짜 장부를 만들어요. 연습으로 적은 내역은 지웠어요.' : '장부로 돌아가요'}</p>
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
        <Button icon={firstRun ? 'plus' : undefined} onClick={onDone}>
          {firstRun ? '새 장부 만들기' : '장부로'}
        </Button>
      </div>
    </StandaloneScreen>
  )
}
