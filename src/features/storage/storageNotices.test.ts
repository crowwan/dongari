import { describe, expect, it } from 'vitest'
import { STORAGE_NOTICE, storageNotices } from './storageNotices'

describe('SPEC-002 시작 안내·저장 실패 안내', () => {
  it('정상으로 시작하고 저장도 잘 되면 안내가 없다', () => {
    expect(storageNotices({ status: 'ok' }, undefined)).toEqual([])
  })

  it('깨진 데이터를 옮기고 새 장부로 시작했으면 예전 기록을 보관했다고 알린다', () => {
    expect(storageNotices({ status: 'recovered' }, undefined)).toEqual([
      { message: '저장된 기록을 읽지 못해 새 장부로 시작해요. 예전 기록은 따로 보관해 두었어요' },
    ])
  })

  it('새 버전 앱에서 쓴 기록이 있으면 앱을 닫았다가 다시 열라고 알린다 (원본 보호를 위해 불러오기 버튼은 없다)', () => {
    expect(storageNotices({ status: 'read-only', reason: 'newer-version' }, undefined)).toEqual([
      { message: '새 버전 앱에서 쓴 기록이 있어요. 앱을 닫았다가 다시 열어 주세요' },
    ])
  })

  it('원본을 옮기지 못해 저장을 막았으면 지금 적는 내용이 저장되지 않는다고 알리고 [백업 파일 불러오기] 를 붙인다', () => {
    expect(storageNotices({ status: 'read-only', reason: 'unreadable-original' }, undefined)).toEqual([
      { message: '저장된 기록을 읽지 못했어요. 지금 적는 내용은 저장되지 않아요', action: 'import-backup' },
    ])
  })

  it('SPEC-005 이전 버전 기록을 따로 보관하지 못해 저장을 막았으면 그렇게 알리고 [백업 파일 보내기] 를 붙인다 (옮긴 기록은 보인다)', () => {
    expect(storageNotices({ status: 'read-only', reason: 'old-version-unpreserved' }, 'old-version-unpreserved')).toEqual([
      { message: '기록을 새 버전으로 옮기지 못했어요. 지금 적는 내용은 저장되지 않아요', action: 'send-backup' },
    ])
  })

  it('저장에 실패하면 백업 파일을 보내 두라고 알리고 [백업 파일 보내기] 를 붙인다', () => {
    expect(storageNotices({ status: 'ok' }, 'quota-exceeded')).toEqual([
      { message: STORAGE_NOTICE.saveFailed, action: 'send-backup' },
    ])
    expect(storageNotices({ status: 'ok' }, 'unknown')).toEqual([
      { message: '저장하지 못했어요. 백업 파일을 보내 두세요', action: 'send-backup' },
    ])
  })

  it('저장을 막아 둔 상태의 저장 실패는 시작 안내 하나로만 알린다 (같은 이유를 두 번 말하지 않음)', () => {
    expect(storageNotices({ status: 'read-only', reason: 'newer-version' }, 'newer-version')).toEqual([
      { message: STORAGE_NOTICE.newerVersion },
    ])
  })

  it('새 장부로 시작한 뒤 저장까지 실패하면 두 안내를 모두 보여준다', () => {
    expect(storageNotices({ status: 'recovered' }, 'quota-exceeded')).toEqual([
      { message: STORAGE_NOTICE.recovered },
      { message: STORAGE_NOTICE.saveFailed, action: 'send-backup' },
    ])
  })
})
