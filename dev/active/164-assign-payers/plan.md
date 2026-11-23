# #164 낸 분을 안 적은 회비에 낸 분 붙이기

스펙: SPEC-010 7절 (AC-22). 대상은 `domain/duesTable.unassignedDues(book)` 그대로(시작 달 이후·낸 분 없음, 오래된 것부터).
이름 목록·한 분씩 금액은 #162 부품(`PayerPicker`·`PayerSharesPage`·`AddPayerSheet`)을 그대로 쓴다.

## 할 일

- [x] 도메인: `ledger.assignPayers(장부, id, 낸 분, 명단)` = 그 기록 내용 그대로 `updateEntry` + `{ kind: 'set' }`, `members.hideUnassignedDues(book)` + 테스트(v4 가드 통과)
- [x] useLedger: `assignPayers(해, id, 낸 분)`(보고 있는 장부 연도와 다른 해도), `hideUnassignedDues()`
- [x] 부품: `EntryCard` `title`("이 기록"), `PayerSharesPage` `total`(금액을 바꿀 수 없는 기록: 합계 = 그 금액일 때만 [이대로 할게요])
- [x] 화면: 회비 표 요약 아래 `--info-bg` 카드(`UnassignedDuesCard`), 붙이기 화면(`AssignPayersPage`), 회원 명단 맨 아래 [낸 분 붙이기]
- [x] App 은 `duesSettings` 한 줄(`assign`), `useScreenHistory` 는 안 바꿈(선택 창·확인 창 칸으로)
- [x] 테스트 AC-22 (SPEC-010 describe), 카탈로그 상태, 큰 글씨·다크 확인
- [x] 문서: 스펙 7절 "구현에서 정한 것 (#164)"·변경 이력, design.md, qa-checklist, CLAUDE.md 폴더 구조
- [x] PR: 확인 기록 스크린샷(assets 브랜치 pr/<번호>/)

## 정한 것 (스펙에 옮김)

- 붙이기 화면은 회비 표 위 선택 창 칸(`'dues-assign'`), 회원 명단에서는 회원 명단 칸을 바꿔 끼우는 칸(`'settings-roster-assign'`, [‹ 회원 명단]).
  "한 분씩 금액"·[+ 회원 넣기] 창은 그 위 확인 창 칸(뒤로 버튼은 그것만 닫음).
- 순서는 화면을 연 때의 대상 목록(오래된 것부터)으로 고정하고 [다음]·[건너뛰기] 로 한 칸씩. 마지막은 [끝], 마지막에서 [건너뛰기]도 끝.
- 저장에 실패하면 화면을 닫아 위쪽 실패 안내를 보인다(내역 적기와 같음).

## 진행

- [✅ 2026-11-24] 구현·테스트(AC-22 App 테스트 15개 + 도메인·훅, 구현 11곳을 되돌려 실패 확인)·카탈로그·문서. #167 머지 뒤 main 으로 다시 올림
- 확인 못 한 것: 갤럭시 실기기(큰 글씨·TalkBack·뒤로 버튼) → qa-checklist
- [✅ 2026-11-24] #181 리뷰 반영: 넘긴 뒤 포커스를 "이 기록" 카드 머리로(🔴 [다음]이 비활성이 되며 포커스가 body 로), [이 카드 숨기기] 뒤 포커스를 요약 카드로, 숨기기 눌림 면, `assignPayers` 는 기록 칸을 다듬지 않음. 고치기 전 코드에서 새 테스트 6개 실패 확인
