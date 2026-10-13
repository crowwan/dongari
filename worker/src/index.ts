import { handleKeepRequest, type Env } from './keep'

// Worker 진입점. 이 파일은 기본 내보내기 하나만 둔다
// (workerd 는 이름 붙은 내보내기를 모두 진입점으로 보고, 상수·함수를 내보내면 시작하지 못한다)
export default {
  fetch: (request: Request, env: Env): Promise<Response> => handleKeepRequest(request, env),
}
