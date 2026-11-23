# #163 회비 표·한 분 보기·장부 [회비 표] 버튼·쉬는 기간

스펙: SPEC-010 4절·5절 (AC-16~19). 계산은 `domain/duesTable.ts`(#160) 그대로 쓴다.

## 할 일

- [ ] 도메인: `members.ts` 쉬는 기간 넣기·빼기(`restMember`·`resumeMember`), [아직 몰라요] 끝 달(`openEndedRestUntil`) + 테스트(v4 가드 통과)
- [ ] useLedger: `restMember`·`resumeMember`, `changeMonthlyFee(fee, year?)`(회비 표에서 보는 해)
- [ ] useScreenHistory: 화면 `dues`(보는 해), `replace`(결산 → 회비 표), `closeSheet` 가 위 확인 창 칸까지 한 번에
- [ ] 화면 문구 순수 함수 `features/dues/duesWords.ts` + 테스트
- [ ] 카탈로그 먼저: 12칸 띠 `DuesStrip`, 달력 칸 `DuesCalendar`, `IconButton note`, `YearStepper`, `YearMonthPicker min`
- [ ] 회비 표 화면 `DuesScreen`: 해 넘기기·요약 카드(월 회비 [바꾸기]/[정하기], 알약)·사람별 줄·명단 없음 안내
- [ ] 한 분 보기 `MemberDuesPage`: 이름 [›] 회원 정보, 요약, 달력, 낸 기록, 달 칸 선택 창 → 쉬는 기간
- [ ] 장부 [👥 회비 표] 버튼(동아리만, 덜 낸 분 수), 결산 회비 줄 → 회비 표
- [ ] 테스트 AC-16~19 (SPEC-010 describe), 큰 글씨·다크 확인
- [ ] 문서: 스펙 4·5절 "구현에서 정한 것", design.md(컴포넌트·장부 화면·새 화면 행·토큰), qa-checklist, CLAUDE.md 폴더 구조
- [ ] PR: 확인 기록 스크린샷(assets 브랜치 pr/<번호>/)

## 정한 것 (스펙에 옮긴다)

- [아직 몰라요]: 그 달부터 "그 달의 해와 올해 중 늦은 해의 다음 해 12월"까지 쉬는 달로 저장(달마다 저장이라 끝이 있어야 한다). 다시 내면 [N월부터 다시 내요].
- "언제까지 쉬나요?"는 `YearMonthPicker`(그 달 전은 고를 수 없음, 그 달 = 한 달만).
- 결산에서 오면 그 결산의 해를 연다(회비 표 범위 밖이면 올해). 장부 버튼은 올해.
- 월 회비 [바꾸기]는 보고 있는 해, [정하기]는 월 회비가 없는 첫 해. 그 해 장부가 없으면 버튼 없이 안내만.
