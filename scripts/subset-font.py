"""Pretendard 가변 글꼴을 앱에 넣을 크기로 줄인다 (#45).

npm 패키지 `pretendard`(devDependency)의 PretendardVariable.woff2(약 2.0MB, 한글 11,172자)에서
글꼴 작가가 공식 서브셋(dist/web/static/woff2-subset)을 만들 때 쓰는 글자 목록(subset_glyphs.txt:
자주 쓰는 한글 2,780자 + 영문·숫자·문장부호·기호, 3,729자)만 남긴다. 가변 굵기(45~920)와 라이선스 정보는 그대로다.
결과(src/styles/fonts/PretendardVariable-subset.woff2)는 레포에 넣는다 — 빌드·CI 에서는 돌리지 않는다.
빠진 드문 글자는 브라우저가 글자 하나씩 기기 한글 글꼴로 대신 그린다 (tokens.css --typeface 대체 순서).

글꼴 버전을 올릴 때만 돌린다:

    pip3 install fonttools brotli   # 처음 한 번
    npm install                     # node_modules/pretendard
    python3 scripts/subset-font.py
"""

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACKAGE = ROOT / "node_modules/pretendard"
SOURCE = PACKAGE / "dist/web/variable/woff2/PretendardVariable.woff2"
GLYPHS = PACKAGE / "subset_glyphs.txt"
OUTPUT = ROOT / "src/styles/fonts/PretendardVariable-subset.woff2"


def main() -> None:
    if not SOURCE.exists() or not GLYPHS.exists():
        sys.exit(f"글꼴 원본이 없어요: {PACKAGE} (npm install 먼저)")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            sys.executable,
            "-m",
            "fontTools.subset",
            str(SOURCE),
            f"--text-file={GLYPHS}",
            # 숫자 같은 폭(tnum) 등 글꼴 기능과 이름표(저작권·OFL 라이선스 문구)를 모두 남긴다
            "--layout-features=*",
            "--name-IDs=*",
            "--flavor=woff2",
            f"--output-file={OUTPUT}",
        ],
        check=True,
    )
    print(f"{OUTPUT.relative_to(ROOT)} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
