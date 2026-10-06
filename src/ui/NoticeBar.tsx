import './ui.css'

type NoticeBarProps = {
  message: string
}

// 화면 위에 붙는 안내 띠 (저장 상태, 백업 안내 등). 노란 면으로 구분하되 글자는 본문 색 그대로
// 앱을 열자마자 알아야 하는 내용이라 화면 읽기 프로그램이 바로 읽도록 alert 역할을 쓴다
export function NoticeBar({ message }: NoticeBarProps) {
  return (
    <p className="ui-notice" role="alert" data-testid="notice-bar">
      {message}
    </p>
  )
}
