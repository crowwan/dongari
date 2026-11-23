import { describe, expect, it } from 'vitest'
import { excelProblemMessage } from './excelMessages'

describe('SPEC-010 엑셀 파일 안내 문구 (8절 예외, #178 리뷰)', () => {
  it('AC-29 기록 파일을 골랐으면 지금 앱에서 [기록 파일 불러오기]가 있는 자리로 안내한다', () => {
    expect(excelProblemMessage('backup-file', 'first-run')).toEqual({
      title: '이 파일은 기록 파일이에요',
      description: '위쪽 [기록 파일 불러오기]에서 열어 주세요',
    })
    expect(excelProblemMessage('backup-file', 'settings').description).toBe('설정 › 기록 파일 불러오기에서 열어 주세요')
    expect(excelProblemMessage('backup-file', 'settings-more').description).toBe(
      '설정 › 다른 방법으로 옮기기 › 기록 파일 불러오기에서 열어 주세요',
    )
  })

  it('엑셀 기능을 받지 못했으면 [앱 다시 열기]로 안내하고, 다른 안내는 자리와 상관없다', () => {
    expect(excelProblemMessage('load-failed', 'first-run')).toEqual({
      title: '엑셀 기능을 받지 못했어요',
      description: '인터넷에 연결된 뒤 [앱 다시 열기]를 눌러 주세요',
    })
    expect(excelProblemMessage('not-excel', 'first-run')).toEqual(excelProblemMessage('not-excel', 'settings-more'))
  })
})
