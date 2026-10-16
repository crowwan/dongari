import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { browserKind } from '../features/install/installRules'
import { Button } from '../ui/Button'
import {
  checkLine,
  chromeIntentUrl,
  clockText,
  errorName,
  hasKakaoTalk,
  openExternalUrl,
  platformOf,
  reportText,
  type CheckOutcome,
  type CheckResult,
  type Fact,
} from './envChecks'
import type { DevEnvironment } from './devEnvironment'
import './devEnv.css'

// 개발 확인 화면 /#/dev/env (SPEC-009 기술 확인 T-1~T-8). 갤럭시 크롬·삼성 인터넷·카톡 안에서 열어 값과 시험 결과를 복사해 간다.
// 개발 모드·미리보기 빌드에서만 열리고(main.tsx), 장부 저장소(localStorage)는 읽지도 쓰지도 않는다

const PLATFORM_WORDS = { android: '안드로이드', ios: '아이폰·아이패드', other: '기타' }

const yesNo = (value: boolean) => (value ? '예' : '아니오')

// 파일 공유가 되는지 (사진 보내기와 같은 확인, v2.6 #130)
function canShareFiles(canShare: DevEnvironment['canShare']): string {
  if (!canShare) return 'canShare 없음'
  try {
    return yesNo(canShare({ files: [new File(['시험'], 'dongari-test.txt', { type: 'text/plain' })] }))
  } catch (error) {
    return `오류 ${errorName(error)}`
  }
}

// 받은 시각: 이 화면에서 받았으면 시각, 열기 전에 받아 두었으면 그렇게, 아니면 안 받음
function receivedText(at: string | null, before: boolean): string {
  if (at) return `받음 ${at}`
  return before ? '받음 (화면 열기 전)' : '안 받음'
}

export function DevEnvScreen({ env }: { env: DevEnvironment }) {
  const prompt = useSyncExternalStore(env.installPrompt.subscribe, env.installPrompt.getSnapshot)
  const [promptAt, setPromptAt] = useState<string | null>(null)
  const [installedAt, setInstalledAt] = useState<string | null>(null)
  const [persisted, setPersisted] = useState(env.persisted ? '확인 중' : '지원 안 함')
  const [logs, setLogs] = useState<CheckResult[]>(() => env.log.load())
  // 화면을 그릴 때 이미 설치 제안이 와 있었는지 (처음 한 번만 본다)
  const [promptBeforeOpen] = useState(() => env.installPrompt.getSnapshot().canInstall)

  const record = (name: string, outcome: CheckOutcome, detail = '') => {
    setLogs(env.log.append({ name, outcome, detail, at: clockText(env.now()) }))
  }

  useEffect(() => {
    const onPrompt = () => {
      const at = clockText(env.now())
      setPromptAt(at)
      setLogs(env.log.append({ name: 'beforeinstallprompt', outcome: '받음', detail: '', at }))
    }
    const onInstalled = () => {
      const at = clockText(env.now())
      setInstalledAt(at)
      setLogs(env.log.append({ name: 'appinstalled', outcome: '받음', detail: '', at }))
    }
    env.events.addEventListener('beforeinstallprompt', onPrompt)
    env.events.addEventListener('appinstalled', onInstalled)
    return () => {
      env.events.removeEventListener('beforeinstallprompt', onPrompt)
      env.events.removeEventListener('appinstalled', onInstalled)
    }
  }, [env])

  useEffect(() => {
    env.persisted?.().then(
      (value) => setPersisted(yesNo(value)),
      (error: unknown) => setPersisted(`오류 ${errorName(error)}`),
    )
  }, [env])

  const shareFiles = useMemo(() => canShareFiles(env.canShare), [env])
  const from = new URL(env.href).searchParams.get('from')

  const facts: (Fact & { id: string })[] = [
    { id: 'ua', label: 'user agent', value: env.userAgent },
    { id: 'browser', label: '브라우저 (browserKind)', value: browserKind(env.userAgent) },
    { id: 'kakao', label: '카톡 안 (KAKAOTALK 포함)', value: yesNo(hasKakaoTalk(env.userAgent)) },
    { id: 'platform', label: '기기', value: PLATFORM_WORDS[platformOf(env.userAgent)] },
    { id: 'standalone', label: '홈 화면 앱 (display-mode: standalone)', value: yesNo(env.standalone) },
    { id: 'from', label: '들어온 길 (?from)', value: from ?? '없음' },
    { id: 'prompt', label: 'beforeinstallprompt', value: receivedText(promptAt, promptBeforeOpen) },
    { id: 'installed', label: 'appinstalled', value: receivedText(installedAt, false) },
    { id: 'share', label: 'navigator.share', value: env.share ? '있음' : '없음' },
    { id: 'can-share', label: 'canShare(파일)', value: shareFiles },
    { id: 'persisted', label: '오래 보관 (storage.persisted)', value: persisted },
    { id: 'origin', label: '출처 (origin)', value: env.origin },
    { id: 'version', label: '앱 버전', value: env.versionLabel },
    { id: 'href', label: '주소', value: env.href },
  ]
  const report = reportText(facts, logs)

  const install = async () => {
    try {
      const outcome = await env.installPrompt.install()
      record('설치 창 결과', '성공', outcome ?? '제안 없음')
    } catch (error) {
      record('설치 창 결과', '실패', errorName(error))
    }
  }

  // 클립보드 쓰기: 누름 처리 안에서 부른다 (T-7)
  const writeClipboard = async (name: string, text: string) => {
    if (!env.clipboard) return record(name, '실패', 'navigator.clipboard 없음')
    try {
      await env.clipboard.writeText(text)
      record(name, '성공')
    } catch (error) {
      record(name, '실패', errorName(error))
    }
  }

  // 클립보드 읽기 (T-8): 권한 창이 뜨는지는 화면에서 본다
  const readClipboard = async () => {
    if (!env.clipboard) return record('붙여넣기 시험', '실패', 'navigator.clipboard 없음')
    try {
      const text = await env.clipboard.readText()
      record('붙여넣기 시험', '성공', `읽음 "${text.slice(0, 40)}"`)
    } catch (error) {
      record('붙여넣기 시험', '실패', errorName(error))
    }
  }

  const shareReport = async () => {
    if (!env.share) return
    try {
      await env.share({ title: '개발 확인 결과', text: report })
      record('결과 보내기', '성공')
    } catch (error) {
      record('결과 보내기', '실패', errorName(error))
    }
  }

  return (
    <main className="dev-env" data-testid="dev-env">
      <h1 className="dev-env__title">개발 확인 화면</h1>
      <p className="dev-env__note">SPEC-009 기술 확인 T-1~T-8. 버튼을 눌러 본 뒤 맨 아래 [결과 복사] 로 가져가세요.</p>

      <section className="dev-env__section" aria-labelledby="dev-env-facts">
        <h2 id="dev-env-facts" className="dev-env__heading">
          지금 브라우저
        </h2>
        <dl className="dev-env__facts">
          {facts.map(({ id, label, value }) => (
            <div key={id} className="dev-env__fact">
              <dt>{label}</dt>
              <dd data-fact={id}>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="dev-env__section" aria-labelledby="dev-env-tests">
        <h2 id="dev-env-tests" className="dev-env__heading">
          시험
        </h2>
        <div className="dev-env__actions">
          {prompt.canInstall && (
            <Button variant="primary" onClick={() => void install()}>
              설치 창 띄우기
            </Button>
          )}
          <Button variant="secondary" onClick={() => void writeClipboard('복사 시험', `우리 장부 복사 시험 ${clockText(env.now())}`)}>
            복사 시험
          </Button>
          <Button variant="secondary" onClick={() => void readClipboard()}>
            붙여넣기 시험
          </Button>
          <a
            className="dev-env__link"
            href={openExternalUrl(env.href)}
            onClick={() => record('openExternal 링크', '누름')}
          >
            kakaotalk openExternal 로 열기
          </a>
          <a className="dev-env__link" href={chromeIntentUrl(env.href)} onClick={() => record('크롬 intent 링크', '누름')}>
            크롬 intent 로 열기
          </a>
        </div>
      </section>

      <section className="dev-env__section" aria-labelledby="dev-env-log">
        <h2 id="dev-env-log" className="dev-env__heading">
          결과 기록
        </h2>
        <ol className="dev-env__log" aria-label="결과 기록">
          {logs.map((result, index) => (
            <li key={index} data-outcome={result.outcome}>
              {checkLine(result)}
            </li>
          ))}
        </ol>
        {logs.length === 0 && <p className="dev-env__note">아직 없음</p>}
        <div className="dev-env__actions">
          <Button variant="primary" onClick={() => void writeClipboard('결과 복사', report)}>
            결과 복사
          </Button>
          {env.share && (
            <Button variant="secondary" onClick={() => void shareReport()}>
              결과 보내기
            </Button>
          )}
        </div>
        <label className="dev-env__report">
          <span>결과 글</span>
          <textarea readOnly value={report} rows={12} onFocus={(event) => event.currentTarget.select()} />
        </label>
      </section>
    </main>
  )
}
