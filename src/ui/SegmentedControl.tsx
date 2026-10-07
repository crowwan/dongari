import { Icon, type IconName } from './Icon'
import './ui.css'

export type SegmentOption<T extends string> = { value: T; label: string; icon?: IconName }

// 둘 중 하나만 (M3·HIG 세그먼트 원칙: 둘 이상 여럿이면 목록이나 선택 창을 쓴다)
export type SegmentOptions<T extends string> = readonly [SegmentOption<T>, SegmentOption<T>]

type SegmentedControlProps<T extends string> = {
  // 묶음 이름 (화면 읽기용, 보통 질문 제목과 같은 말)
  label: string
  options: SegmentOptions<T>
  // 아직 안 골랐으면 null
  value: T | null
  onChange: (value: T) => void
}

// 한 몸통 스위치: 회색 바탕 안에서 고른 쪽만 손잡이(흰 면 + 굵게)로 떠오른다 ([수입] [지출])
export function SegmentedControl<T extends string>({ label, options, value, onChange }: SegmentedControlProps<T>) {
  return (
    <div className="ui-segment" role="group" aria-label={label} data-testid="segmented-control">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            className="ui-segment__option"
            aria-pressed={selected}
            data-state={selected ? 'selected' : 'idle'}
            onClick={() => onChange(option.value)}
          >
            {option.icon && <Icon name={option.icon} />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
