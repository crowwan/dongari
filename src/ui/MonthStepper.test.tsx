import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MonthStepper } from './MonthStepper'

describe('MonthStepper', () => {
  it('보고 있는 달을 글자로 보여주고 양옆에 "이전 달"/"다음 달" 버튼을 둔다', () => {
    render(<MonthStepper month={9} onPrevious={() => {}} onNext={() => {}} />)

    expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('9월')
    expect(screen.getByRole('button', { name: '이전 달' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다음 달' })).toBeInTheDocument()
  })

  it('이전 달·다음 달을 누르면 각각 onPrevious·onNext 가 불린다', async () => {
    const user = userEvent.setup()
    const onPrevious = vi.fn()
    const onNext = vi.fn()
    render(<MonthStepper month={9} onPrevious={onPrevious} onNext={onNext} />)

    await user.click(screen.getByRole('button', { name: '이전 달' }))
    await user.click(screen.getByRole('button', { name: '다음 달' }))

    expect(onPrevious).toHaveBeenCalledTimes(1)
    expect(onNext).toHaveBeenCalledTimes(1)
  })

  it('1월처럼 더 갈 곳이 없는 쪽은 비활성으로 눌리지 않는다', async () => {
    const user = userEvent.setup()
    const onPrevious = vi.fn()
    render(<MonthStepper month={1} onPrevious={onPrevious} onNext={() => {}} previousDisabled />)

    await user.click(screen.getByRole('button', { name: '이전 달' }))

    expect(screen.getByRole('button', { name: '이전 달' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '다음 달' })).toBeEnabled()
    expect(onPrevious).not.toHaveBeenCalled()
  })

  it('12월에서는 다음 달을 비활성으로 둘 수 있다', () => {
    render(<MonthStepper month={12} onPrevious={() => {}} onNext={() => {}} nextDisabled />)

    expect(screen.getByRole('button', { name: '다음 달' })).toBeDisabled()
  })

  it('달이 바뀌면 화면 읽기 프로그램이 새 달을 읽도록 알림 영역에 둔다', () => {
    render(<MonthStepper month={3} onPrevious={() => {}} onNext={() => {}} />)

    expect(screen.getByTestId('month-stepper-label')).toHaveAttribute('aria-live', 'polite')
  })

  it('onPickMonth 가 없으면 가운데 달은 글자일 뿐 버튼이 아니다', () => {
    render(<MonthStepper month={9} onPrevious={() => {}} onNext={() => {}} />)

    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('onPickMonth 를 주면 가운데 달(▾)을 눌러 달 고르기 창을 연다', async () => {
    const user = userEvent.setup()
    const onPickMonth = vi.fn()
    render(<MonthStepper month={10} onPrevious={() => {}} onNext={() => {}} onPickMonth={onPickMonth} />)

    const middle = screen.getByRole('button', { name: '10월 달 고르기' })
    expect(middle).toHaveAttribute('aria-haspopup', 'dialog')
    expect(screen.getByTestId('month-stepper-label')).toHaveTextContent('10월')
    await user.click(middle)

    expect(onPickMonth).toHaveBeenCalledTimes(1)
  })
})
