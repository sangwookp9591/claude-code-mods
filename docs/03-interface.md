# 03. 인터페이스에 그리기 (학습 노트)

출처: https://code.claude.com/docs/ko/plugins/mods/interface.md

## 핵심 모델

- mod가 그릴 수 있는 각 위치 = **렌더링 지점(render site)** (창, 밴드, 스피너 등)
- Claude Code는 렌더링 지점을 그리기 직전마다 `ui.render` 이벤트를 발생시키고, 훅은 그릴 내용(요소 트리)을 반환한다
- 그리기는 스냅샷이다. 새 내용을 보이려면 훅이 다시 실행되어야 한다
- 렌더 주기: 콜백이 상태 변경 > `$.ui.invalidate('ui.render')` > 훅 재실행 > 새 트리

터미널 화면 맵(전체 화면 렌더링 기준): 오른쪽 사이드바 창(pane), 트랜스크립트 우상단 토스트, 트랜스크립트 로그 줄, 프롬프트 위 밴드, 프롬프트 아래 상태줄. 메시지, 도구 호출 행, 스피너는 다시 그릴 수 있음. 프롬프트 자체는 Claude Code 것. 좁은 터미널에서 창은 프롬프트 위에 배치.

## 예제: 탭이 있는 창 (`hello-tabs`)

`/hello-tabs` 명령으로 창을 열고, 탭 2개, 두 번째 탭에 카운터 버튼. 카운트는 재시작 후에도 유지.

```json
// hello-tabs/hooks/hooks.json
{ "modules": ["./register.js"] }
```

```javascript
// hello-tabs/hooks/register.js (요약)
const PANE = 'hello-tabs'
let tab = 'one'
let count = 0

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hello-tabs', description: 'Open the hello-tabs pane' })
    const saved = await $.store.get('count')
    if (typeof saved === 'number') count = saved
    return next(e)
  })

  on('command.run', { command: 'hello-tabs' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Hello tabs', focus: true, closeOnEscape: true })
    return {}   // 트랜스크립트에 아무것도 출력하지 않음
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)   // 다른 mod의 창은 건드리지 않음
    const { Box, Text, Button } = $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')

    const tabButton = (name, label, hotkey) =>
      Button({ key: 'tab-' + name, label, hotkey, plain: true, dimColor: tab !== name,
        onPress: () => { tab = name; redraw() } })

    const body = tab === 'one'
      ? [Text({ children: ['This is the first tab.'] })]
      : [Box({ flexDirection: 'row', columnGap: 2, children: [
          Button({ key: 'more', label: 'Add one', hotkey: 'a',
            onPress: async () => { count += 1; redraw(); await $.store.set('count', count) } }),
          Text({ children: ['Count: ' + count] }),
        ] })]

    return Box({ flexDirection: 'column', children: [
      Box({ flexDirection: 'row', columnGap: 3, children: [tabButton('one', 'One', '1'), tabButton('two', 'Two', '2')] }),
      Text({ children: [' '] }),
      ...body,
    ] })
  })
}
```

포인트:
- `$.ui.open`은 창의 존재만 알린다. 실제 내용은 이어서 발생하는 `ui.render`가 결정
- 탭은 한 줄로 나열한 `Button`들. mod가 활성 탭을 추적
- 실행: `claude --plugin-dir ./hello-tabs` > `/hello-tabs` > 상단에 `1: One`, `2: Two` > `2` 누르고 `a` 여러 번 > Esc로 닫고 재시작해도 카운트 유지
- 지우기: `$.store.delete('count')`

## 그릴 위치 선택

`ui.render` 훅은 matcher 없으면 모든 렌더링 지점에서 실행된다. `on`의 두 번째 인수로 필터.

이벤트 필드:
- `e.component` 지점 이름
- `e.surface` 그리는 앱 (예: `terminal`, `vscode`)
- `e.props` 지점 고유 데이터
- `e.requestId` (Pane) 창을 열 때 쓴 `id`

| 지점 | matcher | 특성 |
| :- | :- | :- |
| Pane | `{ component: 'Pane' }` + `e.requestId` 확인 | 넓은 전체 화면 터미널에서는 트랜스크립트 옆 사이드바, 그 외에는 프롬프트 위 테두리 영역. 여러 개면 제목 탭 생김. `$.ui.open({ id })`로 나타남 |
| 밴드 | `{ component: 'AbovePrompt' }` | 프롬프트 입력란 바로 위 띠. 항상 존재, 모든 mod가 공유. 트리 반환 시 표시, `next(e)` 반환 시 미표시 |

밴드 공유 규칙: 반환한 트리는 뒤에 실행되는 mod가 그리는 내용을 대체한다. 다른 mod 내용을 유지하려면 `await next(e)` 결과를 내 `Box`의 children에 넣는다.

### Claude Code가 이미 그리는 지점

| 지점 | 설명 |
| :- | :- |
| `UserMessage`, `AssistantMessage` | 트랜스크립트 메시지 |
| `ToolUse`, `ToolResult`, `ToolGroup` | 도구 호출 행, 결과, 접힌 호출 그룹 |
| `CommandOutput` | 명령이 출력한 행 |
| `AskUserQuestion` | Claude의 질문 대화 상자 |
| `Spinner`, `ToolProgress`, `TurnDuration` | 작업 중 애니메이션 줄, 실행 중 도구 진행 줄, 턴 마무리 줄 |
| `InfoNotice`, `SessionMode`, `PromptHint` | 로고 아래 상태줄, 푸터 모드 레이블, 프롬프트 아래 힌트 줄 |

`Pane`, `AskUserQuestion`, `Spinner`, `UserMessage`, `AssistantMessage`, 도구 호출 지점은 터미널, Desktop, VS Code 모두 작동. 나머지는 reference의 렌더링 지점 표 참조.

세 가지 처리 방식 (스피너 예):

```javascript
// 1) 세부 사항 변경: props 바꾼 복사본을 next로
on('ui.render', { component: 'Spinner' }, async ($, e, next) =>
  next({ ...e, props: { ...e.props, suffix: ' · tool calls: ' + calls + '…' } }))
// 결과: Thinking · tool calls: 2…

// 2) 대체: next 호출 없이 트리 반환
on('ui.render', { component: 'Spinner' }, async ($, e) => {
  const { Text } = $.ui.resolve(e)
  return Text({ children: ['Claude has made ' + calls + ' tool calls'] })
})

// 3) 그대로 두기: next(e)
on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
  if (calls === 0) return next(e)
  return next({ ...e, props: { ...e.props, suffix: ' · tool calls: ' + calls + '…' } })
})
```

`next(e)`는 (뒤 mod가 자체 트리를 반환하지 않는 한) Claude Code 그리기의 참조 `{ type: 'engine', ref }`를 반환한다. 이 참조를 그대로 반환하거나 `Box` 안에 내 요소와 나란히 둘 수 있다.

```javascript
on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
  const { Box, Text } = $.ui.resolve(e)
  const theirs = await next(e)
  return Box({ flexDirection: 'column', children: [theirs, Text({ children: ['under the spinner'] })] })
})
```

`AskUserQuestion` 규칙: 트리가 참조를 정확히 한 번 포함하고, 직접 만든 요소는 그 위에 있어야 한다. 아니면 Claude Code가 자체 대화 상자를 그린다. 권한 프롬프트는 렌더링 지점이 아니다.

## 창 열기/닫기

```javascript
await $.ui.open({ id: 'hello-tabs', title: 'Hello tabs', focus: true })
await $.ui.close({ id: 'hello-tabs' })
```

| 필드 | 기능 |
| :- | :- |
| `id` (필수) | 창 이름. `ui.render`에서 `e.requestId`로 확인, 닫을 때도 사용 |
| `title` | 창이 둘 이상일 때 탭 레이블 |
| `focus` | 키보드 포커스 요청 |
| `closeOnEscape` | Esc로 닫기 |
| `holdToasts` | 터미널에서 이 창이 보이는 동안 토스트 보류 |
| `rows` | 프롬프트 위에 있을 때 요청 높이. 기본값 공간의 1/3 |
| `columns` | 트랜스크립트 옆일 때 요청 너비. 최대 터미널 너비의 45%. 사용자가 크기를 조정한 적이 있으면 사용자 너비 우선 (같은 45% 제한) |

- VS Code 확장은 `rows`, `columns` 무시
- `focus`, `closeOnEscape`, `holdToasts`는 `true`만 허용. `false` 전달 시 `ui.open: focus is true or left out` 같은 오류. 조건부라면 필드를 조건부로 추가:

```javascript
const pane = { id: 'hello-tabs', title: 'Hello tabs' }
await $.ui.open(items.length > 0 ? { ...pane, focus: true } : pane)
```

- Claude 작업 중에도 명령으로 창을 열려면 명령 등록 시 `immediate: true`. 없으면 턴이 끝날 때까지 대기

### 토스트 보류

창이 응답 후 사라지는 대화 상자라면 `holdToasts: true`. 보류 중에는 `$.ui.toast` 토스트, 다른 mod 토스트, Claude Code 자체 짧은 알림이 모두 대기. 상시 열린 창에서는 생략.

### 창이 더 넓은 터미널을 기다리는 경우

- 사용자 동작(명령, 버튼)으로 연 창: 너비와 무관하게 표시
- mod가 스스로 연 창(타이머, `turn.start` 훅 등): 144열 이상에서만 표시. 사용자가 그 창을 직접 한 번 연 후에는 110열이면 충분
- 반환값: 표시되면 `{ isPlaced: true }`. 대기 중이면 `isPlaced: false`와 이유 문자열 `reason`. 사용자가 열거나 터미널을 넓히면 표시
- 창 없이 알리기: `$.ui.toast('Your message')`

## VS Code 확장에서 그리기

요구: 확장 2.1.299 이상 (기능 플래그 미수신 세션, 예 Bedrock은 2.1.304 이상). 패널용 훅에서 `e.surface`는 `vscode`.

| 항목 | 차이 |
| :- | :- |
| Pane | 패널 너비 800px 이상: 대화 옆 도킹, `e.props.placement === 'dock'`, `e.viewport.isFullscreen === true`. 더 좁으면 프롬프트 위, `placement === 'inline'`, 12행 후 스크롤 |
| 토스트와 상태줄 | 프롬프트 상자 바로 위 하나의 스택 (좁으면 창도 포함). mod당 상태줄 하나. 권한 요청/대화 상자 중에는 스택 숨김 |
| 레이블 | 테두리 + **From the token-chart plugin** 또는 **Edited by the token-chart plugin** |
| 키보드 | 버튼 단축키 없음. 클릭 또는 포커스 후 Enter |
| 포커스 | 패널에 포커스 있고, Claude가 대기 질문 없이 유휴이고, 프롬프트가 비어 있을 때만 `focus: true` 허용 |
| `AskUserQuestion` | 자체 질문 카드 유지, 그 위에 내 요소. `next`에 넘긴 prop은 카드를 바꾸지 않음 |
| 프롬프트 제안 | `$.prompt.suggest`는 `isShown: false`로 resolve, 아무것도 표시 안 함 |
| 텍스트 제한 | 상태줄 200자 또는 2행, 토스트 500자에서 자름 |

## 요소로 트리 만들기

`const { Box, Text, Button } = $.ui.resolve(e)` 로 요소 함수를 얻고, prop을 넘기며 내부 요소/문자열은 `children`에.

| 요소 | 내용 | 사용 위치 |
| :- | :- | :- |
| `Box` | flex 컨테이너. `flexDirection`, `borderStyle`, `width` 등. 간격 prop(`columnGap`, `padding`)은 숫자 또는 `'xs'`~`'xl'` 단계 이름 | 모든 곳 |
| `Text` | `color`, `bold`, `dimColor`, `italic`, `wrap`, `weight` 등. `color`는 테마 키 또는 `'red'` 같은 색. `wrap`은 `'wrap'`, `'truncate'`, `'truncate-start'`, `'truncate-middle'`, `'truncate-end'` | 모든 곳 |
| `Button` | `onPress` 호출 컨트롤 | 모든 곳 |
| `Link`, `Code`, `Markdown` | `href`+선택적 `label` 링크, 코드 블록, Claude 응답 방식 서식 텍스트. `Markdown`은 `children`이 아닌 `text` prop. `onLinkPress` 사용 시 `key` 필요 | 모든 곳 |
| `Input`, `Select` | 텍스트 필드, 드롭다운 | 터미널, Desktop, VS Code |
| `Svg` | SVG 문서 | Desktop, VS Code |
| `Client` | 애니메이션/포인터 입력용 별도 두 번째 파일이 그리는 영역. mod API 사용 불가. 훅과는 데이터 게시로만 통신(`ui.message` 이벤트로 전달). 실패 시 훅이 `ui.fault` 이벤트 수신 | 터미널, Desktop |
| `Raster`, `Image` | 색상 셀 그리드, 이미지 | 터미널 |

- `.tsx`/`.jsx` 모듈이면 JSX 사용 가능 (먼저 `$.ui.resolve(e)`에서 구조 분해)
- 잘못된 prop/자식을 넣은 트리를 반환하면 훅 실패. 표시 예:
  `my-mod: ui.render hook skipped: returned the wrong shape (a tree Pane refuses: Text prop "bogusProp" is not allowed)`

예시 렌더 결과:
- `Box` row + `Button` + `Text`: `[ Add one ]  Count: 0`
- `Button({ ..., hotkey: '1', plain: true })`: `1: One`
- `Input({ label: 'Note', placeholder: ..., submitLabel: 'add' })`: `Note: Type a note and press Enter`
- `Input`의 `rows`를 2 이상으로 하면 여러 줄 필드

### Desktop/VS Code의 `Link` 요구 사항 (미충족 시 일반 텍스트)

- `https:` URL 또는 `http://localhost` URL (예 `http://localhost:3000`)
- 경로/쿼리의 `@`는 `%40`으로
- 호스트 뒤 `/` 누락 외에는 `new URL(href).href`와 동일해야 함 (대문자 호스트, 공백, `https:`의 `:443` 불가)
- 터미널에는 적용 안 됨

### `Client` 실패

터미널에서 `Client` 파일이 실패하면 그 자리에 흐린 줄 `my-mod: Client client/spinner.js: boom`, 나머지는 그대로 표시. mod가 `ui.fault`를 처리하면 Claude Code가 그 후 영역을 다시 그린다.

### 색상 셀 그리드 (`Raster`, 터미널 전용)

- prop: `key`, `columns`, `rows`, `cells`(base64 문자열)
- 셀 하나 = 숫자 3개: 문자 코드 포인트, 문자 색, 배경 색 (24비트 RGB, 예 `0xc62828`). `0x01000000` = 터미널 기본 색
- 각 문자는 한 셀 너비여야 함
- 터미널 외에는 `Raster`가 없으므로 `e.surface` 확인 후 텍스트로 대체

```javascript
const DEFAULT_COLOR = 0x01000000
function cellsOf(rows) {
  const numbers = rows.flat().flatMap(([char, color]) => [char.codePointAt(0), color, DEFAULT_COLOR])
  return new Uint8Array(Uint32Array.from(numbers).buffer).toBase64()
}
// ui.render (Pane, requestId 'heat') 안에서
if (e.surface !== 'terminal') return Text({ children: ['The heat map needs the terminal.'] })
return Box({ flexDirection: 'column', children: [Raster({ key: 'grid', columns: 3, rows: 2, cells: cellsOf(rows) })] })
```

애니메이션: `ui.render` 재실행 없이 요소 하나만 다시 그리기

```javascript
$.ui.blit({ requestId: 'heat', key: 'grid', columns: 3, rows: 2, cells: cellsOf(newRows) })
```

## 누르기와 입력에 응답

| 컨트롤 | 콜백 |
| :- | :- |
| `Button` | `onPress(e)`, `e.surface`는 누르기가 발생한 앱 |
| `Input` | `onSubmit(value)` (Enter), `onInput(value)` (변경마다) |
| `Select` | `onSelect(value)`. `options`는 고유 값 선택지 1개 이상, 예 `[{ value: 'sm', label: 'Small' }, { value: 'lg', label: 'Large' }]` |

### `key`

- 모든 `Input`, `Select`는 `key` 필수
- `Button`은 `label` prop 또는 단일 문자열 자식이 있으면 `key` 생략 가능 (그 값이 키)
- 키 용도: 테스트가 키로 컨트롤을 누르거나 입력. 다른 mod는 콜백 실행 전에 발생하는 `ui.press`, `ui.input`, `ui.select` 이벤트의 `e.element`로 키를 받아 입력을 보거나 바꾸거나 콜백을 막을 수 있다 (단 다른 mod의 버튼을 누르는 API는 없음)
- 오류 메시지 `needs a key`, `is drawn twice`는 troubleshoot 문서 참조

### 키보드 포커스와 단축키

mod는 키보드를 직접 읽지 않는다. Claude Code가 키를 컨트롤에 배정해 콜백 실행. 밴드의 숫자 단축키와 `action` 바인딩을 제외하면 창/밴드에 포커스가 있을 때만. 그 외 키는 프롬프트로.

창이 포커스를 얻는 경우:
- 명령이나 누르기에서 `focus: true`로 열 때
- 사용자가 Ctrl+X 후 Tab
- 사용자가 창 클릭 (터미널은 전체 화면 렌더링 필요)
- 단, `focus: true`는 프롬프트가 비어 있고 다른 것이 포커스를 갖지 않을 때만 허용

| 키 | 동작 |
| :- | :- |
| Tab | 다음 컨트롤 |
| Up/Down | 컨트롤 간 이동, 넘치면 스크롤. 터미널 `Input`에서는 필드 행 이동, 첫/끝 행에서 앞/뒤 컨트롤로 |
| Enter | 포커스된 `Button` 누름, `Input` 제출, `Select` 선택 |
| 버튼 단축키 | 해당 버튼 누름. `Input` 포커스 중에는 출력 가능 키가 필드로 |
| Page Up/Down, Home, End | 넘칠 때 스크롤 |
| Ctrl+X 후 화살표 | 창 크기 조정 (Left/Up 확대, Right/Down 축소). 옆 창은 45% 상한 |
| Ctrl+X 후 X | 필드 포커스 중에도 창 닫기 |
| Ctrl+X 후 Ctrl+A | 밴드 접기/펼치기 (프롬프트 포커스 중에도 동작) |
| Esc | 포커스를 프롬프트로. `closeOnEscape: true`면 창도 닫음 |

- Tab, 화살표 키는 다른 동작에 바인딩 불가 > 게임은 `w`, `a`, `s`, `d`
- `hotkey`: 숫자 하나 또는 소문자 하나 (예 `hotkey: 'a'`)
- `autoFocus: true`: 창이 열릴 때 첫 포커스 컨트롤. `true`만 허용. VS Code에서는 효과 없음

단축키 표시:

| 버튼 | 터미널 | Desktop | VS Code |
| :- | :- | :- | :- |
| 대괄호(기본) | `[ Add one ]`, 단축키 미표시 | 레이블 옆 작은 키 | 레이블만, 단축키 미동작 |
| `plain: true` | `1: One` | 레이블 옆 작은 키 | 레이블만, 단축키 미동작 |

터미널에서는 대괄호 버튼 레이블에 키 이름을 넣거나 `plain: true` 사용.

### 사용자가 밴드를 접을 때 (터미널)

- 접기: 첫 행 오른쪽 끝 `[-]` 클릭 (전체 화면 렌더링), 또는 Ctrl+X 후 Ctrl+A (`abovePrompt:toggle` 액션으로 재바인딩 가능)
- 접힌 표시: `▸ plugin panel hidden · ctrl+x ctrl+a or click to show`
- 접힌 동안: 단축키, 빈 프롬프트 숫자 입력, `action` 키보드 단축키 모두 미동작. 포커스는 프롬프트로, Ctrl+X Tab은 밴드를 건너뜀
- `/clear` 후에도 접힘 유지, 다음 시작 시 펼쳐짐
- mod는 밴드를 펼칠 수 없고 접힘 여부도 알 수 없다 (`ui.render`는 계속 실행, `e.props`에 표시 없음)

### 입력 + 목록 패턴 (메모 창)

```javascript
let notes = []
on('ui.render', { component: 'Pane' }, async ($, e, next) => {
  if (e.requestId !== 'notes') return next(e)
  const { Box, Text, Button, Input } = $.ui.resolve(e)
  const redraw = () => $.ui.invalidate('ui.render')
  return Box({ flexDirection: 'column', children: [
    Input({ key: 'new-note', label: 'Note', placeholder: 'Type a note and press Enter',
      value: '', submitLabel: 'add', autoFocus: true,
      onSubmit: async (value) => {
        if (!value.trim()) return
        notes = [...notes, value.trim()]; redraw(); await $.store.set('notes', notes)
      } }),
    ...notes.map((note, i) => Box({ flexDirection: 'row', columnGap: 1, children: [
      Button({ key: 'delete-' + i, label: 'x', plain: true,
        onPress: async () => { notes = notes.filter((_, j) => j !== i); redraw(); await $.store.set('notes', notes) } }),
      Text({ children: [note] }),
    ] })),
  ] })
})
```

터미널 결과:

```text
╭────────────────────────────────────────────────────────✕─╮
│ Note: Type a note and press Enter ⏎ add                  │
│ x buy milk │
│ x call bob │
╰──────────────────────────────────────────────────────────╯
```

- 상단 테두리 `✕`는 Claude Code 자체 닫기 표시
- `x`는 레이블이지 단축키가 아님 (Tab으로 포커스 후 Enter)
- 재그리기 중에도 같은 `value`를 넘기면 사용자가 입력 중인 텍스트 유지. 다른 `value`를 넘기면 교체
- `Input`의 prop: `label`(터미널은 뒤에 `: `), `placeholder`(빈 동안 흐린 텍스트), `value`(초기 텍스트), `submitLabel`(`⏎` 뒤 단어)
- `Input` 제출은 턴을 시작하지 않는다 (콜백이 `$.prompt.submit`을 호출하는 경우 제외)
- 예제는 저장만 하고 불러오지 않음. 불러오려면 `session.start`에서 읽기

## 다시 그리기

### 자동 재그리기

- 지점의 prop 변경, 터미널 너비 변경 시
- `Client` 실패 후 mod가 `ui.fault`를 처리하면, 그 훅 반환 후 한 번 더 (그래서 `ui.render`에서 해당 `Client`를 뺄 수 있음)
- 타이머로는 재실행 안 함. 모듈 변수 변경도 감지 못함

### 데이터 변경 시

`$.ui.invalidate('ui.render')` 호출. (`$.state` 값은 쓰기만 하면 그 값을 읽는 지점이 자동 재그리기)

### 타이머

```javascript
on('session.start', async ($, e, next) => {
  $.clock.every(1000, () => $.ui.invalidate('ui.render'))
  return next(e)
})
```

모듈 재로드 시 타이머 중지, 새 인스턴스가 자체 타이머 시작.

### 빈도 제한

- 지점별 재그리기 빈도 제한 있음 (값은 reference의 제한 표)
- 제한보다 빠른 호출은 하나로 병합, 최신 값만 표시. 애니메이션은 제한보다 빠를 수 없다
- 따라서 데이터 변경마다 `invalidate` 호출해도 됨

## 상태 유지

| 보관 위치 | 유지 기간 | 용도 |
| :- | :- | :- |
| 모듈 수준 변수 | 모듈 재로드까지 (개발 중엔 저장마다) | 잃어도 되는 값 (`tab`) |
| `$.state` | 세션 끝 또는 `/clear`, `/resume`, `/branch`까지. 재로드는 넘어 유지 | 그리기에 쓰고 재로드 후에도 필요한 값 |
| `$.store` | mod가 삭제하거나, `cleanupPeriodDays` 동안 어떤 세션도 읽고 쓰지 않을 때까지. `~/.claude/plugins/store/` 아래 플러그인별 JSON | 설정, 기록 등 다음에도 있어야 하는 값 |

`$.store.get(key)` > 값 또는 `undefined`. `$.store.set(key, value)` > 모든 JSON 값. `$.store.delete(key)`.

### `$.state` (반응형)

1) 선언 `hello-tabs/types/index.d.ts`:

```typescript
declare module 'claude-code' {
  interface PluginState {
    'hello-tabs': {
      tab: 'one' | 'two'
      count: number
    }
  }
}
```

2) 매니페스트에 `"types": "./types/index.d.ts"` 추가

3) 정의/읽기/쓰기 (`atom`, `read`, `update`가 `$.state.get`/`$.state.set`을 대신 호출):

```javascript
import { atom, read, update } from 'claude-code'
const count = atom({ plugin: 'hello-tabs', key: 'count' }, 0)   // 모듈 상단
const n = await read($, count)                                   // ui.render 안
onPress: () => update($, count, (value) => value + 1)           // 콜백 안
```

규칙:
- `plugin`, `key`는 문자열 리터럴
- `atom` 결과는 `const`에 (`let`이면 `takes a source the scan can read` 실패)
- 모든 값을 타입 선언에 선언 (`hello-tabs.count is not declared` 실패)
- `ui.render` 훅은 읽기만 가능, 쓰기는 `onPress`, `onSubmit` 또는 다른 이벤트 훅에서

### `/clear` 후 저장값 다시 로드

`/clear`, `/resume`, `/branch`는 모든 `$.state`를 기본값으로 재설정하고 `session.start`는 다시 실행되지 않는다. `classic.SessionStart`가 `e.source`를 `clear`/`resume`/`fork`로 실행되므로 거기서 다시 복사.

```javascript
async function loadCount($) {
  const saved = Number((await $.store.get('count')) ?? 0)
  await update($, count, () => saved)
}
on('session.start', async ($, e, next) => { await loadCount($); return next(e) })
on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
  await loadCount($); return next(e)
})
```

- `classic.SessionStart`는 시작 시와 압축 후에도 실행되지만 그때는 `$.state`가 재설정되지 않으므로 `source` 필터로 세 경우만
- 안 하면 기본값이 그려지고, 저장 콜백이 저장값을 기본값으로 덮어씀
- `session.start`는 재로드마다 재실행되어 `$.state`를 저장값으로 덮으므로, 변경마다 저장할 것

### 여러 세션에서 저장

머신의 모든 세션이 하나의 `$.store`를 공유. `get` 후 `set`은 원자적이지 않음 (경쟁 시 나중 쓰기가 덮어씀).
- 항목마다 고유 키 (`set`은 자기 키만 변경)
- 쓰기 직전에 다시 `get`

```javascript
onPress: async () => {
  const saved = Number((await $.store.get('count')) ?? 0)
  await $.store.set('count', saved + 1)
  await update($, count, () => saved + 1)
}
```

## 주의/제약

- matcher 없는 `ui.render`는 모든 지점에서 실행. Pane 훅은 반드시 `e.requestId` 확인 후 아니면 `next(e)`
- 밴드(`AbovePrompt`)는 공유 공간. 트리 반환 시 뒤 mod 내용을 대체하므로 `await next(e)`를 children에 포함하는 것이 예의
- 밴드는 사용자가 접을 수 있고 mod는 이를 감지/해제 못함. 응답이 필요한 내용을 밴드에만 두지 말 것
- `focus`, `closeOnEscape`, `holdToasts`, `autoFocus`는 `true`만 허용 (`false`는 오류)
- mod가 스스로 연 창은 144열 미만 터미널에서 대기 (`isPlaced: false`). 사용자가 한 번 연 후는 110열
- 옆 창 너비 최대 45%. VS Code는 `rows`/`columns` 무시
- `immediate: true` 없는 명령은 Claude 작업 중 턴 끝까지 대기
- `focus: true`는 프롬프트가 비어 있고 다른 포커스가 없을 때만 허용 (VS Code는 추가로 유휴 상태 필요)
- Tab, 화살표 재바인딩 불가. `hotkey`는 숫자 1개 또는 소문자 1개
- VS Code: 단축키 없음, `autoFocus` 무효, `$.prompt.suggest` 미표시, 상태줄 200자/2행, 토스트 500자 자름, 권한 요청 중 스택 숨김
- `Input`, `Select`는 `key` 필수. 목록 행 버튼은 고유 `key`
- `Raster`, `Image`는 터미널 전용, `Svg`는 Desktop/VS Code 전용, `Client`는 터미널/Desktop 전용 (mod API 불가)
- `Markdown`은 `text` prop 사용 (children 아님)
- Desktop/VS Code `Link`는 엄격한 URL 형식 요구 (`@` 금지, 정규화 형태)
- 허용되지 않은 prop/자식이 있으면 훅이 실패하고 `hook skipped` 줄 표시
- `AskUserQuestion` 트리는 엔진 참조를 정확히 한 번, 내 요소는 그 위에. 권한 프롬프트는 변경 불가
- 그리기는 스냅샷. 모듈 변수 변경이나 타이머만으로는 재그리기 안 됨 (`invalidate` 필요, `$.state`는 자동)
- 재그리기 빈도 제한, 빠른 호출은 병합
- `ui.render`에서 `$.state` 쓰기 불가
- `/clear`/`/resume`/`/branch`는 `$.state` 초기화 + `session.start` 미실행 > `classic.SessionStart` 필요
- `$.store`는 세션 간 공유, 비원자적. `cleanupPeriodDays` 동안 미사용이면 사라짐

## 테스트 체크리스트

창(Pane)
- [ ] `/hello-tabs` 실행 시 창이 열리고 상단에 `1: One`, `2: Two`, 본문 `This is the first tab.` 표시
- [ ] `2` 누르면 `[ Add one ]  Count: 0` 표시, `a` 3회 후 `Count: 3`
- [ ] 비활성 탭 레이블이 `dimColor`로 흐리게 표시
- [ ] Esc로 창 닫힘 (`closeOnEscape: true`), 재시작 후 `/hello-tabs`에서 `Count: 3` 유지
- [ ] `$.ui.close({ id })`로 닫힘
- [ ] 두 창을 동시에 열면 `title` 기반 탭이 생김
- [ ] `focus: false` 전달 시 `ui.open: focus is true or left out` 오류
- [ ] `rows: 5`로 프롬프트 위 창 높이 변경, `columns`로 옆 창 너비 변경 (45% 상한)
- [ ] 타이머에서 연 창이 120열 터미널에서 `{ isPlaced: false, reason }` 반환, 144열 이상으로 넓히면 표시
- [ ] 사용자 명령으로 연 창은 좁은 터미널에서도 즉시 표시
- [ ] `immediate: true` 명령은 Claude 작업 중에도 창을 즉시 열고, 없으면 턴 끝까지 대기
- [ ] `holdToasts: true` 창이 열린 동안 `$.ui.toast` 토스트가 보이지 않다가 닫으면 나타남
- [ ] Ctrl+X 후 화살표로 창 크기 조정, Ctrl+X 후 X로 닫힘, Ctrl+X 후 Tab으로 포커스

밴드(AbovePrompt)
- [ ] `{ component: 'AbovePrompt' }` 훅이 프롬프트 위에 텍스트 X 표시, `next(e)` 반환 시 사라짐
- [ ] 두 mod가 밴드에 그릴 때 `await next(e)`를 children에 넣으면 두 내용이 모두 보임, 안 넣으면 하나만
- [ ] Ctrl+X 후 Ctrl+A로 접으면 `▸ plugin panel hidden · ctrl+x ctrl+a or click to show` 표시, 다시 누르면 펼쳐짐
- [ ] 접힌 동안 밴드 버튼 단축키가 동작하지 않음, `ui.render`는 계속 호출됨(카운터로 확인)
- [ ] `/clear` 후에도 접힘 유지

기존 지점 재작성
- [ ] Spinner `suffix` 변경: `Thinking · tool calls: 2…`
- [ ] Spinner 대체: 스피너 대신 `Claude has made 2 tool calls`
- [ ] 조건부 유지: 도구 호출 0회일 때 `Thinking…` 그대로
- [ ] `await next(e)` 참조 + 아래 `under the spinner` 줄이 함께 표시
- [ ] `UserMessage`, `AssistantMessage`, `ToolUse`, `ToolResult`, `ToolGroup`, `CommandOutput`, `ToolProgress`, `TurnDuration`, `InfoNotice`, `SessionMode`, `PromptHint` 각각에 표식 텍스트를 붙여 어느 지점이 어디인지 확인
- [ ] `AskUserQuestion`에 참조 1회 + 위에 안내 텍스트: 커스텀 표시. 참조 누락 시 Claude Code 기본 대화 상자로 대체
- [ ] 권한 프롬프트는 어떤 `ui.render`로도 바뀌지 않음

요소
- [ ] `Text`의 `color: 'red'`, `bold`, `italic`, `dimColor`, `wrap: 'truncate-middle'` 렌더 확인
- [ ] `Box`의 `borderStyle`, `padding: 'md'`, `columnGap: 'xs'` 단계 이름 동작
- [ ] `Link`(https), `Code`, `Markdown({ text })` 표시. `Markdown`에 `onLinkPress`를 주고 `key` 없으면 오류
- [ ] Desktop에서 `@` 포함 `Link`가 일반 텍스트로 그려짐
- [ ] `Select` `options` 선택 시 `onSelect('lg')` 호출
- [ ] `Input` `rows: 3`으로 여러 줄 필드, Up/Down이 행 이동
- [ ] `Text`에 `bogusProp` 넣으면 `my-mod: ui.render hook skipped: returned the wrong shape (...)` 줄
- [ ] `Raster` 3x2 히트맵이 터미널에 색 블록으로, Desktop에서는 `The heat map needs the terminal.`
- [ ] `$.ui.blit`으로 `Raster` 셀만 갱신, `ui.render` 호출 횟수는 증가하지 않음
- [ ] `Client` 파일에서 throw 시 `my-mod: Client client/x.js: boom` 흐린 줄, `ui.fault` 훅 호출 확인
- [ ] `.tsx` 모듈에서 JSX로 같은 트리 렌더

입력/포커스
- [ ] 메모 창에 `buy milk` 입력 후 Enter로 행 추가, 필드 비워짐, 빈 줄은 무시
- [ ] Tab으로 `x` 포커스 후 Enter로 삭제. `x` 키 입력으로는 삭제 안 됨
- [ ] 입력 중 타이머 재그리기에도 입력 텍스트 유지
- [ ] `Input` 제출이 턴을 시작하지 않음
- [ ] `autoFocus: true` 컨트롤이 창 열림 시 포커스
- [ ] 프롬프트에 텍스트가 있는 상태에서 `focus: true` 창을 열면 포커스를 가져가지 않음
- [ ] 다른 mod의 `ui.press` 훅이 `e.element`로 키를 보고 콜백을 막을 수 있음

재그리기/상태
- [ ] `invalidate` 없이 모듈 변수만 바꾸면 화면이 갱신되지 않음, 호출하면 갱신
- [ ] `$.clock.every(1000, ...)`로 시계가 1초마다 갱신, 재로드 시 중복 타이머 없음
- [ ] 매우 빠른 연속 `invalidate`가 병합되어 최신 값만 표시
- [ ] `$.state` 값 쓰기만으로 자동 재그리기, 파일 저장(재로드) 후에도 값 유지
- [ ] `atom`을 `let`에 담으면 `takes a source the scan can read`, 미선언 값은 `hello-tabs.count is not declared`
- [ ] `ui.render` 안에서 `update` 호출 시 실패 확인
- [ ] `/clear` 후 `classic.SessionStart` 훅 없이는 `Count: 0`, 있으면 저장값
- [ ] 두 세션에서 같은 버튼을 번갈아 누를 때 쓰기 직전 재읽기로 합산이 맞음
- [ ] `~/.claude/plugins/store/` 아래 플러그인 JSON 파일에 값이 저장됨

VS Code
- [ ] `e.surface === 'vscode'`, 800px 이상에서 `e.props.placement === 'dock'`, 좁으면 `'inline'`
- [ ] 그린 내용 테두리에 **From the <plugin> plugin** 레이블
- [ ] `$.prompt.suggest`가 `isShown: false`
