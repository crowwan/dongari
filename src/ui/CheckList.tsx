import { useEffect, useRef, useState, type Ref } from 'react'
import { Icon, type IconName } from './Icon'
import './ui.css'

export type CheckOption = { value: string; label: string }

// 맨 아래 따로 묶는 줄들과 그 묶음 이름 (회비 "누가 냈어요?" 의 "쉬는 분", SPEC-010 3절)
export type CheckListTail = { title: string; options: readonly CheckOption[] }

// 줄이 많으면 처음 몇 줄만 보이고 나머지는 [⌄ 회원 N명 더 보기] 로 펼친다. 접기 줄은 없다
export type CheckListCollapse = { visible: number; label: (hidden: number) => string }

type CheckListProps = {
  // 묶음 이름 (화면 읽기용)
  label: string
  options: readonly CheckOption[]
  tail?: CheckListTail
  checked: readonly string[]
  onToggle: (value: string) => void
  collapse?: CheckListCollapse
  // 맨 아래 따로 하는 일 줄 ([+ 회원 넣기]). 고르는 줄이 아니다
  action?: { label: string; icon: IconName; onClick: () => void }
}

// 여럿을 고르는 세로 체크 목록 (PATTERNS N12 — 블록 격자 대신 줄 목록): 줄 56 이상, 누르면 체크/해제.
// 고른 줄은 옅은 청록 면 + 굵게 + 채운 체크 동그라미, 안 고른 줄은 빈 동그라미 (색만으로 구분하지 않음). 줄 사이 선 없음
export function CheckList({ label, options, tail, checked, onToggle, collapse, action }: CheckListProps) {
  const tailOptions = tail?.options ?? []
  const all = [...options, ...tailOptions]
  const limit = collapse && all.length > collapse.visible + 1 ? collapse.visible : all.length
  // 고른 줄이 접힌 자리에 있으면 펼친 채 시작한다 (고치기에서 이미 낸 분)
  const [expanded, setExpanded] = useState(() => all.slice(limit).some((option) => checked.includes(option.value)))
  const shown = expanded ? all.length : limit
  // 더 보기를 눌러 펼쳤을 때만 처음 펼친 줄로 포커스를 옮긴다
  const focusFirstMore = useRef(false)
  const firstMoreRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!expanded || !focusFirstMore.current) return
    focusFirstMore.current = false
    firstMoreRef.current?.focus()
  }, [expanded])

  const row = (option: CheckOption, index: number) => (
    <CheckRow
      key={option.value}
      option={option}
      checked={checked.includes(option.value)}
      onToggle={onToggle}
      buttonRef={index === limit ? firstMoreRef : undefined}
    />
  )
  const shownTail = tailOptions.slice(0, Math.max(shown - options.length, 0))

  return (
    <div className="ui-checks" role="group" aria-label={label} data-testid="check-list">
      {options.slice(0, shown).map(row)}
      {tail && shownTail.length > 0 && (
        <div className="ui-checks__tail" role="group" aria-label={tail.title}>
          <p className="ui-checks__divider" aria-hidden="true">
            {tail.title}
          </p>
          {shownTail.map((option, index) => row(option, options.length + index))}
        </div>
      )}
      {collapse && shown < all.length && (
        <button
          type="button"
          className="ui-checks__more"
          data-testid="check-list-more"
          aria-expanded={false}
          onClick={() => {
            focusFirstMore.current = true
            setExpanded(true)
          }}
        >
          <Icon name="down" />
          {collapse.label(all.length - shown)}
        </button>
      )}
      {action && (
        <button type="button" className="ui-checks__action" data-testid="check-list-action" onClick={action.onClick}>
          <Icon name={action.icon} />
          {action.label}
        </button>
      )}
    </div>
  )
}

type CheckRowProps = {
  option: CheckOption
  checked: boolean
  onToggle: (value: string) => void
  buttonRef?: Ref<HTMLButtonElement>
}

// 고르는 줄 하나: 체크 동그라미 + 이름. 화면 읽기는 "김도윤, 체크박스, 선택됨"
function CheckRow({ option, checked, onToggle, buttonRef }: CheckRowProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      role="checkbox"
      aria-checked={checked}
      className="ui-checks__option"
      data-state={checked ? 'checked' : 'idle'}
      onClick={() => onToggle(option.value)}
    >
      <span className="ui-checks__box" aria-hidden="true">
        {checked && <Icon name="check" />}
      </span>
      <span className="ui-checks__label">{option.label}</span>
    </button>
  )
}
