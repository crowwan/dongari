import { useState } from 'react'
import { daysInMonth } from '../../domain/entryDate'
import { BottomSheet } from '../../ui/BottomSheet'
import { DayPicker } from '../../ui/DayPicker'
import { MonthStepper } from '../../ui/MonthStepper'
import type { SheetHistory } from '../useScreenHistory'

// 고치기의 날짜 선택 창 이름 (방문 기록 한 칸, useScreenHistory)
export const ENTRY_DATE_SHEET = 'entry-date'

type EntryDateSheetProps = {
  sheets: SheetHistory
  // 장부 연도 (그 달 마지막 날, 2월 윤년)
  year: number
  // 지금 날짜. 날짜 없는 예전 기록이면 day 가 undefined
  month: number
  day: number | undefined
  // 이번 달·오늘 (날 격자 테두리). 올해 장부가 아니면 주지 않는다
  currentMonth?: number
  currentDay?: number
  onChange: (date: { month: number; day: number }) => void
}

// 내역 고치기의 "며칠인가요?" 날짜 선택 창 (SPEC-001 고치기, AC-25): 위 [‹ 10월 ›] + 그 달 날 격자. 날을 누르면 바로 닫힌다.
// 달만 넘기고 닫으면 아무것도 바뀌지 않는다. 안드로이드 뒤로 버튼은 창만 닫는다. 여는 쪽은 sheets.openSheet(ENTRY_DATE_SHEET)
export function EntryDateSheet({ sheets, ...props }: EntryDateSheetProps) {
  return (
    <BottomSheet open={sheets.sheet === ENTRY_DATE_SHEET} title="며칠인가요?" onClose={sheets.closeSheet}>
      {/* 창이 열릴 때마다 새로 그려 넘겨 보던 달이 지금 날짜의 달부터 시작한다 */}
      <DateSheetBody
        {...props}
        onChange={(date) => {
          props.onChange(date)
          sheets.closeSheet()
        }}
      />
    </BottomSheet>
  )
}

function DateSheetBody({ year, month, day, currentMonth, currentDay, onChange }: Omit<EntryDateSheetProps, 'sheets'>) {
  const [viewedMonth, setViewedMonth] = useState(month)
  return (
    <div className="entry__date-sheet">
      <MonthStepper
        month={viewedMonth}
        onPrevious={() => setViewedMonth(viewedMonth - 1)}
        onNext={() => setViewedMonth(viewedMonth + 1)}
        previousDisabled={viewedMonth === 1}
        nextDisabled={viewedMonth === 12}
      />
      <DayPicker
        label={`${viewedMonth}월 날짜`}
        days={daysInMonth(year, viewedMonth)}
        value={viewedMonth === month ? (day ?? null) : null}
        today={viewedMonth === currentMonth ? currentDay : undefined}
        onChange={(picked) => onChange({ month: viewedMonth, day: picked })}
      />
    </div>
  )
}
