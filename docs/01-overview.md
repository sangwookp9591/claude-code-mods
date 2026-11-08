# 01. Mods 개요 (학습 노트)

출처: https://code.claude.com/docs/ko/plugins/mods/overview.md

## 한 줄 정의

mod는 Claude Code의 모양과 동작을 바꾸는 플러그인이다. JavaScript 또는 TypeScript 이벤트 핸들러(훅)로 구성되며, Claude Code 내부(자체 프로세스)에서 함수로 실행된다. 훅은 이벤트를 관찰, 변경(재작성), 직접 처리(응답)할 수 있다.

용어 구분:
- 이 문서군에서 "훅" = mod의 핸들러 함수
- 설정 파일(`settings.json`) 방식의 기존 훅 = "설정 훅" (셸 명령, HTTP 요청, 프롬프트 형태)

## mod로 할 수 있는 일

| 능력 | 내용 | 관련 문서 |
| :- | :- | :- |
| 직접 인터페이스 그리기 | 트랜스크립트 옆 창(pane), 프롬프트 위 띠(band)에 탭, 버튼, 텍스트 필드 배치 | interface.md |
| Claude Code 자체 UI 다시 그리기 | 도구 호출 행, 스피너, `AskUserQuestion` 대화 상자 등을 교체하거나 스타일 변경 | interface.md |
| 도구 호출/요청 개입 | 사용자에게 묻는 동안 도구 호출 보류, 도구 실행 없이 응답, 특정 요청을 다른 모델로 라우팅 | events.md |
| 명령으로 코드 실행 | Claude 턴 없이, Claude 작업 중에도 즉시 실행되는 `/command` | api.md |
| 훅 간 데이터 공유 | 같은 파일의 모듈 변수를 공유 (예: 한 훅이 세고 다른 훅이 표시) | events.md |

설정 훅, 스킬, 상태줄, MCP 서버는 Claude Code "외부"에서 동작하지만 mod는 "내부"에서 실행되므로 이들이 못 하는 일을 할 수 있다.

## mod 가져오기

1. 내장 mod 사용 (`/diff` 등 일부 기능이 이미 mod)
2. Claude에게 요청해 작성 (`plugin-authoring` 스킬 기반, 02-create.md 참조)
3. 마켓플레이스에서 설치

### 설치 / 업데이트

형식: `플러그인이름@마켓플레이스이름`

```bash
# 세션 안에서
/plugin install token-chart@your-org
# 셸에서
claude plugin install token-chart@your-org
```

- 세션이 열린 상태에서 셸로 설치/업데이트했다면 해당 세션에서 `/reload-plugins` 실행. 아니면 다음 시작 시 로드.

### 샘플 mod

저장소: `anthropics/claude-code-playground`의 `claude-code/mods` 디렉터리 (지원 없음, as-is)

| 샘플 | 기능 |
| :- | :- |
| `token-weather` | 프롬프트 위에 컨텍스트 윈도우 예보를 그림 |
| `blast-radius` | `rm -rf`, 강제 푸시 같은 위험한 셸 명령을 보류, 변경 범위를 보여 주고 진행/취소 버튼 제공 |
| `replay-theater` | 마지막 턴의 파일 편집을 단계별로 보는 `/replay` 명령 |

- 시험: 클론 후 `--plugin-dir`로 한 세션 동안 로드
- 계속 사용: 클론의 `claude-code/mods`를 마켓플레이스로 추가하고 `claude-code-playground-mods`에서 설치 (클론을 옮기거나 지우면 로드 안 됨)

## 신뢰와 접근 범위

로드된 mod가 할 수 있는 것 (사용자 권한으로 실행, 샌드박스 아님):
- 사용자 계정이 접근 가능한 모든 파일 읽기/쓰기, 프로그램 실행, 네트워크 요청
- 환경 변수, 설정 파일, API 키 읽기
- 모든 프롬프트와 도구 호출 보기
- 프롬프트/도구 호출 재작성, 사용자인 것처럼 프롬프트 제출, 사용자의 다른 세션으로 메시지 전송
- 사용자 확인 전에 도구 호출 승인
- 사용자 플랜/API 키로 모델 호출 (사용량 소비)

권한 관련 규칙:
- 관리형 설정이 있거나 Team/Enterprise `/login` 자격 증명인 경우: 기본적으로 mod의 승인은 사용자의 `ask` 규칙이나 `PreToolUse` 훅을 넘어서 통과시키지 못한다.
- 둘 다 없으면: mod는 `ask` 규칙이 물어볼 호출, 사용자 `PreToolUse` 훅이 차단한 호출도 승인할 수 있다.
- `deny` 규칙 관련 우선순위는 permissions 문서의 "precedence among rules, hooks and mods" 참조.
- 권한 프롬프트는 mod가 변경할 수 없다.

### 설치 전 검사

```bash
claude plugin validate ./some-mod
```

출력의 `hooks:` 줄(처리하는 이벤트)과 `calls:` 줄(Claude Code에 요청하는 작업)로 mod가 하는 일을 실행 없이 나열할 수 있다. 훅은 자체 코드 밖의 작업(그리기, 명령 추가, 모델 호출, 파일 읽기, 프로세스 시작, 네트워크)을 반드시 mods API(`$`)로만 하므로 이 정적 나열이 가능하다.

## 켜기 / 끄기

- 기본값: 켜짐
- 버전 요구: 터미널 Claude Code v2.1.287 이상, Desktop 앱 내장 Claude Code v2.1.286 이상
  - 터미널 확인: `claude --version`
  - Desktop 확인: Code 탭 로컬 세션에서 `/status`의 **Claude Code** 행

끄는 방법:

| 범위 | 방법 |
| :- | :- |
| mod 하나 | `/plugin`의 **Installed** 탭에서 비활성화 또는 제거 |
| 설치된 모든 mod, 한 세션 | `--safe-mode`로 시작 (다른 사용자 지정도 같이 꺼짐) |
| 사용자가 설치한 모든 mod, 모든 세션 | `~/.claude/settings.json`에 `"disableAllHooks": true` (설정 훅, 사용자 상태줄도 중지. 조직 관리 항목은 계속 실행) |

- `disableAllHooks`와 조직의 `allowManagedModsOnly`는 mod만 중지하고 플러그인의 스킬, 명령, 에이전트, MCP 서버는 그대로 로드.
- 얼리 액세스 때 설정한 `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`는 제거할 것. v2.1.287 이상에서는 무시되며 `0`으로 해도 mod가 꺼지지 않는다.

### 로드된 mod 확인

`/plugin` 실행 시 탭 아래 흐린 줄: `1 mod active · first-mod` (내장 mod는 이 줄에 표시 안 됨)

## mod의 구조

```text
first-mod/
├── .claude-plugin/
│   └── plugin.json     # 매니페스트
└── hooks/
    ├── hooks.json      # 코드 파일을 가리킴
    └── register.js     # 훅 모듈 (사용자 코드)
```

최소 예제 (도구 호출 수를 스피너 옆에 표시):

```javascript
let calls = 0

export function register(on) {
  on('tool.call', async ($, e, next) => {
    calls += 1
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    return next({ ...e, props: { ...e.props, suffix: ' · tool calls: ' + calls + '…' } })
  })
}
```

결과: `Thinking · tool calls: 1…`, `2…`, `3…`

### 훅이 이벤트로 할 수 있는 세 가지

| 방식 | 의미 | 예 |
| :- | :- | :- |
| 관찰 | 기록만 하고 그대로 진행 (`return next(e)`) | `tool.call`에서 카운트 |
| 재작성 | 이벤트를 바꿔서 진행 (`next({...e, ...})`) | 스피너 `suffix` 추가 |
| 응답 | 직접 처리, 기본 동작 미실행 (`next` 미호출) | 명령 거부 |

## mod가 실행되는 위치

훅은 모델 공급자(Amazon Bedrock, Google Cloud Agent Platform, Microsoft Foundry 포함)와 무관하게 플러그인을 로드하는 모든 세션에서 실행된다. 그리기는 더 좁다.

| 실행 위치 | 훅 실행 | 그린 내용 표시 |
| :- | :- | :- |
| 터미널 `claude` (에디터 통합 터미널, JetBrains 포함) | 예 | 예 |
| Desktop 앱 Code 탭 (WSL 제외) | 예 | 예 (요소 표에서 터미널 전용 표시 요소 제외) |
| Desktop 앱 WSL 세션 | 아니요 (플러그인 불가) | 아니요 |
| VS Code 확장 채팅 패널 | 예 | 예. 확장 2.1.299 이상. 기능 플래그를 가져오지 않는 세션(예: Bedrock)은 2.1.304 이상 |
| `claude -p`, Agent SDK | 예 | 아니요 |
| Remote Control (claude.ai/모바일) | 예 (사용자 컴퓨터 세션에서) | 사용자 컴퓨터 터미널에 표시 |
| 클라우드 세션 | 예 (클라우드로 전달되는 플러그인일 때) | 아니요 |

그리는 mod는 실행 중인 앱을 확인해서, 그릴 수 없는 곳에서는 트랜스크립트 한 줄이나 명령의 텍스트 응답으로 대체할 수 있다.

## 비교표

| | Mod | 설정 훅 | 스킬 | MCP 서버 |
| :- | :- | :- | :- | :- |
| 정의 | 플러그인 내 함수, Claude Code 자체 프로세스에서 호출 | 라이프사이클 이벤트에서 실행되는 셸 명령/HTTP/프롬프트 | Claude가 읽는 `SKILL.md` | Claude에 도구를 주는 외부 프로세스 |
| 변경 대상 | 도구 호출, 프롬프트, 명령, 턴, 인터페이스 | 진행 여부, 도구 인수/결과, 추가 컨텍스트 | Claude의 지식/행동 | 사용 가능한 도구 |
| UI 그리기 | 예 | 아니요 | 아니요 | 아니요 |
| 작성 언어 | JS/TS | 스크립트 + `settings.json` | Markdown | 아무 언어 |
| 선택 시점 | 창, 밴드, 사용자 명령이 필요하거나 이벤트 재작성 | 기존 스크립트로 차단/허용/로그 | 같은 지침을 반복 붙여넣을 때 | 외부 시스템 접근 |

하나의 플러그인에 mod, 스킬, MCP 서버를 함께 담아 배포할 수 있다.

## 내장 mod

`/plugin` > **Installed** 탭 > **Built-in** 아래 표시. 업데이트/제거 불가.

| 이름 | 기능 | 활성 위치 | 끄는 방법 |
| :- | :- | :- | :- |
| `cc-plugin-agents-md` | `AGENTS.md`를 프로젝트 지침으로 로드 | 읽을 수 없는 세션 제외 전부 | `/plugin`에서 비활성화 또는 지침 파일 선택 |
| `cc-plugin-diff` | `/diff`를 처리하고 창을 그림 | 대화형 터미널 세션 | `/plugin`에서 비활성화 (`/diff`는 내장 버전이 처리) |
| `cc-plugin-plugin-authoring` | `plugin-authoring` 스킬 제공 (mod 코드 없음) | Anthropic이 원격으로 끈 경우 제외 전부 | `/plugin`에서 비활성화 |
| `cc-plugin-sec-default` | 사용자 설치 mod로부터 조직 관리 항목 보호 | 보호 기능 로드 위치 | 끌 수 없음 (관리자가 순서 지정) |
| `cc-plugin-telemetry` | 분석 레코드 전송 | 자체 분석이 켜진 곳 | `/plugin` 비활성화 또는 `DISABLE_TELEMETRY` |
| `cc-plugin-you-should-know` | 보조 에이전트가 놓친 내용을 프롬프트 위에 알림 | 켜기 전까지 꺼짐 | `/plugin` 비활성화 |

`disableAllHooks`, `--bare`, `--safe-mode`는 내장 mod를 중지하지 않는다.

공개 소스 (`anthropics/claude-code`의 `mods` 디렉터리), 학습용 레퍼런스:
- `diff`: 키보드 동작에 바인딩된 버튼, mod가 자체 처리하는 스크롤
- `agents-md`: `userConfig` 옵션 사용 예
- `sec-default`: 정책 적용 mod의 모델
- `telemetry`: 다른 mod가 호출할 메서드 추가 + 타입 제공

## 주의/제약

- mod는 샌드박스 밖에서 사용자 권한으로 실행된다. 샌드박싱을 켜도 mod가 시작한 프로세스는 격리되지 않는다.
- 권한 프롬프트 내용은 mod가 바꿀 수 없다.
- 관리형 설정 또는 Team/Enterprise 로그인이면 mod 승인이 `ask` 규칙과 `PreToolUse` 훅을 우회하지 못한다 (기본값).
- 버전 하한: 터미널 v2.1.287, Desktop v2.1.286, VS Code 확장 2.1.299 (기능 플래그 미수신 세션 2.1.304).
- `claude -p`, Agent SDK, 클라우드 세션에서는 훅은 돌지만 그리기는 보이지 않는다. Desktop WSL 세션은 훅도 안 돈다.
- `CLAUDE_CODE_ENABLE_FUNCTION_HOOKS`는 더 이상 효과 없음 (`0`으로도 못 끈다).
- `--plugin-dir` 클론 기반 마켓플레이스는 클론을 옮기면 깨진다.
- 내장 mod는 `mods active` 줄에 안 나오고, `disableAllHooks`/`--safe-mode`/`--bare`로 꺼지지 않는다.
- 훅의 외부 작업은 전부 `$` 경유여야 한다 (그래야 `validate`가 나열 가능).

## 테스트 체크리스트

- [ ] `claude --version`이 2.1.287 이상인지 확인
- [ ] `--plugin-dir`로 로드 후 `/plugin` 탭 아래 흐린 줄에 `1 mod active · <mod-name>`가 표시됨
- [ ] `/plugin` > **Installed** > **Built-in** 아래에 `cc-plugin-diff` 등 내장 mod가 나열됨
- [ ] `tool.call` 관찰 훅: 프롬프트 1회로 도구 3회 호출 시 스피너가 `Thinking · tool calls: 1…` > `2…` > `3…`로 증가
- [ ] 재작성: `ui.render` Spinner `suffix` 변경이 스피너 단어 뒤에 붙음
- [ ] 응답: 특정 도구 호출에 `next` 없이 결과를 반환하면 실제 도구가 실행되지 않음 (예: Bash `ls`가 실행 안 되고 mod 결과가 보임)
- [ ] `claude plugin validate ./mod`의 `hooks:`/`calls:` 줄이 코드의 `on(...)`과 `$.xxx` 호출과 정확히 일치
- [ ] `claude --plugin-dir ./mod --safe-mode`에서 mod가 로드되지 않음 (`mods active` 줄 없음)
- [ ] `"disableAllHooks": true` 설정 시 mod 미로드, 같은 플러그인의 스킬은 여전히 로드
- [ ] `claude -p "/명령" --plugin-dir ./mod`에서 훅(명령)은 실행되고 텍스트 응답이 출력됨, 그리기는 없음
- [ ] 셸에서 업데이트 후 세션에서 `/reload-plugins`로 변경 반영
- [ ] mod 하나에 스킬과 mod를 같이 넣은 플러그인에서 둘 다 동작
- [ ] (권한) 개인 계정 환경에서 mod가 `ask` 규칙 대상 호출을 승인하면 프롬프트 없이 진행되는지 관찰
- [ ] 권한 프롬프트를 `ui.render`로 바꾸려 해도 변경되지 않음을 확인
