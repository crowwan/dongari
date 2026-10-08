import { describe, expect, it } from 'vitest'
import { book } from '../test/ledgerFixtures'
import { currentBook } from './book'
import { CURRENT_SCHEMA_VERSION, type StoredData } from './types'

const CLUB = book([], { id: 'club', name: '한랑드림' })
const HOUSEHOLD = book([], { id: 'home', name: '우리집 가계부', kind: 'household' })

function dataWith(lastBookId: string | undefined): StoredData {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, books: [CLUB, HOUSEHOLD], settings: { lastBookId } }
}

describe('SPEC-005 지금 장부', () => {
  it('AC-2 마지막에 본 장부가 지금 장부다', () => {
    expect(currentBook(dataWith('home'))).toBe(HOUSEHOLD)
  })

  it('마지막에 본 장부가 없거나 지워졌으면 첫 장부(만든 순)를 연다', () => {
    expect(currentBook(dataWith(undefined))).toBe(CLUB)
    expect(currentBook(dataWith('gone'))).toBe(CLUB)
  })

  it('장부가 하나도 없으면 지금 장부도 없다 (첫 실행)', () => {
    expect(currentBook({ schemaVersion: CURRENT_SCHEMA_VERSION, books: [], settings: {} })).toBeUndefined()
  })
})
