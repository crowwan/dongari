# 동아리 회계 관리 웹앱

동아리 연간 수입/지출 내역을 입력하고, 정산 보고서를 자동 생성하는 모바일 웹 앱

## 주요 기능

- **기본정보 입력**: 연도, 동아리명, 전년도 이월금
- **월별 수입/지출 관리**: 12개월 데이터 입력 및 지출 상세 항목 관리
- **수입내역 관리**: 수입 항목 목록 관리 및 검증
- **보고서 미리보기**: 수입/지출 표, 지출 상세 표 자동 생성
- **이미지 저장**: 보고서를 PNG 이미지로 저장

## 기술 스택

- React 18 + TypeScript
- Vite
- Tailwind CSS
- localStorage (데이터 저장)
- html2canvas (이미지 저장)

## 실행 방법

```bash
# 의존성 설치
npm install

# 개발 서버 실행
npm run dev

# 빌드
npm run build
```

## 프로젝트 구조

```
src/
├── components/
│   ├── tabs/          # 탭 컴포넌트
│   ├── report/        # 보고서 컴포넌트
│   └── common/        # 공통 컴포넌트
├── hooks/             # 커스텀 훅
├── types/             # TypeScript 타입
└── utils/             # 유틸리티 함수
```
