import { Icon, type IconName } from './Icon'
import './ui.css'

export type Option<T extends string> = { value: T; label: string; icon?: IconName }

type OptionListProps<T extends string> = {
  // 묶음 이름 (화면 읽기용)
  label: string
  options: readonly Option<T>[]
  // 고른 값. 아직 없으면 null
  value: T | null
  onChange: (value: T) => void
}

// 여럿 중 하나: 줄 목록, 고른 줄은 옅은 청록 면 + 굵게 + 체크 (선택 창 안 장부 연도 등)
export function OptionList<T extends string>({ label, options, value, onChange }: OptionListProps<T>) {
  return (
    <div className="ui-options" role="group" aria-label={label} data-testid="option-list">
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            className="ui-options__option"
            aria-pressed={selected}
            data-state={selected ? 'selected' : 'idle'}
            onClick={() => onChange(option.value)}
          >
            {option.icon && (
              <span className="ui-options__icon">
                <Icon name={option.icon} />
              </span>
            )}
            <span className="ui-options__label">{option.label}</span>
            {selected && <Icon name="check" />}
          </button>
        )
      })}
    </div>
  )
}
