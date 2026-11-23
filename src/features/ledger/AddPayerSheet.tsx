import { useState } from 'react'
import { hasNameSeparator, hasSameName, NAME_SEPARATOR_ERROR } from '../../domain/members'
import type { Member } from '../../domain/types'
import { BottomSheet } from '../../ui/BottomSheet'
import { Button } from '../../ui/Button'
import { TextField } from '../../ui/TextField'

type AddPayerSheetProps = {
  open: boolean
  // 같은 이름 안내용 명단 (그만둔 분 포함)
  members: readonly Member[]
  // 들어온 달 = 이 기록의 달 ("2026년 10월")
  joinedText: string
  onAdd: (name: string) => void
  onClose: () => void
}

// "누가 냈어요?" [+ 회원 넣기] → 이름 칸 하나짜리 창 (SPEC-010 3절). 넣으면 명단에 저장되고(들어온 달 = 이 기록의 달) 체크된 채 목록에 생긴다.
// 같은 이름은 막지 않고 안내만 (회원 명단 회원 넣기와 같음). 키패드 [완료](Enter) 로도 넣는다
export function AddPayerSheet({ open, members, joinedText, onAdd, onClose }: AddPayerSheetProps) {
  return (
    <BottomSheet open={open} title="회원 넣기" onClose={onClose}>
      {/* 창을 열 때마다 빈 이름 칸에서 시작한다 */}
      {open && <AddPayerForm members={members} joinedText={joinedText} onAdd={onAdd} />}
    </BottomSheet>
  )
}

function AddPayerForm({ members, joinedText, onAdd }: Pick<AddPayerSheetProps, 'members' | 'joinedText' | 'onAdd'>) {
  const [name, setName] = useState('')
  const empty = name.trim() === ''
  // 쉼표는 엑셀 낸 분을 가르는 글자라 이름에 못 쓴다 (#180 리뷰)
  const separated = hasNameSeparator(name)
  return (
    <form
      className="entry__add-payer"
      onSubmit={(event) => {
        event.preventDefault()
        if (!empty && !separated) onAdd(name.trim())
      }}
    >
      <TextField
        label="이름"
        labelRole="label"
        value={name}
        autoFocus
        onChange={setName}
        error={separated ? NAME_SEPARATOR_ERROR : undefined}
        note={hasSameName(members, name) ? '같은 이름이 있어요. 구분할 수 있게 적어 주세요' : undefined}
      />
      <p className="screen__note entry__note">{joinedText}에 들어온 분으로 넣고, 회원 명단에도 저장해요</p>
      <Button type="submit" icon="plus" disabled={empty || separated}>
        넣기
      </Button>
    </form>
  )
}
