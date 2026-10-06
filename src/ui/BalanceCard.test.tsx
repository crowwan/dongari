import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BalanceCard } from './BalanceCard'

describe('BalanceCard', () => {
  it('이름, 큰 잔액 숫자, 보조 줄을 차례로 보여준다', () => {
    render(<BalanceCard label="지금 잔액" amount={1166193} note="작년 이월금 370,482원 포함" />)

    const card = screen.getByTestId('balance-card')
    expect(card).toHaveTextContent('지금 잔액')
    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('1,166,193원')
    expect(card).toHaveTextContent('작년 이월금 370,482원 포함')
  })

  it('적자면 하이픈 대신 글자 빼기표(−)로 보여준다', () => {
    render(<BalanceCard label="지금 잔액" amount={-50000} />)

    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('−50,000원')
  })

  it('보조 줄이 없으면 그리지 않는다', () => {
    render(<BalanceCard label="지금 잔액" amount={0} />)

    expect(screen.queryByTestId('balance-card-note')).not.toBeInTheDocument()
    expect(screen.getByTestId('balance-card-amount')).toHaveTextContent('0원')
  })
})
