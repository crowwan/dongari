import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { unassignedDues } from '../../domain/duesTable'
import { duesBook } from '../../test/ledgerFixtures'
import { UnassignedDuesCard } from './UnassignedDuesCard'

const duesCss = readFileSync('src/features/dues/dues.css', 'utf8')

// 선택자 하나가 든 규칙 본문들 (쉼표로 묶인 규칙도)
function rulesWith(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(?:^|\\})[^{}]*${escaped}[^{}]*\\{([^}]*)\\}`, 'g')
  return [...duesCss.matchAll(pattern)].map((match) => match[1]).join('\n')
}

describe('SPEC-010 "낸 분을 안 적은 회비" 카드 (7절, #164)', () => {
  it('AC-22 카드 이름이 "낸 분을 안 적은 회비 N건 · M원" 이고 두 버튼이 각자 할 일을 부른다', async () => {
    const onAssign = vi.fn()
    const onHide = vi.fn()
    render(<UnassignedDuesCard unassigned={unassignedDues(duesBook())} onAssign={onAssign} onHide={onHide} />)

    const card = screen.getByRole('region', { name: '낸 분을 안 적은 회비 1건 · 30,000원' })
    await userEvent.click(within(card).getByRole('button', { name: '낸 분 붙이기' }))
    await userEvent.click(within(card).getByRole('button', { name: '이 카드 숨기기' }))

    expect(onAssign).toHaveBeenCalledTimes(1)
    expect(onHide).toHaveBeenCalledTimes(1)
  })

  it('[이 카드 숨기기] 는 누르는 동안(카탈로그 눌림 견본 포함) 알아 둘 것 면 위에서 보이는 눌림 색(토큰)이 된다 (#181 리뷰)', () => {
    expect(rulesWith('.dues-unassigned__hide:active')).toMatch(/background:\s*var\(--primary-soft-pressed\)/)
    expect(rulesWith('[data-preview-pressed] .dues-unassigned__hide')).toMatch(/background:\s*var\(--primary-soft-pressed\)/)
  })
})
