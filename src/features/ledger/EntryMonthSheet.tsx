import { BottomSheet } from '../../ui/BottomSheet'
import { MonthPicker } from '../../ui/MonthPicker'
import type { SheetHistory } from '../useScreenHistory'
import { ENTRY_MONTH_SHEET } from './entryOptions'

type EntryMonthSheetProps = {
  sheets: SheetHistory
  month: number
  // 이번 달 (테두리). 올해 장부가 아니면 주지 않는다
  currentMonth?: number
  onChange: (month: number) => void
}

// 내역 적기·고치기의 "몇 월인가요?" 열두 달 선택 창: 고르면 바로 닫힌다. 안드로이드 뒤로 버튼은 창만 닫는다.
// 여는 쪽은 sheets.openSheet(ENTRY_MONTH_SHEET) (두 화면 모두 "며칠인가요?" 제목 옆 [10월 ▾])
export function EntryMonthSheet({ sheets, month, currentMonth, onChange }: EntryMonthSheetProps) {
  return (
    <BottomSheet open={sheets.sheet === ENTRY_MONTH_SHEET} title="몇 월인가요?" onClose={sheets.closeSheet}>
      <MonthPicker
        value={month}
        currentMonth={currentMonth}
        onChange={(picked) => {
          onChange(picked)
          sheets.closeSheet()
        }}
      />
    </BottomSheet>
  )
}
