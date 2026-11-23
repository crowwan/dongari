// 엑셀 불러오기 입구 (SPEC-010 8절 "여는 곳", #166): 장부 고르기 창·설정·첫 실행이 같은 파일 고르기를 쓰도록 App 에 하나만 둔다.
// 파일을 고르면 읽은 내용 확인 화면을 연다. 읽기와 화면은 엑셀 조각(ExcelImportScreen)이 맡고, 여기는 첫 화면 쪽이라 가볍게 둔다
import { useState, type ChangeEvent } from 'react'
import type { ScreenHistory } from '../useScreenHistory'

// 고른 파일. 같은 파일을 다시 골라도 처음부터 다시 읽게 고를 때마다 번호가 바뀐다
export interface ExcelPick {
  id: number
  file: File
}

export interface ExcelImportFlow {
  start: () => void // 입구 버튼: 파일 고르기 창을 연다
  attachFileInput: (input: HTMLInputElement | null) => void // 숨은 파일 고르기 칸 (callback ref)
  onFileChosen: (event: ChangeEvent<HTMLInputElement>) => void
  pick: ExcelPick | undefined // 지금 읽는(읽은) 파일
}

export function useExcelImport(navigation: Pick<ScreenHistory, 'screen' | 'replace'>): ExcelImportFlow {
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null)
  const [pick, setPick] = useState<ExcelPick | undefined>()

  return {
    start: () => fileInput?.click(),
    attachFileInput: setFileInput,
    onFileChosen: (event) => {
      const file = event.target.files?.[0]
      // 같은 파일을 다시 골라도 change 가 오도록 비운다
      event.target.value = ''
      if (!file) return
      setPick({ id: (pick?.id ?? 0) + 1, file })
      // 확인 화면에서 [파일 다시 고르기] 로 골랐으면 화면은 그대로 두고 새 파일을 읽는다.
      // replace(#163): 장부(장부 고르기 창)에서는 창 칸을 화면 칸으로, 설정에서는 설정 칸을 바꿔 끼워 뒤로 버튼 한 번에 장부로
      if (navigation.screen.name !== 'excel-import') navigation.replace({ name: 'excel-import' })
    },
    pick,
  }
}
