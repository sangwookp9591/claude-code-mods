# 10. mod 디자인 시스템 (mod-starter 템플릿)

이 문서는 `template/mod-starter/`와 그 UI 키트 `hooks/kit.tsx`의 규칙을 정리한다. cockpit mod가 이 키트로 만들어졌고, `scripts/new-mod.sh`가 새 mod를 같은 골격으로 찍어 낸다.

## 새 mod 만들기

```bash
./scripts/new-mod.sh my-board "My Board" "한 줄 설명"
claude plugin validate ./mods/my-board
claude plugin test ./mods/my-board
claude --plugin-dir ./mods/my-board
```

이름은 소문자, 숫자, 하이픈만 쓰고 64자 이하다. 제목과 설명에는 역슬래시, 따옴표, 백틱을 넣을 수 없다. 이 값들이 JSON과 TS 문자열에 그대로 들어가기 때문이다.

## 골격

| 파일 | 역할 |
| :- | :- |
| `.claude-plugin/plugin.json` | 이름, 버전, 설명, `author`, `license`, `"types": "./types/index.d.ts"` |
| `hooks/hooks.json` | `{ "modules": ["./register.tsx"] }` |
| `hooks/register.tsx` | 훅 전부. 명령, 창, 띠, 이벤트 기록 |
| `hooks/kit.tsx` | 표면에 독립적인 UI 부품과 서식 함수 |
| `types/index.d.ts` | `PluginState['<mod>']` 상태 계약. 목록 값은 `Shaped<T>` |
| `tests/*.test.tsx` | `claude plugin test`가 돌리는 행동 테스트 |

## 디자인 토큰

색은 직접 RGB를 쓰지 않고 테마 키에 의미를 붙여 쓴다. 사용자가 고른 테마를 그대로 따라가기 때문이다.

| 토큰 (`tone.*`) | 테마 키 | 쓰임 |
| :- | :- | :- |
| `accent` | `claude` | 제목 글리프 ◆, 강조 수치 |
| `ok` | `success` | 정상, 완료 ✓ |
| `warn` | `warning` | 거부 ⊘, 60% 이상 |
| `bad` | `error` | 실패 ✗, 85% 이상 |
| `muted` | `subtle` | 0인 값 |
| `info` | `suggestion` | 진행 중 ◐, 일반 수치 |

`Raster`는 셀 색으로 `0x00RRGGBB`만 받아 사용자 테마를 따르지 못하므로 키트에서 쓰지 않는다. 같은 그래프가 표면마다 다르게 읽히지 않도록 모든 표면에 같은 `Text` 경로를 쓴다.

임계값은 `LEVELS`와 `levelTone(pct)` 한 곳에서 정한다. 60 미만 `ok`, 85 미만 `warn`, 그 이상 `bad`. 색을 구분하기 어려운 사람도 읽도록 `levelWord(pct)`가 `roomy`, `filling`, `nearly full`을 함께 준다.

## 부품

모든 부품은 JSX 컴포넌트가 아니라 **요소 표 `ui`를 첫 인자로 받는 함수**다. 요소는 전역이 아니고 `$.ui.resolve(e)`가 표면마다 다른 표를 주기 때문이다. 호출은 `{Meter(ui, 'context', 42, 20)}`처럼 한다.

| 부품 | 모양 | 비고 |
| :- | :- | :- |
| `Heading(ui, text, width, right?)` | `◆ 제목 ........ 오른쪽 메모` | 창의 첫 줄. 자리가 없으면 오른쪽 메모를 뺀다 |
| `Tabs(ui, tabs, active, width, onPick)` | `[ ▸Overview ] [  Tools ]` | 활성 탭은 `variant="primary"`와 `▸`로 표시. 각 탭에 `key="tab-<id>"`와 숫자 `hotkey`. 좁으면 `short` 이름을 쓴다. 숫자 단축키는 창에 포커스가 있을 때만 동작한다 |
| `Pager(ui, page, size, total, noun, onPage)` | `1–10 of 40 calls Newer Older` | 긴 목록을 `scroll.bodyRows`에 맞춰 나눈다 |
| `Rule(ui, width)` | `────────` | 탭과 본문 사이 |
| `Meter(ui, label, pct, width)` | `context ████░░░░ 42% roomy` | `null`이면 `n/a` |
| `Stat(ui, label, value, tone)` | 위 작은 라벨, 아래 굵은 값 | `flexWrap="wrap"` 줄에 나란히 |
| `Spark(ui, key, values, width, opts)` | `▁▂▅▇█` | 모든 표면에서 같은 축과 색. 왼쪽 정렬. 위에 범위 라벨을 둔다 |
| `cells`, `clip`, `clipMiddle` | 표시 폭 계산과 자르기 | 전각 문자는 2칸. `clipMiddle`은 파일 이름을 남긴다 |
| `duration`, `usd`, `bar` | 서식 함수 | 순수 함수 |

## 배치 규칙

1. 창과 띠의 너비는 `e.props.bodyColumns`로 맞춘다. 창이 트랜스크립트 옆에 붙으면 viewport보다 좁다. 임의의 하한(20열 같은)을 두지 않고, 좁으면 정보를 단계적으로 뺀다.
2. 창의 높이는 `e.props.scroll.bodyRows`로 정하고, 긴 목록은 `Pager`로 나눈다. 잘린 목록은 숨은 개수와 다음 페이지를 보여 준다.
3. 띠는 한 줄이다. `e.props.hasSurvey`일 때와 보여 줄 것이 없을 때는 `next(e)`로 물러난다. 상태줄과 창에 이미 있는 값을 반복하지 말고 최근 결과와 행동을 보여 준다. 위험 구간의 값만 띠로 올린다. 숨기기 버튼을 두고, 창 안에 다시 표시하는 버튼을 함께 둔다. 사용자가 반드시 답해야 하는 것은 띠에만 두지 않는다. 사용자가 띠를 접으면 mod는 그 사실을 알 수 없다.
   값이 어느 시점의 것인지 적는다. `turn.complete`에서 저장한 값이면 "마지막 완료 턴" 기준임을 표시한다. 띠와 창은 terminal과 desktop에서 쓰이며 `AbovePrompt`는 다른 표면에서 호출되지 않는다.
   **세션 합계는 보관 배열에서 계산하지 않는다.** 배열은 잘리므로 합계용 값을 따로 둔다.
4. 목록의 각 `Button`에는 고유한 `key`를 준다.
5. 한 그리기의 예산은 세 겹으로 지킨다. 행 수는 `bodyRows` 안에서, 필드 하나는 `FIELD_MAX`(240자) 안에서 저장하고, 표시는 `clip`으로 열 수에 맞춘다. 행 수만 제한하면 긴 도구 이름 하나가 직렬화 한도(10만 자)를 넘길 수 있다.

## 상태 규칙

| 값 | 둘 곳 | 이유 |
| :- | :- | :- |
| 그리는 데 쓰는 값 | `$.state` (`atom`, `read`, `update`) | 쓰기가 읽는 쪽만 다시 그리고, 핫 리로드 뒤에도 남는다 |
| 세션을 넘는 값 | `$.store` | 쓰기를 한 줄로 직렬화한다. 동시에 읽고 쓰면 값이 사라진다 |
| 한 턴 안의 계수기 | 모듈 변수 | 리로드에 사라져도 되는 값만 |

- 목록 값은 계약에서 `Shaped<T>`로 선언하고 `atom(ref, [], { shape: 'calls-1' })`처럼 태그를 붙인다. 필드를 바꾸면 태그를 올린다. 옛 코드가 저장한 값은 초기값으로 읽힌다.
- 태그가 없는 열거 값(탭 등)은 그릴 때 허용 목록으로 검사하고, 아니면 기본값으로 떨어뜨린다.
- `/clear`는 `session.start`를 다시 부르지 않는다. 초기화는 `classic.SessionStart`에서 `e.source === 'clear'`일 때 한다.
- 렌더 훅 안에서는 쓰지 않는다. 쓰기는 버튼 핸들러나 다른 이벤트에서 한다.

## 동작 규칙

- 창은 대화형 세션에서만 스스로 연다(`session.start`의 `e.isInteractive`). 헤드리스에서는 `ui.open`이 `no-surface`로 실패한다.
- 서브에이전트의 턴은 `turn.start`와 `turn.complete`의 `e.agentId`로 거른다.
- 막는 훅(`tool.call`이 `deny`를 줄 수 있는 경우)에는 `.catch`를 단다. 실패한 훅은 건너뛰어지고 동작은 그대로 진행된다(fail open).

## 테스트 규칙

- `mock.clock(on)`과 `mock.store(on)`로 시계와 저장소를 대신한다.
- 엔진 대역은 `on('command.register', ...)`, `on('tool.call', ...)`처럼 테스트의 `on`으로 세운다.
- 그리기 테스트는 표면 목록을 돌며 `$.ui.mount`로 한 번씩 그린다. 최소 `terminal`과 `desktop`.
- 레이아웃 fixture를 둔다. 20, 32, 56열에서 어느 행도 폭을 넘지 않는지, 긴 한글 경로, 긴 MCP 도구 이름, 보관 한도를 넘는 호출 수, 띠 숨김 뒤 복원, 표면별로 같은 그래프를 확인한다.
- 옛 버전이 저장한 값을 `on('state.get', { key }, ...)`로 주입해 shape 태그가 막는지 확인한다.
