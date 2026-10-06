import { describe, expect, it } from 'vitest'
import type { BackupReadFailure } from '../../storage/backup'
import { importConfirmTitle, importFailureMessage, restoreFailureMessage } from './backupMessages'

describe('SPEC-002 백업 불러오기 문구', () => {
  it('장부 하나면 "YYYY년 장부(기록 N건)를 불러올까요?" 로 묻는다', () => {
    expect(importConfirmTitle({ years: [2026], entryCount: 12 })).toBe('2026년 장부(기록 12건)를 불러올까요?')
  })

  it('장부가 여러 개면 연도를 오래된 순으로 잇고 기록 수는 합쳐서 묻는다', () => {
    expect(importConfirmTitle({ years: [2025, 2026], entryCount: 30 })).toBe(
      '2025년·2026년 장부(기록 30건)를 불러올까요?',
    )
  })

  it('장부가 없는 백업 파일이면 그렇다고 알리고 묻는다', () => {
    expect(importConfirmTitle({ years: [], entryCount: 0 })).toBe('장부가 없는 백업 파일이에요. 불러올까요?')
  })

  it.each<[BackupReadFailure, string]>([
    ['broken', '동아리 회계에서 보낸 백업 파일인지 확인해 주세요'],
    ['not-backup', '동아리 회계에서 보낸 백업 파일인지 확인해 주세요'],
    ['newer-version', '앱을 닫았다가 다시 연 뒤 불러와 주세요'],
  ])('AC-4 %s 파일은 "이 파일은 열 수 없어요" 와 할 일을 알린다', (reason, description) => {
    expect(importFailureMessage(reason)).toEqual({ title: '이 파일은 열 수 없어요', description })
  })

  it('새 버전 기록이 있어 저장을 막았으면 앱을 닫았다가 다시 열라고 알린다', () => {
    expect(restoreFailureMessage('newer-version')).toEqual({
      title: '불러오지 못했어요',
      description: '새 버전 앱에서 쓴 기록이 있어요. 앱을 닫았다가 다시 열어 주세요',
    })
  })

  it('그 밖의 저장 실패는 지금 기록이 그대로라고 알린다', () => {
    expect(restoreFailureMessage('quota-exceeded')).toEqual({
      title: '불러오지 못했어요',
      description: '기기에 저장하지 못했어요. 지금 기록은 그대로예요',
    })
  })
})
