import { useState } from 'react'
import { SegmentedControl } from '../../ui/SegmentedControl'
import { SlideGuide } from '../../ui/SlideGuide'
import { InstallGuidePicture } from './InstallGuidePicture'
import {
  GUIDE_BROWSER_CHOICES,
  GUIDE_BROWSER_QUESTION,
  INSTALL_GUIDE_STEPS,
  type GuideBrowser,
} from './installGuideSteps'
import type { BrowserKind } from './installRules'
import './install.css'

type InstallGuideProps = {
  browser: BrowserKind
  // 마지막 장 [다 했어요]
  onFinish: () => void
}

// 그림으로 따라 하는 설치 안내 (SPEC-009 A): 지금 브라우저의 네 장을 손으로 넘긴다.
// 크롬·삼성 인터넷이 아니면 먼저 앱을 고르게 하고, 고른 칩은 남아 있어 바꾸면 그 브라우저 1장부터 본다
export function InstallGuide({ browser, onFinish }: InstallGuideProps) {
  const [picked, setPicked] = useState<GuideBrowser | null>(browser === 'other' ? null : browser)
  return (
    <div className="install-guide" data-testid="install-guide" data-browser={browser}>
      {browser === 'other' && (
        <div className="install-guide__choose">
          <p className="install-guide__question">{GUIDE_BROWSER_QUESTION}</p>
          <SegmentedControl label={GUIDE_BROWSER_QUESTION} options={GUIDE_BROWSER_CHOICES} value={picked} onChange={setPicked} />
        </div>
      )}
      {picked && (
        <SlideGuide
          key={picked}
          slides={INSTALL_GUIDE_STEPS[picked].map((step) => ({
            picture: <InstallGuidePicture picture={step.picture} />,
            text: step.text,
          }))}
          finishLabel="다 했어요"
          onFinish={onFinish}
        />
      )}
    </div>
  )
}
