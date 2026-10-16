import { useEffect, useEffectEvent, useId, useRef, useState, type ReactNode } from 'react'
import { APP_SHORT_NAME } from '../../pwa/appName'
import { Button } from '../../ui/Button'
import { Icon } from '../../ui/Icon'
import { BackButton } from '../BackToLedger'
import { useScreenHeading } from '../useScreenHeading'
import { BrowserBar, BrowserMenu, BrowserPage, BrowserPicture } from './BrowserPicture'
import { IN_APP_WORDS, copyRecoveryCode, openExternalUrl, readFromKakao, withFromKakao, type InAppKind } from './inAppBrowser'
import './inApp.css'

// ② 카톡 안에 장부가 있을 때 옮기는 길: 복구 코드(자동으로 지키기로 바로 올린 뒤 복사) 또는 기록 파일
export type LedgerMove =
  | { by: 'code'; code: string; keepNow: () => Promise<boolean> }
  | { by: 'file'; sendFile: () => Promise<boolean> }

type InAppBrowserScreenProps = {
  kind: InAppKind
  // 장부가 있으면 ②(옮기는 길), 없으면 ①
  move?: LedgerMove
  // [그냥 여기서 쓸게요]
  onStay: () => void
  // 설정 [인터넷 앱으로 열기] 줄에서 열었으면 맨 위 [‹ 설정]
  back?: { label: string; onBack: () => void }
}

const WORDS = IN_APP_WORDS

// 카톡 안에서 열렸을 때 (SPEC-009 C): 제목·글 → (안드로이드) 주 버튼 [인터넷 앱으로 열기] 또는 ② 장부 옮기기 →
// 안 열릴 때 카톡 메뉴 그림 → 맨 아래 작은 글자 버튼 [그냥 여기서 쓸게요].
// 아이폰 카톡은 대상 기기가 아니라 주 버튼 없이 메뉴 그림만 (② 는 [코드 복사하기]·[기록 파일 보내기] 를 보조 버튼으로)
export function InAppBrowserScreen({ kind, move, onStay, back }: InAppBrowserScreenProps) {
  const android = kind === 'kakao-android'
  return (
    <div className="screen in-app" data-testid="in-app-screen" data-kind={kind}>
      {back && <BackButton label={back.label} onBack={back.onBack} />}
      <div className="in-app__mark" aria-hidden="true">
        <Icon name="talk" />
      </div>
      <h1 className="screen__title in-app__title">{WORDS.title}</h1>
      <p className="in-app__lead">{move ? WORDS.leadBooks : WORDS.leadEmpty}</p>
      {move === undefined && android && <OpenLink fromKakao={false}>{WORDS.open}</OpenLink>}
      {move?.by === 'code' && <CodeMove code={move.code} keepNow={move.keepNow} android={android} />}
      {move?.by === 'file' && <FileMove sendFile={move.sendFile} android={android} />}
      <MenuHelp kind={kind} />
      <button type="button" className="in-app__stay" onClick={onStay}>
        {WORDS.stay}
      </button>
    </div>
  )
}

// 앱을 열 때 첫 화면 대신 그리는 틀 (App 밖, 장부 없는 ①): App 과 같은 바탕·내용 칸, 제목으로 브라우저 제목
export function InAppStartScreen(props: InAppBrowserScreenProps) {
  const mainRef = useRef<HTMLElement>(null)
  useScreenHeading(mainRef)
  return (
    <div className="app">
      <main ref={mainRef} className="app__main">
        <InAppBrowserScreen {...props} />
      </main>
    </div>
  )
}

// ③ 인터넷 앱에서 열린 첫 화면(?from=kakao, 장부 없음)의 첫 실행 물음 위 카드. 누르면 복구 코드로 불러오기
export function InAppImportCard({ onImport }: { onImport: () => void }) {
  const titleId = useId()
  return (
    <section className="in-app-import" aria-labelledby={titleId} data-testid="in-app-import">
      <h2 className="in-app-import__title" id={titleId}>
        {WORDS.importTitle}
      </h2>
      <p className="in-app-import__text">{WORDS.importText}</p>
      <button type="button" className="in-app-import__action" onClick={onImport}>
        <Icon name="key" />
        {WORDS.importButton}
      </button>
    </section>
  )
}

// [인터넷 앱으로 열기] 링크: 카톡이 폰의 기본 인터넷 앱으로 지금 주소를 연다 (T-3). 누름 처리 안 location 대입보다
// 링크가 카톡 안에서 막힐 일이 적다. 주 버튼 모양
function OpenLink({ fromKakao, onClick, children }: { fromKakao: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <a
      className="ui-button in-app__open"
      data-variant="primary"
      href={openExternalUrl(globalThis.location.href, { fromKakao })}
      onClick={onClick}
    >
      <Icon name="open" />
      {children}
    </a>
  )
}

type KeepStatus = 'keeping' | 'kept' | 'failed'

const KEEP_STATUS_TEXT: Record<KeepStatus, string> = {
  keeping: WORDS.keeping,
  kept: WORDS.kept,
  failed: WORDS.keepFailed,
}

// ② 복구 코드로 옮기기: 화면을 열면 자동으로 지키기로 지금 기록을 바로 올리고, 다 올라가야 주 버튼이 눌린다.
// 올리지 못하면 연결이 돌아올 때(online) 다시 올린다. 복구 코드는 주소에 넣지 않는다
function CodeMove({ code, keepNow, android }: { code: string; keepNow: () => Promise<boolean>; android: boolean }) {
  const [status, setStatus] = useState<KeepStatus>('keeping')
  const [copied, setCopied] = useState<boolean | undefined>()
  const mounted = useRef(false)
  const labelId = useId()

  const upload = useEffectEvent(async () => {
    const kept = await keepNow()
    if (mounted.current) setStatus(kept ? 'kept' : 'failed')
  })
  const onOnline = useEffectEvent(() => {
    if (status !== 'failed') return
    setStatus('keeping')
    void upload()
  })

  useEffect(() => {
    mounted.current = true
    void upload()
    const listener = () => onOnline()
    window.addEventListener('online', listener)
    return () => {
      mounted.current = false
      window.removeEventListener('online', listener)
    }
  }, [])

  // 이 화면이 떠 있는 동안 주소에 ?from=kakao 를 붙여 둔다: 열기가 안 돼 메뉴 '다른 브라우저로 열기' 로 열어도
  // 열린 곳에 가져오기 카드가 뜬다. 화면을 떠나면 지운다
  useEffect(() => {
    window.history.replaceState(window.history.state, '', withFromKakao(window.location.href))
    return () => {
      const { cleanHref } = readFromKakao(window.location.href)
      if (cleanHref) window.history.replaceState(window.history.state, '', cleanHref)
    }
  }, [])

  // 누름 처리 안에서 바로 쓴다 (T-7). 링크는 그대로 열린다 — 못 썼으면 코드를 크게 보여 준 채 "적어 두세요"
  function copy() {
    void copyRecoveryCode(code).then(setCopied)
  }

  const ready = status === 'kept'
  return (
    <>
      <section className="in-app__card" aria-labelledby={labelId}>
        <h2 className="in-app__card-label" id={labelId}>
          {WORDS.codeLabel}
        </h2>
        <p className="in-app__code" data-testid="in-app-code">
          {code}
        </p>
        <p className="in-app__status" role="status" data-status={status}>
          <Icon name="cloud" />
          {KEEP_STATUS_TEXT[status]}
        </p>
      </section>
      {copied === false && (
        <p className="in-app__error" role="alert">
          {WORDS.copyFailed}
        </p>
      )}
      {copied === true && !android && (
        <p className="in-app__note" role="status">
          {WORDS.copied}
        </p>
      )}
      {android && ready && (
        <OpenLink fromKakao onClick={copy}>
          {WORDS.copyAndOpen}
        </OpenLink>
      )}
      {android && !ready && (
        <Button icon="open" disabled>
          {WORDS.copyAndOpen}
        </Button>
      )}
      {!android && (
        <Button variant="secondary" icon="key" disabled={!ready} onClick={copy}>
          {WORDS.copyOnly}
        </Button>
      )}
      <p className="in-app__note">{WORDS.codeNote}</p>
    </>
  )
}

// ② 기록 파일로 옮기기 (자동으로 지키기를 쓸 수 없을 때): [기록 파일 보내기] 를 마치면 주 버튼이 [인터넷 앱으로 열기] 로 바뀐다
function FileMove({ sendFile, android }: { sendFile: () => Promise<boolean>; android: boolean }) {
  const [sent, setSent] = useState(false)
  return (
    <>
      <p className="in-app__card in-app__card-text">{WORDS.fileLead}</p>
      {android && sent ? (
        <OpenLink fromKakao={false}>{WORDS.open}</OpenLink>
      ) : (
        <Button
          variant={android ? 'primary' : 'secondary'}
          icon="share"
          onClick={() => void sendFile().then((done) => done && setSent(true))}
        >
          {WORDS.sendFile}
        </Button>
      )}
      <p className="in-app__note">{WORDS.fileNote}</p>
    </>
  )
}

// 안 열릴 때: 카톡 안 브라우저 메뉴 그림 한 장 (T-5). 오른쪽 아래 ⋮(아이폰 ⋯) → 진한 줄 하나. 넘기지 않는다
function MenuHelp({ kind }: { kind: InAppKind }) {
  const menu = WORDS.menu[kind]
  return (
    <div className="in-app__help">
      <p className="in-app__help-text">{menu.hint}</p>
      <BrowserPicture name={`${kind}-menu`}>
        <BrowserPage title={APP_SHORT_NAME} />
        <BrowserMenu place="bottom" items={[...menu.before.map((label) => ({ label })), { label: menu.item, hot: true }]} />
        <BrowserBar
          place="bottom"
          items={[{ icon: 'left' }, { icon: 'right' }, { icon: 'refresh' }, { icon: kind === 'kakao-ios' ? 'more' : 'kebab', hot: true }]}
        />
      </BrowserPicture>
    </div>
  )
}
