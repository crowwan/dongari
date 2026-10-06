import '../screens.css'

// 보고서 탭 자리 (SPEC-003). 보고서 미리보기·보내기는 #16 에서 v1 보고서(src/components/report)를 옮겨 채운다
export function ReportScreen() {
  return (
    <div className="screen" data-testid="report-screen">
      <h1 className="screen__title">보고서</h1>
      <p className="screen__lead">적은 기록으로 연말 보고서를 만드는 곳이에요. 다음 업데이트에서 열려요.</p>
    </div>
  )
}
