# 11. 기능 실측표 (mods-lab)

측정 환경: Claude Code v2.1.319, macOS, `echo "/lab run" | claude -p --plugin-dir ./mods/mods-lab` (2026-11-07). 토큰 0 사용.
대화형 세션에서는 `/lab`으로 창을 열고 버튼으로 하나씩 누른다.

기호: `+` 통과, `x` 실패, `-` 건너뜀.

## 헤드리스 실측 결과

| 그룹 | 프로브 | 결과 | 엔진의 답 |
| :- | :- | :- | :- |
| UI | `ui.toast` / `ui.status` / `ui.log` | + | 호출 성공 (반환값 없음) |
| UI | `ui.notice` | - | 사람이 다음 도구 호출에서 확인해야 함 |
| UI | `ui.notify` | x | `not sent: no-surface` |
| UI | `ui.copy` | x | `not copied: no-surface` |
| UI | `ui.open` / `ui.panes` / `ui.close` | x | `no-surface: no surface is attached ($.session.surfaces() is empty)` |
| UI | 띠 (`AbovePrompt`) | - | 사람이 `band ok`를 눌러야 함 |
| Data | `store` set/get/delete | + | 삭제 뒤 `undefined` |
| Data | `state` (`update`) | + | counter 0 -> 1 |
| Data | `fs.list` / `fs.read` | + | cwd 7개 항목, 자기 `plugin.json` 읽음 |
| Data | `process.run` | + | exit 0, stdout `mods-lab` |
| Data | `env.get` | + | `HOME` 읽음 |
| Data | `settings.read` | + | 최상위 키 14개 |
| Data | `http.fetch` | + | status 200 |
| Session | `cwd` `usage` `version` `messages` `model` `id` `turns` | + | version 2.1.319, model `claude-opus-5-5` |
| Session | `session.append` (system notice) | + | 새 row id 발급 |
| Model | `model.complete` | - | 토큰 비용 때문에 Run all에서 제외. 버튼으로만 실행 |
| Prompt | `prompt.fill` | x | `refused: no_composer` |
| Prompt | `prompt.read` | + | 빈 draft |
| Tools | `tool.register` / `tool.list` | + | `mcp__mods-lab__echo` 등록됨, 전체 도구 479개 |
| Tools | `tool.call` (자기 도구) | + | `echo: ping` |
| Tools | 모델이 mod 도구 호출 | + | haiku가 `echo: hi from haiku` 받음 |
| Commands | `command.register` / `command.list` | + | `/lab` 등록 |
| Clock | `clock.after(50)` | + | 52ms 뒤 실행 |

헤드리스 실패 4개는 모두 화면이 필요한 API다. 대화형 세션에서 다시 확인할 항목이다.

## 대화형 세션에서 확인할 것

- [ ] `/lab` 창이 열리고 탭과 Run all이 동작한다
- [ ] `ui.notify`, `ui.copy`, 두 번째 창 열고 닫기 통과
- [ ] `prompt.fill`이 프롬프트에 글자를 넣는다
- [ ] 띠 프로브의 `band ok` 버튼
- [ ] `ui.notice`가 다음 도구 호출 아래에 뜬다
- [ ] Tools 탭에서 버튼으로 누른 `tool.call`. 테스트 키트에서는 자기 echo 훅이 답하지 않았다. 실제 세션의 답을 기록할 것
- [ ] `model.complete` 버튼 (토큰 소량 사용)

## 정적 검사가 강제한 설계 규칙

`claude plugin validate`가 실제로 거부한 패턴들이다. 템플릿과 두 mod가 이 규칙을 따른다.

1. `$`를 값으로 넘기면 안 된다. `run($)` 함수 표는 거부된다. 메시지: `$ itself is passed as an argument ...; $ is always spelled $.noun.event(...) at the call site`. 표에는 데이터만 두고 `switch`로 분기한다. 단, 같은 파일의 일반 함수에 `$`를 인자로 넘기는 것은 cockpit에서 허용됐다.
2. `atom`의 참조는 쓰는 파일 안에 리터럴로 선언한다. 다른 파일에서 import한 atom은 `read`가 읽지 못한다.
3. matcher 값은 문자열 리터럴로 쓴다. import한 상수는 validate가 `command=?`로 표시한다.
4. 거부할 수 있는 지점(`command.run`, `tool.call`, `prompt.submit`, `session.append`)의 훅에는 `.catch`를 단다.
