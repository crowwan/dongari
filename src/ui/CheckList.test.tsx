import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { CheckList, type CheckOption } from './CheckList'

const names = (...labels: string[]): CheckOption[] => labels.map((label) => ({ value: label, label }))
const NINE = names('강민지', '김도윤', '박서연', '이준호', '정하늘', '최유나', '한지우', '홍서진', '황보람')

function Harness({ options, initial = [], tail }: { options: CheckOption[]; initial?: string[]; tail?: CheckOption[] }) {
  const [checked, setChecked] = useState(initial)
  return (
    <CheckList
      label="누가 냈어요?"
      options={options}
      tail={tail && { title: '쉬는 분', options: tail }}
      checked={checked}
      onToggle={(value) => setChecked((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]))}
      collapse={{ visible: 7, label: (hidden) => `회원 ${hidden}명 더 보기` }}
    />
  )
}

const boxes = () => screen.getAllByRole('checkbox').map((box) => box.textContent)
const COLLAPSE = { visible: 7, label: (hidden: number) => `회원 ${hidden}명 더 보기` }

describe('CheckList 세로 체크 목록 (SPEC-010 3절, PATTERNS N12)', () => {
  it('줄을 누를 때마다 체크하고 풀며, 체크 상태가 화면 읽기에도 들린다', async () => {
    render(<Harness options={names('김도윤', '강민지')} />)
    const kim = screen.getByRole('checkbox', { name: '김도윤' })

    await userEvent.click(kim)
    expect(kim).toBeChecked()
    expect(screen.getByRole('checkbox', { name: '강민지' })).not.toBeChecked()

    await userEvent.click(kim)
    expect(kim).not.toBeChecked()
  })

  it('8명 넘으면 7명만 보이고 [회원 N명 더 보기] 를 누르면 나머지가 펼쳐지고 처음 펼친 줄로 포커스가 간다', async () => {
    render(<Harness options={NINE} />)

    expect(boxes()).toHaveLength(7)
    const more = screen.getByRole('button', { name: '회원 2명 더 보기' })
    expect(more).toHaveAttribute('aria-expanded', 'false')

    await userEvent.click(more)
    expect(boxes()).toHaveLength(9)
    expect(screen.queryByRole('button', { name: /더 보기/ })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: '홍서진' })).toHaveFocus()
  })

  it('접힌 자리의 줄이 나중에 체크되면(회원 넣기로 넣은 분) 펼친다', () => {
    const { rerender } = render(<CheckList label="회원" options={NINE} checked={[]} onToggle={vi.fn()} collapse={COLLAPSE} />)
    expect(boxes()).toHaveLength(7)

    rerender(<CheckList label="회원" options={NINE} checked={['황보람']} onToggle={vi.fn()} collapse={COLLAPSE} />)

    expect(boxes()).toHaveLength(9)
    expect(screen.getByRole('checkbox', { name: '황보람' })).toBeChecked()
  })

  it('8명에서 9명이 되어 처음 접힐 때 새로 체크된 분이 뒤에 있으면 펼친 채다', () => {
    const { rerender } = render(<CheckList label="회원" options={NINE.slice(0, 8)} checked={[]} onToggle={vi.fn()} collapse={COLLAPSE} />)

    rerender(<CheckList label="회원" options={NINE} checked={['황보람']} onToggle={vi.fn()} collapse={COLLAPSE} />)

    expect(boxes()).toHaveLength(9)
  })

  it('펼친 뒤 접힌 자리였던 줄의 체크를 풀어도 다시 접지 않는다 (누른 줄이 사라지지 않게)', async () => {
    render(<Harness options={NINE} initial={['황보람']} />)

    await userEvent.click(screen.getByRole('checkbox', { name: '황보람' }))

    expect(boxes()).toHaveLength(9)
  })

  it('8명이면 접지 않는다', () => {
    render(<Harness options={NINE.slice(0, 8)} />)

    expect(boxes()).toHaveLength(8)
    expect(screen.queryByRole('button', { name: /더 보기/ })).not.toBeInTheDocument()
  })

  it('고른 줄이 접힌 자리에 있으면 펼친 채 시작한다', () => {
    render(<Harness options={NINE} initial={['황보람']} />)

    expect(boxes()).toHaveLength(9)
  })

  it('맨 아래 묶음("쉬는 분")은 묶음 이름이 붙은 따로 된 묶음이고, 접는 수에 함께 센다', async () => {
    render(<Harness options={NINE.slice(0, 6)} tail={names('나쉼', '다쉼', '라쉼')} />)

    // 6명 + 쉬는 분 1명 = 7명
    expect(within(screen.getByRole('group', { name: '쉬는 분' })).getAllByRole('checkbox')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: '회원 2명 더 보기' }))
    expect(within(screen.getByRole('group', { name: '쉬는 분' })).getAllByRole('checkbox').map((box) => box.textContent)).toEqual([
      '나쉼',
      '다쉼',
      '라쉼',
    ])
  })

  it('맨 아래 하는 일 줄은 고르는 줄이 아니라 버튼이다', async () => {
    const onAdd = vi.fn()
    render(
      <CheckList label="누가 냈어요?" options={names('김도윤')} checked={[]} onToggle={vi.fn()} action={{ label: '회원 넣기', icon: 'plus', onClick: onAdd }} />,
    )

    await userEvent.click(screen.getByRole('button', { name: '회원 넣기' }))
    expect(onAdd).toHaveBeenCalledOnce()
    expect(boxes()).toEqual(['김도윤'])
  })
})
