import { useEffect, useRef, type Ref } from 'react'
import { Button } from '../../ui/Button'
import { APP_TITLE } from '../useScreenHeading'
import '../screens.css'
import './reopen.css'

export const REOPEN_TITLE = '화면에 문제가 생겼어요'

type ReopenScreenProps = {
  // [다시 열기]: 앱을 처음부터 다시 연다
  onReopen: () => void
  // 화면이 뜰 때 포커스를 줄 제목 (ReopenPage 가 준다. 카탈로그 견본은 주지 않는다)
  headingRef?: Ref<HTMLHeadingElement>
}

// "다시 열기" 화면 (SPEC-012 2절): 화면을 그리다 오류가 나면 흰 화면 대신 보인다.
// 앱 상태·저장소에 기대지 않는 단순한 부품이다 — 이 화면이 다시 오류를 내지 않게 글과 버튼 하나만 그리고, 값은 토큰 CSS 만 쓴다.
// [기록 파일 보내기]는 두지 않는다: 자동으로 지키기가 켜진 폰은 개발자가 서버 사본을 꺼낼 수 있다(keep-rescue, SPEC-012 열린 질문)
export function ReopenScreen({ onReopen, headingRef }: ReopenScreenProps) {
  return (
    <section className="screen reopen" data-testid="reopen-screen">
      <div className="reopen__text">
        <h1 ref={headingRef} className="screen__title" tabIndex={-1}>
          {REOPEN_TITLE}
        </h1>
        <p className="reopen__body">적어 둔 기록은 폰에 그대로 있어요.</p>
      </div>
      <Button variant="primary" icon="refresh" onClick={onReopen}>
        다시 열기
      </Button>
    </section>
  )
}

// 오류 경계가 그리는 한 장: 앱 화면 틀 안에 다시 열기 화면. 화면 읽기(TalkBack)가 새 화면을 알게
// 제목에 포커스를 주고 브라우저 제목을 바꾼다 (useScreenHeading 과 같은 약속)
export function ReopenPage({ onReopen }: { onReopen: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    document.title = `${REOPEN_TITLE} · ${APP_TITLE}`
    heading.current?.focus({ preventScroll: true })
  }, [])
  return (
    <div className="app">
      <main className="app__main">
        <ReopenScreen headingRef={heading} onReopen={onReopen} />
      </main>
    </div>
  )
}
