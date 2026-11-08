# 06. mods API 사용하기 (api)

원문: https://code.claude.com/docs/ko/plugins/mods/api (mods API 사용하기)

## 요약

- mods API = 모든 훅이 첫 인수 `$`로 받는 메서드 집합. `$.ui`, `$.fs` 같은 네임스페이스로 그룹화.
- 이벤트는 훅이 **언제** 실행되는지, API는 훅이 **무엇을** 호출하는지 결정한다.
- 모든 `$` 호출은 그 자체로 이벤트다. 이름은 `$.`를 뺀 네임스페이스.메서드(예: `$.fs.read` → `fs.read`). 체인 앞쪽 mod가 관찰/재작성/거부할 수 있고, 조직은 이 방식으로 mod 접근 범위를 제한한다.
- 전체 메서드는 `reference.md#mods-api-methods` 또는 빌드의 타입 참조.

## `$` 네임스페이스와 메서드 표 (이 페이지에 등장하는 모든 것)

| 네임스페이스 | 메서드 | 설명 |
| :- | :- | :- |
| `$.command` | `register({ name, description, argumentHint, immediate })` | 사용자용 슬래시 명령 등록(`session.start`에서). 내장 명령 이름과 충돌 시 예외(`"/focus" refused: it is the built-in /focus`) |
| `$.command` | `run` | 명령 실행. 중단 후/대기열 삭제 시 reject |
| `$.tool` | `register({ name, description, inputSchema, isDeferred })` | Claude용 도구 등록. 전체 이름 `mcp__<plugin>__<name>`. `isDeferred: false`는 v2.1.293+ |
| `$.tool` | `call` | 도구 실행. Bash/Monitor/CronCreate의 `run_in_background: true`는 중단 후 `{ deny }` |
| `$.model` | `complete({ model, prompt, system, maxTokens, timeoutMs, effort })` | 단독 프롬프트. 결과 `isAnswered`, `text`, `reason`, `usage` |
| `$.model` | `fork({ prompt })` | 현재 대화 끝에 프롬프트를 붙여 세션 모델로 요청 |
| `$.clock` | `every(ms, fn)`, `after(ms, fn)` | `setInterval`/`setTimeout` 대체. `cancel()` 있는 타이머 반환 |
| `$.clock` | `now()` | 현재 시간(ms), `await` 필요 |
| `$.clock` | `sleep` | 대기. 이 시간은 훅 시간 제한에 **포함**됨 |
| `$.ui` | `status(text)` | 프롬프트 아래 유지되는 한 줄 `⚠ my-mod: ...` |
| `$.ui` | `toast(text)` | 몇 초 후 사라지는 토스트 |
| `$.ui` | `log(text)` | 트랜스크립트의 흐린 줄 `● my-mod: ...`, Claude는 읽지 않음 |
| `$.ui` | `notify(text)` | 터미널 외부 알림. 비어 있지 않은 `{ title }`을 전달 가능(정확한 시그니처는 빌드 타입 참조). `{ isSent, channel }` 또는 `{ isSent: false, reason }` |
| `$.ui` | `ask(question, options)` | 질문 대화 상자, 선택 레이블로 resolve (05-events.md) |
| `$.ui` | `open({ id, focus, closeOnEscape })`, `resolve(e)` | 창 열기, 요소 팩토리 획득 (04-gallery.md) |
| `$.prompt` | `submit({ text, asUser })` | 세션 유휴 시 새 턴 시작. 턴 시작 시 resolve |
| `$.session` | `send({ to, text })` | 다른 세션/서브에이전트/팀원에게 메시지. `{ isDelivered, reason }` |
| `$.session` | `messages()` | 트랜스크립트 `{ role, text, toolUses }` 목록 |
| `$.session` | `usage()` | 컨텍스트 윈도우 사용량, 플랜 한도 |
| `$.session` | (기타) | 작업 디렉터리, 모델 등 제공 |
| `$.agent` | `list()`, `spawn` | 서브에이전트/팀원 id 조회, 서브에이전트 생성(중단 후 `{ deny }`) |
| `$.fs` | `read(path)`, `write(path, text)`, `exists(path)`, `stat(path)`, `list(path)` | 파일/디렉터리. `list`는 `{ name, kind, size, isLink }`, 비재귀 |
| `$.process` | `run([...args])` | 셸 없이 실행, `{ exitCode, stdout, stderr }`. 기본 타임아웃 30초 |
| `$.process` | `spawn` | 장시간 명령 출력 스트리밍 |
| `$.http` | `fetch(url, init)` | http/https. `{ status, ok, headers, text }` |
| `$.store` | (키-값) | 플러그인 전용 JSON 저장소, 세션 간 유지 |
| `$.env` | `get`, `set` | 환경 변수. 이름은 문자열 리터럴로 |
| `$.settings` | `read()`, `read({ source })`, `read({ key })`, `read({ key, source })` | 병합 설정 / 한 소스 / 한 키 |
| `$.mcp` | `call` | 연결된 MCP 서버의 도구 호출 |

훅 모듈 환경: Node.js API 없음, `setTimeout` 같은 타이머 전역 없음, 자체 네트워크/파일 접근 없음. `URL`, `TextEncoder`, `AbortController`, `crypto.subtle` 등 표준 JS/웹 API는 사용 가능. 권한은 Claude Code를 실행한 사용자와 동일.

## 명령 추가

```javascript
on('session.start', async ($, e, next) => {
  await $.command.register({ name: 'standup', description: 'Summarize what changed today', argumentHint: '[days]' })
  return next(e)
})
on('command.run', { command: 'standup' }, async ($, e) => {
  return { text: 'Summary for the last ' + (e.args || '1') + ' day(s): ...' }
})
```

- `session.start` 훅은 첫 프롬프트 전에 완료를 기다리므로 첫 턴부터 사용 가능.
- `e.args`: 명령 뒤 텍스트 또는 빈 문자열.
- 반환 `text`는 트랜스크립트에 출력되고 **Claude가 읽는다**. 아무것도 출력하지 않으려면 `{}`.
- `immediate: true`: Claude 작업 중에도 실행 가능.
- 등록 예외는 훅을 건너뛰게 하므로, 명령 등록은 훅 마지막에 두거나 `try`/`catch`.

## 도구 추가

```javascript
on('session.start', async ($, e, next) => {
  await $.tool.register({
    name: 'ticket',
    description: 'Look up a ticket by its id and return its title and status',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  })
  return next(e)
})
on('tool.call', { tool: 'mcp__my-mod__ticket' }, async ($, e) => {
  const response = await $.http.fetch('https://tickets.example.com/api/' + encodeURIComponent(e.id))
  return { result: response.ok ? response.text : 'Lookup failed with status ' + response.status }
})
```

MCP 도구 검색이 도구를 지연 로드하면 Claude는 검색 전까지 이름만 본다. 매 턴 고려해야 하면 `isDeferred: false`.

## 모델 호출

| 포함 항목 | `$.model.complete` | `$.model.fork` |
| :- | :- | :- |
| 모델 | 전달한 `model` | 세션의 모델 |
| 시스템 프롬프트 | 짧은 attribution 블록 + `system` | 세션의 시스템 프롬프트 |
| 메시지 | `prompt` 사용자 메시지 하나 | 지금까지의 대화 + `prompt` |
| CLAUDE.md 등 프로젝트 컨텍스트 | 없음 | 마지막 요청과 동일하게 포함 |
| 도구 | 없음 | Claude의 도구(모델이 호출할 수는 없음) |

- fork는 마지막 요청을 반복하므로 캐시가 살아 있는 동안 대부분 프롬프트 캐시로 처리.
- 둘 다 세션 자격 증명 사용(사용자 플랜/API 키/클라우드 제공업체로 청구).

```javascript
on('command.run', { command: 'triage' }, async ($, e) => {
  const r = await $.model.complete({
    model: 'haiku',
    system: 'Reply with one word: bug, feature, or question.',
    prompt: e.args,
    maxTokens: 20,
    timeoutMs: 15000,
  })
  const label = r.isAnswered ? r.text.trim() : 'unknown'
  return { text: 'Label: ' + label }
})
```

- Claude API 오류는 reject하지 않는다. `r.isAnswered` 확인, `false`면 `r.reason`.
- 조직이 차단한 모델처럼 Claude Code가 보내지 않는 요청은 reject.

### 프롬프트 캐싱

```javascript
prompt: [
  { text: RULES, cache: true },  // 정적, 캐시 프리픽스
  { text: e.args },              // 가변, 브레이크포인트 뒤
]
```

- `cache: true` 블록은 API `cache_control`로 전송. `system`도 같은 배열 형식 가능.
- 블록 배열은 v2.1.292+. 이전 버전은 `prompt` 배열을 `takes { model, prompt } (host check)` 오류로 거부, `system` 배열은 제외.
- TTL: 마지막 사용 후 5분. 호출이 아닌 사용자 설정으로 결정, `subagentPromptCacheTtl`을 `1h`로.
- 요청당 브레이크포인트 최대 4개, 초과 시 `r.reason`에 `api-error`.
- `prompt` vs `system`: API 직접 전송이면 어느 쪽이든. Bedrock, Claude Platform on AWS, Google Cloud's Agent Platform, Microsoft Foundry, LLM 게이트웨이 경유거나 남이 실행하는 mod면 `prompt` 사용(attribution 블록 fingerprint 때문). `system`이 `prompt`보다 앞이므로 `system`이 다르면 캐시 미스.
- 캐시 확인: `usage.cache_creation_input_tokens`(기록), `usage.cache_read_input_tokens`(읽기). 둘 다 0이면 프리픽스가 최소 길이 미만, `DISABLE_PROMPT_CACHING`, 게이트웨이가 `cache_control` 제거, 다른 mod가 텍스트 시작 부분 재작성 중 하나.

### `model.complete` 훅이 받는 값

- `e.prompt`: 항상 문자열(배열이면 블록 텍스트 연결). `e.system`: 동일 방식, 없으면 부재.
- `e.promptBlocks`, `e.systemBlocks`: 호출자가 배열을 전달한 경우에만.
- `next({ ...e, prompt: e.prompt + NOTE })`는 브레이크포인트 유지, 시작 부분을 바꾸면 브레이크포인트 제거.

## 백그라운드 작업

```javascript
on('session.start', async ($, e, next) => {
  $.clock.every(60_000, async () => {
    const status = await $.process.run(['gh', 'pr', 'checks', '--json', 'state'])
    $.ui.status('checks: ' + summarize(status.stdout))
  })
  return next(e)   // 타이머를 기다리지 않음
})
```

- 훅 시간 제한은 자체 실행 시간 기준. `next`나 mod API 대기 시간은 `$.clock.sleep`을 제외하고 불포함.
- 타이머 콜백은 이벤트에 속하지 않으며 턴 사이에도 실행, 턴을 시작하지 않음. 오류는 디버그 로그, 다음 간격에 재실행.
- 타이머는 모듈 리로드 시 중지. 훅 내부 장시간 작업에는 `next.signal`(`AbortSignal`)을 전달.

### 턴 없이 표시하기

| 호출 | 표시 |
| :- | :- |
| `$.ui.status(text)` | 프롬프트 아래 유지 줄, `⚠ my-mod: checks: 3 passing` |
| `$.ui.toast(text)` | 수 초 후 사라짐. 전체 화면: 오른쪽 상단 상자, 클래식: 프롬프트 아래 오른쪽 한 줄 |
| `$.ui.log(text)` | `● my-mod: build finished`, Claude는 읽지 않음 |
| `$.ui.notify(text)` | `preferredNotifChannel`에 따른 터미널 외부 알림. 제목 기본값은 mod 이름 |

VS Code 확장: 상태줄과 토스트는 프롬프트 상자 위, 로그 줄은 대화에 표시.

`$.ui.notify` 결과: `{ isSent: true, channel }`(`kitty`, `terminal_bell` 등. `terminal_bell`은 텍스트 없이 벨만). 실패 `reason`:

| `reason` | 의미 |
| :- | :- |
| `disabled` | `preferredNotifChannel`이 `notifications_disabled` |
| `no-channel` | `auto`인데 터미널에 보낼 알림 수단 없음 |
| `no-surface` | 터미널 없음(`-p`, Agent SDK, 데스크톱 앱, VS Code 확장, 클라우드 세션), 로드 중 또는 종료 중 호출 |
| `refused` | 다른 mod의 `ui.notify` 훅이 대신 응답하고 보내지 않음 |

`text`가 문자열이 아니거나, 다른 mod 훅이 `{ deny }`, 터미널 쓰기 실패면 reject. 빈도 제한 없음, mod가 채널을 고를 수 없음. 실행 중 세션에 도달하면 사용자 `Notification` 훅이 `plugin_notification` 유형으로 실행(호출한 mod의 훅은 제외). `isSent: true`는 전송일 뿐 사용자가 봤다는 뜻이 아님.

```javascript
on('turn.complete', ($, e, next) => {
  const isMainTurn = e.agentId === undefined && !e.isAborted
  const fallBack = () => $.ui.toast('Turn finished')
  if (isMainTurn) {
    $.ui.notify('Turn finished').then(sent => {
      if (!(sent.isSent && sent.channel !== 'terminal_bell')) fallBack()
    }, fallBack)
  }
  return next(e)
})
```

### 백그라운드에서 턴 시작

`$.prompt.submit({ text })`: Claude는 mod를 발신자로 명시하는 문장 뒤의 텍스트를 읽는다. `asUser: true`면 그 문장 없이 사용자 말로. 세션 유휴까지 기다렸다가 턴 시작 시 resolve되므로 Claude 작업 중 실행되는 핸들러에서 `await`하지 말 것.

## 중단(Esc/Stop) 후 동작

사유 문자열 `the session was stopped and nobody has sent input since`: 사용자의 다음 입력까지 새 작업을 시작하는 호출이 거부된다(`$.prompt.submit`, `$.command.run` 외 처리는 v2.1.304+).

| 거부되는 호출 | 결과 |
| :- | :- |
| `$.prompt.submit` | `{ drop: '<reason>' }`, 대기열에 넣지 않음 |
| `$.command.run` | `<reason>`으로 끝나는 오류로 reject |
| `$.agent.spawn` | `{ deny: '<reason>' }` |
| 완료된 서브에이전트에 `$.session.send` | `{ isDelivered: false, reason: 'Agent "<id>" was not resumed: <reason>.' }` (실행 중 서브에이전트는 받음) |
| 에이전트 팀 팀원에 `$.session.send` | `{ isDelivered: false, reason: 'Teammate "<name>" was not messaged: <reason>.' }` |
| Bash/Monitor/CronCreate `run_in_background: true`의 `$.tool.call` | `{ deny: '<tool> was not run: it starts background work, a schedule or a goal, and <reason>' }` |

중단 전에 시작된 작업:

| 작업 | 다음 입력 전까지 | 조치 |
| :- | :- | :- |
| 대기 중 `$.prompt.submit` | 삭제, `{ drop: 'the prompt was removed from the queue before it ran' }` | 재제출 |
| 대기 중 `$.command.run` | 삭제, `the command was removed from the queue before it ran` reject | 재실행 |
| CronCreate 등 일회성 예약 | 입력 이후 실행 | 불필요 |
| 반복 예약 | 해당 실행 건너뜀, 일정 유지 | 불필요 |
| mod가 시작한 모니터 이벤트 | 모니터 계속, 이벤트 삭제(종료 알림만 입력 후 전달) | 없음 |
| `$.session.send`로 재개한 서브에이전트 완료 | 완료 알림 대기 후 입력 이후 전달 | 불필요 |
| `$.tool.call` 포그라운드 Bash/PowerShell 타임아웃 | 백그라운드 이동 대신 중지, `isError`, 출력에 `Ended instead of moving to the background: plugins' input is held, by a Stop or by the host's limits.` | 입력 후 재실행 |

재시도 패턴 (`register` 바깥에 상태와 함수, `turn.complete` 훅은 안에. 검증이 `register` 내부 함수에 전달된 `$`를 거부하기 때문):

```javascript
let pendingText = null
async function submitPrompt($, text) {
  let reason
  try { const result = await $.prompt.submit({ text }); reason = result?.drop ?? '' }
  catch (error) { reason = String(error?.message ?? error) }
  if (reason.includes('the session was stopped and nobody has sent input since') ||
      reason.includes('was removed from the queue before it ran')) pendingText = text
}
on('turn.complete', async ($, e, next) => {
  if (pendingText !== null) { const text = pendingText; pendingText = null; submitPrompt($, text) }
  return next(e)
})
```

## `claude -p` / Agent SDK에서 거부되는 사유

| `<reason>` | 대처 |
| :- | :- |
| `the run reached its --max-turns limit` | mod 프롬프트와 mod가 만든 서브에이전트 턴도 포함됨. 제한을 높이거나 호출 중지. 새 프롬프트를 받으면 초기화 |
| `the run is past its --max-budget-usd limit` | 총비용 누적, 재시도해도 동일. 제한을 높이거나 호출 중지 |
| `the host has ended its input` | 스트리밍 입력 종료 또는 `--input-format stream-json` stdin 닫힘. 재시도 무의미 |
| `the session was stopped and nobody has sent input since` | SDK `interrupt()` 등. 다음 메시지 후 재시도 |

매 턴 끝에 프롬프트를 제출하는 mod는 `claude -p`를 끝나지 않게 만든다. `claude -p "find the TODOs" --max-turns 5`처럼 제한을 걸 것. v2.1.299부터 제한 도달 시 mod 프롬프트 거부, v2.1.304부터 서브에이전트 턴이 `--max-turns`에 포함.

## 세션 간 메시지

`$.session.send({ to, text })`, SendMessage 도구와 같은 방식으로 전달. `to`:

- 다른 세션: `{ sessionId }`
- 서브에이전트/팀원: `$.agent.list()`의 id로 `{ agentId }`
- 수신 메시지 발신자: 해당 메시지의 발신 문자열 주소

```javascript
on('command.run', { command: 'ping' }, async ($, e) => {
  const sent = await $.session.send({ to: { sessionId: e.args }, text: 'Status? One line.' })
  if (!sent.isDelivered) $.ui.toast('Not delivered: ' + sent.reason)
  return {}
})
```

| 이벤트 | 발생 시점 | 필드 / 결과 |
| :- | :- | :- |
| `session.receive` | Claude가 읽기 전 메시지 도착 | `e.text`, `e.origin.kind`(`peer`, `peer-send-message`, `task-notification`, `scheduled-trigger` 등). `{ consumed: reason }`으로 Claude 전달 차단 |
| `session.send` | SendMessage 도구나 mod에서 메시지가 나가려 할 때 | `e.to`, `e.text`, `e.origin.kind`(`model` 또는 `plugin`) |

수신 거부 설정 세션은 `session.receive` 전에 거부. 승인 대기 메시지는 먼저 훅에 도달(미승인 메시지를 읽을 수 있음). 전달 실패 시 훅의 `next(e)`는 reject. 발신자 이름은 위조 가능하므로 결정 근거로 쓰지 말 것.

## 파일, 프로세스, 네트워크 규칙

- 상대 경로: 세션 작업 디렉터리, 또는 이벤트를 발생시킨 서브에이전트의 작업 디렉터리 기준.
- `$.process.run`: 셸 없음, 종료 코드와 무관하게 resolve. 시작 불가 또는 타임아웃(기본 30초)이면 reject, `try`/`catch` 필수.
- `$.http.fetch`: 리디렉션 최대 5회. 다른 origin으로 가면 `accept`, `accept-language`, `content-type`, `user-agent`만 유지(`Authorization` 등 제거).
- `$.process.spawn`은 출력/종료 후에도 다른 mod가 거부할 수 있고 작업은 되돌려지지 않음. reject 메시지: `$.process.spawn started, and a plugin withheld its result:`(아직 실행 중이면 중지) 또는 `$.process.spawn ran, and a plugin withheld its result:`.

### 설정 읽기

| 호출 | 결과 |
| :- | :- |
| `$.settings.read()` | 병합 설정 객체(`permissions`, `hooks` 등) |
| `$.settings.read({ source: 'policy' })` | 한 소스, 없으면 `{}` |
| `$.settings.read({ key: 'spinnerTipsEnabled' })` | 병합 설정의 키 값, 없으면 `undefined` |
| `$.settings.read({ key: 'spinnerTipsEnabled', source: 'user' })` | 한 소스의 키 값 |

`source`: `user`(`~/.claude/settings.json`), `project`(`.claude/settings.json`), `local`(`.claude/settings.local.json`), `flag`(`--settings`와 SDK 인라인), `policy`(관리형 설정). `key`는 최상위 키만(점 표기 불가), v2.1.304+.

## 주의/제약

- 훅 모듈에 Node.js API, `setTimeout`, 직접 파일/네트워크 접근 없음. 반드시 `$` 경유.
- 모든 `$` 호출은 이벤트이므로 앞쪽 mod/조직 정책이 가로채거나 거부할 수 있다.
- 명령 이름이 내장 명령과 겹치면 예외로 `session.start` 훅 나머지가 실행되지 않는다.
- 명령의 `{ text }`는 Claude가 읽는다(조용히 하려면 `{}`).
- `$.model.complete`는 API 오류에도 resolve(`isAnswered` 확인). `maxTokens` 기본값은 레퍼런스의 제한 참조.
- `$.clock.sleep`은 훅 시간 제한에 포함. 직접 만든 promise 대기도 포함.
- `$.prompt.submit`을 Claude 작업 중 핸들러에서 `await`하면 턴 시작까지 묶인다.
- `register` 내부에 선언한 함수에 `$`를 넘기면 검증에서 거부된다.
- `$.ui.notify`는 사용자가 봤는지 보장하지 않으며 빈도 제한도 없다(남용 주의).
- `$.http.fetch` 교차 origin 리디렉션에서 인증 헤더 손실.
- `$.process.run` 기본 타임아웃 30초, reject 가능.
- `$.fs.list`는 비재귀.
- `$.settings.read`의 `key`는 최상위 키만.
- 버전 의존: `isDeferred`(v2.1.293), 블록 배열 캐싱(v2.1.292), 중단 후 처리 및 `key`(v2.1.304), `-p` 제한 거부(v2.1.299).

## 테스트 체크리스트

- [ ] `$.command.register`: `/` 목록에 설명과 함께 표시, `argumentHint`가 `/standup [days]`로 보임. `/standup 3` → `Summary for the last 3 day(s): ...`.
- [ ] 내장 명령 이름(예: `focus`) 등록 시 `"/focus" refused` 예외를 `try`/`catch`로 잡아 `$.ui.log`.
- [ ] `immediate: true` 명령을 Claude 작업 중에 실행 가능.
- [ ] `{}` 반환 명령은 트랜스크립트에 아무것도 출력하지 않음.
- [ ] `$.tool.register`: Claude에게 "티켓 X 조회" 요청 시 `mcp__<plugin>__ticket` 호출, `{ result }`를 Claude가 인용. `isDeferred: false` 유무로 도구 검색 동작 비교.
- [ ] `$.model.complete`: `/triage the export button does nothing` → `Label: bug`. 잘못된 모델로 `isAnswered: false`와 `reason` 확인.
- [ ] 캐싱: `RULES`(충분히 긴 텍스트) + `cache: true`로 2회 호출, 1회차 `cache_creation_input_tokens` > 0, 2회차 `cache_read_input_tokens` > 0. 브레이크포인트 5개로 `api-error`.
- [ ] `$.model.fork`: 현재 대화 내용을 아는 답이 오는지 확인.
- [ ] `$.clock.every`: 1분마다 `$.ui.status` 갱신. `cancel()` 후 중단. 모듈 저장(리로드) 시 타이머 중지.
- [ ] `$.clock.after(5000, fn)` 5초 후 1회 실행, `$.clock.now()` 차이로 검증.
- [ ] `$.ui.status`/`toast`/`log` 표시 위치와 접두(`⚠`, `●`, mod 이름) 확인. 전체 화면 vs 클래식 토스트 위치.
- [ ] `$.ui.notify`: 반환 `isSent`/`channel` 로그. `notifications_disabled` 설정 시 `disabled`, `claude -p`에서 `no-surface`. 문자열이 아닌 `text`로 reject.
- [ ] `$.prompt.submit({ text })`: 유휴 시 새 턴 시작, Claude가 mod 발신 문장을 인지. `asUser: true` 비교.
- [ ] Esc 중단 직후 `$.prompt.submit` → `{ drop }` 사유 확인, 다음 입력 후 `turn.complete` 재시도로 실행.
- [ ] `claude -p "..." --max-turns 2`에서 mod 반복 제출이 `the run reached its --max-turns limit`로 거부되고 실행 종료.
- [ ] `$.session.send`: 존재하지 않는 `sessionId`로 `isDelivered: false` 토스트. `$.agent.list()` id로 서브에이전트에 전송.
- [ ] `session.receive` 훅에서 `{ consumed }` 반환 시 Claude가 메시지를 보지 못함. `e.origin.kind` 로그.
- [ ] `$.fs.read/write/exists/stat/list`: 임시 파일 왕복, `list` 결과 형태와 비재귀 확인. 상대 경로 기준 디렉터리 확인.
- [ ] `$.process.run(['git','status'])` 결과 3필드, 없는 프로그램으로 reject, 30초 초과 명령으로 타임아웃 reject.
- [ ] `$.process.spawn`으로 스트리밍 출력 수신.
- [ ] `$.http.fetch`: `ok`/`status`/`headers`/`text` 확인. 교차 origin 리디렉션 후 `Authorization` 제거 관찰.
- [ ] `$.store`: 값 저장 후 Claude Code 재시작 뒤 유지 확인.
- [ ] `$.env.get`/`set` 왕복.
- [ ] `$.settings.read()`, `{ source: 'user' }`, `{ key: 'spinnerTipsEnabled' }`, 둘 다 전달한 경우의 반환 형태 비교.
- [ ] `$.session.messages()`의 `{ role, text, toolUses }`, `$.session.usage()` 컨텍스트 사용량을 상태줄에 표시.
- [ ] `$.mcp.call`로 연결된 MCP 서버 도구 호출.
- [ ] 다른 mod 훅(`fs.read` 이벤트)으로 이 mod의 `$.fs.read`를 거부해 "모든 API 호출이 이벤트"임을 확인.
