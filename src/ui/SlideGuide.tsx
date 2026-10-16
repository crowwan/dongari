import { useRef, useState, type ReactNode } from 'react'
import { Button } from './Button'
import './slideGuide.css'

export type Slide = {
  // 그림 한 장 (뜻은 text 가 전하므로 그림은 보통 화면 읽기에서 숨긴다)
  picture: ReactNode
  // 큰 글씨 한 줄. 화면 읽기는 "2 / 4, …" 처럼 장 번호와 함께 읽는다
  text: string
}

type SlideGuideProps = {
  slides: readonly Slide[]
  // 마지막 장의 [다음] 자리 버튼 이름 (예: "다 했어요")
  finishLabel: string
  onFinish: () => void
}

// 넘겨 보는 안내 틀 (SPEC-009 설치 안내): 그림 한 장 + "1 / 4" 글 줄 + [이전]·[다음].
// 따라 하는 동안 다른 화면(브라우저 메뉴)을 오가니 손으로만 넘긴다(자동 넘김 없음). 장 번호는 이 부품 안 상태라
// 창을 닫았다 다시 열면(다시 그려지면) 1장부터다. 처음부터 다시 보이려면 key 를 바꿔 다시 그린다
export function SlideGuide({ slides, finishLabel, onFinish }: SlideGuideProps) {
  const [index, setIndex] = useState(0)
  const nextRef = useRef<HTMLButtonElement>(null)
  const slide = slides[index]
  const last = index === slides.length - 1

  const goPrevious = () => {
    const previous = index - 1
    setIndex(previous)
    // 첫 장에서 [이전] 은 누를 수 없게 되어 포커스를 잃으니 [다음] 으로 옮긴다
    if (previous === 0) nextRef.current?.focus()
  }

  return (
    <div className="ui-slides" data-testid="slide-guide" data-step={index + 1}>
      <div className="ui-slides__picture">{slide.picture}</div>
      <p className="ui-slides__text" aria-live="polite" data-testid="slide-guide-text">
        <span className="ui-slides__count">
          {index + 1} / {slides.length}
        </span>
        <span className="ui-visually-hidden">, </span>
        <span>{slide.text}</span>
      </p>
      <div className="ui-slides__buttons">
        <Button variant="secondary" disabled={index === 0} onClick={goPrevious}>
          이전
        </Button>
        <Button ref={nextRef} onClick={last ? onFinish : () => setIndex(index + 1)}>
          {last ? finishLabel : '다음'}
        </Button>
      </div>
    </div>
  )
}
