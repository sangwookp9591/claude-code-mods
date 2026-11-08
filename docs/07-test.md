# 07. mod 테스트하기 (test)

> 원문: https://code.claude.com/docs/ko/plugins/mods/test
> 세션, 로그인, 네트워크 없이 이벤트를 발생시키고, Claude Code의 응답을 스텁으로 대신하고, 버튼을 누르는 자동화 테스트를 작성한다.

## 1. 핵심 요약

- 테스트는 mod를 로드하고, Claude Code와 똑같은 방식으로 훅에 이벤트를 보낸 뒤, 훅이 한 일을 확인한다.
- 실행 명령은 셸에서 `claude plugin test`이다. 세션, 로그인, 네트워크가 필요 없다.
- 테스트 키트는 `claude-code/testing` 모듈에서 가져온다. 내보내는 이름은 `test`, `expect`, `mock`, `tier`이다.
- 테스트가 하나라도 실패하면 종료 코드 1이므로 CI에 그대로 쓸 수 있다.

## 2. 테스트 파일 규칙

| 항목 | 규칙 |
| :- | :- |
| 파일 이름 | `.test.ts`로 끝나야 한다 (예: `first-mod.test.ts`). 참조 문서 기준으로 `.test.tsx`도 실행 대상이다. |
| 위치 | 플러그인 디렉터리 안 어디든 된다 (관례: `tests/`). |
| 최소 조건 | 파일마다 `test()`가 하나 이상 있어야 한다. 없으면 `declares no test(): nothing ran` 오류로 실행이 실패한다. |
| 헬퍼 import | mod 자체 파일과 같은 위치의 `.ts` 헬퍼를 가져올 수 있다. 게임 규칙 같은 순수 함수는 키트 없이 단위 테스트할 수 있다. |
| 실행 범위 | `claude plugin test [directory]`는 지정한 디렉터리(생략 시 현재 디렉터리) 아래의 모든 `.test.ts` / `.test.tsx`를 실행한다. |
| 시간 제한 | 테스트 하나당 5초. 테스트에서 `timeoutMs`를 설정하면 바뀐다. |

## 3. 첫 테스트

```typescript
// first-mod/tests/first-mod.test.ts
import { expect, test } from 'claude-code/testing'

test('/tally reports the tool calls the mod has seen', async ($, on) => {
  on('tool.call', () => ({ result: 'ok' }))          // 스텁: 실제 도구는 실행되지 않는다
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Read', file_path: 'README.md' })
  const answer = await $.command.run({ command: 'tally', args: '' })
  expect(answer.text).toBe('Claude has made 2 tool calls since this mod loaded')
})
```

```bash
cd first-mod
claude plugin test
```

출력 예:

```text
tests/first-mod.test.ts:
(pass) /tally reports the tool calls the mod has seen [22.87ms]

 1 pass
 0 fail
Ran 1 test across 1 file. [0.19s]
```

- 각 `$.tool.call`은 mod의 `tool.call` 훅을 거친 뒤 스텁에 도달한다. `ls`는 실행되지 않는다.
- `$.command.run`은 mod의 `command.run` 훅으로 가고, `answer`는 그 훅이 반환한 객체다.
- 셸에서 mod를 로드할 수 없으면 `claude plugin test: hooks modules are turned off`로 시작하는 줄과 이유를 출력하고 코드 1로 종료한다.

## 4. 테스트 함수의 두 인수: `$`와 `on`

### `$` (Claude Code 역할)

- 훅이 받는 mods API `$`가 **아니다**. 테스트 자체의 `$`이다.
- 각 메서드는 같은 이름의 이벤트를 발생시켜 mod 훅으로 보내고, 결과로 resolve된다.
- 사용 가능한 예: `$.tool.call`, `$.command.run`, `$.prompt.submit`, `$.session.start`, `$.turn.complete`, `$.turn.step`, `$.session.receive`, `$.classic.*` (예: `$.classic.Stop`, `$.classic.SessionStart`), `$.ui.mount`.
- `ui.close` 같은 mods API 호출은 직접 발생시킬 수 없다. 창을 닫는 버튼을 누르는 식으로 mod를 통해 트리거한다.

### `on` (스텁 등록)

- 스텁은 Claude Code 대신 응답하는 훅이다.
- mods API 호출 스텁은 `$.` 없이 이름을 쓴다. `on('store.get', ...)`은 mod의 `$.store.get`에 응답한다.

### 스텁 반환 형식 두 가지

| 대상 | 반환 형식 | 예 |
| :- | :- | :- |
| mods API 호출 (`$.store.get`, `$.model.complete` 등) | `{ value }` 또는 `{ deny: 'reason' }` | `{ value: 7 }` 이면 `$.store.get`이 `7`로 resolve |
| Claude Code 이벤트 (`tool.call`, `turn.step` 등) | 이벤트 자체의 결과 | `{ result: 'ok' }` |
| `$.session.send`, `$.prompt.fill` | 이벤트의 결과 형식 | `{ isDelivered: true }`, `{ isFilled: true }` |

스텁 오류 메시지 (실패 출력의 `the engine reported:` 블록 안에 표시):

- `returned neither { value } nor { deny }`: mods API 스텁이 값을 그대로 반환했다. 테스트 실패.
- `no implementation for <name>`: mod가 호출했지만 응답할 스텁이 없다.

### 모델 호출 스텁 예

```typescript
// grader/tests/grader.test.ts
test('a passing grade is reported', async ($, on) => {
  on('model.complete', () => ({
    value: {
      isAnswered: true,
      text: 'PASS\nNice sentence.',
      usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
    },
  }))
  const answer = await $.command.run({ command: 'grade', args: 'The cat sat on the mat.' })
  expect(answer.text).toBe('Passed')
})
```

반대 경우는 `text`가 `FAIL`로 시작하는 스텁으로 두 번째 테스트를 만들고 `Try again`을 기대한다.

## 5. 미리 만든 mock

| mock | 동작 |
| :- | :- |
| `mock.clock(on)` | `$.clock`에 응답하고, 테스트가 시간을 앞당길 수 있는 시계를 반환한다. `mock.clock(on, { now: 5000 })`으로 시작 시각 지정 (ms). 기본 시작은 `0`. |
| `mock.store(on, { count: 7 })` | 지정 항목으로 시작하는 저장소로 `$.store`에 응답한다. 아무것도 반환하지 않으므로, mod가 저장한 값을 확인하려면 `store.get` / `store.set` 스텁을 직접 쓴다. |
| `mock.env(on, { CI: 'true' })` | 지정 변수로 `$.env.get`에 응답한다. |
| `mock.session(on)` | `appended()` 메서드가 있는 mock 세션을 반환한다. mod가 `$.session.append`로 추가한 행을 오래된 순으로 나열한다. Claude Code v2.1.293 이상. |

## 6. 테스트 키트 규칙 (처음 쓰는 사람이 가장 먼저 부딪히는 오류)

1. **`$`를 처음 호출하기 전에 모든 스텁을 등록한다.** 이후 `on`을 부르면 `on("ui.render") after the test first called $` 같은 오류가 난다.
2. **`session.start`는 자동으로 실행되지 않는다.** 각 테스트는 모듈을 새로 로드한 상태에서 시작하며 모듈 수준 변수는 초기값이다. `session.start`에 의존하면 직접 발생시킨다.

   ```typescript
   on('session.start', () => ({ cwd: '/work' }))
   on('command.register', () => ({ value: undefined }))
   await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
   ```

   `command.register` 스텁이 없으면 그 호출이 `no implementation for command.register`로 reject되고 키트가 훅을 건너뛴다. 이 시점에는 실패하지 않고, 이후 검사가 실패할 때 `the engine reported:` 아래에 나타난다.
3. **`next(e)`를 반환하는 훅에는 응답할 스텁이 필요하다.** 예: `ui.render` 훅이 `next(e)`를 반환하면 마운트가 `no implementation for ui.render`로 실패한다.

   ```typescript
   on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
   ```
4. **`turn.step` 스텁은 비동기 제너레이터다.** 테스트가 스트림을 끝까지 읽어야 결과를 얻는다.

   ```typescript
   on('turn.step', async function* ($, e) {
     yield { kind: 'text', index: 0, text: 'ok' }
     return { turnId: e.turnId, index: e.index, answer: 'ok', toolUses: [], stopReason: 'end_turn', usage: null }
   })
   const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-test', messageCount: 1 })
   let step = await stream.next()
   while (step.done !== true) step = await stream.next()
   const result = step.value   // result.answer === 'ok'
   ```
5. **도구 호출은 도구 이름과 인수를 필드로 발생시킨다.** `await $.tool.call({ tool: 'Bash', command: 'ls' })` + `{ result }`를 반환하는 `tool.call` 스텁.

## 7. 스텁 반환값 조회표

키트가 직접 응답하는 예외: `$.ui.invalidate`, `$.state`, `$.session.append`. `$.clock`은 반드시 `mock.clock(on)`을 쓴다. 없으면 `no implementation for clock.now`로 실패한다.

| mod가 호출하거나 넘기는 항목 | 스텁 |
| :- | :- |
| `$.command.register`, `$.tool.register`, `$.ui.toast`, `$.ui.log`, `$.ui.status`, `$.ui.close`, `$.store.set` | `() => ({ value: undefined })`. `ui.toast`, `ui.log`의 텍스트는 `e.text` |
| `$.store.get` | `($, e) => ({ value: saved.get(e.key) })` |
| `$.fs.read` | `($, e) => ({ value: e.path.endsWith('notes.md') ? '# Notes' : '' })`. `e.path`는 절대 경로 |
| `$.ui.open` | `() => ({ value: { isPlaced: true } })` |
| `$.ui.ask` | `tool.call` 스텁 사용 (`AskUserQuestion` 도구로 전달됨): `($, e) => ({ result: { answers: { [e.questions[0].question]: 'Run it' } } })` |
| `$.model.complete` | `() => ({ value: { isAnswered: true, text: '...', usage } })` |
| `$.process.run` | `($, e) => ({ value: { exitCode: 0, stdout: '...', stderr: '' } })`. `e.argv`, `e.init`(`cwd`, `timeoutMs`) |
| 실패해야 하는 mods API 호출 | `() => ({ deny: 'the reason' })`. 예외를 던지는 스텁은 거부가 아니라 건너뛰어진다 |
| `session.start` | `() => ({ cwd: '/work' })` |
| `turn.start` | `($, e) => ({ turnId: e.turnId })` |
| `tool.call` | `() => ({ result: '...' })` |
| `turn.complete` | `() => ({ text: '' })`. 발생: `$.turn.complete({ turnId, answer, durationMs, isAborted: false, usage: null })` |
| `prompt.submit` | `($, e) => ({ text: e.text })` |
| `prompt.fill` | `() => ({ isFilled: true })` |
| `$.prompt.read` | `() => ({ value: { text: '...', cursor: 0 } })` |
| `$.ui.copy` | `() => ({ value: { isCopied: true } })` |
| `$.ui.notify` | `() => ({ value: { isSent: true, channel: 'terminal_bell' } })` |
| `$.session.messages` | `() => ({ value: [{ role: 'assistant', text: '...', toolUses: [] }] })` |
| `$.session.id`, `$.agent.list` | `() => ({ value: 'abc123' })`, `() => ({ value: [] })` |
| `session.send` | `() => ({ isDelivered: true })`. `e.to`는 항상 문자열 |
| `session.receive` | `($, e) => ({ text: e.text })`. 발생: `$.session.receive({ origin: { kind: 'peer-send-message' }, text })` |
| `ui.render` | `() => ({ type: 'Text', props: {}, children: ['...'] })` |

### `expect` 어설션

`toBe`, `toEqual`, `toMatch`, `toMatchObject`, `toContain`, `toBeDefined`, `toBeUndefined`, `toThrow`. 모두 앞에 `.not`을 붙일 수 있다.

일반 함수 스텁이나 훅 안에서 `expect`가 실패하면 테스트가 실패한다. 엔진은 그 훅을 건너뛰고, 출력에 `in the test's store.set hook`처럼 훅 이름이 나온다.

## 8. 타이머 테스트

`const clock = mock.clock(on)`. 테스트가 움직일 때만 시간이 흐른다.

| 메서드 | 동작 |
| :- | :- |
| `await clock.advance(1000)` | ms만큼 앞으로 이동, 기한이 된 타이머 실행 |
| `await clock.set(5000)` | 해당 시각까지 앞으로 이동 (`advance`와 같은 방식) |
| `clock.now()` | 현재 시각. mod의 `$.clock.now()` 반환값과 같다 |
| `await clock.settle()` | 시간 이동 없이 이미 기한이 된 타이머 실행 (지연 0인 `$.clock.after` 체인 등) |
| `await clock.sleep(2000)` | 스텁 안에서 쓰면 테스트가 그만큼 시간을 진행한 뒤에만 응답. 느린 모델/프로세스 시뮬레이션 |

```typescript
// countdown/tests/countdown.test.ts
import { expect, mock, test } from 'claude-code/testing'

test('the countdown ends with a toast', async ($, on) => {
  const clock = mock.clock(on)
  const toasts: string[] = []
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } })

  await $.command.run({ command: 'countdown', args: '3' })
  await clock.advance(2000)
  expect(toasts).toEqual([])
  await clock.advance(1000)
  expect(toasts).toEqual(['Time is up'])
})
```

각 `advance`는 기한이 된 타이머가 실행된 뒤 완료되므로 다음 줄에서 결과를 볼 수 있다.

## 9. 그리기 테스트 (`$.ui.mount`)

`$.ui.mount`는 mod의 `ui.render` 훅으로 렌더링 지점을 그리고 핸들을 반환한다. `surface`로 대상 앱(`terminal`, `desktop` 등)을 지정한다. `props`는 Claude Code가 그 지점에 전달할 값으로 직접 채운다 (참조 문서의 렌더링 지점 표 참고).

```typescript
const PANE = {
  plugin: 'hello-tabs', component: 'Pane', requestId: 'hello-tabs',
  viewport: { columns: 100, rows: 30 },
  props: { title: 'Hello tabs', isFocused: true, bodyColumns: 60, placement: 'inline',
           scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

test('the second tab counts presses and saves the count', async ($, on) => {
  const saved = new Map<string, unknown>()
  on('store.get', ($, e) => ({ value: saved.get(e.key) }))
  on('store.set', ($, e) => { saved.set(e.key, e.value); return { value: undefined } })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'tab-two' })
    await ui.press({ key: 'more' })
    expect(await ui.find({ type: 'Text', text: /^Count: \d+$/ })).toBeDefined()
    await ui.unmount()
  }
  expect(saved.get('count')).toBe(2)   // 두 마운트가 같은 모듈 인스턴스를 공유
})
```

### 핸들 메서드

| 메서드 | 기능 |
| :- | :- |
| `press({ key: 'more' })` | 해당 `key`의 `Button`을 누른다 |
| `input({ key: 'new-note', text: 'buy milk' })` | 해당 `Input`에 입력 후 Enter. 제출 없이 입력만: `kind: 'change'`. `rows`가 있는 필드는 `\n` 가능 |
| `select({ key: 'size', value: 'large' })` | 해당 `Select`에서 옵션 선택 |
| `find({ key })` / `find({ type: 'Text', text })` | 첫 일치 요소를 `{ type, props, children }`로, 없으면 `undefined`. `text`는 문자열 또는 정규식 |
| `unmount()` | 그린 내용 제거 |

각 메서드는 핸들러 완료 후 resolve된다. 테스트는 트리 유효성은 잡지만 앱이 실제로 어떻게 그리는지는 확인하지 않는다. 새 레이아웃은 실제 세션에서도 본다.

### `/clear` 후 그리기 테스트

각 테스트는 모든 `$.state`가 기본값인 상태(즉 `/clear` 직후와 같음)로 시작한다. `session.start`를 건너뛰고 `source: 'clear'`로 `classic.SessionStart`를 발생시킨다.

```typescript
test('the saved count comes back after /clear', async ($, on) => {
  on('store.get', () => ({ value: 7 }))
  on('classic.SessionStart', () => ({}))
  await $.classic.SessionStart({ source: 'clear' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'tab-two' })
  expect(await ui.find({ type: 'Text', text: 'Count: 7' })).toBeDefined()
})
```

## 10. 정책 mod 테스트 (`tier`, `plugins`)

- `tier('prepend')`: 파일 맨 위에서 한 번 호출. 값은 `prepend`, `append`, `builtin`. 생략하면 `user`.
- `test(name, { plugins: [...] }, fn)`: 인라인 mod(`name`, `register` 함수, 선택적 `tier`)를 함께 로드한다.
- 키트는 테스트에서 `$`를 처음 호출할 때 모든 mod를 로드한다. 거부가 있으면 그 호출에서 오류가 throw된다.

```typescript
import { expect, test, tier } from 'claude-code/testing'
tier('prepend')

const runner = { name: 'runner', register(on) {
  on('tool.call', async ($, e, next) => { await $.process.run(['ls']); return { result: 'runner answered' } })
} }

test('refuses a mod that starts a process', { plugins: [runner] }, async ($, on) => {
  on('tool.call', () => ({ result: 'claude code answered' }))
  let message = ''
  try { await $.tool.call({ tool: 'Bash', command: 'ls' }) } catch (error) { message = error.message }
  expect(message).toBe('runner: refused by acme-guard: Acme policy: mods may not call process.run')
})
```

거부 메시지 형식: `<거부된 mod>: refused by <거부한 mod>: <사유>`.

## 테스트 체크리스트

- [ ] 플러그인 디렉터리에서 `claude plugin test` 실행 시 `N pass`, `0 fail`, `Ran N test across M file.` 줄이 출력된다.
- [ ] 의도적으로 기대값을 틀리게 바꾸면 `(fail)` 줄이 나오고 `echo $?`가 `1`이다.
- [ ] `test()`가 없는 `.test.ts` 파일을 두면 `declares no test(): nothing ran`으로 실패한다.
- [ ] 스텁을 하나 지우면 실패 출력의 `the engine reported:` 블록에 `no implementation for <name>`이 나온다.
- [ ] mods API 스텁이 `{ value }` 없이 값을 반환하면 `returned neither { value } nor { deny }`가 나온다.
- [ ] `$` 호출 뒤에 `on`을 부르면 `on("...") after the test first called $` 오류가 난다.
- [ ] `session.start`에 의존하는 훅은 `$.session.start(...)`를 먼저 부른 테스트에서만 통과한다.
- [ ] 타이머 mod: `clock.advance` 전후로 상태 변화가 정확히 한 번 관찰된다.
- [ ] 그리기 mod: `terminal`과 `desktop` 두 `surface` 모두에서 `ui.find`가 기대 요소를 반환한다.
- [ ] `/clear` 시나리오: `$.classic.SessionStart({ source: 'clear' })` 후 저장값이 다시 그려진다.
- [ ] 정책 mod: 거부 테스트의 메시지가 `<mod>: refused by <guard>: <reason>` 형식과 정확히 일치한다.
- [ ] mod를 로드할 수 없는 셸이면 `claude plugin test: hooks modules are turned off`로 시작하는 줄과 코드 1이 나온다.

## 주의/제약

- 테스트 함수의 `$`는 mods API가 아니라 Claude Code 역할이다. 혼동하지 않는다.
- 스텁은 반드시 첫 `$` 호출 전에 등록한다.
- 모델, 저장소, 도구는 실행되지 않는다. mod가 Claude Code 응답을 기대하는 모든 곳에 스텁이 필요하다 (예외: `$.ui.invalidate`, `$.state`, `$.session.append`).
- `$.clock`을 쓰는 mod는 `mock.clock(on)` 없이는 `no implementation for clock.now`로 실패한다.
- 스텁에서 예외를 던지면 거부가 아니라 훅이 건너뛰어진다. 실패를 시뮬레이션하려면 `{ deny: 'reason' }`.
- 건너뛴 훅은 즉시 실패를 일으키지 않는다. 이후 검사가 실패할 때만 `the engine reported:` 아래에 보인다.
- 테스트 하나당 기본 5초 제한 (`timeoutMs`로 변경).
- 테스트는 앱이 트리를 실제로 그리는 모습은 검증하지 않는다. 레이아웃은 실제 세션에서 확인한다.
- `mock.session(on)`은 Claude Code v2.1.293 이상.
- 두 마운트는 같은 로드된 모듈을 공유하므로 모듈 상태가 앱 간에 이어진다.
