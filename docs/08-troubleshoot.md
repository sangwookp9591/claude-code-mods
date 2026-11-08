# 08. mod 문제 해결 (troubleshoot)

> 원문: https://code.claude.com/docs/ko/plugins/mods/troubleshoot
> 모듈이나 훅이 실패하면 Claude Code는 그것을 건너뛰고 세션을 계속한다. 그래서 손상된 mod는 "아무것도 안 하는 mod"처럼 보인다.

## 1. 진단 순서

1. **정적 검사**: `claude plugin validate ./first-mod`. 세션 없이 철자 틀린 이벤트, 잘못된 매니페스트, 읽을 수 없는 모듈을 찾는다.
2. **로드 가능 여부**: mod가 **없는** 디렉터리에서 `claude plugin test` 실행 (아래 표).
3. **기록된 줄 확인**: 모듈 미로드, 훅 건너뜀, 다른 mod의 거부는 mod 이름이 들어간 한 줄로 기록된다. 위치는 세션 종류에 따라 다르다.

| 세션 종류 | 줄이 보이는 곳 |
| :- | :- |
| 플러그인 디렉터리를 핫 리로드하는 세션 (`--plugin-dir`로 시작한 대화형, 또는 Claude가 작성한 mod에 핫 리로드를 켠 세션) | 트랜스크립트의 흐린 줄 |
| 그 외 대화형 세션 (예: 마켓플레이스 설치 mod) | 디버그 로그에만. `claude --debug`로 시작 |
| `--plugin-dir`을 쓴 `claude -p` | 기본 텍스트 출력에서 stderr. 다른 mod에 의한 거부는 디버그 로그에만 |

### `claude plugin test`로 로드 가능 여부 확인 (mod 없는 디렉터리에서)

| 메시지에 포함된 내용 | 의미 |
| :- | :- |
| `no hooks module to load` | mod를 로드할 수 있다. 단지 현재 디렉터리에 테스트할 mod가 없다 |
| `hooks modules are turned off here` | 설정이 차단 중. 사용자 설정의 `disableAllHooks` 또는 조직 정책 |
| `hooks modules are turned off in this process: the rollout switch served off` | Anthropic이 설치된 mod를 원격으로 껐다 |
| `hooks modules are turned off in this process: the rollout switch was saved off by an earlier session` | 이전 세션이 저장한 값(오래됐을 수 있음). `claude`를 한 번 시작해 새로 고친 뒤 재실행 |

주의: `allowManagedModsOnly`는 이 명령이 보고하지 않는다. 이 경우 사용자 mod는 기본 제공 가드 메시지와 함께 거부된다.

## 2. 증상 -> 원인 -> 해결 표

### 2.1 mod가 로드되지 않음 (명령도, 그리기도, 동작 변화도 없음)

| 증상 / 메시지 | 원인 | 해결 |
| :- | :- | :- |
| 아무것도 안 나타남 | 버전이 너무 오래됨 | overview 문서의 버전 확인 절차 참고 |
| `/plugin`의 `mods active` 줄에 mod 이름 없음 | 훅 모듈 미로드. 디버그 로그에 `hooks module <name> not loaded: <reason>` (예: `hooks module first-mod@inline not loaded: disableAllHooks in managed settings`) | 콜론 뒤 이유를 아래 거부 메시지 표에서 찾는다 |
| `claude -p`에서 stderr로 `hooks module not loaded` | 훅 모듈 거부 (비대화형이라 stderr로 출력) | 콜론 뒤 이유 확인 |
| `validate`는 통과하지만 `hooks` 줄이 나열되지 않음 | `hooks/hooks.json`에 `modules` 키가 없거나 철자 오류 | `"modules": ["./register.js"]` 추가 |
| `<mod> hooks module did not load: <reason>` | 모듈 로드 실패 (예: 최상위 코드에서 예외). 코드 문제면 파일과 줄 표시 | 이유의 오류 수정 |
| 위 이유가 `; the version loaded before is unloaded`로 끝남 | 실행 중인 버전이 없음 | 수정 후 `/reload-plugins` |
| `hooks module did not load: options do not fit plugin.json userConfig: ...` | `userConfig` 검증 실패 (예: `max` 초과, 필수값 없음) | 줄 끝에 나온 `settings.json`의 `pluginConfigs` 항목 값을 설정/변경 |
| `code nested too deep to scan: more than 2000 scopes` | 한 파일에서 범위 중첩이 2,000 초과 (`validate`도 보고) | 덜 깊게 중첩되도록 재작성 |
| `the engine ran out of stack linking the file and its imports` | 중첩이 너무 깊거나 import 체인이 너무 김 | 가장 깊은 중첩 축소 또는 import 체인 단축 |
| `code nested too deep to scan (the parser stopped: <message>)` / `the engine ran out of stack loading the file (code nested too deep): <message>` | 파일 읽는 중 스택 부족. 줄 번호 없음 | 파일에서 가장 깊은 중첩을 직접 찾아 축소 |
| 처음 연 디렉터리에서 로드 안 됨 | 신뢰 프롬프트에 응답 안 함 | 그 디렉터리에서 `claude` 대화형 시작 후 신뢰 수락 |
| 설치된 플러그인이 전부 로드 안 됨 | `--safe-mode`로 시작 | 플래그 없이 시작 |
| Claude가 쓴 mod가 로드 안 되고 핫 리로드 질문도 다시 안 나옴 | 질문이 답 없이 세 번 종료되어 핫 리로드가 꺼진 채 유지 (예: `askUserQuestionTimeout` 만료). 직접 닫은 경우는 세 번에 미포함 | mod 디렉터리를 mods 폴더 밖으로 복사 후 `claude --plugin-dir ~/mods/git-branch` |

### 2.2 거부 메시지 (디버그 로그의 `hooks module <name> not loaded:` 뒤)

| 메시지 시작 부분 | 의미 |
| :- | :- |
| `hooks modules are turned off for installed plugins in this process: the rollout switch served off` | Anthropic이 원격으로 끔 |
| `hooks modules are turned off for installed plugins in this process: the rollout switch was saved off by an earlier session` | 오래된 저장값. Claude Code 재시작 |
| `disableAllHooks in managed settings` | 조직이 설치 플러그인 훅을 끔 |
| `only managed plugins and built-in plugins run` | `allowManagedHooksOnly` 설정, 또는 관리형이 아닌 설정 파일에 `disableAllHooks` |
| `installed plugins that are not managed load no hooks module in this mode (--bare)` | `--bare`로 시작 |
| `another plugin of that name loads first` | 활성화된 다른 플러그인이 같은 이름을 차지 |

### 2.3 기본 제공 가드 메시지 (관리형 설정이 있거나 Team/Enterprise `/login` 세션)

| 메시지 포함 내용 | 의미 | 표시 위치 |
| :- | :- | :- |
| `mods are limited to your organization's by policy (allowManagedModsOnly)` | 조직 자체 mod만 허용 | 디버그 로그 + 핫 리로드 세션의 트랜스크립트 |
| `tried to lift a deny rule in your settings` | mod의 `tool.check` 훅이 `deny` 규칙이 거부하는 호출을 승인하려 함. 호출은 계속 거부됨 | 트랜스크립트와 디버그 로그 (세션에서 mod마다 1회). `claude -p`는 디버그 로그만 |
| `the deny rules in your settings could not be checked for this call, so it is refused` | 가드가 확인 중 실패하여 거부 | Claude가 읽는 거부 사유 |

### 2.4 훅 건너뜀 / mod 언로드

| 증상 / 메시지 | 원인 | 해결 |
| :- | :- | :- |
| `<mod>: <event> hook skipped: <reason>` (예: `first-mod: tool.call hook skipped: threw Error: boom`) | 훅이 예외, 시간 제한 초과, 잘못된 형태의 결과 반환. 트랜스크립트에는 재로드까지 이벤트와 실패 유형마다 1회, 디버그 로그는 매번 | 오류 수정 |
| `first-mod registered /tally but no command.run hook answered it` | 명령이 응답 없이 체인 끝에 도달. `command.run` 훅 없음, 필터가 다른 명령 지정, 훅이 `next(e)` 반환, 또는 훅이 건너뛰어짐 (`$.ui.open`에 `focus: false` 전달도 한 원인) | 훅 추가, 또는 `command.run`을 가리키는 `hook skipped` 줄의 이유 확인. 같은 명령을 실행하는 테스트도 같은 이유로 실패 |
| `first-mod was unloaded: it crashed the hooks worker` | 설치 mod들이 공유하는 워커 스레드가 멈추거나 충돌, 원인이 이 mod로 추적됨 (예: await 없는 루프) | 훅 수정 |
| `first-mod: its session.start ran again in a fresh copy; the $.prompt.submit call it had already made was not made again` | 모듈 재로드 후 새 사본의 `session.start` 실행. `$.prompt.submit`, `$.command.run`, `$.agent.spawn` 호출은 첫 실행 결과로 확정되어 중복 실행 안 됨 | 수정 불필요 (v2.1.292 이전엔 중복 실행됐음) |
| `This mod's change didn't load, so the earlier version is still running: <reason>.` / `This mod didn't load, and the earlier version is no longer running: <reason>.` | 이 세션에서 Claude가 작성한 mod의 변경 로드 실패 | Claude는 이 줄을 못 보므로 다음 메시지에 붙여 넣어 수정 요청 |
| `first-mod: $.agent.register refused: the hooks module that made the call is no longer loaded (it was reloaded or removed)` | 이전 사본에서 아직 실행 중이던 코드의 호출 | `session.start` 훅에서 등록 (재로드 후 새 사본마다 재실행됨) |
| `hooks: mods that run in the hooks worker are off for this session: it crashed 3 times` | 워커가 3번 중단, 원인 mod 특정 불가. 내장 외 모든 mod 언로드 (조직 mod 포함) | `/reload-plugins` |

### 2.5 도구 호출 거부

| 메시지 | 원인 | 해결 |
| :- | :- | :- |
| `a hook changed this call's input after the model wrote it` | 자동 모드에서 서버 측 분류기 검토 후 훅(`tool.call`, `turn.step`, 또는 `PreToolUse`)이 입력을 변경 | 메시지가 Claude에게 원래대로 재실행을 지시. 또 거부되면 mod/훅을 끄거나 자동 모드 종료 후 직접 승인 |
| `a hook changed this call's input after auto mode reviewed it` | 일부 대화형 터미널/VS Code 세션의 같은 거부. 재시도에는 mod의 첫 변경만 반영 | Claude가 자동 모드가 확인할 수 없었다고 알리지 않는 한 변경 불필요 |

### 2.6 턴 중지 후 토스트

| 메시지 | 원인 | 해결 |
| :- | :- | :- |
| `Stopped: type a message to continue; a mod cannot resume work after Stop` | Esc 등으로 중지 후 mod가 스스로 작업을 시작하려 했고 거부됨 | 수정 불필요. 다음 메시지를 보내면 재개 가능 |

### 2.7 그림이 안 보이거나 반응 없음

| 증상 / 메시지 | 원인 | 해결 |
| :- | :- | :- |
| 다른 mod의 band는 보이는데 내 band는 안 보임 | 프롬프트 위 band는 하나를 공유. 먼저 실행되는 mod가 `next(e)` 결과를 포함하지 않은 트리를 반환 | 그 mod가 `await next(e)` 결과를 `Box` 자식으로 넣게 함. 그 `Box`와 감싸는 `Box`에 `width`, `height`, `minWidth`, `minHeight`, `position`, `top`, `left`, `right`, `bottom`, `display`, `overflow` 금지. 디버그 로그에서 `answered ui.render without next()` 검색 |
| pane/band가 비어 있거나 Claude Code 기본 콘텐츠 표시 | 트리 유효성 검사 실패. 예: `first-mod: ui.render hook skipped: returned the wrong shape (a tree Pane refuses: Box prop "flexDirection" must be one of row, column, row-reverse, column-reverse)` | 이유 수정. 잘렸으면 디버그 로그에서 `a hook returned a tree that does not validate` 검색 |
| `ui.render (<site>) refused:` 또는 `ui.render (<site>): the chain settled on a tree that does not validate` | 트리가 크기 제한 초과. 예: `hooks: ui.render (AbovePrompt) refused: deeper than 32; nothing was drawn` | 더 작은 트리 반환. 줄이 `hooks`로 시작하면 여러 mod가 그 지점에 그리므로 각각 확인 |
| `<Input> needs a key`, `<Select> needs a key`, `<Button> needs a key` | `key` 없음, 빈 값, 또는 문자열 아님 (`key: 3`) | 비어 있지 않은 문자열 `key` |
| `Input "size" is drawn twice; each takes its own key` | 같은 종류 두 요소가 같은 `key` | 고유한 `key` |
| 테스트 `press`에서 `key each once` | 같은 key의 버튼이 둘 이상. `key` 없이 레이블이 같으면 레이블을 key로 공유 | 고유한 `key` |
| `first-mod: ui.render (ToolUse) threw while drawn: <error>; the engine drew its own` | 반환 트리 또는 `next`에 넘긴 `props`로 그리는 중 오류. 기본 콘텐츠로 대체 | 훅의 값 수정 |
| `my-mod: Client client/spinner.js: the module failed without a message` | `Client`가 메시지 없는 오류(`throw new Error()`)로 실패 | 오류에 메시지 지정 |
| `$.ui.open`이 실행되는데 pane이 안 나타남 | 사용자 동작에서 비롯되지 않았고 터미널이 필요 너비보다 좁음 | 명령/버튼에서 열거나 `isPlaced` 결과 확인 |
| toast가 안 보임 | 호출 거부(예: `first-mod: $.ui.toast dropped: timeoutMs is a whole number of ms, 1 to 60000`), pane의 `holdToasts`, 클래식 렌더러에서 프롬프트 아래 오른쪽에 한 줄로 표시, 새 toast가 대체(`gave way, cut short` / `gave way, unseen`), 전체 화면에서 동시 3개 제한으로 만료(`left the stack, never drawn`) | 디버그 로그에서 `$.ui.toast (first-mod): <text>` 줄 확인 후 원인별 조치. 여러 메시지는 toast 하나로 합침 |
| band에 `plugin panel hidden` / `▸ plugin panel hidden` | band가 접힘 (Ctrl+X 다음 Ctrl+A, 또는 전체 화면에서 `[-]` 클릭) | 같은 키 또는 행 클릭으로 펼침 |
| 단축키가 안 먹음 | 포커스 없음, 접힌 band 안, 또는 VS Code (단축키 없음) | Ctrl+X 다음 Tab, 또는 `focus: true`로 열기. band 펼치기. VS Code는 클릭 또는 포커스 후 Enter |
| 터미널에선 되는데 Desktop/VS Code에선 안 됨 | 그 앱이 해당 지점/요소를 그리지 않음, VS Code 확장 < 2.1.299, 또는 확장 < 2.1.304 + 기능 플래그 미수신 세션 (Bedrock, Agent Platform, Foundry, Claude apps gateway 등) | `e.surface` 확인 후 그 앱이 그릴 수 있는 트리 반환. 확장 업데이트 또는 통합 터미널에서 `claude` |

### 2.8 편집 내용이나 값이 사라짐

| 증상 | 원인 | 해결 |
| :- | :- | :- |
| 편집이 적용 안 됨 | 설치된 플러그인의 캐시 사본이 실행 중 | `claude --plugin-dir ./first-mod`로 작업 사본 지정 (저장마다 재로드) |
| 재로드 시 값 초기화 | 모듈 수준 변수는 재로드마다 재초기화 | `$.state` 또는 `$.store`에 보관 |
| `/clear`, `/resume`, `/branch` 후 값 초기화 | 이 명령들은 `$.state`를 기본값으로 재설정하고 `session.start`는 다시 발생하지 않음 | `classic.SessionStart` 훅에서 저장값 재로드 |
| `settings.read` 훅이 반환한 키가 적용 안 됨 | 권한 규칙과 `env`는 Claude Code 자체 읽기에서 반환해도 적용 안 됨 | 설정 파일 사용, `env`는 `$.env.set` |

`settings.read` 관련 디버그 로그 줄:

| 로그 줄 | 의미 및 조치 |
| :- | :- |
| `<mod> settings.read hook skipped` | 훅 실패. 오류 수정 |
| `<mod> ... settings.read bypassed by cc-plugin-sec-default` | 기본 제공 가드가 건너뜀. 관리자에게 조직 mod로 설치 요청 |
| `settings.read: the answer for <key> is no value the key can hold; the settings' own value stands` | 반환값이 키 스키마와 불일치. 내 값이 틀렸으면 settings-reference에 맞게 수정, 맞으면 다른 mod를 찾음 |
| `settings.read: the merge never settles for <key>` | 그 키는 설정 소스 값을 유지. 설정 파일에서 설정 |
| `<mod> answered settings.read without next()` | 앞서 실행된 mod가 가로챔. 그 mod를 끄거나 관리자에게 요청 |
| `settings.read: refused to the engine (engine: $.settings.read: <reason>); the settings' own values stand` | Claude Code 자체 읽기가 거부되어 모든 훅 값 폐기. 내 코드에 사유 텍스트가 있으면 `next.origin`이 엔진 읽기일 때 `{ value }`를 반환하도록 수정. 없으면 다른 mod를 하나씩 끄며 `claude --debug-file ./settings-read-2.log ...`(매번 새 경로)로 `refused to the engine` 검색 |

## 3. 디버그 로그 읽기

```bash
claude --debug-file ./mod-debug.log --plugin-dir ./first-mod
# 다른 터미널
tail -f ./mod-debug.log | grep first-mod
```

- 로드 성공 줄 (`--plugin-dir` mod는 `@inline`이 붙음):

  ```text
  hooks module first-mod@inline loaded (worker, environment 2, tier user); events: session.start,tool.call,command.run,ui.render
  ```
- 로그에 직접 쓰기: `$.ui.log('message', { to: 'debug' })`. 두 번째 인수가 없으면 트랜스크립트에 흐린 줄.
- `--plugin-dir` mod를 편집하면 재로드마다 트랜스크립트에 mod 이름과 훅 목록 줄이 나온다. 저장이 모듈을 망가뜨리면 `reload failed, the previous version stays loaded:`와 이유가 나오고, 다음 재로드(`/reload-plugins` 등)까지 마지막 정상 버전이 유지된다.

## 테스트 체크리스트

- [ ] `claude plugin validate ./<mod>`가 오류 없이 통과하고, 처리 이벤트와 `hooks` 줄을 나열한다.
- [ ] mod 없는 디렉터리에서 `claude plugin test`가 `no hooks module to load`를 출력한다 (= 이 환경에서 mod 로드 가능).
- [ ] `claude --debug-file ./mod-debug.log --plugin-dir ./<mod>`로 시작하면 로그에 `hooks module <mod>@inline loaded (... tier user); events: ...` 줄이 있다.
- [ ] `/plugin` 화면에 `1 mod active · <mod>` 형태의 줄이 보인다.
- [ ] `hooks/hooks.json`에서 `modules` 키를 지우면 `validate`는 통과하지만 `hooks` 줄이 사라진다 (재현 확인 후 복구).
- [ ] 훅에서 일부러 `throw new Error('boom')`하면 트랜스크립트/로그에 `<mod>: <event> hook skipped: threw Error: boom`이 나온다.
- [ ] `command.run` 훅 필터를 다른 명령으로 바꾸면 `<mod> registered /<cmd> but no command.run hook answered it`가 나온다.
- [ ] `Button`의 `key`를 빼면 `<Button> needs a key`가 나온다.
- [ ] `$.ui.log('x', { to: 'debug' })` 호출이 디버그 로그에만 나타나고 트랜스크립트에는 없다.
- [ ] 저장으로 모듈을 망가뜨리면 `reload failed, the previous version stays loaded:`가 나오고 이전 동작이 유지된다.
- [ ] `/clear` 후 `$.state` 값이 `classic.SessionStart` 훅으로 복원된다.

## 주의/제약

- 실패한 모듈과 훅은 조용히 건너뛰어진다. "아무 반응 없음"은 곧 로그를 볼 신호다.
- 마켓플레이스 설치 mod의 실패는 트랜스크립트에 안 나오고 디버그 로그(`claude --debug`)에만 남는다.
- `claude plugin test`는 `allowManagedModsOnly` 차단을 보고하지 않는다.
- `hook skipped` 줄은 트랜스크립트에선 재로드까지 이벤트와 실패 유형마다 한 번만 표시된다. 전체 기록은 디버그 로그.
- 설치된 mod는 하나의 워커 스레드를 공유한다. await 없는 루프 같은 블로킹 코드는 mod 언로드로 이어지고, 세 번 충돌하면 내장 외 모든 mod가 꺼진다.
- 모듈 수준 변수는 재로드마다 초기화된다. 지속 값은 `$.state` / `$.store`.
- `/clear`, `/resume`, `/branch` 후에는 `session.start`가 다시 오지 않는다. 복원은 `classic.SessionStart`.
- 프롬프트 위 band는 모든 mod가 공유한다. `ui.render`에서 `next(e)` 결과를 버리면 다른 mod의 band를 지운다.
- 트리 깊이는 루트 아래 32단계, 파일 내 범위 중첩은 2,000 제한.
- Claude는 트랜스크립트의 `This mod's change didn't load` 줄을 볼 수 없다. 직접 붙여 넣어야 한다.
- 버전 의존 동작: `session.start` 재실행 중복 방지는 v2.1.292+, `threw while drawn` 세션 유지는 v2.1.289+, toast 2초 드롭은 v2.1.290에서 제거, `refused:` 의미 변경은 v2.1.307.
