# Claude Code mods 연구소

Claude Code의 mods 기능을 공식 문서 9개로 익히고, 기능을 하나씩 시험하고, 재사용할 디자인 템플릿과 대표 mod를 만든 저장소다.

## 구성

| 경로 | 내용 |
| :- | :- |
| `docs/01-overview.md` ~ `docs/09-reference.md` | 공식 문서 9개의 한국어 학습 노트. 각 문서 끝에 테스트 체크리스트와 주의/제약 |
| `docs/10-design-system.md` | 디자인 토큰, UI 부품, 배치, 상태, 테스트 규칙 |
| `docs/11-capability-matrix.md` | 기능별 실측 결과 (mods-lab로 확인) |
| `template/mod-starter/` | 새 mod의 골격과 UI 키트 `hooks/kit.tsx` |
| `scripts/new-mod.sh` | 템플릿으로 새 mod를 만드는 생성기 |
| `mods/cockpit/` | 대표 mod. 세션 대시보드 창, 프롬프트 위 띠, 상태줄 |
| `mods/mods-lab/` | 기능 시험 mod. 버튼을 눌러 API별 통과/실패를 기록 |

## 공식 문서

overview, create, interface, gallery, events, api, test, troubleshoot, reference
(`https://code.claude.com/docs/ko/plugins/mods/<page>`)

## 설치

터미널 세션의 프롬프트에서:

```
/plugin install cockpit --marketplace sangwookp9591/claude-code-mods
/plugin install mods-lab --marketplace sangwookp9591/claude-code-mods
```

셸에서는 `claude plugin install cockpit --marketplace sangwookp9591/claude-code-mods`를 쓴다. 처음에는 마켓플레이스를 추가할지 묻는다. `y`로 답하고 범위를 고르면 된다. 데스크톱 앱에서는 프롬프트 옆 +, Plugins, Add marketplace 순서로 눌러 `sangwookp9591/claude-code-mods`를 넣고 Add plugin을 누른다.

## 빠른 시작 (개발)

```bash
claude --plugin-dir ./mods/cockpit --plugin-dir ./mods/mods-lab
```

세션에서 `/cockpit`으로 대시보드를, `/lab`으로 기능 시험 창을 연다.

```bash
./scripts/new-mod.sh my-board "My Board" "한 줄 설명"
claude plugin validate ./mods/my-board && claude plugin test ./mods/my-board
```

요구 버전: 터미널 Claude Code v2.1.287 이상. 이 저장소는 v2.1.319에서 검증했다.
