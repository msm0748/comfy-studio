# Reference Image Editing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** 생성 결과 또는 업로드한 인물 사진을 참조해 배경·행동을 바꾸는 로컬 이미지 편집을 스튜디오에 추가한다.

**Architecture:** 기존 작업 큐·인증·복구를 공유하고, 참조 이미지 저장 서비스와 편집용 워크플로 컴파일러를 분리한다. 모델별 생성/편집 모드로 화면을 나누고 모든 참조 파일은 인증된 API에서만 제공한다. 기존 생성 요청과 저장 작업 형식은 호환한다.

**Tech Stack:** Windows PowerShell, Next.js 16.4.2/React 19.3/TypeScript, pnpm, sharp 0.35.5, Node test runner, 로컬 ComfyUI, PM2.

**Spec:** `C:/ComfyUI/comfy-studio/docs/superpowers/specs/2026-10-17-reference-image-edit-design.md`

## Global Constraints

- 작업 루트 `C:/ComfyUI/comfy-studio`, 현재 브랜치 `feat/reference-image-edit`를 사용한다. 별도 worktree 생성은 요청받지 않았다.
- 기존 어두운 색상·라임 포인트와 모바일 반응형 화면을 유지한다.
- 스텝·CFG·노이즈 강도 등은 저장된 워크플로 설정으로 처리한다.
- 업로드는 PNG/JPEG/WebP 1장, 파일 최대 10MiB, 디코딩 최대 25MP로 제한한다.
- 긴 변 최대 1536px로 비율을 유지해 정규화하고 메타데이터를 제거한 PNG로 저장한다.
- 배치 1장, 출력 약 1MP부터 실제 메모리와 결과를 검증한다.
- 참조 파일과 메타데이터는 `.data/references`에 서버가 발급한 UUID로 저장한다.
- 참조 파일은 작업에서 사용할 수 있도록 이번 버전에서 자동 만료/정리하지 않는다.
- 모델·LoRA·기존 인코더/VAE는 승인된 설계서의 정확한 파일만 사용한다. 기존 T2I Qwen 2512 LoRA를 편집에 쓰지 않는다.
- 기존 3개 생성 워크플로의 샘플링 값을 변경하지 않는다.
- 실제 비밀번호·참조/결과 원본·모델 파일은 Git에 포함하지 않는다.
- Next.js 관련 구현 전에 로컬 번들 문서와 `AGENTS.md`를 따른다. 네트워크/작업 스케줄러/프로세스 검증은 필요 시 승인된 터미널 권한으로 실행한다.

## Review Focus

1. Content-Length가 없거나 잘못된 업로드도 본문을 읽는 동안 크기 제한을 적용한다 — Task 2/3.
2. 사진 교체 요청이 늦게 끝나도 제거하거나 더 최근에 선택한 참조를 덮어쓰지 않는다 — Task 5.
3. 편집 후 모드 전환이나 로그인 만료·새로고침에도 작업 ID와 참조 ID가 다른 요청으로 바뀌지 않는다 — Task 1/4/5.
4. 손상/과대 해상도 파일과 원본 작업 경로 조작은 정상 이미지처럼 취급하지 않는다 — Task 2/3.
5. 새 모델 누락 또는 메모리 부족을 텍스트 생성 우회나 자동 설정 변경으로 숨기지 않는다 — Task 4/6.

## 파일과 책임

- `lib/types.ts`, `presets.ts`, `validation.ts`, `submission.ts`: 모드별 모델/입력 계약과 기존 작업 호환.
- `lib/reference-images.ts`: 디코딩·정규화·UUID 저장·참조 조회. ComfyUI 클라이언트를 import하지 않는다.
- `lib/request-body.ts`: 제한된 스트림 읽기. 파일/MIME 판별은 이미지 서비스 책임이다.
- `app/api/references/route.ts`, `[id]/route.ts`, `[id]/image/route.ts`: 업로드/기존 결과 가져오기·메타데이터·미리보기.
- `lib/edit-workflow.ts`, `workflows/qwen-image-edit-2511.api.json`: 편집 그래프와 허용된 입력 바인딩.
- `lib/comfy-client.ts`: 참조 업로드·모드별 워크플로 준비·제출·설치 상태.
- `components/reference-input.tsx`, `generation-form.tsx`, `generation-result.tsx`, `studio.tsx`, `image-lightbox.tsx`, `app/globals.css`: 편집 화면·복원·원본 비교.
- `tests/references.test.ts`, `edit-workflow.test.ts`, 기존 validation/submission/jobs 테스트: 입력·저장·그래프·복구 검증.
- `scripts/Install-EditModels.ps1`, `README.md`: 검증된 모델 설치 및 운영 절차.

### Task 1: 생성/편집 계약과 기존 작업 호환

**Interfaces:** `ModelId`에 `qwen-edit-2511` 추가. `Preset.mode: 'generate'|'edit'` 추가.
`GenerationInput`은 기존 `modelId/prompt/sizeId`에 선택적인 `referenceId?:string`, `preserveIdentity?:boolean`을 더한다.
`ReferenceRecord={id:string,width:number,height:number,createdAt:string,sourceJobId?:string}`를 정의한다.
편집 요청의 `preserveIdentity` 기본값은 true이며 생성 요청의 반환 JSON에는 편집 필드를 추가하지 않는다.

- [x] `tests/validation.test.ts`에 RED 검사 추가: `edit_requires_reference`, `generation_rejects_edit_fields`, `edit_rejects_non_uuid_reference`, `edit_defaults_identity_true`, `identity_requires_boolean`, `legacy_input_unchanged`.
  `referenceId='..\\secret'`와 임의 URL은 거부하고, 기존 생성 입력 결과는 기존 세 필드와 정확히 같아야 한다.
- [x] `node --experimental-strip-types --test tests/validation.test.ts` 실행해 새 기능 부재로 실패함을 확인한다.
- [x] `types.ts/presets.ts/validation.ts`를 구현한다. 편집 모델의 상업 이용 표시는 Apache-2.0 허용,
  사이즈는 1024×1024, 896×1152, 1152×896, 1344×768, 768×1344로 고정한다.
  생성·편집 입력 허용 키를 분리하고 1~8,000자 프롬프트와 기존 모델 제한을 유지한다.
- [x] `tests/jobs.test.ts`, `submission.test.ts`에 동일 UUID의 편집 요청 중복 방지/충돌 및
  새 서비스 인스턴스에서 참조 ID가 유지되는 검사를 추가한다. `createPendingJob`은 입력 객체의 참조를 보존한다.
- [x] 관련 검사와 `pnpm typecheck` 통과 후 해당 파일만 커밋한다.

### Task 2: 제한된 이미지 읽기와 비공개 저장

**Interfaces:** `readLimitedBody(request:Request,maxBytes:number):Promise<Uint8Array>`.
`createReferenceService(directory:string)`는 `create(bytes:Uint8Array,sourceJobId?:string):Promise<ReferenceRecord>`,
`get(id:string):Promise<ReferenceRecord>`, `image(id:string):Promise<Uint8Array>`를 반환한다.
저장 파일은 `<UUID>.png`, `<UUID>.json`이고 조회 시 UUID 형식과 파일 존재를 확인한다.

- [x] 승인된 의존성 `pnpm add sharp@0.35.5`를 추가한다. 테스트에서 작은 PNG/JPEG/WebP/EXIF 이미지를 sharp로 만든다.
- [x] `tests/references.test.ts`에 RED 검사: 지원 형식 재인코딩/회전/비율 유지/EXIF 제거,
  1536px 상한, 10MiB 초과, 25MP 초과, SVG/GIF/손상 데이터/다중 프레임 거부, UUID 경로 조작 거부,
  새 서비스 인스턴스에서 동일 파일·메타데이터 조회.
- [x] 같은 파일에서 스트림 본문 검사를 추가한다. Content-Length 없이 상한을 넘는 스트림과
  실제보다 작은 Content-Length를 준 스트림도 413으로 거부해야 한다. 한도 이내 본문은 바이트가 정확히 유지돼야 한다.
- [x] RED 확인 후 `reference-images.ts`와 `request-body.ts`를 구현한다. 실제 디코딩 형식으로 PNG/JPEG/WebP만 허용하며
  `.rotate().resize({width:1536,height:1536,fit:'inside',withoutEnlargement:true}).png()`와 픽셀 제한을 사용한다.
  사용자 파일명·외부 URL·원본 EXIF를 저장/출력 경로에 사용하지 않는다. 임시 파일을 원자적으로 확정하고 중간 실패 파일을 정리한다.
- [x] 저장/조회/제한 검사, 타입 검사 통과 후 커밋한다. 테스트 임시 폴더 삭제는 절대 경로가 `.data/test-tmp` 아래인지 먼저 검증한다.

### Task 3: 인증된 참조 이미지 API

**Interfaces:** `POST /api/references`: multipart `image` 1개 또는 JSON `{sourceJobId,index:0}`.
반환 `{reference:ReferenceRecord}`; `GET /api/references/[id]`도 동일 형식.
`GET /api/references/[id]/image`는 PNG 바이트와 no-store/nosniff 헤더를 반환한다.
모든 참조 경로는 Proxy와 `requireAuth()`에서 보호하고 POST에는 `sameOrigin()`을 적용한다.

- [x] API 처리 로직은 테스트 가능한 `lib/reference-api.ts`의 `handleReferencePost(request,deps):Promise<ReferenceRecord>`로 분리한다.
  `deps={references:ReturnType<typeof createReferenceService>,getGenerationImage:(id:string,index:number)=>Promise<Response>}`를 받는다.
- [x] `tests/references.test.ts`에 RED 검사: 허용된 multipart 필드/단일 파일, 다른 필드·두 파일·20MB 스트림 거부,
  JSON 본문 4096바이트 상한, 잘못된 작업 UUID/음수 인덱스/임의 경로 거부,
  완료되지 않은 작업 이미지 실패가 참조 생성으로 이어지지 않음, 정상 결과 복사.
- [x] RED 확인 후 핸들러·API·공유 참조 서비스 인스턴스를 구현한다. multipart 전체 본문은
  `10*1024*1024+65536`바이트, 실제 파일은 `10*1024*1024`바이트로 제한한다.
  결과 가져오기는 기존 `getGenerationImage()`의 검증된 출력만 읽고 같은 정규화·용량 제한을 적용한다.
- [x] `next.config.ts`에 `experimental.proxyClientMaxBodySize: '12mb'`를 추가한다.
  로컬 Next.js 문서상 기본 10MB를 넘으면 본문이 조용히 잘릴 수 있으므로 multipart 오버헤드를 수용한다.
  앱 수준 스트림 상한은 그대로 유지한다.
- [x] 테스트/타입 검사와 별도 테스트 자격증명 서버에서 비인증 401·다른 출처 403·과대 업로드 413·정상 미리보기 200 확인 후 커밋한다.

### Task 4: 참조가 실제 연결된 편집 워크플로

**Interfaces:** `compileEditWorkflow(raw:unknown,input:GenerationInput,referenceFilename:string,nodeInfo:NodeInfo):ApiGraph`.
`uploadReference(referenceId:string):Promise<string>`는 앱이 소유한 ComfyUI input 경로만 반환한다.
`getModelOptions()`는 네 번째 편집 모델도 반환하며 모델/노드 누락을 사용 불가 사유로 표시한다.

- [x] 공식 템플릿을 읽어 단일 참조 API 그래프로 변환하고 버전 관리할 JSON을 만든다.
  Loader/인코더/샘플러/저장 노드에는 안정적인 이름 ID를 사용한다.
  기본 모델은 설계서의 FP8mixed, 인코더/VAE는 재사용 파일, Lightning BF16 LoRA 강도 1,
  KSampler 4스텝·CFG 1·euler/simple·denoise 1·배치 1, AuraFlow shift 3.1을 저장한다.
  LoRA 적용 경로와 4-step 기본값이 맞는지 공식 2511 템플릿의 Lightning 분기를 먼저 대조한다.
- [x] `tests/edit-workflow.test.ts`에 RED 검사: 참조가 `LoadImage`에서 `TextEncodeQwenImageEditPlus.image1`로 도달함,
  선택 크기의 출력 latent, 변경 지시, 인물 유지 켜짐/꺼짐의 지시 차이, 샘플러 설정 보존,
  음성/추가 참조/로컬 경로를 입력으로 받지 않음, 모델/노드 누락 거부.
- [x] RED 확인 후 컴파일러를 구현한다. 보존 지시는 서버의 고정 영문 문장으로 추가하고
  사용자 지시는 원문을 유지한다. 번역 API나 외부 이미지 전송을 추가하지 않는다.
  JSON은 허용 노드와 바인딩을 확인하고 임의 API 그래프로 실행하지 않는다.
- [x] `comfy-client.ts`의 생성 경로를 분기한다. 참조 존재를 확인한 뒤 정규 PNG를
  ComfyUI `/upload/image`에 `subfolder=ComfyStudio/references`, UUID 파일명, `overwrite=true`로 전송한다.
  ComfyUI 반환 파일명이 예상한 앱 경로인지 확인한 후에만 그래프에 넣는다.
  설치 상태 검사는 실제 참조 업로드 없이 검사용 파일명으로 그래프/모델 구조만 확인한다.
- [x] 편집 사전 검증은 명백한 참조/설치 누락을 접수 불명 상태로 남기지 않게 처리한다.
  실제 `/prompt` 응답 유실은 기존 작업 UUID/extra_data 기반 복구를 그대로 사용한다.
  참조 ID가 다른 재요청은 같은 작업 ID로 허용하지 않는다.
- [x] 관련 검사·기존 25개 검사·타입 검사 통과 후 커밋한다.

### Task 5: 업로드·이어 만들기·원본 비교 UI

**Interfaces:** `ReferenceInput({reference:ReferenceRecord|null,busy:boolean,error:string,onFile:(file:File)=>void,onRemove:()=>void})`.
`GenerationResult`에 `onContinue:(job:JobRecord)=>void`를 추가한다.
`GenerationForm`에 `mode`, `onMode`, `reference`, `preserveIdentity`, `onPreserveIdentity`, `referenceBusy`를 전달한다.
화면 모드는 선택한 모델의 `Preset.mode`와 일치해야 한다.

- [x] 브라우저에서 기존 화면에 편집 전환/참조 업로드/이어 만들기가 없음을 확인한 후 UI를 추가한다.
  모델 목록은 모드로 필터링하고 생성 모드의 마지막 모델/프롬프트와 편집 모드의 변경 지시를 분리한다.
  참조 업로드 중과 생성 작업 중에는 제출/모드/참조 변경을 잠그며 오류는 업로드와 생성 영역에 각각 표시한다.
- [x] `reference-input.tsx`에 키보드로 누를 수 있는 업로드·교체·제거, 미리보기, 10MiB 안내를 제공한다.
  `studio.tsx`는 업로드/결과 복사에 요청 순번 또는 AbortController를 사용해 제거·교체 후 늦은 응답을 폐기한다.
- [x] `GenerationResult`의 완료 결과에 ‘이 이미지로 이어 만들기’를 추가한다.
  결과 복사 API 완료 후 편집 모드를 열고 참조를 표시하며 변경 입력창에 포커스를 준다.
  결과가 실패했거나 참조 준비 중이면 편집 생성은 비활성화한다.
- [x] `ImageLightbox`를 이미지 URL/설명 기반 재사용 구조로 바꿔 원본과 결과를 각각 확대한다.
  편집 결과에는 해당 작업의 `input.referenceId`로 원본/결과 비교를 표시한다.
  현재 폼에서 선택한 다른 참조를 과거 결과의 원본으로 잘못 표시하지 않는다.
- [x] 복구 시 작업 입력의 모델/참조/보존 여부를 복원하고 기존 작업 복구 데이터는 지우지 않는다.
  401은 기존 로그인 복귀를 유지한다. 새로고침 뒤 메타데이터/미리보기를 인증 API로 다시 조회한다.
- [x] PC 및 390px 모바일에서 업로드·교체·제거, 모드 입력 보존, 이어 만들기,
  원본/결과 확대, 사용 불가 모델, 늦은 업로드 응답, 세션 만료·재로그인 복구를 검증한다.
  API 입력과 상태 전이에 필요한 회귀 검사만 추가하고 CSS/텍스트를 그대로 복제하는 검사는 만들지 않는다. 커밋한다.

### Task 6: 모델 설치·실제 편집·배포

**Files:** `scripts/Install-EditModels.ps1`, `README.md`, `.data/edit-verification.json`(Git 제외).

- [x] 다운로드 직전 하드웨어 스킬을 다시 적용해 nvidia-smi, 가용 RAM/디스크, 큐를 확인한다.
  `Install-EditModels.ps1`은 공식 HF의 정확한 승인 파일 2개만 다운로드한다.
  저장 파일을 `.part`로 재개하고 공식 LFS SHA-256/크기 대조 후 확정한다. 기존 파일은 검증 후 재사용하며 덮어쓰지 않는다.
- [x] 스크립트에서 실제 다운로드 전 메타데이터·대상 경로·예상 용량만 검증하는 검사를 수행한다.
  그 후 승인된 약 21.4GB를 다운로드한다. 자격증명·실제 참조 파일은 출력하지 않는다.
- [x] ComfyUI 작업을 방해하지 않고 새 모델 인식을 확인한다. 필요한 경우 큐가 비어 있을 때만 서버 갱신을 수행한다.
  편집 모델 사용 가능 상태를 확인하고 상업용 허용 모델로 만든 기존 인물 사진을 참조로 실제 편집 1회 이상 실행한다.
  배경 또는 동작 변경과 인물 특징 유지 여부를 육안 비교하고 작업 ID·시간·피크 VRAM/RAM을 기록한다.
  실패 시 원인을 해결하되 임의 다른 모델로 대체하거나 성공으로 보고하지 않는다.
- [x] 전체 테스트·타입 검사·변경 파일 ESLint·프로덕션 빌드를 통과시킨다.
  Windows 파일 잠금 방지를 위해 프로덕션 빌드 동안 `comfy-studio` PM2 앱만 중지하고 빌드 후 재시작한다.
- [x] 선택된 실행 방식에 따른 독립 리뷰를 수행하고 지적을 해결한다.
  README에 업로드/이어 만들기·보존 한계·정규 참조 저장 위치와 보관·모델/설정·운영/재시작 절차를 기록한다.
- [x] 커밋·푸시·PR·main 병합 후 공개 주소에서 로그인/비인증 차단/편집 화면/다운로드를 확인한다.
  PC/모바일 및 실제 원본/결과 스크린샷을 `.data`에 저장하고 결과 보고에 포함한다.

## 자체 검토

- 설계서의 화면·보안·모델·복구·실제 실행·배포 요구를 Tasks 1~6에 대응했다.
- 참조 저장 서비스는 ComfyUI 클라이언트를 import하지 않도록 해 의존성 순환을 피했다.
- 10MiB 파일 + multipart 오버헤드와 Next Proxy의 본문 제한을 구분했다.
- 기존 생성 JSON 형식과 작업 UUID 비교를 유지하고 편집 입력만 명시적으로 정규화한다.
- 5개 Review Focus의 검증을 각 소유 Task에 배치했다. 미결정 인터페이스나 추가 제품 기능은 없다.

## 실행 결과

완료: Native 구현 및 독립 코드 리뷰 후 지적 해결. 테스트 36개, 타입 검사, 빌드 통과. 전체 린트 오류 0개·경고 8개.
인물 편집 실측 약 43초, 최대 GPU 23,684MiB, 시스템 RAM 사용 약 40.9GiB. 브라우저에서도 기존 결과로 편집·비교·연속 편집·재시작 복원을 확인했다.
Chrome 확장의 로컬 파일 URL 권한으로 자동 파일 선택은 제한되어 업로드는 실제 HTTP API로 검증했다. 확장 권한은 변경하지 않았다.
