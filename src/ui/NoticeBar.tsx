import './ui.css'

type NoticeBarProps = {
  message: string
  // 안내와 함께 바로 할 일 (예: [백업 파일 보내기]). 문장 아래 버튼 하나
  action?: { label: string; onClick: () => void }
}

// 화면 위에 붙는 안내 띠 (저장 상태, 백업 안내 등). 노란 면으로 구분하되 글자는 본문 색 그대로
// 앱을 열자마자 알아야 하는 내용이라 화면 읽기 프로그램이 바로 읽도록 문장에 alert 역할을 쓴다 (버튼 글자는 빼고)
export function NoticeBar({ message, action }: NoticeBarProps) {
  return (
    <div className="ui-notice" data-testid="notice-bar">
      <p className="ui-notice__message" role="alert">
        {message}
      </p>
      {action && (
        <button type="button" className="ui-notice__action" data-testid="notice-bar-action" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  )
}
