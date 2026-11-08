# 02. mod 만들기 (학습 노트)

출처: https://code.claude.com/docs/ko/plugins/mods/create.md

## 요약

mod는 훅 모듈(진입 파일)을 갖춘 플러그인이다. 훅 모듈은 이벤트 발생 시 Claude Code가 호출하는 JS/TS 파일이다. Claude Code가 `.js`, `.ts`를 직접 로드하므로 Node.js, 번들러, 빌드 단계가 필요 없다. 요구 버전: Claude Code v2.1.287 이상.

만드는 방법 두 가지:
1. Claude에게 요청 (`plugin-authoring` 스킬)
2. 직접 작성

## 방법 1: Claude에게 요청하기

- 내장 스킬 `plugin-authoring`이 작성 위치, 현재 버전의 이벤트/메서드, 로드 방식을 Claude에게 알려 준다. 직접 로드: `/plugin-authoring`.
- 작성 위치: 세션의 mod 폴더 `~/.claude/dev-mods/<세션ID>/<mod이름>/`
  - 예: `~/.claude/dev-mods/3f2a9c1e-5b7d-4e8a-9c21-6d0f4b8a7e13/git-branch/`

절차:
1. **설명**: 예 `make a mod that shows the current git branch above the prompt`
   - `default`, `acceptEdits` 권한 모드에서 mod 폴더는 보호된 경로라 파일마다 승인 필요
2. **승인**: 첫 파일 저장 시 핫 리로딩 활성화 여부를 묻는다
   - **Enable for this session**: 턴 끝에 로드, 이후 mod를 바꾼 각 턴 끝마다 다시 로드. 세션 재개 후에도 유지
   - **Not now**: 지금은 로드 안 함. 해당 세션이 다음에 시작될 때 로드. 막으려면 디렉터리 삭제
3. **확인**: `/plugin` > Tab으로 **Installed** 탭. 여기서 끌 수도 있음
4. **사용/수정 반복**: 파일이 바뀐 턴이 끝날 때마다 재로드
   - 트랜스크립트에 "변경 사항이 로드되지 않았다"는 mod 이름으로 시작하는 줄이 나오면, 그 줄을 다음 메시지에 붙여 넣어야 Claude가 볼 수 있다

### 다른 세션에서 쓰기

- Claude가 작성한 mod는 만든 세션에서만 로드. 세션 mod 폴더는 `cleanupPeriodDays`보다 오래되면 삭제됨
- 보관: 디렉터리를 `~/mods/git-branch` 등으로 복사
  - 본인: `claude --plugin-dir ~/mods/git-branch`
  - 타인: 마켓플레이스에 추가

### Claude 작성 mod가 로드되지 않는 세션

- 승인할 사람이 없음: `claude -p`, `dontAsk` 모드
- 워크스페이스 미신뢰: 신뢰 프롬프트를 수락하지 않음
- mod 비활성화: `--safe-mode`, `--bare`, `disableAllHooks`, 조직 관리형 설정 차단

## 방법 2: 직접 작성 (튜토리얼 `first-mod`)

목표: 도구 호출 수를 세서 스피너 옆에 표시 + `/tally` 명령으로 출력.

```text
first-mod/
├── .claude-plugin/plugin.json
└── hooks/
    ├── hooks.json
    └── register.js
```

### 1. 디렉터리

```bash
mkdir -p first-mod/.claude-plugin first-mod/hooks
```

### 2. 매니페스트 `first-mod/.claude-plugin/plugin.json`

특별한 필드 없음.

```json
{
  "name": "first-mod",
  "version": "0.1.0",
  "description": "Counts Claude's tool calls, shows the count beside the spinner, and adds a /tally command",
  "author": { "name": "Your Name" }
}
```

### 3. `first-mod/hooks/hooks.json`

`modules` 키가 있어야 플러그인이 mod가 된다. 경로는 `hooks.json` 기준 상대 경로.

```json
{
  "description": "The first-mod hooks module",
  "modules": ["./register.js"]
}
```

### 4. 훅 모듈 `first-mod/hooks/register.js`

mod 로드 시 Claude Code가 export된 `register` 함수를 호출하며 `on` 함수를 전달한다. `on` 호출 하나가 훅 하나를 등록한다.

```javascript
let calls = 0

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'tally',
      description: 'Show how many tool calls Claude has made',
    })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    calls += 1
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('command.run', { command: 'tally' }, async () => {
    return { text: 'Claude has made ' + calls + ' tool calls since this mod loaded' }
  })

  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    return next({ ...e, props: { ...e.props, suffix: ' · tool calls: ' + calls + '…' } })
  })
}
```

| 훅 | 실행 시점 | 하는 일 |
| :- | :- | :- |
| `session.start` | 세션 시작, 첫 프롬프트 전. mod 재로드마다 다시 실행 | `/tally` 명령 등록 |
| `tool.call` | Claude가 도구를 쓰려 할 때마다 | 카운트 증가 + 다시 그리기 요청 |
| `command.run` | `/tally` 입력 시 (matcher로 제한) | 출력 텍스트 반환 |
| `ui.render` | 스피너를 그릴 때마다 | 스피너 단어 뒤에 카운트 추가 |

### 5. 로드

```bash
claude --plugin-dir ./first-mod
```

`--plugin-dir`은 설치 없이 한 세션 동안 디렉터리를 로드한다.

### 6. 사용

- `list the files here and read the README` 요청 시 스피너: `Thinking · tool calls: 2…`
- `/tally` 출력: `first-mod: Claude has made 2 tool calls since this mod loaded` (Claude Code가 플러그인 이름을 앞에 붙임)
- 비대화형 확인:

```bash
claude -p "/tally" --plugin-dir ./first-mod
# first-mod: Claude has made 0 tool calls since this mod loaded
```

- 명령 목록에 `/tally`가 없으면 모듈이 로드되지 않은 것

### 7. 핫 리로드

세션을 연 채 `' · tool calls: '`를 `' · tools used: '`로 바꾸고 저장하면, 트랜스크립트에 `first-mod`가 재로드되었다는 줄과 훅 목록이 나오고 다음 스피너가 `Thinking · tools used: 1…`로 바뀐다.

## 훅의 세 인수

| 인수 | 의미 |
| :- | :- |
| `$` (mods API) | 외부 접근용 메서드 전체. `$.ui`, `$.command` 같은 네임스페이스로 구성 |
| `e` (이벤트) | 이벤트 입력을 담은 일반 데이터 (도구 이름, 인수 등) |
| `next` | 이벤트를 다른 mod로, 이어서 Claude Code 기본 동작으로 넘기고 결과를 반환하는 함수 |

`first-mod`의 처리 방식:
- 관찰: `session.start`, `tool.call`이 `next(e)` 반환
- 응답: `command.run`은 `next` 없이 자체 결과 반환. 두 번째 인수 `{ command: 'tally' }`는 matcher(필터)
- 재작성: `ui.render`는 `suffix`를 바꾼 `e` 복사본으로 `next` 호출

재로드 동작: `--plugin-dir` 디렉터리를 감시하고 파일 변경 시 핫 리로드. 재로드마다 `register`가 다시 실행되어 모듈 변수(`calls`)가 `0`으로 초기화. 유지하려면 `$.state`/`$.store` 사용 (03-interface.md "상태 유지").

## 계속 작업하기

### Claude로 기존 mod 변경

```bash
claude --plugin-dir ./first-mod
```

예: `add a /tally-reset command to this mod that sets the tally back to zero`. Claude는 훅 모듈 편집, `claude plugin validate` 실행, 문제 수정까지 한다. `--plugin-dir` 디렉터리도 보호된 경로라 `default`/`acceptEdits`에서는 편집마다 승인. 턴 중 저장한 파일은 턴 끝에 재로드.

### 타입 정의 (`.claude-plugin/types/`)

대화형 세션에서 `--plugin-dir` 로드 또는 Claude 작성 mod 로드 시, Claude Code가 실행 중인 버전에 맞는 선언 파일을 생성한다.

| 경로 | 내용 |
| :- | :- |
| `claude-code/index.d.ts` | 모든 이벤트와 입력/결과, 모든 mods API 네임스페이스와 메서드, 각 환경에서 그릴 수 있는 요소 |
| `claude-code-tools/index.d.ts` | 기본 제공 도구의 입력과 결과. `e.tool === 'Bash'` 검사 시 `e` 타입이 좁혀짐 |
| `claude-code-mcp/index.d.ts` | 마지막 저장 시 연결된 MCP 도구의 입력 |
| `<플러그인이름>/index.d.ts` | `plugin.json`의 `dependencies`에 나열된 플러그인이 mods API에 추가하는 내용 |
| `tsconfig.json` | 훅 모듈용 컴파일러 옵션 |

- mod에 자체 `tsconfig.json`이 없으면 루트에 생성 파일을 extends하는 `tsconfig.json`을 추가 > `tsc -p ./first-mod`로 타입 검사 가능
- 문서와 다르면 이 파일을 신뢰할 것. `claude-code/index.d.ts`가 가장 완전한 레퍼런스 (메서드 설명과 예제 포함). `'tool.call'`처럼 이름으로 검색

### `claude plugin validate`

매니페스트 검사 + 로드 시와 동일한 정적 분석을 실행(코드 실행 없음).

```bash
claude plugin validate ./first-mod
```

```text
  ❯ ./register.js hooks: session.start, tool.call, command.run{command=tally}, ui.render{component=Spinner}
  ❯ ./register.js calls: $.command.register, $.ui.invalidate

✔ Validation passed
```

출력 줄 종류:
- `hooks:` 훅하는 이벤트 + 중괄호 안 필터
- `calls:` 호출하는 mods API 메서드
- `env reads:` / `env writes:` 환경 변수 읽기/쓰기 시
- `state reads:` / `state writes:` `$.state` 사용 시
- `gating hook without .catch: tool.call` 작업을 거부할 수 있는 훅마다 `.catch` 핸들러 유무 표시
- 오타 예: `"tool.calls" is not an event`

### 정적 분석 규칙 (위반 시 검증 실패)

| 규칙 | 위반 시 오류 |
| :- | :- |
| mods API 호출은 `$.store.get('notes')`처럼 `$`.네임스페이스.메서드 전체로 작성 | `const ui = $.ui` > `$.ui is used as a value` |
| `$`는 같은 파일 최상위 선언 함수에만 전달 가능 (`calls:`에 `$.store.get (via loadNotes)`로 표시). 메서드, 훅 안에서 정의한 함수, 다른 파일에서 가져온 함수에 전달하면 실패. 예외: `$.state`용 `read`/`update`(가져온 함수지만 `$` 허용) | 검증 실패 |
| `$`나 네임스페이스를 변수 할당, 구조 분해, 계산된 이름 인덱싱 금지 | `$.ui is used as a value` |
| `on`의 이벤트 이름은 문자열 리터럴 (변수, 이름 목록 반복 금지) | `the event name passed to on() is not a string literal` |
| `register` 안에서 `on` 재선언 금지 | `"on" is declared again (shadowed)` |
| 상대 경로 import는 플러그인 디렉터리 내부만. bare import는 `claude-code`만 허용 (타입과 헬퍼) | 검증 실패 |
| 파일 상단 `import` 선언만. 동적 `import()` 금지 | `a dynamic import(); a hooks module imports its own files with an import declaration` |
| ES 모듈만 (`require` 금지) | 검증 실패 |

### 테스트 (`claude plugin test`)

세션, 로그인, 네트워크 없이 실행. 테스트가 이벤트를 발생시키고 훅의 동작을 검사한다.

`first-mod/tests/first-mod.test.ts`:

```typescript
import { expect, test } from 'claude-code/testing'

test('/tally reports the tool calls the mod has seen', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))   // Claude Code 대신 응답, 실제 도구 미실행
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Read', file_path: 'README.md' })
  const answer = await $.command.run({ command: 'tally', args: '' })
  expect(answer.text).toBe('Claude has made 2 tool calls since this mod loaded')
})
```

mod 디렉터리에서 `claude plugin test` 실행:

```text
tests/first-mod.test.ts:
(pass) /tally reports the tool calls the mod has seen [22.87ms]

 1 pass
 0 fail
Ran 1 test across 1 file. [0.19s]
```

참고: 테스트의 `$.command.run` 결과 `text`에는 플러그인 이름 접두사가 없다 (트랜스크립트 표시에서만 붙음).

## 공유하기

| 대상 | 방법 |
| :- | :- |
| 소수 | 디렉터리 또는 `.zip` 전달 (마켓플레이스 없이) |
| 팀 | 자체 마켓플레이스(플러그인마다 디렉터리 하나인 비공개 저장소). 저장소 설정에 마켓플레이스 등록 가능 |
| 조직 | 관리자가 관리형 설정으로 설치 |
| 모두 | 공개 마켓플레이스 저장소 또는 Anthropic 디렉터리에 제출 |

- `name`이 Anthropic 자체 플러그인처럼 보이면(예: `claude-`로 시작) `claude plugin validate` 실패
- README에 테스트한 Claude Code 버전 명시 (이벤트/메서드가 릴리스마다 바뀜)
- 개발은 설치된 사본이 아닌 디렉터리에 `--plugin-dir`로. 설치본은 버전별로 캐시되어 버전을 올리고 재설치해야 반영

## 주의/제약

- 재로드마다 `register` 재실행, 모듈 변수 초기화. 유지할 값은 `$.state`/`$.store`
- `$`를 변수에 담거나 구조 분해하면 정적 분석이 깨진다. 헬퍼에 `$`를 넘길 때는 같은 파일 최상위 함수만
- 이벤트 이름은 문자열 리터럴만. 이벤트 목록을 돌며 `on`을 등록하는 패턴 불가
- 동적 `import()`, `require`, 플러그인 밖 상대 import, `claude-code` 외 bare import 불가 (npm 패키지 import 불가로 해석됨)
- Claude 작성 mod는 `claude -p`, `dontAsk`, 미신뢰 워크스페이스, `--safe-mode`/`--bare`/`disableAllHooks`에서 로드 안 됨
- Claude 작성 mod는 해당 세션 전용이고 `cleanupPeriodDays` 경과 시 삭제됨. 보관하려면 복사
- 보호된 경로라 `default`/`acceptEdits` 모드에서 mod 파일 편집마다 승인 필요
- "변경 사항이 로드되지 않았다" 줄은 Claude에게 보이지 않으므로 직접 붙여 넣어야 함
- 문서와 `.claude-plugin/types/claude-code/index.d.ts`가 다르면 후자가 정답
- 설치본 캐시: 버전 올리지 않으면 수정이 반영되지 않음
- 플러그인 `name`에 `claude-` 접두사 금지

## 테스트 체크리스트

- [ ] `first-mod` 3파일 구성 후 `claude --plugin-dir ./first-mod`로 로드, 명령 목록에 `/tally` 표시
- [ ] 다중 도구 호출 프롬프트에서 스피너에 `Thinking · tool calls: N…`가 증가
- [ ] `/tally` 입력 시 트랜스크립트에 `first-mod: Claude has made N tool calls since this mod loaded` (접두사 확인)
- [ ] `claude -p "/tally" --plugin-dir ./first-mod`가 `first-mod: Claude has made 0 tool calls since this mod loaded` 출력
- [ ] 세션 중 `suffix` 문자열을 바꿔 저장하면 재로드 줄 + 훅 목록이 트랜스크립트에 나오고 스피너 문구가 바뀜
- [ ] 재로드 직후 `/tally`가 0부터 다시 셈 (모듈 변수 초기화 확인)
- [ ] `hooks.json`에서 `modules` 키를 빼면 mod로 인식되지 않음 (`/tally` 사라짐)
- [ ] 대화형 로드 후 `.claude-plugin/types/claude-code/index.d.ts`, `claude-code-tools/index.d.ts`, `tsconfig.json` 생성 확인
- [ ] `tsc -p ./first-mod`가 오류 없이 통과
- [ ] `e.tool === 'Bash'` 분기에서 에디터가 `e.command` 타입을 좁혀 자동 완성
- [ ] `claude plugin validate ./first-mod` 출력의 `hooks:`/`calls:` 줄이 위 예시와 일치, `✔ Validation passed`
- [ ] 의도적 위반으로 각 오류 메시지 재현: `'tool.calls'` 오타, `const ui = $.ui`, 변수 이벤트 이름, `on` 섀도잉, 동적 `import()`
- [ ] 최상위 헬퍼 `loadNotes($)` 사용 시 `calls:`에 `(via loadNotes)` 표시
- [ ] `tool.call` 게이팅 훅에 `.catch`가 없을 때 `gating hook without .catch: tool.call` 줄 표시
- [ ] 환경 변수 읽기 시 `env reads:` 줄 표시
- [ ] `claude plugin test`로 `tests/first-mod.test.ts`가 `1 pass 0 fail`
- [ ] 플러그인 이름을 `claude-test`로 바꾸면 validate 실패
- [ ] Claude에게 `/plugin-authoring`으로 mod 요청 시 `~/.claude/dev-mods/<세션ID>/<이름>/`에 생성되고 핫 리로딩 승인 프롬프트가 뜸
- [ ] **Not now** 선택 시 현재 세션에는 로드되지 않음
