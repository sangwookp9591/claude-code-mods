# 04. 인터페이스 갤러리 (gallery)

원문: https://code.claude.com/docs/ko/plugins/mods/gallery (mod용 인터페이스 갤러리)

## 요약

- 이 페이지는 "완성된 mod 모음"이 아니라 **요소(element) 샘플 모음**이다. 각 샘플은 요소 하나와 그 안에 중첩된 요소에 대한 코드 조각이다.
- mod는 요소로 인터페이스를 그린다: 텍스트, 박스, 버튼, 필드, 그리고 콘텐츠 서식을 대신 지정하는 요소(`Markdown`, `Code` 등).
- 주요 prop과 요소별 지원 앱은 요소 레퍼런스(`reference.md#elements`), 모든 prop은 빌드의 타입 선언에 있다.
- 기본 그리기 위치는 **창(Pane)**: 넓은 전체 화면 터미널에서는 트랜스크립트 옆 사이드바, 그 외에는 프롬프트 위의 테두리 영역.

## 샘플 실행용 하네스 mod (`/gallery`)

디렉터리 구조:

```
gallery/
  .claude-plugin/plugin.json
  hooks/hooks.json
  hooks/register.js
```

`gallery/.claude-plugin/plugin.json`

```json
{
  "name": "gallery",
  "version": "0.1.0",
  "description": "Opens a pane that draws one sample",
  "author": { "name": "Your Name" }
}
```

`gallery/hooks/hooks.json`

```json
{ "modules": ["./register.js"] }
```

`gallery/hooks/register.js` (요약)

```javascript
const noop = () => {}
let picked = 'md'
const DEFAULT_COLOR = 0x01000000
function cellsOf(rows) {
  const numbers = rows.flat().flatMap(([char, color]) => [char.codePointAt(0), color, DEFAULT_COLOR])
  return new Uint8Array(Uint32Array.from(numbers).buffer).toBase64()
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'gallery', description: 'Open the sample pane' })
    return next(e)
  })
  on('command.run', { command: 'gallery' }, async ($) => {
    await $.ui.open({ id: 'gallery', focus: true, closeOnEscape: true })
    return {}
  })
  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== 'gallery') return next(e)
    const { Box, Text, Button, Input, Select, Link, Markdown, Code, Raster, Svg } = $.ui.resolve(e)
    return Text({ children: ['Plain text'] })
  })
}
```

실행: `claude --plugin-dir ./gallery` 후 프롬프트에서 `/gallery`.
샘플 교체: `return` 뒤의 `Text(...)` 자리에 샘플을 붙여 넣고 저장. **파일 저장 시 모듈이 다시 로드**되므로 `/gallery`만 다시 실행하면 된다.

하네스가 쓰는 API: `$.command.register`, `command.run` 이벤트(matcher `{ command }`), `$.ui.open({ id, focus, closeOnEscape })`, `ui.render` 이벤트(matcher `{ component: 'Pane' }`, `e.requestId`), `$.ui.resolve(e)`로 요소 팩토리 획득.

## 요소 분류

| 목적 | 요소 |
| :- | :- |
| 텍스트 표시 | `Text`, `Markdown`, `Link` |
| 코드 및 변경 사항 표시 | `Code` |
| 요소 배치 | `Box` |
| 입력 받기 | `Button`, `Input`, `Select` |
| 그림 그리기 | `Raster`, `Svg`, `Image`, `Client` |

## 샘플 목록 (무엇을 보여 주는가, 어떤 prop/API를 쓰는가)

| 샘플 | 보여 주는 것 | 사용하는 prop / API |
| :- | :- | :- |
| `Text` 스타일 9줄 | 일반 텍스트와 8가지 스타일 | `bold`, `italic`, `underline`, `strikethrough`, `dimColor`(회색), `inverse`, `color: 'red'`, `backgroundColor: 'blue'`(텍스트 너비만큼만 채움), `children`. `Box({ flexDirection: 'column' })`로 세로 배치 |
| `Markdown` | Claude 응답과 같은 서식 | 내용은 `children`이 아닌 `text`. 제목은 `#` 없이 굵게, 인라인 코드는 백틱 없이 색상, 인용문은 왼쪽 막대 + 기울임꼴 |
| `Link` | 레이블 뒤에 URL을 회색으로 표시 | `href`, `label`. 클릭 가능 여부는 터미널에 따라 다름 |
| `Code` (소스) | Claude Code 자체 구문 색상, 줄 번호 | `language` 또는 `path`(언어 추론), `startLine`, `source`. 색상은 사용자 테마 |
| `Code` (diff) | unified diff 렌더링, 단어 단위 강조 | `format: 'diff'`, `source`에 하나 이상의 헝크. `@@` 줄 대신 줄 번호, 비슷한 줄의 변경 단어는 더 진한 음영 |
| `Box` | 가로 행 / 세로 열 배치, 테두리 | `flexDirection`, `gap`, `columnGap`, `borderStyle: 'round'`, `paddingX`. 테두리는 창 너비만큼 늘어남 |
| `Button` 3종 | 기본, 단축키 `plain`, 흐린 버튼 | `key`, `label`, `onPress`, `hotkey: 'n'`, `plain: true`, `dimColor: true`. 포커스 시 반전 색상 |
| `Input` 한 줄 | Enter로 제출하는 텍스트 필드 | `key`, `label`, `placeholder`, `value`, `submitLabel`, `onSubmit`. 포커스 시 레이블 굵게, 커서, `⏎` 뒤 `submitLabel` |
| `Input` 여러 줄 | 메모/커밋 메시지용 필드 | `rows: 4` (2 이상). Claude Code v2.1.301 이상 필요 |
| `Select` | 옵션 중 하나 선택 | `key`, `label`, `value`, `options: [{ value, label }]`, `onSelect(value)`. 닫힘: 레이블 + 현재 옵션 + 화살표, 열림: 목록 |
| `Raster` | 색상 문자 셀 그리드 (히트맵, 스파크라인, 게임 보드) | `key`, `columns`, `rows`, `cells`(base64 압축 문자열, `cellsOf` 헬퍼). 색상은 더 작은 팔레트로 반올림 (`0x2e7d32` → `#337733`) |
| `Svg` | SVG 문서 | `alt`, `width`, `height`, `source`. Desktop 앱과 VS Code 확장에서만 그려짐 |
| `Image` | PNG 또는 원시 픽셀 (샘플 없음) | `source.png`, `source.rgba`(base64), `source.file`, `alt` |
| `Client` | 두 번째 파일이 그리는 영역, 애니메이션과 포인터 입력용 (샘플 없음) | prop은 요소 레퍼런스 참조 |

### 핵심 코드 예시 (발췌)

```javascript
Code({ format: 'diff', source: '@@ -1,3 +1,3 @@\n # Mods\n-A mod is a plugin.\n+A mod is a plugin that runs code.\n Read on.' })

Button({ key: 'next', label: 'Next', hotkey: 'n', plain: true, onPress: noop })

Input({ key: 'title', label: 'Title', placeholder: 'Type a title and press Enter', value: '', submitLabel: 'save', onSubmit: noop })

Select({ key: 'format', label: 'Format', value: picked,
  options: [{ value: 'md', label: 'Markdown' }, { value: 'html', label: 'HTML' }, { value: 'txt', label: 'Plain text' }],
  onSelect: (value) => { picked = value } })

Raster({ key: 'grid', columns: 3, rows: 2, cells: cellsOf([
  [['█', 0x2e7d32], ['█', 0xf9a825], ['█', 0xc62828]],
  [['█', 0x2e7d32], ['█', 0x2e7d32], ['█', 0xf9a825]],
]) })
```

## 입력과 포커스

- `Button`, `Input`, `Select`는 컨트롤. 사용자는 Tab으로 컨트롤 사이를 이동한다.
- `focus: true`로 창을 열면 창에 키보드 포커스를 요청한다. 입력한 글자는 포커스 있는 `Input`으로 간다.
- 여러 줄 `Input` 키 동작:
  - 터미널에서 Enter는 여전히 **제출**. 새 줄은 백슬래시 + Enter, 또는 지원 터미널에서 Shift+Enter.
  - 위/아래 화살표는 행 사이 이동, 첫/마지막 행에서는 앞/뒤 컨트롤로 이동.
  - `onSubmit`과 `onInput`은 `\n`으로 연결된 전체 텍스트를 받는다.
  - 비어 있어도 지정한 행 수만큼 공간을 차지(창이나 밴드 높이까지). 긴 텍스트는 필드 안에서 스크롤.

## `Image` 렌더링 조건

그림으로 그려지는 터미널: kitty 0.28 이상, Ghostty, iTerm2 3.5 이상(Claude Code v2.1.305 이상 필요).
그 외에는 `alt` 텍스트가 흐리게 표시된다. 특히 다음 경우 `alt`가 표시된다:

- GNU screen 내부
- 요구 사항을 충족하지 않는 tmux 내부
- 모든 백그라운드 세션
- 전체 화면 렌더링이 아닌 iTerm2 (`CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT=1` 상태 포함). `/tui fullscreen` 필요
- iTerm2 또는 tmux에서 `source.file` 사용 시. 대신 `source.png` 또는 `source.rgba` base64로 전달

`CLAUDE_CODE_FORCE_TERMINAL_IMAGES=1`: 유니코드 플레이스홀더 kitty 프로토콜 터미널에서 흐린 텍스트가 보일 때 사용자가 설정. GNU screen, tmux 3.3 미만, tmux 팝업, `allow-passthrough` 꺼짐 환경에서는 설정 금지(상자가 표시됨).

tmux 내부 요구 사항: Claude Code v2.1.310 이상, tmux 3.3 이상, 팝업이 아닌 tmux 창, 바깥 터미널이 kitty 0.28+/Ghostty/iTerm2 3.5+, `focus-events`와 `allow-passthrough`가 `on`(kitty/Ghostty는 `all`도 가능), iTerm2에서는 `-CC` 없이 + 전체 화면 렌더링 + `CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT` 미설정 + `tmux display-message -p '#{window_bigger}'`가 `1`이 아님, 그리고 `png`/`rgba` 바이트로 전달.

```bash
tmux set -g allow-passthrough on
tmux set -g focus-events on
```

## mod가 그릴 수 있는 다른 위치

- 창과 밴드: interface.md "그릴 위치 선택하기"
- 스피너 같은 Claude Code 자체의 행: interface.md "Claude Code가 이미 그리는 내용 변경하기"
- 토스트, 상태줄, 로그 줄: `$.ui.toast`, `$.ui.status`, `$.ui.log` (06-api.md)
- 질문 대화 상자: `$.ui.ask` (05-events.md)

## 주의/제약

- 샘플은 완전한 mod가 아니다. 하네스 mod 안에 붙여 넣어 사용한다.
- VS Code 확장에서 `Code`는 `source`를 일반 텍스트로 표시(색상, 줄 번호, diff 음영 없음).
- VS Code 확장에서 여러 줄 `Input`은 한 줄. `rows`는 v2.1.301 미만에서 무시(한 줄).
- `Svg`는 터미널에서 그려지지 않는다. `Svg`만 반환하는 창은 터미널에서 빈 상태. `e.surface`를 확인해 다른 트리를 반환해야 한다.
- `Raster` 색상은 축소 팔레트로 반올림되므로 정확한 색을 기대하면 안 된다.
- `backgroundColor`는 텍스트 너비만큼만, `Box` 테두리는 창 전체 너비로 늘어난다.
- `Link` 클릭 가능 여부는 터미널 의존.
- `Image`의 `alt`는 여러 환경에서 대신 보이므로 그 자체로 의미가 통하게 작성한다.
- `ui.render` 트리가 유효성 검사를 통과하지 못하면 잘못된 결과를 반환한 훅으로 취급되어 건너뛰어진다(05-events.md).

## 테스트 체크리스트

- [ ] `/gallery` 실행 시 창이 열리고 `Plain text`가 보인다. Esc로 닫힌다(`closeOnEscape`).
- [ ] `register.js` 저장만으로 핫 리로드되어 `/gallery` 재실행 시 새 샘플이 보인다.
- [ ] `Text` 9줄: 각 스타일이 시각적으로 구분되고 `dimColor`는 회색, `backgroundColor`는 텍스트 너비만큼만 칠해진다.
- [ ] `Markdown`: 제목에 `#`이 없고, 인라인 코드에 백틱이 없고, 인용문에 왼쪽 막대가 있다.
- [ ] `Link`: 레이블 뒤 URL이 회색으로 보인다.
- [ ] `Code` (`language`, `startLine: 1`): 줄 번호 1부터, 테마 색상 적용. `path`만 줘도 언어가 추론된다.
- [ ] `Code` (`format: 'diff'`): 삭제 빨강, 추가 초록, `@@` 대신 줄 번호, 변경 단어 진한 음영.
- [ ] `Box`: `columnGap: 4` 간격의 가로 행, `borderStyle: 'round'` 테두리가 창 너비로 늘어난다.
- [ ] `Button`: Tab 두 번 후 두 번째 버튼이 반전. `n` 키로 `hotkey` 버튼이 눌린다. `onPress`에서 `$.ui.log` 등으로 호출 확인.
- [ ] `Input`: 포커스 시 레이블 굵게 + 커서 + `⏎ save`. Enter 시 `onSubmit`이 입력값으로 호출된다.
- [ ] `Input rows: 4`: 4행 공간 확보, 백슬래시+Enter로 줄바꿈, `onSubmit`이 `\n` 포함 텍스트를 받는다. 화살표로 행 이동, 경계에서 다음 컨트롤로 이동.
- [ ] `Select`: 열림/닫힘 상태 전환, 선택 후 `onSelect`가 `value`로 호출되고 다시 그릴 때 새 값이 보인다.
- [ ] `Raster`: 2x3 색 블록, `0x2e7d32`가 `#337733` 근사로 보인다. 셀을 매 프레임 바꿔 게임 보드/스파크라인 갱신 확인.
- [ ] `Svg`: 터미널에서 빈 창, Desktop/VS Code에서 막대 3개. `e.surface` 분기로 터미널에서는 `Text` 대체가 보인다.
- [ ] `Image`: kitty/Ghostty/iTerm2(전체 화면)에서 그림, 그 외 터미널/tmux 미충족/백그라운드 세션에서 `alt`가 흐리게 보인다. `source.file` vs `source.png` 차이 확인.
- [ ] `focus: true`로 연 창에서 바로 타이핑하면 `Input`에 입력된다.
