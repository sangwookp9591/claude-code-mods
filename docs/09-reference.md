# 09. Mods 참조 (reference)

> 원문: https://code.claude.com/docs/ko/plugins/mods/reference
> 기준 버전: Claude Code CLI 및 Desktop v2.1.290, VS Code 확장 v2.1.299.
> 최종 권위: Claude Code가 설치된 빌드에 맞게 작성하는 TypeScript 선언 사본 (create 문서의 "get the types for your build"). GitHub의 `mods/types/claude-code.d.ts`는 더 오래됐을 수 있다.

## 1. 폴더 레이아웃

mod는 플러그인 디렉터리다.

```text
first-mod/
  .claude-plugin/plugin.json   # 필수. 플러그인 매니페스트. mod 전용 필수 필드는 없음
  hooks/hooks.json             # 필수. { "modules": ["./register.js"] } (+ 선택적 "hooks" 설정 훅)
  hooks/register.js            # 필수. 훅 모듈 (진입점). register(on, options) export
  types/index.d.ts             # $.state 사용 또는 mods API 네임스페이스 추가 시 필수
  tests/first-mod.test.ts      # 선택. claude plugin test 대상
```

| 파일 | 필수 | 내용 |
| :- | :- | :- |
| `.claude-plugin/plugin.json` | 예 | 플러그인 매니페스트. mod는 필수 필드를 추가하지 않는다 |
| `hooks/hooks.json` | 예 | `modules`: 훅 모듈 경로 **하나**를 이 파일 기준 상대 경로로 담은 배열. `hooks` 아래 설정 훅도 포함 가능 |
| 훅 모듈 (예: `hooks/register.js`) | 예 | `register(on, options)` export. 확장자 `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx`. ES 모듈 |
| `types/index.d.ts` (매니페스트 `types`가 다른 경로를 지정하지 않을 때) | `$.state` 사용 또는 네임스페이스 추가 시 | `PluginState` 값과 mod가 추가하는 네임스페이스 선언. 매니페스트에서 `types` 생략은 v2.1.299+ |
| `*.test.ts` / `*.test.tsx` | 아니요 | `claude plugin test`가 실행 |

```json
// hooks/hooks.json
{ "modules": ["./register.js"] }
```

## 2. 매니페스트 필드와 `userConfig`

이 페이지가 직접 언급하는 매니페스트 관련 항목만 정리한다 (전체 필드는 manifest-reference 문서).

| 항목 | 내용 |
| :- | :- |
| 필수 필드 | mod 때문에 추가되는 필수 필드는 없다 |
| `types` | 타입 선언 파일 경로. 생략 시 `types/index.d.ts` (생략은 v2.1.299+) |
| `userConfig` | 사용자 설정 필드 선언. 값은 `register`의 두 번째 인수 `options`로 기본값이 채워진 상태로 전달 |
| MCP 서버 목록 | `$.mcp.connect(server)`는 이 플러그인 매니페스트에 나열된 MCP 서버에만 연결 |

`userConfig` 값의 저장 위치는 설정의 `pluginConfigs`이다.

- 키는 플러그인 ID (예: `acme-guard@acme-tools`).
- `--plugin-dir`로 로드한 mod는 `<name>@inline` (예: `first-mod@inline`).
- 검증 실패 시 `options do not fit plugin.json userConfig` (troubleshoot 문서 참고).

```javascript
// hooks/register.js
export function register(on, options) {
  // options: userConfig 값 (기본값 채워짐)
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => next(e))
}
```

## 3. 훅 함수

`on(eventName, [matcher], hook)` 형태. 반환값은 `.catch(handler)` 하나를 가진 등록 객체 (오류 핸들러).

| 인수 | 설명 |
| :- | :- |
| `$` | mods API. 항상 `$.fs.read('notes.md')`처럼 네임스페이스 + 메서드 전체 형태로 호출 |
| `e` | 깊게 동결된 일반 데이터. 바꾸려면 복사본을 `next`에 전달 |
| `next(e)` | 미들웨어의 다음 핸들러. 이후 훅, 그다음 Claude Code 동작 실행. 이벤트 결과로 resolve |
| `next.signal` | 이벤트 중단 시 abort되는 `AbortSignal` |
| `next.origin` | 이벤트를 발생시킨 주체 `{ plugin, tier }`. Claude Code 자체는 `{ plugin: 'engine', tier: 'core' }`. mod `tier`: `prepend`, `user`, `append`, `builtin` |
| `next.budget` | ms 단위 시간 제한. `next.budget.ms` 전체, `next.budget.remainingMs` 남은 시간 |
| `next.to(e, tier)` | 이후 tier(`append`, `builtin`, `core`)로 건너뜀. `prependPlugins`/`appendPlugins`의 mod만 호출 가능 |
| `next.error` | `.catch`에서만. `kind`: `throw`, `timeout`, `re-entry`(v2.1.292+). `message`: 오류 텍스트 |
| `next.error.cause` | `kind`가 `re-entry`일 때만. `rewritten`(v2.1.300+) 또는 `lent`(v2.1.292+) |
| `next.called` | `.catch`에서만. 훅이 `next`를 호출했으면 `true` |

반환 약식: `next(e)`는 그대로 전달, `next({ ...e, text })`는 필드 변경 사본 전달, 객체 반환은 `next` 없이 직접 응답.

`turn.step`과 `process.spawn` 훅은 **비동기 제너레이터**, 나머지는 비동기 함수.

## 4. 이벤트

### 도구

| 이벤트 | 발생 시점 | 반환 |
| :- | :- | :- |
| `tool.call` | 도구 실행 직전 | `next(e)`, `{ deny: reason }`, `{ result }` |
| `tool.check` | `tool.call`/`PreToolUse` 이후 실행 허용 결정 시 | `next(e)` 또는 `{ decision }` (`allow`/`ask`/`deny`, 선택적 `reason`) |
| `tool.describe` | 도구 설명이 Claude에 처음 전송될 때 도구마다 1회 (MCP 도구는 도구 검색 로드 시 1회 더) | `{ description }`, 선택적 `isDeferred` |

`tool.check` 추가 필드: `e.agentId`(서브에이전트/인프로세스 팀원 호출 시), `e.ceiling`(조직이 `ask`로 설정한 커넥터 도구면 `ask`), 둘 다 v2.1.290+. `e.isReadOnly`는 도구가 읽기 전용이라 보고할 때만 `true`, 아니면 필드 자체가 없음 (v2.1.304+).

### 프롬프트와 Claude가 읽는 내용

| 이벤트 | 발생 시점 | 반환 |
| :- | :- | :- |
| `prompt.submit` | 프롬프트 제출 | `next({ ...e, text })`, `next({ ...e, context })`, `{ drop: reason }` |
| `prompt.fill`, `prompt.suggest` | 초안/흐린 제안이 입력란에 들어가기 직전 | 텍스트 변경한 `next(e)` |
| `prompt.edit` | 입력란 편집 | `next(e)` |
| `prompt.autocomplete` | 커서 위치 단어가 끝날 때 (`e.token`). 기다리지 않음 | `{ suggestions }` (`{ text, label, description }` 목록) |
| `prompt.compose` | 시스템 프롬프트 렌더링 | `{ sections }` (`{ id, text, scope }` 목록) |
| `prompt.section` | 시스템 프롬프트 이름 있는 섹션마다 (`e.name`) | `{ text }`, 생략은 `{ text: null }` |
| `prompt.context` | 대화마다 1회, 첫 메시지 컨텍스트 | `{ blocks }` |
| `prompt.attachment` | 리마인더 등 Claude Code 자체 메시지 추가 (`e.type`, `e.detail`) | `{ text }`, 생략은 `{ text: null }` |
| `prompt.mention` | @-멘션 파일 읽기 직전 (v2.1.290+) | `next({ ...e, path })`, `{ deny: reason }` |
| `skill.prompt` | 스킬 텍스트 확장 시 | `{ text }` |
| `attribution.text` | 커밋/PR 저작자 표시 작성 시 | `{ text }` |

`skill.prompt` 필드 (v2.1.299+): `e.skill`, `e.text`, `e.source`(`policySettings`, `userSettings`, `projectSettings`, `plugin`, `mcp`, `syncedSkills`, `built-in` 등), `e.pluginName`, `e.path`, `e.frontmatter`, `e.frontmatterProblem`. `text`와 `frontmatter` 외 필드를 바꾸면 훅이 실패한다.

### 명령과 구성

| 이벤트 | 발생 시점 | 반환 |
| :- | :- | :- |
| `command.run` | 명령 실행 직전 | `{ text }`, `{}`, `next(e)` |
| `command.describe` | 명령 목록용, 명령마다 | `{ description, argumentHint, isHidden }` |
| `config.set` | `/config` 행 변경 직전 | `next({ ...e, value })`, `{ deny: reason }` |
| `config.describe` | `/config` 행마다 | `{ label, description, isHidden }` |
| `settings.read` | `$.settings.read` 호출 또는 병합 설정 생성 시 (엔진 읽기와 `e.layers`는 v2.1.304+) | `next(e)`, `{ value }`, `{ deny: reason }` |

`e.layers`: 소스별 `{ source, settings }`, 우선순위 낮은 것부터. `e.source`: mod가 요청한 하나의 소스 (예: `$.settings.read({ source: 'policy' })`).

### 턴

| 이벤트 | 발생 시점 | 반환 |
| :- | :- | :- |
| `turn.start` | 턴 시작 | `next(e)` |
| `turn.step` | 모델 요청 직전 | `yield* next(e)`, `next({ ...e, model })`, `next({ ...e, effort })` |
| `turn.complete` | 턴 종료 | `next(e)`, 답변 아래 한 줄은 `{ text }` |

### 세션

| 이벤트 | 발생 시점 | 반환 |
| :- | :- | :- |
| `session.start` | mod마다 첫 프롬프트 전 1회 + 재로드 후 1회. `/clear`, `/resume`, `/branch` 후엔 **발생 안 함** | `next(e)` |
| `session.end` | 종료 또는 `/clear`/`/resume`/`/branch`. `e.reason`: `clear`, `resume`, `logout`, `prompt_input_exit`, `other` (`/branch`는 `resume`) | `next(e)` |
| `session.compact` | 압축 직전 | `{ skip: reason }` |
| `session.receive`, `session.send` | 메시지 도착 / 전송 직전 | `receive`: `{ consumed: reason }`, `send`: `{ isDelivered: false, reason }` |
| `session.append` | 대화 행 저장 직전 행마다 | `message.content` 변경한 `next({ ...e, message })` |
| `session.attach`, `session.detach` | 다른 앱 연결/해제 | `next(e)` |
| `session.measure` | 턴 후, 플랜 한도 사용률 변경 시 | `next(e)` |

### 서브에이전트

| 이벤트 | 발생 시점 | 반환 |
| :- | :- | :- |
| `agent.offer` | 서브에이전트 유형이 Claude에 제공될 때 | `{ isOffered: false }` |
| `agent.spawn` | 서브에이전트/팀원 시작 직전, 또는 재개 직전 (`e.isTeammate`, `e.resume`) | `next({ ...e, model })`, `{ deny: reason }` |

재개(`e.resume = { agentId }`)는 v2.1.299+. 재개 실행에서 `model` 등 변경은 무시된다. 거부하면 Claude는 `a plugin declined the resume: <reason>`을 읽는다. 카운터 훅은 `e.resume`이 있으면 건너뛴다.

### 인터페이스

| 이벤트 | 발생 시점 |
| :- | :- |
| `ui.render` | 렌더링 지점 그리기 직전 |
| `ui.resolve` | mod 로드 시 앱 x 지점 x mod 조합마다 1회. 결과는 `$.ui.resolve(e)`가 읽는 요소 테이블 |
| `ui.press`, `ui.input`, `ui.select` | mod가 그린 `Button`/`Input`/`Select` 사용 |
| `ui.focus`, `ui.scroll` | 포커스/스크롤 변경 직전 |
| `ui.close` | 창 닫기 직전. `e.id`, `e.origin.kind`(`plugin`, `person`, `unload`) |
| `ui.message` | `Client` 요소가 데이터를 게시 |
| `ui.fault` | `Client` 실패. `e.phase`(`load`, `render`, `run`), `e.reason` (v2.1.289+) |

### 다른 mod / 텔레메트리 / 설정 훅 / API 호출

| 이벤트 | 내용 |
| :- | :- |
| `plugin.register` | 훅 모듈 로드 직전. `e.uses`는 `claude plugin validate` 형식 (호출은 `fs.read`처럼 `$.` 없이). 반환 `{ refuse: reason }` |
| `engine.create` | 이 mod용 mods API 구성 시. 네임스페이스 추가한 API 반환. `user` 외 tier는 네임스페이스 제외도 가능 |
| `telemetry.log`, `telemetry.mark` | 설치 mod는 `{ to: 'collector' }` 필터 필수 (없으면 `validate` 실패). `*`는 매치 안 됨. 반환 `next(e)` 또는 `{ deny: reason }` |
| `classic.<Event>` | 설정 훅 이벤트 (예: `classic.Stop`, `classic.PostToolUse`). `e`는 훅의 stdin JSON |
| mods API 호출 이벤트 | 모든 메서드가 이벤트이기도 함 (`fs.read`, `model.complete`, `ui.open`). 반환 `next(e)`, `{ deny: reason }`, `{ value }` |

## 5. Mods API 메서드 (`$`)

| 네임스페이스 | 메서드 |
| :- | :- |
| `$.plugin` | `name`, `root` |
| `$.ui` | `resolve`, `invalidate`, `open`, `close`, `panes`, `focus`, `scroll`, `toast`, `notify`, `status`, `log`, `notice`, `ask`, `copy`, `selection`, `blit` |
| `$.command` | `register`, `run`, `list` |
| `$.tool` | `register`, `call`, `check`, `list` |
| `$.agent` | `register`, `spawn`, `list` (`status`: `pending`, `running`, `waiting`, `idle`, `completed`, `failed`, `killed`. `idle`/`waiting`은 v2.1.289+) |
| `$.model` | `complete`, `fork`, `classify` |
| `$.prompt` | `submit`, `read`, `fill`, `suggest`, `compose`. `submit({ text, asUser: true })`는 발신자 문장 없이 사용자 말로 전송 |
| `$.turn` | `abort` |
| `$.session` | `messages`, `cwd`, `root`, `model`, `turns`, `id`, `repo`, `surfaces`, `usage`, `version`, `compact`, `send`, `append`, `authorize`. `usage()`는 `{ startedAt, context, rateLimits, cost }` |
| `$.config` | `list`, `set` |
| `$.settings` | `read` |
| `$.env` | `get`, `set` |
| `$.fs` | `read`, `write`, `list`, `exists`, `stat`, `ancestors`. `write`는 원자적이지 않음 |
| `$.store` | `get`, `set`, `delete`, `keys`. 머신의 모든 세션이 공유하는 키-값 저장소 |
| `$.state` | 반응형 상태: `get`, `set` + `claude-code`의 헬퍼 `atom`, `read`, `update`, `derive`, `memberOf` |
| `$.clock` | `now`, `sleep`, `after`, `every` |
| `$.http` | `fetch` |
| `$.process` | `run`, `spawn` |
| `$.mcp` | `call`, `connect` |
| `$.audio` | `play`, `speak` |
| `$.telemetry` | `log`, `mark` (Claude Code 또는 내장 mod가 호출한 경우에만 전송) |

## 6. 상태 계약 (`$.state`, `$.store`, 모듈 변수)

| 보관 위치 | 수명 / 범위 | 제약 |
| :- | :- | :- |
| 모듈 수준 변수 | 재로드마다 재초기화 | 지속 값 보관 금지 |
| `$.state` | 반응형 세션 상태. `/clear`, `/resume`, `/branch` 시 기본값으로 재설정 | `types/index.d.ts`에 `PluginState` 선언 필수. 복원은 `classic.SessionStart` 훅에서 |
| `$.store` | 머신의 모든 세션 공유 키-값 | JSON 총 4 MiB. 여러 세션이 바꾸는 데이터는 여기 (`$.fs.write`는 원자적이지 않음) |
| `pluginConfigs` (`userConfig`) | 설정 파일 | `register`의 `options`로 전달 |

## 7. 렌더링 지점 (`ui.render`의 `e.component`)

`e.surface`: `terminal`, `desktop`, `vscode`. VS Code 렌더링은 확장 2.1.299+ (기능 플래그 미수신 세션은 2.1.304+).

| 지점 | `e.props` | `e.requestId` | 렌더링 앱 |
| :- | :- | :- | :- |
| `Pane` | `title`, `isFocused`, `bodyColumns`, `placement`, `scroll`, `view` | 창 `id` | 터미널, Desktop, VS Code |
| `AbovePrompt` | `hasSurvey`, `isWorking`, `maxRows`, `bodyColumns`, `scroll`, `view` | 단일 | 터미널, Desktop |
| `UserMessage` | `text`, `origin`, `isExpanded`, `task` 또는 `from` | 메시지 id | 터미널, Desktop, VS Code |
| `AssistantMessage` | 응답 텍스트 | 메시지 id | 터미널, Desktop, VS Code |
| `ToolUse`, `ToolResult`, `ToolGroup` | 도구 이름, 입력, 결과 | 도구 호출 id | 터미널, Desktop, VS Code |
| `CommandOutput` | `command`, `text` | 메시지 id | 터미널, Desktop |
| `AskUserQuestion` | 질문과 선택지 | 도구 호출 id | 터미널, Desktop, VS Code |
| `ToolProgress` | `kind` | 도구 호출 id | 터미널 |
| `Spinner` | `word`, `message`, `suffix`, `mode` | 에이전트 id | 터미널, Desktop, VS Code |
| `TurnDuration` | `word`, `durationMs` | 메시지 id | 터미널 |
| `InfoNotice` | `text`, `command` | 메시지 id | 터미널 |
| `SessionMode` | `modes` | 단일 | 터미널, Desktop |
| `PromptHint` | `isDraft`, `isWorking`, `hint` | 단일 | 터미널, Desktop |

- `e.viewport`: `columns`, `rows`, `isFullscreen`. 터미널/Desktop에선 측정 전 없음, `rows`는 창이 아닌 전체 윈도우 높이. VS Code는 항상 있음.
- 너비는 `e.props.bodyColumns`에 맞춘다.
- `placement: 'dock'`: `e.props.scroll.bodyRows`가 높이. `placement: 'inline'`: 트리에 맞춰 `bodyRows` 한도까지 성장 (`$.ui.open`의 `rows`로 변경).
- 창보다 높은 트리는 전체가 하나로 스크롤.

## 8. 요소

| 요소 | 주요 prop | 터미널 | Desktop | VS Code |
| :- | :- | :-: | :-: | :-: |
| `Box` | `key`, flex, `gap`/`padding`/`margin`, `width`, `height`, `minWidth`, `minHeight`, `borderStyle`, `borderColor`, `borderDimColor`, `backgroundColor`, `position`, `top`/`left`/`right`/`bottom`, `overflow`, `display`, `hover` | O | O | O |
| `Text` | `color`, `backgroundColor`, `bold`, `italic`, `underline`, `strikethrough`, `dimColor`, `inverse`, `wrap`, `size`, `weight`, `mono`, `tabular`, `hover` | O | O | O |
| `Button` | `key`, `label`, `children`, `onPress`, `hotkey`, `plain`, `dimColor`, `autoFocus`, `action`, `variant`, `role`, `hover` | O | O | O |
| `Link` | `href`, `label` | O | O | O |
| `Code` | `source`, `language`, `path`, `startLine`, `format`, `wrap` | O | O | O |
| `Markdown` | `text`, `key`, `dimColor`, `onLinkPress`, `pressableLinks` | O | O | O |
| `Input` | `key`, `label`, `placeholder`, `value`, `submitLabel`, `rows`, `onSubmit`, `onInput`, `autoFocus` | O | O | O |
| `Select` | `key`, `label`, `options`, `value`, `onSelect`, `autoFocus` | O | O | O |
| `Svg` | `source`(최대 131,072자), `alt`, `width`, `height`, `isInteractive` | | O | O |
| `Client` | `module`, `key`, `props`, `width`, `height`, `flexGrow` | O | O | |
| `Raster` | `key`, `columns`(최대 512), `rows`(최대 256), `cells` | O | | |
| `Image` | `key`, `source`(PNG/RGBA 최대 2 MiB 또는 파일 경로), `columns`/`rows`(각 최대 255), `alt` | O | | |

`Button` 규칙:

- `action`: Claude Code 키보드 단축키 액션 지정. 사용자 바인딩이 chord 또는 수정자 조합일 때 버튼을 누름.
- band의 숫자 `hotkey`는 빈 프롬프트에 숫자만 입력하고 멈춰도 실행.
- 접힌 band에선 `action`과 단축키 모두 동작 안 함.
- 같은 `hotkey`를 두 버튼이 쓰면 나중 버튼이 가져감.
- `variant`: `primary` 또는 `secondary`만 (그 외 오류). `role`: `dismiss`만 (그 외 오류, 닫기는 `onPress`에서 직접).
- `children`: 문자열과 `Text`만 허용 (v2.1.295+). 단일 문자열이 아니면 `key` 또는 `label` 지정. Desktop/VS Code는 `label`을 그림.
- `autoFocus`는 `true`만 허용. 끄려면 prop 생략.

VS Code가 무시하는 prop: `Box`의 `position`/`top`/`left`/`right`/`bottom`/`alignSelf`/`borderDimColor`/`hover`, `Text`의 `size`/`mono`/`tabular`/`hover`, `Button`의 `hotkey`/`plain`/`autoFocus`/`action`/`hover`/`variant`/`role`, `Code`의 `language`/`path`/`startLine`/`format`/`wrap`, `Input`/`Select`의 `autoFocus`와 `Input`의 `rows`, `Svg`의 `isInteractive`.

### `borderStyle`

`'single'`, `'double'`, `'round'`, `'bold'`, `'singleDouble'`, `'doubleSingle'`, `'classic'`, `'arrow'`, `'dashed'`, `'quote'`. 그 외 이름(예: `'rounded'`)은 테두리 없이 그려진다.

### 간격 단계 (v2.1.299+)

| 단계 | 가로 셀 | 세로 셀 |
| :- | :- | :- |
| `'xs'` | 1 | 0 |
| `'sm'` | 1 | 0 |
| `'md'` | 2 | 1 |
| `'lg'` | 3 | 1 |
| `'xl'` | 4 | 2 |

적용 prop: `gap`, `columnGap`, `rowGap`, `padding`, `margin`, 한쪽/한 축 형태(`paddingX`, `marginTop` 등). 이전 릴리스에선 단계 이름을 쓴 트리가 그려지지 않는다.

### `Text` 타이포그래피 (v2.1.299+)

| Prop | 값 | 터미널 | VS Code |
| :- | :- | :- | :- |
| `size` | `'caption'`, `'footnote'`, `'body'`, `'heading'`, `'title'` | 무시 | 무시 |
| `weight` | `'regular'`, `'medium'`, `'semibold'`, `'bold'` | `semibold`/`bold`는 굵게 | 같음 |
| `mono` | `true` | 무시 | 무시 |
| `tabular` | `true` | 무시 | 무시 |

`bold`는 deprecated (작동은 함). `bold: true`를 `weight: 'semibold'`로 바꾼다. 둘 다 설정하면 `bold`는 효과 없음. v2.1.299 이전에는 `weight` 등을 설정한 트리가 그려지지 않는다.

## 9. 제한

| 제한 | 값 |
| :- | :- |
| 훅 자체 실행 시간 (`next` 내부, `$.clock.sleep` 외 API 호출 시간 제외) | 10초, `prompt.edit`는 50밀리초 |
| `.catch` 핸들러 | 1초 |
| 모든 `session.end` 훅 합계 | SessionEnd 훅 예산 (기본 1.5초), 설정의 `SessionEnd` 훅 완료 시점부터 |
| `$.process.run` 타임아웃 | 기본 30초, 최대 10분 |
| `$.process.run` `stdout`/`stderr` | 각 4 MiB (`isStdoutTruncated`/`isStderrTruncated`) |
| `$.model.complete` `maxTokens` | 기본 1024, 최대 64,000 또는 모델 출력 한도 |
| `$.fs.read` / `$.fs.write` | 파일당 4 MiB |
| `$.http.fetch` 요청 본문 | 4 MiB (문자 수). 초과 시 거부 |
| `$.http.fetch` 응답 본문 | 4 MiB. `Content-Length`가 더 크면 거부 (`is over the 4194304-byte limit`), 최종 `HEAD`는 예외 (v2.1.296+) |
| `$.http.fetch` 호출 하나 | 30초, 리디렉션 5회 |
| `drop` / `config.set` `deny` 사유 | 4,096자 (초과분 잘림, v2.1.292+) |
| 트리 텍스트 | 처음 100,000자까지 그림 |
| `Code`의 `language`/`path`, `Select` 옵션 `value`, `Client` `module` | 10,000자 (초과 시 훅 실패) |
| `Link` `href` | 2,048자 (초과 시 훅 실패) |
| 트리 중첩 깊이 | 루트 아래 32단계 |
| 트리의 요소 + 텍스트 자식 | 20,000 |
| 트리의 `Raster` 셀 합 | 262,144 |
| 트리의 `Image` 바이트 합 | 2 MiB |
| `$.store` | JSON 총 4 MiB |
| `$.session.messages()` | 최신 4,096개 |
| `$.ui.invalidate('ui.render')` | 초당 10회 (터미널의 표시 중 창, 펼친 band, 힌트 줄은 초당 30회). 초과분 병합 |
| `$.ui.toast` | 기본 4초 (`timeoutMs`로 변경, 1 ~ 60000) |
| 사용자 요청 없이 열린 창 | 터미널 144열 이상일 때 배치, 사용자가 한 번 연 뒤엔 110열 이상 |
| API 호출 인수 / `next` 변경 이벤트 / 훅 반환값 중첩 | 28,000단계 (`nesting deeper than 28000 levels is not supported`, v2.1.299+) |
| 훅 모듈 한 파일 내 범위 중첩 | 2,000 |
| 명령, 도구, 서브에이전트 유형, 창 이름 | 문자, 숫자, `_`, `-`, 최대 64자 |
| `claude plugin test` 테스트 하나 | 5초 (`timeoutMs`로 변경) |

## 10. 설정 및 환경 변수

| 이름 | 위치 | 기능 |
| :- | :- | :- |
| `CLAUDE_CODE_PLUGIN_DIRS` | 환경 또는 `~/.claude/settings.json`의 `env` | `--plugin-dir`처럼 로드. 절대 경로를 `:`(Windows `;`)로 구분 |
| `CLAUDE_CODE_PLUGIN_DIR_WATCH` | 환경 | `1`이면 장시간 비대화형 세션이 저장 시 `--plugin-dir` mod 재로드 |
| `prependPlugins`, `appendPlugins` | 관리형 설정 (관리형 설정이 없고 Team/Enterprise `/login`이 아닐 때만 사용자 설정) | 플러그인 ID 목록. prepend는 사용자 mod보다 먼저, append는 이후 |
| `allowManagedModsOnly` | 관리형 설정 (기본 제공 가드 옵션) | 조직 mod와 내장 mod만 훅 실행. 사용자 설정 훅은 계속 실행 |
| `allowModsToOverrideDenyRules` | 관리형 설정 (기본 제공 가드 옵션) | 사용자 mod가 `deny` 규칙 거부 호출을 승인 가능 |
| `allowManagedHooksOnly` | 관리형 설정 | 조직 외 훅과 설치 mod 차단 |
| `disableAllHooks` | 모든 설정 파일 | 관리형이면 설치 플러그인 mod/훅 전부 중지. 사용자 설정이면 조직 관리 항목은 계속 실행 |
| `disableSideloadFlags` | 관리형 설정 | 시작 시 `--plugin-dir`, `--plugin-url` 거부 |
| `pluginConfigs` | 사용자 또는 관리형 설정 | `userConfig` 값. 키는 플러그인 ID 또는 `<name>@inline` |

기본 제공 가드 `sec-default@builtin` (`/plugin`과 로그에선 `cc-plugin-sec-default`): 관리형 설정이 있거나 Team/Enterprise `/login` 세션에서 모든 사용자 mod보다 먼저 로드. 관리형 `prependPlugins`가 있으면 그 목록에 이름이 있을 때만 그 위치에서 로드. 소스는 Claude Code 저장소 `mods/sec-default`.

## 11. 명령

| 명령 | 기능 |
| :- | :- |
| `/plugin` | 내장 외 mod가 로드되면 `1 mod active · first-mod` 같은 줄 표시 |
| `claude plugin validate <directory>` | 매니페스트와 훅 모듈을 읽어 오류, 처리 이벤트, mods API 호출 보고. `--strict`는 경고를 오류로, `--json`은 기계 판독 보고서 |
| `claude plugin test [directory]` | 디렉터리(생략 시 현재) 아래 `.test.ts`/`.test.tsx` 전부 실행. 실패 시 종료 코드 1 |
| `claude --plugin-dir <directory>` | 한 세션 동안 플러그인 디렉터리 로드, 저장마다 훅 모듈 재로드. 여러 개는 플래그 반복 |
| `/reload-plugins` | 플러그인 재로드 |

## 테스트 체크리스트

- [ ] 폴더에 `.claude-plugin/plugin.json`, `hooks/hooks.json`, 훅 모듈이 모두 있고 `hooks.json`의 `modules` 배열에 경로가 정확히 하나다.
- [ ] 훅 모듈이 `register(on, options)`를 export하는 ES 모듈이고 확장자가 허용 목록 안에 있다.
- [ ] `$.state`를 쓰면 `types/index.d.ts`(또는 매니페스트 `types` 경로)에 `PluginState`가 선언되어 있다.
- [ ] `claude plugin validate <dir> --strict`가 경고 없이 통과한다.
- [ ] `claude plugin validate <dir> --json` 출력의 이벤트 목록과 mods API 호출 목록이 코드와 일치한다 (오타 이벤트 없음).
- [ ] `userConfig` 필드의 기본값이 `register`의 `options`에 실제로 들어온다 (테스트 또는 `$.ui.log`로 확인).
- [ ] 텔레메트리 훅이 있다면 `{ to: 'collector' }` 필터가 있다 (없으면 `validate` 실패).
- [ ] 명령/도구/창 이름이 문자, 숫자, `_`, `-`만 쓰고 64자 이하다.
- [ ] `ui.render` 트리가 32단계, 20,000 요소 이하이고 모든 `Button`/`Input`/`Select`에 고유 문자열 `key`가 있다.
- [ ] `/clear` 후에도 필요한 값이 `classic.SessionStart` 훅으로 `$.store`에서 `$.state`로 복원된다.
- [ ] 각 `surface`(`terminal`, `desktop`, `vscode`)에서 쓰는 요소가 요소 표의 지원 범위 안이다 (`e.surface` 분기).
- [ ] `claude plugin test`가 통과하고 종료 코드 0이다.

## 주의/제약

- 이 페이지는 요약 참조다. 메서드 시그니처와 전체 필드는 설치 빌드에 맞게 생성된 TypeScript 선언을 신뢰한다.
- `e`는 깊게 동결되어 있다. 직접 수정하지 말고 사본을 `next`에 넘긴다. `skill.prompt`처럼 바꿀 수 있는 필드가 제한된 이벤트가 있다.
- `session.start`는 `/clear`, `/resume`, `/branch` 후에 다시 오지 않는다.
- `$.fs.write`는 원자적이지 않다. 다중 세션 데이터는 `$.store`(4 MiB 한도).
- `$.mcp.connect`는 자기 매니페스트에 나열된 서버에만 연결된다.
- `next.to`는 `prependPlugins`/`appendPlugins`의 mod만 쓸 수 있다.
- 훅 실행은 10초 (`prompt.edit`는 50ms), `.catch`는 1초 한도. 초과 시 건너뛰어진다.
- `variant`, `role`에 허용 외 값을 주면 오류. `autoFocus`는 `true`만.
- `borderStyle` 오타는 오류 없이 테두리만 사라진다. 조용한 실패에 주의.
- 간격 단계 이름, `Text` 타이포그래피 prop, `weight`는 v2.1.299 미만에서 트리 전체를 그리지 않게 만든다.
- VS Code는 여러 prop을 무시하고 `Client`, `Raster`, `Image`를 그리지 않는다. 터미널은 `Svg`를 그리지 않는다.
- 관리형 정책(`allowManagedModsOnly`, `allowManagedHooksOnly`, `disableAllHooks`, `disableSideloadFlags`)은 개발 환경에서도 mod를 막을 수 있다.
