import { Icon, type IconName } from './Icon'
import './ui.css'

export type Option<T extends string> = {
  value: T
  label: string
  icon?: IconName
  // 줄 오른쪽 작은 글자 (항목의 "수입"/"지출")
  note?: string
  // 수입 항목이면 원형 아이콘을 청록 원으로 (장부 줄 ListRow 와 같은 구분)
  tone?: 'income'
}

// 목록 맨 아래 고르는 줄이 아닌 따로 하는 일 줄 ([✎ 직접 적기])
export type OptionListAction = { label: string; icon: IconName; onClick: () => void }

type OptionListProps<T extends string> = {
  // 묶음 이름 (화면 읽기용)
  label: string
  options: readonly Option<T>[]
  // 고른 값. 아직 없으면 null
  value: T | null
  onChange: (value: T) => void
  action?: OptionListAction
}

// 여럿 중 하나: 줄 목록, 고른 줄은 옅은 청록 면 + 굵게 + 체크 (선택 창 안 장부 연도, 내역 적기 항목 목록)
export function OptionList<T extends string>({ label, options, value, onChange, action }: OptionListProps<T>) {
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
            data-tone={option.tone}
            onClick={() => onChange(option.value)}
          >
            {option.icon && (
              <span className="ui-options__icon">
                <Icon name={option.icon} />
              </span>
            )}
            <span className="ui-options__label">{option.label}</span>
            {option.note && (
              <>
                {/* 이름과 띄어 읽히게 ("대관료 지출") */}{' '}
                <span className="ui-options__note">{option.note}</span>
              </>
            )}
            {selected && <Icon name="check" />}
          </button>
        )
      })}
      {action && (
        <button type="button" className="ui-options__option ui-options__action" data-testid="option-list-action" onClick={action.onClick}>
          <span className="ui-options__icon">
            <Icon name={action.icon} />
          </span>
          <span className="ui-options__label">{action.label}</span>
        </button>
      )}
    </div>
  )
}
