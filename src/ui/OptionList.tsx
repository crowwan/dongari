import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react'
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
// expanded 를 주면 펼치는 줄이 된다: 펼침 상태를 읽히고(aria-expanded), 펼쳤을 때 그 줄 아래(목록 안)에 panel 을 보인다 (고치기 직접 적기 칸, v2.6)
export type OptionListAction = { label: string; icon: IconName; onClick: () => void; expanded?: boolean; panel?: ReactNode }

// 처음 줄들 뒤 [⌄ 예전에 쓴 항목 N개 더 보기] 줄 (SPEC-001 v2.7). 누르면 그 자리에 구분 글자(heading)와 options 가 펼쳐진다.
// 접기 줄은 없다. 펼친 상태는 이 목록이 그려져 있는 동안만 (다시 그리면 접힌 채, 고른 값이 예전 줄이면 펼친 채 시작)
export type OptionListMore<T extends string> = { label: string; heading: string; options: readonly Option<T>[] }

type OptionListProps<T extends string> = {
  // 묶음 이름 (화면 읽기용)
  label: string
  options: readonly Option<T>[]
  // 고른 값. 아직 없으면 null
  value: T | null
  onChange: (value: T) => void
  more?: OptionListMore<T>
  action?: OptionListAction
}

// 여럿 중 하나: 줄 목록, 고른 줄은 옅은 청록 면 + 굵게 + 체크 (선택 창 안 장부 연도, 내역 적기 항목 목록)
export function OptionList<T extends string>({ label, options, value, onChange, more, action }: OptionListProps<T>) {
  const panelId = useId()
  const panelOpen = action?.expanded === true && action.panel !== undefined
  const moreOptions = more?.options ?? []
  const [expanded, setExpanded] = useState(() => moreOptions.some((option) => option.value === value))
  // 더 보기를 눌러 펼쳤을 때만 첫 예전 줄로 포커스를 옮긴다 (처음부터 펼친 채 그릴 때는 옮기지 않는다)
  const focusFirstMore = useRef(false)
  const firstMoreRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!expanded || !focusFirstMore.current) return
    focusFirstMore.current = false
    firstMoreRef.current?.focus()
  }, [expanded])

  return (
    <div className="ui-options" role="group" aria-label={label} data-testid="option-list">
      {options.map((option) => (
        <OptionRow key={option.value} option={option} selected={option.value === value} onChange={onChange} />
      ))}
      {more && moreOptions.length > 0 && !expanded && (
        <button
          type="button"
          className="ui-options__option ui-options__action ui-options__more"
          data-testid="option-list-more"
          aria-expanded={false}
          onClick={() => {
            focusFirstMore.current = true
            setExpanded(true)
          }}
        >
          <span className="ui-options__icon">
            <Icon name="down" />
          </span>
          <span className="ui-options__label">{more.label}</span>
        </button>
      )}
      {more && moreOptions.length > 0 && expanded && (
        <>
          <p className="ui-options__divider" data-testid="option-list-more-heading">
            <Icon name="history" />
            {more.heading}
          </p>
          {moreOptions.map((option, index) => (
            <OptionRow
              key={option.value}
              option={option}
              selected={option.value === value}
              onChange={onChange}
              buttonRef={index === 0 ? firstMoreRef : undefined}
            />
          ))}
        </>
      )}
      {action && (
        <button
          type="button"
          className="ui-options__option ui-options__action"
          data-testid="option-list-action"
          aria-expanded={action.expanded}
          aria-controls={panelOpen ? panelId : undefined}
          onClick={action.onClick}
        >
          <span className="ui-options__icon">
            <Icon name={action.icon} />
          </span>
          <span className="ui-options__label">{action.label}</span>
        </button>
      )}
      {panelOpen && (
        <div className="ui-options__panel" id={panelId} data-testid="option-list-panel">
          {action.panel}
        </div>
      )}
    </div>
  )
}

type OptionRowProps<T extends string> = {
  option: Option<T>
  selected: boolean
  onChange: (value: T) => void
  buttonRef?: Ref<HTMLButtonElement>
}

// 고르는 줄 하나: 원형 아이콘 + 이름 + 오른쪽 작은 표시 + 고르면 체크
function OptionRow<T extends string>({ option, selected, onChange, buttonRef }: OptionRowProps<T>) {
  return (
    <button
      ref={buttonRef}
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
}
