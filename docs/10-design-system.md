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
| `warn` | `warning` | 진행 중 ◐, 60% 이상 |
| `bad` | `error` | 실패 ✗, 85% 이상 |
| `muted` | `subtle` | 거부 ⊘, 0인 값 |
| `info` | `suggestion` | 일반 수치 |

예외는 `Raster` 하나다. 셀 색이 `0x00RRGGBB`만 받으므로 `kit.tsx`의 `RGB` 표가 같은 의미의 고정 색을 둔다.

임계값은 `levelTone(pct)` 한 곳에서 정한다. 60 미만 `ok`, 85 미만 `warn`, 그 이상 `bad`.

## 부품

모든 부품은 JSX 컴포넌트가 아니라 **요소 표 `ui`를 첫 인자로 받는 함수**다. 요소는 전역이 아니고 `$.ui.resolve(e)`가 표면마다 다른 표를 주기 때문이다. 호출은 `{Meter(ui, 'context', 42, 20)}`처럼 한다.

| 부품 | 모양 | 비고 |
| :- | :- | :- |
| `Heading(ui, text, right?)` | `◆ 제목 ........ 오른쪽 메모` | 창의 첫 줄 |
| `Tabs(ui, tabs, active, onPick)` | `[ Overview ] [ Tools ]` | 활성 탭은 `variant="primary"`. 각 탭에 `key="tab-<id>"`와 숫자 `hotkey` |
| `Rule(ui, width)` | `────────` | 탭과 본문 사이 |
| `Meter(ui, label, pct, width)` | `context ████░░░░ 42%` | `null`이면 `n/a` |
| `Stat(ui, label, value, tone)` | 위 작은 라벨, 아래 굵은 값 | `flexWrap="wrap"` 줄에 나란히 |
| `Spark(ui, key, values, width, opts)` | `▁▂▅▇█` | 터미널은 색 있는 `Raster` 한 개, 다른 표면은 `Text` |
| `duration`, `usd`, `clip`, `bar`, `sparkText` | 서식 함수 | 순수 함수 |

## 배치 규칙

1. 창과 띠의 너비는 `e.props.bodyColumns`로 맞춘다. 창이 트랜스크립트 옆에 붙으면 viewport보다 좁다.
2. 창의 높이는 `e.viewport?.rows`로 짐작하고, 목록은 그만큼만 그린다. 보이는 부분만 그리는 것이 10만 자 제한을 피하는 방법이다.
3. 띠는 한 줄이다. `e.props.hasSurvey`일 때와 보여 줄 것이 없을 때는 `next(e)`로 물러난다. 숨기기 버튼 `×`를 둔다. 사용자가 반드시 답해야 하는 것은 띠에만 두지 않는다. 사용자가 띠를 접으면 mod는 그 사실을 알 수 없다.
4. 목록의 각 `Button`에는 고유한 `key`를 준다.
5. 색 칸 격자는 `Box` 여러 개가 아니라 `Raster` 하나로 그린다.

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
- 옛 버전이 저장한 값을 `on('state.get', { key }, ...)`로 주입해 shape 태그가 막는지 확인한다.
