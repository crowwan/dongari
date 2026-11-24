import { describe, expect, it } from 'vitest'
import { keepIdOf as appKeepIdOf, sealKeep } from '../src/features/keep/keepCrypto'
import { createBackup, readBackup } from '../src/storage/backup'
import { book, ledger, storedWith } from '../src/test/ledgerFixtures'
import { planBackup } from '../ops/keep-backup/scripts/backupPlan.ts'
import { rescueFile } from './keepRescue.ts'

// 백업 레포(crowwan/dongari-keep-backup)의 주간 워크플로가 서버 내보내기(GET /v1/export) 답을 레포 파일로 바꾸는 규칙.
// 파일 원본은 이 레포 ops/keep-backup/ 에 있고, 리뷰·테스트는 여기서 한다

const ID_A = 'a'.repeat(64)
const ID_B = 'b'.repeat(64)
const ID_C = 'c'.repeat(64)
const EXPORTED_AT = '2026-11-22T23:00:00.000Z'

function envelope(data: string, savedAt = '2026-11-21T03:00:00.000Z') {
  return { v: 1, savedAt, iv: 'AAECAwQFBgcICQoL', data }
}

function exported(items: unknown[], exportedAt = EXPORTED_AT) {
  return { exportedAt, items }
}

const itemA = { id: ID_A, savedAt: '2026-11-21T03:00:00.000Z', envelope: envelope('YQ==') }
const itemB = { id: ID_B, savedAt: '2026-11-20T03:00:00.000Z', envelope: envelope('Yg==', '2026-11-20T02:59:00.000Z') }

describe('SPEC-011 서버 밖 주간 사본 (백업 레포 워크플로)', () => {
  describe('AC-8 레포 파일로 쓰기', () => {
    it('보관본마다 keep/<id>.json 에 겉봉투를 그대로 쓰고, index.json 에 id·보관 시각·크기(바이트)를 id 순으로 쓴다', () => {
      const plan = planBackup(exported([itemB, itemA]), [])

      if (!plan.ok) throw new Error(plan.message)
      expect(plan.files).toEqual([
        { path: `keep/${ID_A}.json`, text: `${JSON.stringify(itemA.envelope)}\n` },
        { path: `keep/${ID_B}.json`, text: `${JSON.stringify(itemB.envelope)}\n` },
      ])
      expect(JSON.parse(plan.indexText)).toEqual([
        { id: ID_A, savedAt: itemA.savedAt, bytes: new TextEncoder().encode(plan.files[0].text).byteLength },
        { id: ID_B, savedAt: itemB.savedAt, bytes: new TextEncoder().encode(plan.files[1].text).byteLength },
      ])
      expect(plan.removePaths).toEqual([])
    })

    it('이번 목록에 없는 id 파일은 지우고, id 모양이 아닌 파일은 건드리지 않는다', () => {
      const existing = [`${ID_A}.json`, `${ID_C}.json`, '.gitkeep', 'README.md']

      const plan = planBackup(exported([itemA]), existing)

      if (!plan.ok) throw new Error(plan.message)
      expect(plan.removePaths).toEqual([`keep/${ID_C}.json`])
    })

    it('index.json 에는 내보낸 때를 넣지 않아, 보관본이 그대로면 다음 주에도 레포 파일이 같다 (커밋 없음)', () => {
      const thisWeek = planBackup(exported([itemA, itemB]), [])
      const nextWeek = planBackup(exported([itemA, itemB], '2026-11-29T23:00:00.000Z'), [`${ID_A}.json`, `${ID_B}.json`])

      if (!thisWeek.ok || !nextWeek.ok) throw new Error('계획 실패')
      expect(nextWeek.files).toEqual(thisWeek.files)
      expect(nextWeek.indexText).toBe(thisWeek.indexText)
      expect(nextWeek.exportedAt).toBe('2026-11-29T23:00:00.000Z')
    })

    it('쓴 keep/<id>.json 을 꺼내기 --file 이 풀어 앱의 [기록 파일 불러오기]로 읽히는 기록 파일을 만든다', async () => {
      const code = 'HK7M-29QF-MX4P-8R2D'
      const data = { ...storedWith(), books: [book([ledger([[3, 'income', '회비', 10_000]], { year: 2026 })], { id: 'a', name: '꽃동아리' })], settings: { recoveryCode: code } }
      const plain = createBackup(data, new Date('2026-11-21T03:00:00.000Z')).text
      const id = await appKeepIdOf(code)
      const sealed = await sealKeep(code, plain, '2026-11-21T03:00:00.000Z')

      const plan = planBackup(exported([{ id, savedAt: '2026-11-21T03:00:01.000Z', envelope: sealed }]), [])

      if (!plan.ok) throw new Error(plan.message)
      const [file] = plan.files
      const rescued = await rescueFile(code, file.path.slice('keep/'.length), file.text)
      if (!rescued.ok) throw new Error(rescued.message)
      expect(rescued.plain).toBe(plain)
      expect(readBackup(rescued.plain)).toMatchObject({ ok: true, summary: { bookCount: 1, entryCount: 1 } })
    })
  })

  describe('안전장치', () => {
    it('id 가 64자 소문자 16진수가 아니면(경로 조작 등) 아무것도 쓰지 않고 실패한다', () => {
      for (const id of ['../../.github/workflows/backup', `${ID_A}/../x`, 'A'.repeat(64), 'a'.repeat(63), '', 42]) {
        const plan = planBackup(exported([itemA, { ...itemB, id }]), [])
        expect(plan).toEqual({ ok: false, message: expect.stringContaining('id') })
      }
    })

    it.each([
      ['객체가 아님', []],
      ['exportedAt 이 없음', { items: [itemA] }],
      ['exportedAt 이 시각이 아님', { exportedAt: '어제', items: [itemA] }],
      ['items 가 배열이 아님', { exportedAt: EXPORTED_AT, items: {} }],
      ['보관 시각이 없음', exported([{ id: ID_A, envelope: itemA.envelope }])],
      ['겉봉투가 없음', exported([{ id: ID_A, savedAt: itemA.savedAt }])],
      ['겉봉투 판 번호가 다름', exported([{ ...itemA, envelope: { ...itemA.envelope, v: 2 } }])],
      ['겉봉투 암호문이 비어 있음', exported([{ ...itemA, envelope: { ...itemA.envelope, data: '' } }])],
      ['같은 id 가 두 번', exported([itemA, { ...itemA }])],
    ])('응답 모양이 틀리면(%s) 실패한다', (_case, body) => {
      expect(planBackup(body, [`${ID_A}.json`])).toMatchObject({ ok: false })
    })

    it('보관본이 0개인데 레포에 파일이 있으면 한꺼번에 지우지 않고 실패한다', () => {
      const plan = planBackup(exported([]), [`${ID_A}.json`, `${ID_B}.json`])

      expect(plan).toEqual({ ok: false, message: expect.stringContaining('0개') })
    })

    it('레포에 파일이 없으면 0개라도 빈 목록을 쓴다 (처음 실행)', () => {
      const plan = planBackup(exported([]), ['.gitkeep'])

      if (!plan.ok) throw new Error(plan.message)
      expect(plan.files).toEqual([])
      expect(plan.removePaths).toEqual([])
      expect(JSON.parse(plan.indexText)).toEqual([])
    })
  })
})
