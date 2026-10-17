# Comfy Studio Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기존 ComfyUI 워크플로의 설정을 보존하는 반응형 이미지 생성 화면을 구현한다.

**Architecture:** Next.js 화면은 프리셋 ID, 프롬프트, 크기 ID만 서버에 전달한다. 서버는 허용된 로컬 워크플로를 실행 그래프로 변환하고 ComfyUI 큐에 제출한다. 작업 메타데이터와 결과를 관리하여 새로고침 후에도 같은 작업을 조회한다.

**Tech Stack:** Next.js 16.4.2, React 19.3.0, TypeScript, Tailwind 4, Node.js 24의 테스트 실행기, 기존 ComfyUI HTTP API.

**Spec:** `docs/superpowers/specs/2026-10-17-image-generation-design.md`.

## Global Constraints

- 프로젝트: `C:\ComfyUI\comfy-studio`.
- 기존 Next.js 16.4.2 / React 19.3.0 / TypeScript / Tailwind 4 설치를 사용한다.
- 새 프로젝트나 외부 호스팅을 만들지 않는다.
- 이번 구현 대상은 이미지 생성이다.
- 외부 도메인, 터널 변경, 로그인 및 영상/음악 생성은 별도 후속 작업이다.
- 이번 개발 서버는 루프백 주소에서만 실행한다.
- 사용자의 기존 ComfyUI 워크플로와 모델 파일은 수정하지 않는다.
- 새 모델이나 의존성 다운로드는 범위 밖이다.
- 프롬프트는 공백 제거 후 1~8,000자로 제한한다.
- 각 생성 요청은 이미지 한 장으로 제한한다.
- 상업용 정책은 `C:\ComfyUI\AGENTS.md`를 따른다.
- 실시간 작업 상태를 캐시하지 않으며, 가짜 결과와 추정 진행률을 표시하지 않는다.

## Review Focus

1. 상위 서브그래프 위젯과 내부 위젯이 다를 때 상위 값과 연결된 입력의 실제 설정을 보존한다. Task 2에서 충돌 fixture 검사.
2. 프롬프트에 한국어, 줄바꿈, 이모지, HTML이 포함되어도 문자열 그대로 전달하고 결과 화면에서는 텍스트로 표시한다. Task 1에서 왕복 검사, Task 4에서 화면 확인.
3. 큐 등록 뒤 상태 요청이 일시 실패하거나 페이지를 새로고침해도 중복 생성하지 않는다. Task 3에서 저장 실패/등록 상태 검사, Task 4에서 복구 확인.
4. 이미지와 작업 ID에 경로 이동 문자나 다른 작업의 파일명이 들어오면 파일을 반환하지 않는다. Task 3에서 변조 입력 검사.
5. 서버가 내려가거나 선택 모델이 누락되면 사용 가능한 것처럼 표시하지 않고 기존 완성 결과를 유지한다. Task 3에서 장애 응답 검사, Task 4에서 UI 확인.

## Files and shared types

- `lib/types.ts`: `ModelId = 'z-image' | 'qwen-2512' | 'krea-2'`, `SizeId = 'square' | 'portrait' | 'landscape' | 'wide' | 'tall'`, `SizeOption {id,label,width,height,recommended}`, `GenerationInput {modelId,prompt,sizeId}`, `ApiGraph = Record<string,{class_type:string,inputs:Record<string,unknown>}>`.
- `ModelOption {id:ModelId,name:string,description:string,available:boolean,reason?:string,sizes:SizeOption[]}`.
- `ImageRef {filename:string,subfolder:string,type:'output'}`; `JobRecord {id:string,promptId:string|null,input:GenerationInput,createdAt:string,state:'submitting'|'queued'|'running'|'completed'|'failed',images:ImageRef[],error?:string}`.
- `lib/presets.ts`, `lib/validation.ts`: 허용 모델, 치수, 요청 검증.
- `lib/workflow.ts`: 세 로컬 워크플로를 해석하고 실행 그래프 생성.
- `lib/comfy-client.ts`: ComfyUI HTTP 통신과 파일/노드 가용성 확인.
- `lib/jobs.ts`: `.data/jobs/<uuid>.json` 저장과 결과 상태 정규화.
- `app/api/models/route.ts`, `app/api/generations/route.ts`, `app/api/generations/[id]/route.ts`, `app/api/generations/[id]/image/route.ts`: 제한된 API.
- `components/studio.tsx`, `components/studio-nav.tsx`, `components/generation-form.tsx`, `components/size-picker.tsx`, `components/generation-result.tsx`: 반응형 생성 흐름.
- `tests/*.test.ts`, `tests/fixtures/`: 실제 변환/검증/작업 복구 테스트.
- `app/page.tsx`, `app/layout.tsx`, `app/globals.css`, `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`, `README.md`: 통합과 실행 설명.

### Task 1: 프리셋과 요청 검증

**Interfaces:** `getPreset(id:ModelId):Preset`, `listPresetDefinitions():Preset[]`, `validateGenerationInput(value:unknown):GenerationInput`; `Preset {id,name,description,workflowFile,sizes}`.

- [ ] 기존 Next.js 번들 문서의 Route Handlers, Server/Client Components, CSS 가이드를 확인한다.
- [ ] `tests/validation.test.ts`에 아래 검사를 먼저 작성한다: 빈 문자열/공백/8,001자/잘못된 모델/크기/추가 고급 파라미터를 거부하고, 8,000자와 한국어·줄바꿈·이모지는 보존한다. `assert.throws(() => validateGenerationInput({modelId:'qwen-2.1',prompt:'test',sizeId:'square'}))`.
- [ ] `node --experimental-strip-types --test tests/validation.test.ts`로 구현 전 실패를 확인한다. TS 상대 import에 필요한 `allowImportingTsExtensions`를 추가하고 `package.json`에 같은 테스트 명령을 등록한다.
- [ ] `lib/types.ts`, `lib/presets.ts`, `lib/validation.ts`를 구현한다. 기본 모델 Z-Image, 기본 크기 square. 크기는 설계 문서의 두 치수 테이블을 그대로 사용한다. 입력 속성은 modelId/prompt/sizeId만 허용한다.
- [ ] 같은 테스트를 통과시킨다. `.data/`, 테스트 산출물, 로컬 비밀 설정을 Git에서 제외하고 `.env.example`에 `COMFYUI_URL`, `COMFYUI_WORKFLOW_DIR`을 명시한다.
- [ ] 이 작업의 파일만 커밋한다: `feat: define image presets and validate generation requests`.

### Task 2: 저장된 워크플로 설정 보존

**Interfaces:** `compileWorkflow(preset:Preset,workflow:unknown,input:GenerationInput,nodeInfo:NodeInfo):ApiGraph`; `loadWorkflow(preset:Preset):Promise<unknown>`; `NodeInfo`는 ComfyUI object_info의 클래스별 입력 스키마 맵이다.

- [ ] 세 워크플로를 다시 읽고 연결 ID, 하위 그래프 입력/출력, 상위 위젯, Primitive와 스위치를 조사한다. 실행 API에서 사용하는 클래스와 프런트 전용 노드를 구분한다.
- [ ] `tests/workflow.test.ts`와 최소 fixture에 실패 검사를 작성한다: Z-Image는 steps=8, cfg=1, sampler=res_multistep, scheduler=simple이다. Qwen은 저장된 Lightning 스위치 false에서 steps=50/cfg=4이며 true fixture에서는 steps=4/cfg=1과 LoRA 경로가 적용된다. Krea는 steps=8/cfg=1, prompt_enhance=true, enable_lora=false다. 인코더/VAE/LoRA 이름도 저장값과 비교한다. 상위/내부 위젯 충돌 fixture는 상위값을 적용한다.
- [ ] 고정 시드는 유지, randomize 시드는 안전한 정수로 변경, 프롬프트/크기 교체, batch=1 보장, 입력 객체 미변경을 검사한다. 알 수 없는 연결/노드/형식은 명시적 오류여야 한다.
- [ ] 테스트 명령으로 실패를 확인한 뒤 `lib/workflow.ts`를 구현한다. 확인된 세 그래프만 지원하고 미지원 구조는 사용 불가로 반환한다. 필요 시 순수 변환 보조 함수를 같은 책임별 모듈로 분리한다.
- [ ] 모든 workflow 검사를 통과시키고 ComfyUI nodeInfo를 사용하여 클래스와 필수 입력을 확인한다. 검증을 위해 사용자 워크플로 파일을 수정하지 않는다.
- [ ] 이 작업의 파일만 커밋한다: `feat: compile saved image workflows without changing presets`.

### Task 3: 생성·상태·결과 API

**Interfaces:** `getModelOptions():Promise<{connected:boolean,models:ModelOption[]}>`, `submitGeneration(input:GenerationInput):Promise<JobRecord>`, `getGeneration(id:string):Promise<JobRecord>`, `getGenerationImage(id:string,index:number):Promise<Response>`.

- [ ] `tests/jobs.test.ts`에서 HTTP와 파일 경계를 주입하는 테스트를 먼저 작성한다: 큐 제출/실행/완료/실패, ComfyUI 연결 끊김, 잘못된 UUID, 경로 이동, 기록에 없는 이미지, 중복 상태 조회 때 POST 1회만 발생.
- [ ] 큐 제출 전 작업 레코드를 저장하고, 제출 후 promptId를 원자적으로 갱신하도록 검사한다. 제출 후 저장 오류가 나도 자동 재제출하지 않고 오류를 기록한다. 단절 후 상태 확인은 동일 promptId로만 수행한다.
- [ ] 모델/워크플로/필수 노드 누락 시 available=false와 reason을 반환하는 검사를 작성하고 실패를 확인한다.
- [ ] `lib/comfy-client.ts`, `lib/jobs.ts`를 구현한다. 요청에는 시간 제한을 적용한다. `/prompt`, `/queue`, `/history/<promptId>`, `/view`, `/object_info`의 실제 로컬 스키마를 확인한다. API 원문 오류는 서버 로그에 남기고 사용자에게 이해 가능한 메시지를 반환한다.
- [ ] 모델 GET, 생성 POST, 작업 GET, 작업 이미지 GET Route Handler를 구현한다. Node 런타임, 요청 시 데이터 조회, no-store 응답. 이미지 조회는 앱의 JobRecord에 기록된 결과 인덱스만 받는다. 임의 URL/파일 경로를 받지 않는다.
- [ ] 위 테스트와 HTTP 스모크 확인을 통과시킨다. 입력 오류 400, 없는 작업/이미지 404, 연결 문제 503을 사용한다. 생성 POST 성공은 202와 JobRecord를 반환한다.
- [ ] 이 작업의 파일만 커밋한다: `feat: connect generation jobs and image results to local ComfyUI`.

### Task 4: 반응형 이미지 스튜디오

**Interfaces:** `Studio`가 API로 모델 목록을 받고 `GenerationForm`에 options, busy, onSubmit을 전달한다. `GenerationResult`는 현재 JobRecord와 마지막 성공 JobRecord를 구분해서 받는다. 메뉴/크기 컴포넌트는 표현과 선택 콜백만 담당한다.

- [ ] `app/page.tsx`에 Studio를 연결하고 layout의 제목/설명/언어를 Comfy Studio와 한국어로 변경한다. 폰트는 기존 설치 구성을 우선 사용하며 빌드 시 폰트 다운로드가 불가하면 로컬 시스템 폰트로 처리한다.
- [ ] 아이보리/흰색/짙은 글자/라임 포인트의 CSS 변수와 화면 구조를 구현한다. PC 메뉴·입력·결과 배치, 태블릿 축소 메뉴, 모바일 상단 메뉴·세로 배치를 구현한다.
- [ ] 모델 선택, 프롬프트, 정확한 픽셀 크기와 용도/추천 표시가 있는 카드, 생성 버튼을 구현한다. 미지원 모델 선택과 중복 제출을 막는다. 비율 표시는 실제 치수와 일치시킨다.
- [ ] `components/studio.tsx`에서 약 2초 간격 상태 조회를 구현한다. 완료/실패/언마운트 시 타이머와 요청을 정리한다. 마지막 작업 ID를 localStorage에 저장하고 새로고침 때 GET으로 복원한다. 네트워크 오류만으로 새 POST를 보내지 않는다.
- [ ] 초기 안내, 실제 경과 시간, 대기/생성/완료/실패, 결과 이미지와 다운로드를 구현한다. 새 작업 실패 시 이전 성공 결과를 유지한다. 모든 사용자 문자열은 React 텍스트로 표시한다.
- [ ] 영상/노래 메뉴는 준비 중으로 표시하고 이미지 메뉴만 활성화한다. 라벨/포커스/aria-live/모션 감소 스타일을 구현한다.
- [ ] 로컬 미리보기에서 1440px·768px·390px 폭으로 가로 넘침, 키보드 조작, 긴 프롬프트, 연결 끊김, 새로고침 복구를 확인한다. 브라우저 기능이 없으면 그 한계를 기록하고 빌드/HTTP 검증을 진행한다.
- [ ] 이 작업의 파일만 커밋한다: `feat: build responsive Comfy Studio image workspace`.

### Task 5: 실제 생성과 배포 없는 로컬 전달

**Interfaces:** 앞선 API와 화면을 그대로 사용한다. 새 기능은 추가하지 않는다.

- [ ] 해당 시점의 GPU 여유 VRAM과 실행 중 큐를 확인한다. 사용자 작업이 있으면 중단하지 않는다.
- [ ] `node --experimental-strip-types --test tests/*.test.ts`, `pnpm exec tsc --noEmit`, `pnpm build`를 실행하고 결과를 확인한다. 실패가 있으면 원인에 해당하는 코드만 수정하고 영향을 받는 검사를 다시 수행한다.
- [ ] 기존 포트와 충돌하지 않게 `pnpm exec next dev --hostname 127.0.0.1 --port 3001`로 로컬 미리보기를 실행한다. 실행 정책상 필요한 권한은 실제 승인 도구를 이용한다.
- [ ] Z-Image square 한 장을 실제 생성한다. 큐 등록, 상태 전이, PNG 응답, 결과 표시, 다운로드를 확인한다. Qwen/Krea는 그래프·파일·노드 검증과 실제 생성 시험을 구분해서 보고한다.
- [ ] 데스크톱/모바일 시각 검증을 수행하고 관찰된 화면 문제만 수정한다. 예시/가짜 생성 기록은 넣지 않는다.
- [ ] README에 pnpm 실행 명령, 환경 변수, 프리셋 추가/설정 경로, 로컬 공개 범위, 영상/노래의 준비 상태를 적는다. 검증 상태와 미확인 사항을 명시한다.
- [ ] 문서와 마지막 수정만 커밋한다. 최종 Git 차이를 확인하여 autostart 로그 등 무관한 사용자 변경이 포함되지 않았는지 확인한다. 최종 검증 증거와 로컬 접속 주소를 사용자에게 전달한다.

## Execution recommendation

직접 실행(Native)을 추천한다. 다섯 작업이 공통 타입과 세 워크플로 해석에 밀접하게
연결되므로 한 구현자가 같은 맥락을 유지하는 편이 효율적이다. 이 계획을 검토하고
실행 방식이 선택되기 전에는 제품 코드를 변경하지 않는다.
