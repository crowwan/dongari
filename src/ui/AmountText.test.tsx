import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AmountText } from './AmountText'

describe('AmountText', () => {
  it('수입 금액은 + 부호와 콤마, "원"을 붙인다', () => {
    render(<AmountText type="income" amount={140000} />)

    expect(screen.getByTestId('amount-text')).toHaveTextContent('+140,000원')
    expect(screen.getByTestId('amount-text')).toHaveAttribute('data-kind', 'income')
  })

  it('지출 금액은 하이픈이 아닌 글자 빼기표(−)를 붙인다', () => {
    render(<AmountText type="expense" amount={58280} />)

    expect(screen.getByTestId('amount-text')).toHaveTextContent('−58,280원')
    expect(screen.getByTestId('amount-text')).toHaveAttribute('data-kind', 'expense')
  })
})
