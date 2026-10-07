import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DayInput } from './DayInput'

function Controlled() {
  const [value, setValue] = useState('')
  return <DayInput label="며칠인가요?" value={value} onChange={setValue} />
}

describe('SPEC-001 DayInput (날 숫자 칸)', () => {
  it('AC-24 이름으로 읽히는 숫자 칸 + "일" 이다 (폰 숫자 키패드, 두 자리까지)', () => {
    render(<DayInput label="며칠인가요?" value="7" onChange={() => {}} />)

    const input = screen.getByRole('textbox', { name: '며칠인가요?' })
    expect(input).toHaveValue('7')
    expect(input).toHaveAttribute('inputmode', 'numeric')
    expect(input).toHaveAttribute('maxlength', '2')
    expect(screen.getByTestId('day-input')).toHaveTextContent('일')
  })

  it('친 글자를 그대로 onChange 로 넘긴다', async () => {
    render(<Controlled />)

    await userEvent.type(screen.getByRole('textbox', { name: '며칠인가요?' }), '12')

    expect(screen.getByRole('textbox', { name: '며칠인가요?' })).toHaveValue('12')
  })

  it('autoFocus 면 나타나자마자 칸에 포커스 (키패드가 바로 뜬다)', () => {
    render(<DayInput label="며칠인가요?" value="" autoFocus onChange={() => {}} />)

    expect(screen.getByRole('textbox', { name: '며칠인가요?' })).toHaveFocus()
  })

  it('AC-24 빠른 칩은 칸 아래에 "오늘 7일"·"방금 5일" 로 보이고, 누르면 그 날이 onPick 으로 간다', async () => {
    const onPick = vi.fn<(day: number) => void>()
    render(
      <DayInput
        label="며칠인가요?"
        value=""
        onChange={() => {}}
        chips={[
          { tag: '오늘', day: 7 },
          { tag: '방금', day: 5 },
        ]}
        onPick={onPick}
      />,
    )

    const chips = within(screen.getByRole('group', { name: '빠른 날짜' })).getAllByRole('button')
    expect(chips.map((chip) => chip.textContent)).toEqual(['오늘 7일', '방금 5일'])
    await userEvent.click(chips[1])

    expect(onPick).toHaveBeenCalledWith(5)
  })

  it('칩이 없으면 칩 줄을 숨긴다', () => {
    render(<DayInput label="며칠인가요?" value="" onChange={() => {}} chips={[]} />)

    expect(screen.queryByRole('group', { name: '빠른 날짜' })).not.toBeInTheDocument()
  })
})
