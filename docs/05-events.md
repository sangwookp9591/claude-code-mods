# 05. 이벤트에 반응하기 (events)

원문: https://code.claude.com/docs/ko/plugins/mods/events (mod로 이벤트에 반응하기)

## 요약

- 훅 = 이벤트 핸들러. `on(eventName, handler)` 또는 `on(eventName, matcher, handler)`로 등록한다.
- 훅은 Claude Code가 작업을 수행하기 **전에** 실행되므로 관찰, 재작성, 직접 응답이 가능하다.
- 핸들러 시그니처: `($, e, next)`. `$` = mods API, `e` = 이벤트, `next` = 다음 핸들러.
- 같은 이벤트의 핸들러들은 **미들웨어 체인**. `next(e)`는 다음 mod의 훅 또는 체인 끝의 Claude Code 자체 동작을 호출하고, 그 결과로 resolve된다.
- 이 페이지가 다루지 않는 전체 이벤트와 필드는 `reference.md#events` 또는 빌드의 타입을 본다.

## `next`로 결정되는 세 가지 동작

| 동작 | 방법 | 효과 |
| :- | :- | :- |
| 관찰 (전) | 작업 후 `return next(e)` | 동작 변화 없음 |
| 관찰 (후) | `const r = await next(e)`; 작업; `return r` | 결과 확인 후 그대로 전달 |
| 재작성 | `next({ ...e, field })` 또는 `await next(e)` 후 결과 복사본 반환 | 이후 핸들러와 Claude Code는 수정본만 본다 |
| 직접 응답 | `next` 호출 없이 결과 반환 | 체인 단락(short-circuit). 이후 mod와 Claude Code 동작이 실행되지 않음 |

이벤트 `e`는 **깊게 동결(deeply frozen)**되어 있어 필드 할당 시 오류. 반드시 복사본을 만든다.

```javascript
on('tool.call', async ($, e, next) => {
  $.ui.log('Claude is about to use ' + e.tool)   // ● my-mod: Claude is about to use Bash
  return next(e)
})

on('prompt.submit', async ($, e, next) => next({ ...e, text: e.text.trim() }))

on('tool.call', { tool: 'Bash' }, async () => ({ deny: 'Bash is turned off in this project. Use the file tools.' }))
```

## matcher (필터)

`on`의 두 번째 인수. 객체의 모든 필드가 이벤트 필드와 일치할 때만 실행. 값은 단일 값, 배열(any), 정규식.

```javascript
on('tool.call', { tool: 'Bash' }, hook)
on('tool.call', { tool: ['Edit', 'Write'] }, hook)
on('tool.call', { tool: /^mcp__github__/ }, hook)
```

- 이벤트 이름 와일드카드: `'classic.*'`는 모든 설정 훅 이벤트, `'*'`는 텔레메트리 이벤트를 제외한 모든 이벤트. 텔레메트리 이벤트는 고유 이름과 `{ to: 'collector' }` 필터 사용.
- 각 이벤트는 **matcher당 한 번** 등록. matcher 없이 `session.start`를 두 번 등록하면 `on("session.start") is registered twice without a matcher` 오류로 모듈 로드 실패. 세션 시작 작업은 훅 하나에 모은다.

## 이벤트 표 (이 페이지에 등장하는 모든 이벤트)

| 이벤트 | 발생 시점 / 입력 `e` | 직접 응답 결과 | `next(e)`가 하는 일 / resolve 값 |
| :- | :- | :- | :- |
| `tool.call` | Claude Code가 도구를 실행하려 할 때(서브에이전트, MCP 도구 포함). `e.tool`, 인수는 `e`의 필드(Bash `e.command`, Edit/Write `e.file_path`) | `{ deny: reason }`(Claude가 도구 결과로 읽음), `{ result }`(도구 실행 없이 응답, 권한 프롬프트 없음) | 권한 검사 후 도구 실행. 결과(`deny`, `isError` 등 포함) 반환. 재호출 시 재시도. 완료 후 `{ deny }` 반환 시 결과를 Claude에게 숨김(작업은 되돌리지 않음, `Bash ran, and a plugin withheld its result:` 접두) |
| `tool.check` | 실행 가능 여부 결정 시점. `PreToolUse` 훅 후, 권한 프롬프트/자동 모드 분류기/`PermissionRequest` 훅 전. `e.input`(도구 인수), `e.isReadOnly`(v2.1.304+, 읽기 전용일 때만 `true`, 아니면 필드 없음) | `{ decision: 'allow' }`, `{ decision: 'deny', reason }`, `{ decision: 'ask', reason }` | Claude Code 자체 결정 `{ decision: 'allow' \| 'ask' \| 'deny' }`. 실행 중 권한 프롬프트 표시 안 됨 |
| `prompt.submit` | 턴 시작 전 각 프롬프트. `e.text`, `e.context` | `{ drop: 'the reason' }`(텍스트는 입력란으로 복귀, `Prompt dropped by a hook:` + 이유 표시) | 프롬프트 전송. `next({ ...e, text })`는 트랜스크립트/기록에도 반영, `next({ ...e, context: [...(e.context ?? []), extra] })`는 Claude만 읽는 텍스트 추가 |
| `prompt.section` | 시스템 프롬프트 각 섹션 | (레퍼런스 참조) | 섹션 텍스트. 요청마다 다르면 프롬프트 캐시 무효화 |
| `prompt.context` | 첫 메시지와 함께 전송되는 컨텍스트 | (레퍼런스 참조) | 동일, 캐시 주의 |
| `skill.prompt` | 스킬 텍스트. 스킬의 출처 플러그인/파일도 읽을 수 있음 | (레퍼런스 참조) | 동일, 캐시 주의 |
| `turn.start` | 턴 시작. `e.turnId` | 관찰만 | 다음 핸들러 |
| `turn.step` | 모델에 요청 하나를 보내려 할 때(도구 호출 턴은 여러 번). 서브에이전트면 `e.agentId` | 모델 호출 없이 응답 가능 | **async generator**로 작성, `yield* next(e)`가 스트림을 전달하고 완료 결과로 평가. 결과에 `usage`(`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`), `model`, `serverToolUses`(v2.1.290+). `next({ ...e, model })`로 모델 변경 |
| `turn.complete` | 턴 종료(중단 포함). `e.isAborted`, `e.answer`, `e.durationMs`, `e.usage`, 서브에이전트면 `e.agentId` | `{ text: 'Done in 12 seconds' }`로 답변 아래 한 줄 표시 | 다음 핸들러 |
| `settings.read` | mod의 `$.settings.read` 호출, 그리고 Claude Code 자체 설정 병합 시(v2.1.304+). `e.layers`(`{ source, settings }` 배열, 낮은 우선순위부터 `plugin`, `user`, `project`, `local`, `flag`, `policy`), `e.source`(mod가 한 소스를 요청한 경우) | `{ value }`, `{ deny: reason }` | `{ value }`(병합 설정 또는 한 소스) 또는 뒤 훅의 `{ deny }` |
| `classic.<Name>` (예: `classic.Stop`) | 설정 훅 이벤트(`Stop`, `SessionEnd`, `PostToolUse`, `PreToolUse` 등). `e`는 설정 훅이 stdin으로 받는 JSON(`transcript_path` 포함) | (레퍼런스 참조) | 설정 파일의 해당 훅 실행 |
| `session.start` | 세션 시작 | | 다음 핸들러 |
| `command.run` | 명령 실행. matcher `{ command }` | `{ text }`, `{}` | 다음 핸들러 |
| `ui.render` | 그리기. matcher `{ component: 'Pane' }` | 요소 트리 | 다음 핸들러. 트리 검증 실패 시 실패한 훅으로 취급 |
| `config.set` | 설정 변경 | `{ deny: 'the reason' }` | 다음 핸들러 |
| `plugin.register` | 플러그인 등록 | `{ refuse: 'the reason' }` | 다음 핸들러. 완료 후 거부도 유효 |

## 주요 패턴 코드 (발췌)

### 도구 호출 차단 / 사후 로그

```javascript
on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
  if (/git push .*--force/.test(e.command)) {
    return { deny: 'Force pushes are not allowed in this repository. Push to a new branch instead.' }
  }
  return next(e)
})

on('tool.call', { tool: ['Edit', 'Write'] }, async ($, e, next) => {
  const result = await next(e)
  const changed = !result.deny && !result.isError
  if (changed && e.file_path.endsWith('.mdx')) $.ui.log('Claude changed ' + e.file_path)
  return result
})
```

`deny` 텍스트는 Claude가 읽으므로 **Claude가 따를 수 있는 지시문**으로 쓴다.

### 사용자 결정까지 보류 (`$.ui.ask`)

```javascript
const RISKY = /\brm\s+-rf?\b|\bgit\s+reset\s+--hard\b|\bgit\s+push\b.*--force/
on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
  if (!RISKY.test(e.command)) return next(e)
  let answer = 'Refuse'
  try { answer = await $.ui.ask('Run this command? ' + e.command, ['Run it', 'Refuse']) } catch {}
  if (answer !== 'Run it') return { deny: 'The user declined this command. Ask before trying a different approach.' }
  return next(e)
})
```

- 대화 상자는 번호 옵션 + 다른 답변 입력 행 + **Chat about this** 행을 추가한다.
- 직접 입력 시 입력 텍스트로 resolve. 닫기, **Chat about this**, `claude -p`에서는 reject.
- `$.ui.ask` 같은 mods API 호출 안의 대기 시간은 훅 시간 제한에 포함되지 않는다. 직접 만든 promise 대기는 포함된다.

### 브랜치 기반 권한 (`tool.check`)

```javascript
on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
  const decided = await next(e)
  if (!e.input.command.includes('git push')) return decided
  const branch = await $.process.run(['git', 'branch', '--show-current'])
  if (branch.stdout.trim() !== 'main') return decided
  return { decision: 'deny', reason: 'Push from a branch other than main' }
})

on('tool.check', { tool: /^mcp__github__/ }, async ($, e, next) => {
  const decided = await next(e)
  if (e.isReadOnly || decided.decision === 'deny') return decided
  return { decision: 'ask', reason: 'This tool can change the GitHub repository' }
})
```

읽기 전용 필터: 읽기 전용만 처리하려면 matcher에 `isReadOnly: true`. 비읽기 전용은 본문에서 `e.isReadOnly` 검사(`isReadOnly: false` matcher는 실행되지 않음).

### 프롬프트에 컨텍스트 추가

```javascript
on('prompt.submit', async ($, e, next) => {
  if (!/\bPR\b|pull request/i.test(e.text)) return next(e)
  const git = await $.process.run(['git', 'branch', '--show-current'])
  if (git.exitCode !== 0) return next(e)
  return next({ ...e, context: [...(e.context ?? []), 'Current branch: ' + git.stdout.trim()] })
})
```

### 턴 단계 토큰 로그 (generator)

```javascript
on('turn.step', async function* ($, e, next) {
  const result = yield* next(e)
  if (result.usage) $.ui.log('cache read ' + result.usage.cache_read_input_tokens + ' · wrote ' + result.usage.cache_creation_input_tokens)
  return result
})
```

모델 변경: `yield* next({ ...e, model: 'haiku' })`. 별칭이 모델 오류로 실패하면 v2.1.309 이상으로 업데이트하거나 전체 모델 ID 사용.

### 설정 키 하나 변경

```javascript
on('settings.read', async ($, e, next) => {
  const read = await next(e)
  if (e.source || !read.value) return read
  return { value: { ...read.value, spinnerTipsEnabled: false } }
})
```

### 설정 훅 이벤트

```javascript
on('classic.Stop', async ($, e, next) => {
  $.ui.log('Transcript saved at ' + e.transcript_path)
  return next(e)
})
```

## `settings.read` 세부

- 출처 구분: `next.origin`. Claude Code 자체 읽기는 `{ plugin: 'engine', tier: 'core' }`, mod 읽기는 `plugin`이 호출한 mod 이름.
- `{ value }` 반환:
  - Claude Code 자체 읽기: 변경된 키마다 스키마에 맞으면 병합 설정의 키 값 전체를 교체. **생략한 키는 설정 해제**되므로 `next(e)`의 `value`를 spread해서 구성.
  - mod 읽기: 해당 mod 호출이 `value`(또는 요청한 `key`)로 resolve. 배열이 아닌 전체 객체 반환.
- `{ deny: reason }` 반환:
  - Claude Code 자체 읽기: 훅 응답 전의 병합 설정 유지, 디버그 로그에 `reason`.
  - mod 읽기: `<calling mod>: $.settings.read: <reason>`으로 reject.
- 스키마 불일치 값: 해당 키만 이전 값 유지, 디버그 로그 `the answer for <key> is no value the key can hold`.
- `env`처럼 소스별로 따로 읽는 키는 `value`에서 바꿔도 효과 없음.
- `e.layers`의 `plugin`은 레이어 이름일 뿐 `$.settings.read`의 `source`로 쓸 수 없다. `claude plugin test`에서는 `e.layers`가 비어 있다.

## 다른 mod와의 실행 순서

첫 mod가 가장 바깥쪽(먼저 보고, 나중에 결과를 봄, 뒤 mod 실행 여부 결정). 뒤 mod는 앞 mod가 보는 것을 막을 수 없다.

1. 기본 제공 가드 `sec-default@builtin`(로드 시, `/plugin`에서 `cc-plugin-sec-default`), 조직 `prependPlugins`, 조직 mod로 간주되며 `appendPlugins`에 없는 mod
2. 사용자가 설치한 mod (매니페스트 `dependencies`에 나열한 mod보다 먼저 실행)
3. 조직 `appendPlugins`
4. 그 밖의 Claude Code 내장 mod

한 모듈 안에서는 `register`가 `on`을 호출한 순서.

`PreToolUse` 설정 훅 위치:

- 관리형 설정의 `PreToolUse`: 첫 mod의 `tool.call`보다 먼저. 차단 시 어떤 mod의 `tool.call`도 실행 안 됨.
- 그 밖의 설정 파일과 플러그인 `hooks/hooks.json`의 `PreToolUse`: 마지막 mod가 `next`를 호출한 뒤 Claude Code 동작의 일부로 실행. `next` 없이 응답하면 이 훅은 실행 안 됨.
- `tool.check`는 `PreToolUse` 이후.

## 실패한 훅 처리

`.catch` 없이 예외/시간 초과/잘못된 형태의 결과:

- `next` 호출 **전** 실패: 훅을 건너뛰고 다음 핸들러 실행 (즉 fail open)
- `next` 완료 **후** 실패: 결과 유지, 재실행 없음
- 로그 예: `my-mod: tool.call hook skipped: threw Error: boom`

fail closed로 만들기:

```javascript
on('tool.call', { tool: 'Bash' }, guard).catch(async ($, e, next) => {
  if (next.called) return next(e)
  return { deny: 'The command guard failed, so this command was not run: ' + next.error.kind }
})
```

- `next.called`: 실패 시점에 이미 `next`를 호출했는지. `next.error.kind`: `'throw'`, `'timeout'` 등.
- `next.called`가 true면 핸들러의 `next(e)`는 재실행 없이 기존 결과로 완료.
- 핸들러는 더 짧은 시간 제한. 핸들러도 실패하면 핸들러가 없는 것처럼 건너뜀.
- 이벤트별 거부 반환: `prompt.submit` → `{ drop }`, `config.set` → `{ deny }`, `tool.check` → `{ decision: 'deny', reason }`, `plugin.register` → `{ refuse }`. `tool.check`와 `plugin.register`는 `next` 완료 후 거부도 유효하므로 `next.called` 검사 불필요.

## 주의/제약

- `e`는 deeply frozen. 할당하지 말고 spread 복사.
- matcher 없는 동일 이벤트 중복 등록은 모듈 로드 실패.
- 훅 실패/시간 초과 기본 동작은 **fail open**(차단 의도가 무시됨). 가드 훅에는 `.catch` 필수.
- `$.ui.ask`는 `claude -p`에서 reject. 기본 답을 안전한 값으로 시작할 것.
- `tool.check`의 명령 텍스트 대조는 알림 수준. 진짜 보호는 Git 호스트의 브랜치 보호 등으로.
- 플랜 모드에서 읽기 전용이 아닌 호출은 `tool.check`가 결정을 더 엄격하게만 할 수 있고 완화는 못 한다. 일부 권한 규칙과 `PreToolUse` 결정은 `allow`로 대체 불가.
- `e.isReadOnly`는 도구 자체 보고. WebFetch, Agent도 읽기 전용으로 보고되므로 이것만으로 승인 금지.
- `prompt.submit`에서 `next(e)` 통과 후 `drop` 반환은 실패(`a drop after its next() was answered`), 턴은 그대로 진행.
- `prompt.section`, `prompt.context`, `skill.prompt` 텍스트가 요청마다 달라지면 프롬프트 캐시 무효화.
- `turn.step`, `turn.complete`는 서브에이전트에서도 발생. 메인만 원하면 `e.agentId` 확인.
- `serverToolUses`의 서버 도구 호출(예: advisor)은 `tool.call`/`tool.check`를 발생시키지 않는다.
- 관리형 설정이나 Team/Enterprise `/login` 환경에서 기본 제공 가드가 설치/`--plugin-dir` mod의 `settings.read` 훅을 건너뛸 수 있다(디버그 로그 `settings.read bypassed by cc-plugin-sec-default`). 가드가 로드되면 설치한 mod의 `classic.*` 훅도 실행되지 않는다.
- 수신 거부 설정 등 다른 문서 사항은 06-api.md 참조.

## 테스트 체크리스트

- [ ] `tool.call` 관찰(전): Bash 실행 전 `● <mod>: Claude is about to use Bash` 흐린 줄.
- [ ] `tool.call` 관찰(후): 도구 완료 후 `<tool> finished` 줄. Claude가 받는 결과가 동일한지 확인.
- [ ] `e.command = 'x'` 할당 시 오류 발생(deeply frozen) 확인.
- [ ] `prompt.submit` trim: 앞뒤 공백 있는 프롬프트가 트랜스크립트에 trim되어 표시.
- [ ] `prompt.submit` context: "PR" 포함 프롬프트에 Claude가 `Current branch:` 내용을 언급하는지(트랜스크립트에는 안 보임).
- [ ] `prompt.submit` drop: 입력란으로 텍스트 복귀 + `Prompt dropped by a hook:` 표시.
- [ ] `tool.call` deny: Bash 금지 시 Claude가 deny 텍스트를 읽고 파일 도구로 전환.
- [ ] `tool.call` `{ result }`: 도구를 실행하지 않고 가짜 결과를 Claude가 읽는다(권한 프롬프트 없음).
- [ ] `tool.call` 재시도: `isError` 시 `next(e)` 재호출로 두 번 실행됨을 로그로 확인.
- [ ] `tool.call` 사후 `{ deny }`: 도구는 실행됐지만 Claude가 `Bash ran, and a plugin withheld its result:` 텍스트를 읽음.
- [ ] matcher 3종(문자열, 배열, 정규식) 각각 해당 도구에서만 실행, Read에서는 미실행.
- [ ] matcher 없는 `session.start` 두 번 등록 시 `registered twice without a matcher` 로드 실패.
- [ ] `'*'` 와일드카드 훅으로 발생하는 모든 이벤트 이름을 로그로 수집(이벤트 탐색용).
- [ ] `$.ui.ask`: `rm -rf build` 시도 시 대화 상자 + Chat about this 행. Run it/Refuse/직접 입력/닫기 4경로 동작. `claude -p`에서 reject로 Refuse 처리.
- [ ] `tool.check`: main 브랜치에서 `git push` deny, 다른 브랜치에서 통과.
- [ ] `tool.check` `e.isReadOnly`: `ls` Bash는 `true`, `rm`은 필드 없음. matcher `isReadOnly: true`만 실행, `false`는 미실행.
- [ ] `turn.start`/`turn.complete`: `turnId` 일치, `durationMs`, `usage`, Esc 중단 시 `isAborted: true`. `{ text }` 반환 시 답변 아래 한 줄.
- [ ] `turn.step` generator: 스트리밍 유지 + 요청마다 cache read/wrote 로그. 도구 호출 턴에서 여러 줄.
- [ ] `turn.step` 모델 변경: `model: 'haiku'`로 보낸 뒤 `result.usage`/`result.model`로 확인.
- [ ] `settings.read`: `spinnerTipsEnabled: false` 적용으로 스피너 팁 사라짐. `next.origin`으로 engine/mod 구분 로그.
- [ ] `settings.read` 스키마 불일치 값 반환 시 디버그 로그 메시지 확인.
- [ ] `classic.Stop`: 응답마다 `transcript_path` 로그.
- [ ] 실패 처리: 훅에서 `throw` 시 `hook skipped: threw` 로그 + 동작 그대로(fail open). `.catch` 추가 후 deny + `next.error.kind`가 `throw`/`timeout`.
- [ ] 순서: 한 모듈에 `tool.call` 훅 둘을 등록하고 로그 순서로 바깥쪽/안쪽 실행 확인.
