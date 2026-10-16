// 화면이 바뀌면 화면 읽기(TalkBack)에 알린다 (#110 접근성 점검 10).
// 화면을 바꾸면 누른 버튼이 사라져 포커스가 BODY 로 떨어지고, 화면 읽기는 새 화면이 열린 것을 모른다.
// 그래서 새 화면 제목(h1)에 포커스를 주고(tabIndex=-1, 포커스 테두리는 screens.css 에서 숨김), 브라우저 제목을 "화면 이름 · 우리 장부" 로 바꾼다.
// 화면 하나에 h1 하나라는 약속에 기댄다: h1 이 다른 요소로 바뀌면 화면이 바뀐 것이다 (설정 위 편집 화면도 같다)
import { useEffect, useRef, type RefObject } from 'react'

export const APP_TITLE = '우리 장부'

// 제목 글자. 화면 읽기 전용 덧말(장부 이름 버튼의 " 장부 바꾸기")은 뺀다
function headingName(heading: HTMLElement): string {
  const copy = heading.cloneNode(true)
  if (!(copy instanceof HTMLElement)) return ''
  for (const hidden of copy.querySelectorAll('.ui-visually-hidden')) hidden.remove()
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim()
}

export function useScreenHeading(mainRef: RefObject<HTMLElement | null>) {
  const shownHeading = useRef<HTMLHeadingElement | null>(null)

  // 그릴 때마다 본다 (화면 이름이 바뀌어도, 제목 요소가 바뀌어도)
  useEffect(() => {
    const main = mainRef.current
    const heading = main?.querySelector('h1')
    if (!main || !heading) return
    document.title = `${headingName(heading)} · ${APP_TITLE}`
    if (heading === shownHeading.current) return
    const firstScreen = shownHeading.current === null
    shownHeading.current = heading
    // 앱을 처음 열 때는 옮기지 않는다. 새 화면이 스스로 칸에 포커스를 줬으면(내역 적기 날 칸 → 숫자 키패드) 그대로 둔다
    if (firstScreen || main.contains(document.activeElement)) return
    heading.tabIndex = -1
    heading.focus({ preventScroll: true })
  })
}
