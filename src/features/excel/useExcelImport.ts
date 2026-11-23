// 엑셀 불러오기 입구 (SPEC-010 8절 "여는 곳", #166): 장부 고르기 창·설정·첫 실행이 같은 파일 고르기를 쓰도록 App 에 하나만 둔다.
// 파일을 고르면 읽은 내용 확인 화면을 연다. 읽기와 화면은 엑셀 조각(ExcelImportScreen)이 맡고, 여기는 첫 화면 쪽이라 가볍게 둔다.
// 연습 장부(SPEC-010 10절)에서는 파일 고르기 창을 열지 않고 연습용 엑셀을 읽는다
import { useState, type ChangeEvent } from 'react'
import type { BookKind } from '../../domain/types'
import { PRACTICE_EXCEL_NAMES } from '../practice/practiceScript'
import type { ScreenHistory } from '../useScreenHistory'
import type { PickedFile } from './excelFile'

// 읽을 것: 폰에서 고른 파일, 또는 연습 장부의 연습용 엑셀(그 장부 종류의 지어낸 표, 조각이 시트 배열로 만든다)
export type ExcelSource = { file: PickedFile } | { practice: BookKind }

// 읽은 내용 화면이 알리는 읽기 결과 (연습 말풍선이 본다): 읽는 중 / 읽음(확인 화면) / 못 읽음(안내 화면)
export type ExcelReadStatus = 'reading' | 'read' | 'failed'

// 고른 파일. 같은 파일을 다시 골라도 처음부터 다시 읽게 고를 때마다 번호가 바뀐다
export interface ExcelPick {
  id: number
  source: ExcelSource
  status: ExcelReadStatus
}

export interface ExcelImportFlow {
  start: () => void // 입구 버튼: 파일 고르기 창을 연다 (연습이면 바로 연습용 엑셀을 읽는다)
  attachFileInput: (input: HTMLInputElement | null) => void // 숨은 파일 고르기 칸 (callback ref)
  onFileChosen: (event: ChangeEvent<HTMLInputElement>) => void
  pick: ExcelPick | undefined // 지금 읽는(읽은) 파일
  settle: (id: number, status: Exclude<ExcelReadStatus, 'reading'>) => void // 그 파일을 다 읽었다(또는 못 읽었다)
}

// 확인 화면에 보일 파일 이름 ("파일이름.xlsx · 시트 …", 장부 이름 칸의 처음 값)
export function excelSourceName(source: ExcelSource): string {
  return 'file' in source ? source.file.name : PRACTICE_EXCEL_NAMES[source.practice]
}

// practice: 연습 장부의 종류 (있으면 파일 고르기 창 대신 연습용 엑셀)
export function useExcelImport(navigation: Pick<ScreenHistory, 'screen' | 'replace'>, practice?: BookKind): ExcelImportFlow {
  const [fileInput, setFileInput] = useState<HTMLInputElement | null>(null)
  const [pick, setPick] = useState<ExcelPick | undefined>()

  function read(source: ExcelSource) {
    setPick({ id: (pick?.id ?? 0) + 1, source, status: 'reading' })
    // 확인 화면에서 [파일 다시 고르기] 로 골랐으면 화면은 그대로 두고 새 파일을 읽는다.
    // replace(#163): 장부(장부 고르기 창)에서는 창 칸을 화면 칸으로, 설정에서는 설정 칸을 바꿔 끼워 뒤로 버튼 한 번에 장부로
    if (navigation.screen.name !== 'excel-import') navigation.replace({ name: 'excel-import' })
  }

  return {
    start: () => (practice ? read({ practice }) : fileInput?.click()),
    attachFileInput: setFileInput,
    onFileChosen: (event) => {
      const file = event.target.files?.[0]
      // 같은 파일을 다시 골라도 change 가 오도록 비운다
      event.target.value = ''
      if (file) read({ file })
    },
    pick,
    settle: (id, status) => setPick((current) => (current?.id === id ? { ...current, status } : current)),
  }
}
