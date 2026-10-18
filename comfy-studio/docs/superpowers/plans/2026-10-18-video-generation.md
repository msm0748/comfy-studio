# Video Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 텍스트와 참조 이미지로 영상을 생성하고, 사용자 지정 길이와 480p·720p·1080p 출력을 재생·다운로드한다.

**Architecture:** 영상 전용 입력·작업 서비스를 기존 이미지 API 옆에 추가하고 인증·번역·참조 저장을 재사용한다. 저장된 H3 워크플로를 서버에서 컴파일해 864×480 생성과 선택적 720p AI 업스케일을 실행한다. 1080p는 완료된 720p 영상을 서버의 CPU FFmpeg 단계로 확대하며 원래 ComfyUI 생성 번호를 유지한다.

**Tech Stack:** Next.js 16.4.2, React 19.3.0, TypeScript, node:test, 기존 ComfyUI·H3·3D latent upscaler, 로컬 FFmpeg 7.1.

**Spec:** `comfy-studio/docs/superpowers/specs/2026-10-18-video-generation-design.md`

## Global Constraints

- 최초 diffusion 생성: 864×480, 24fps, 배치 1. 최종 출력: 480p=864×480, 720p=1280×720, 1080p=1920×1080.
- 기본: 720p·7초. 선택 길이: 정수 5~10초(480p), 정수 5~7초(720p·1080p).
- 프레임 변환: `ceil((seconds*24-5)/17)*17+5`. 480p 최대 243프레임, 고해상도 최대 175프레임.
- 최대값은 실측 전 잠정값. 두 모드의 최대 길이 완주·메모리 검증을 통과한 조합만 운영에 제공한다.
- H3 사용자 상업 허가와 AGENTS.md의 Apache-2.0 업스케일 모델만 사용한다. 새 모델·LoRA·패키지를 다운로드하지 않는다.
- 프롬프트 최대 8,000자, 전용 Google 번역 계정, 사용자 원문 보존. 참조 사진은 로컬 ComfyUI에만 전송한다.
- 기존 이미지 API·기록·localStorage·로그인·PWA 캐시 정책을 유지한다.
- 저장된 샘플러·스텝·가속 스위치를 보존한다. 실패 후 임의 설정 변경·자동 재생성을 하지 않는다.
- 모델·키·환경변수·참조·결과·실행 로그는 Git에 넣지 않는다. 기존 autostart 로그 변경은 건드리지 않는다.
- Next.js 변경 전에 관련 로컬 문서를 읽는다. 작업 분리는 테스트 가능한 모듈 단위로 하며 각 작업에서 RED→GREEN을 확인한다.

## Review Focus

1. 10초에서 720p로 전환: 길이를 조용히 바꾸지 않고 사용자가 범위를 수정할 때까지 제출을 막는다(Task 1, 5).
2. 접수 응답 유실·앱 새로고침·인코딩 재시작: 원래 작업 번호와 ComfyUI prompt ID를 보존한다(Task 3, 4, 5).
3. 설치된 custom node의 widget 순서 변경: 저장값을 잘못 매핑하지 않고 사용 불가로 처리한다(Task 2).
4. 영상 Range 탐색·연결 취소: 정확한 206/416, 스트림 취소, 안정된 길이·헤더를 제공한다(Task 4).
5. 업스케일 AV 분리·시간 청크 경계: 원래 오디오·프레임 수를 보존하고 깜빡임·색 변화·무음 결과를 검사한다(Task 2, 6).

## File Structure

앱 아래 `lib/video/`에 `types.ts`, `presets.ts`, `validation.ts`, `workflow.ts`, `client.ts`,
`jobs.ts`, `media.ts`, `encoding.ts`, `submission.ts`를 둔다. 공통 그래프 해석기는
`lib/stored-workflow.ts`로 추출하고 기존 `lib/workflow.ts`는 이미지용 어댑터로 유지한다.
API는 `app/api/videos/`, 화면은 `app/video/page.tsx`와 `components/video/`에 둔다.
테스트는 기존 node:test 패턴으로 `tests/video-*.test.ts`에 추가한다.

## Task 1: 영상 입력과 출력 프리셋

**Files:** Create `lib/video/types.ts`, `lib/video/presets.ts`, `lib/video/validation.ts`, `tests/video-input.test.ts`.

**Interfaces:**
- `VideoResolution = '480p'|'720p'|'1080p'`, `VideoMode = 'text'|'image'`.
- `VideoInput = {mode:VideoMode;prompt:string;resolution:VideoResolution;durationSeconds:number;referenceId?:string}`.
- `VideoOutputRef = {filename:string;subfolder:string;type:'output'}`.
- `VideoMedia = {kind:'comfy';ref:VideoOutputRef}|{kind:'local';filename:string}`. 로컬 filename은 서버가 만든 UUID.mp4만 허용한다.
- `VideoJobRecord`: id, promptId, input, createdAt, state(`submitting|queued|running|processing|completed|failed`),
  phase(`generation|upscale|encoding|null`), sourceOutput, media, error, generationWidth/Height,
  width/height, frames, fps, actualDurationSeconds. 원문과 선택값은 input에 둔다.
- `videoFrames(seconds:number):number`, `getVideoPreset(resolution:VideoResolution):VideoPreset`,
  `validateVideoInput(raw:unknown):VideoInput`, `videoInputIssue(input:VideoInput):string|null`.

- [ ] RED: 아래 사례와 알 수 없는 필드·모드·referenceId, 비문자열/빈/8,000자 초과 프롬프트,
  이미지 모드 참조 누락, text 모드 참조 혼입, 소수·NaN·문자열 길이를 거부하는 테스트를 작성한다.
  ```ts
  assert.deepEqual([5,6,7,8,9,10].map(videoFrames),[124,158,175,192,226,243]);
  assert.equal(getVideoPreset('1080p').maxSeconds,7);
  assert.throws(()=>validateVideoInput({mode:'text',prompt:'x',resolution:'720p',durationSeconds:10}));
  ```
- [ ] `node --experimental-strip-types --test tests/video-input.test.ts` 실행, 미구현 실패 확인.
- [ ] 타입·프리셋·입력 검증을 구현한다. 해상도 전환 시 입력값을 보정하는 대신 오류를 반환한다.
- [ ] 같은 테스트를 실행해 통과 확인. `git add`는 해당 파일만 지정하고 `feat: define video inputs and output presets`로 커밋한다.

## Task 2: 저장 H3 그래프와 업스케일 분기

**Files:** Create `lib/stored-workflow.ts`, `lib/video/workflow.ts`, `tests/video-workflow.test.ts`,
`tests/fixtures/video/`의 개인정보 제거된 두 H3 워크플로·사용 노드 스키마.
Modify `lib/workflow.ts`.

**Interfaces:**
- `compileStoredGraph(raw:unknown,info:NodeInfo,options:{outputTypes:string[];patch:(context:{key:string;nodeId:number;type:string;inputs:Record<string,unknown>;nested:boolean})=>void}):ApiGraph`.
- `loadVideoWorkflow(mode:VideoMode):Promise<unknown>`: COMFYUI_WORKFLOW_DIR와 등록 파일명만 사용한다.
- `compileVideoWorkflow(raw:unknown,input:VideoInput,info:NodeInfo,referenceFilename?:string):ApiGraph`.
- `validateVideoGraph(graph:ApiGraph,info:NodeInfo):void`: H3 모델·인코더·VAE·업스케일 모델·출력 분기 허용 목록 확인.

- [ ] RED: 기존 이미지 fixture의 컴파일 결과가 추출 전과 같다는 회귀 테스트를 고정한다.
  영상 fixture에서는 원래 개인 프롬프트·사진 경로를 제거하고 샘플 문구로 대체한다.
- [ ] RED: 세 출력 모두 H3 최초 864×480, 선택 길이의 프레임 수, image에만 first_frame,
  원래 샘플링·비활성 LoRA 가지치기, H.264/MP4 저장, 임의 경로 차단을 단언한다.
  ```ts
  const graph=compileVideoWorkflow(textFixture,{mode:'text',prompt:'A red mug',resolution:'480p',durationSeconds:10},schema);
  const h3=Object.values(graph).find(n=>n.class_type==='MiniMaxH3ImageToVideo')!;
  assert.deepEqual([h3.inputs.width,h3.inputs.height,h3.inputs.length],[864,480,243]);
  assert.equal(h3.inputs.first_frame,undefined);
  assert.ok(!Object.values(graph).some(n=>n.class_type==='MinimaxH3LatentUpscaler3D'));
  ```
- [ ] `node --experimental-strip-types --test tests/workflow.test.ts tests/video-workflow.test.ts` 실행, 새 테스트 실패 확인.
- [ ] 기존 subgraph·switch 해석 로직을 공통 함수로 추출하고 이미지 어댑터의 동작을 유지한다.
  H3 노드 입력, RandomNoise 시드, SaveVideo 접두사만 명시적으로 패치한다.
- [ ] 720p·1080p 분기는 실행 중 `/object_info`와 설치 소스에서 `LTXVSeparateAVLatent`,
  `MinimaxH3LatentUpscaler3D`, `MMH3 Split Upscale` 계열, `VAEDecodeTiled`의 정확한 입력 이름을 확인해 연결한다.
  영상 latent만 확대·보정하고 오디오 latent를 원래 값으로 유지한다.
  중간 latent는 1280×736(32 정렬), 영상은 디코딩 후 상하 각 8픽셀을 중앙 크롭해 1280×720으로 만든다.
  시간 청크·공간 타일을 사용하고 upscaler의 temporal chunking/force_unload를 켠다.
  보정 시 res_multistep/simple, 6스텝·denoise 0.3을 초기값으로 명시하며 base 스케줄은 그대로 보존한다.
  스키마와 맞지 않는 저장 widget, 필수 노드 누락은 조용한 추측 대신 준비 오류로 처리한다.
- [ ] 전체 workflow 테스트 통과와 `pnpm typecheck`를 확인하고 `feat: compile H3 video and upscale workflows`로 커밋한다.

## Task 3: 중복 방지 영상 작업과 ComfyUI 연동

**Files:** Create `lib/video/jobs.ts`, `lib/video/client.ts`, `tests/video-jobs.test.ts`, `tests/video-client.test.ts`.

**Interfaces:**
- `createVideoJobService(deps:{directory:string;submit:(input:VideoInput,id:string)=>Promise<string>;
  inspect:(promptId:string)=>Promise<VideoInspection>;recover:(id:string)=>Promise<string|null>;
  finalize:(job:VideoJobRecord)=>Promise<VideoMedia>})` returns
  `submit(input:VideoInput,id:string):Promise<VideoJobRecord>`, `get(id:string):Promise<VideoJobRecord>`.
- `VideoInspection = {state:'queued'|'running'|'completed'|'failed';output?:VideoOutputRef;error?:string}`.
- client exports `getVideoAvailability():Promise<VideoAvailability>`, `submitVideo`, `getVideoJob`, `getVideoRecord`.
  `VideoAvailability` contains connected, modes and per-resolution available/reason/verified/maxSeconds.

- [ ] RED: 임시 `.data/test-tmp`에서 동시 동일 UUID 요청의 번역·ComfyUI 제출이 한 번,
  다른 resolution/duration/reference의 409, 원문·선택값·실제 길이의 재시작 후 보존을 검사한다.
- [ ] RED: 번역 실패와 missing model은 미제출, 제출 응답 유실은 같은 UUID의 queue/history에서 복구,
  inspect 네트워크 오류는 접수된 promptId 유지, 잘못된 영상 경로·출력 없는 success는 실패로 검사한다.
- [ ] 해당 테스트를 실행해 실패 확인 후 기존 이미지 서비스의 잠금·atomic JSON·recover 방식을 영상 전용으로 구현한다.
  저장 경로는 `.data/video-jobs`. ComfyUI extra_data에는 `comfy_studio_video_job_id`를 사용한다.
- [ ] 실제 SaveVideo PreviewVideo 실행 기록 형식을 로컬 ComfyUI의 UI serializer와 대조하고 fixture로 고정한다.
  완료 확인 뒤 후처리를 실행한다. 후처리 실패/재시작에서도 ComfyUI 샘플링은 재제출하지 않는다.
  availability는 ComfyUI system_stats와 필수 노드·모델·워크플로·실측 허용 조합을 함께 확인한다.
- [ ] 테스트 통과 확인, `feat: persist and recover video generation jobs`로 커밋한다.

## Task 4: CPU 인코딩, 인증 API, Range 미디어

**Files:** Create `lib/video/encoding.ts`, `lib/video/media.ts`, `app/api/videos/route.ts`,
`app/api/videos/models/route.ts`, `app/api/videos/[id]/route.ts`, `app/api/videos/[id]/media/route.ts`,
`tests/video-media.test.ts`, `tests/video-api.test.ts`, `tests/video-encoding.test.ts`.
Modify `.env.example` to document server-only `STUDIO_FFMPEG_PATH`.

**Interfaces:**
- `finalizeVideo(job:VideoJobRecord):Promise<VideoMedia>`: 480p·720p는 안전한 ComfyUI 출력,
  1080p는 완료된 720p sourceOutput만 확대한다.
- `encode1080p(jobId:string,source:VideoOutputRef):Promise<{kind:'local';filename:string}>`.
- `serveVideoMedia(job:VideoJobRecord,request:Request):Promise<Response>`: 원격/local 출력 모두 GET·HEAD 지원.

- [ ] RED: 인증 없는 401, foreign-origin POST 403, 과대 요청 413, UUID 오류, 입력 한계,
  다른 작업의 미디어·경로 탈출·부정확한 MIME 거부 테스트를 작성하고 실패 확인한다.
- [ ] RED: `Range: bytes=0-99`, suffix, open-ended, 범위 초과(416), multi-range 거부,
  HEAD, 요청 취소 시 upstream/파일 스트림 해제를 테스트한다.
- [ ] RED: 가짜 encoder로 source 다운로드 중 실패·인코딩 실패·재시작·동시 finalize·이미 완료된 파일 재사용을 검사한다.
  전 과정에서 ComfyUI submit 추가 호출은 0이어야 한다.
- [ ] Node runtime route를 구현한다. API는 `requireAuth`, `sameOrigin`, `readLimitedBody`를 재사용한다.
  모델/상태 응답은 no-store. 미디어는 MP4, nosniff, 안전한 Content-Disposition을 강제한다.
  원격 `/view`는 Range·AbortSignal을 전달하며 200/206/416과 길이 헤더를 보존한다.
  로컬 UUID.mp4는 파일 크기로 single-range를 계산해 createReadStream으로 전달한다.
- [ ] encoder는 `spawn` 인자 배열·`shell:false`·`windowsHide:true`를 사용한다.
  기본 FFmpeg 경로는 설치된 imageio_ffmpeg/binaries/ffmpeg-win-x86_64-v7.1.exe이며 서버 설정으로만 바꿀 수 있다.
  source는 검증된 ComfyUI 출력에서 `.data/video-media/<UUID>/`로 스트리밍해 저장한다.
  `scale=1920:1080:flags=lanczos`, CPU libx264, yuv420p, `-c:a copy`, faststart를 사용한다.
  1080p 프레임을 GPU 배치로 만들지 않는다. 출력은 임시 파일 완주 후 원자적으로 확정한다.
  동일 프로세스에서는 작업별 finalize Promise를 공유한다. 앱 재시작으로 인코딩을 다시 하더라도
  고유 임시 파일을 사용하고 이미 확정된 결과를 재사용해 기존 완성본을 손상하지 않는다.
  후처리 재시도는 저장한 원본만 사용하며 diffusion·AI 업스케일을 재실행하지 않는다.
- [ ] 전체 API·미디어·encoding 테스트, 타입 검사 통과 후 `feat: serve authenticated video and encode Full HD outputs`로 커밋한다.

## Task 5: 영상 스튜디오와 이미지에서 이어 만들기

**Files:** Create `lib/video/submission.ts`, `components/video/video-studio.tsx`, `video-form.tsx`,
`video-result.tsx`, `app/video/page.tsx`, `tests/video-submission.test.ts`.
Modify `components/studio-nav.tsx`, `components/generation-result.tsx`, `app/globals.css`.

**Interfaces:**
- `createPendingVideo(input:VideoInput):VideoJobRecord`,
  `submitOrRecoverVideo(pending:VideoJobRecord,send,read):Promise<VideoJobRecord>`,
  `videoCanSubmit(input:VideoInput,availability:VideoAvailability,busy:boolean):boolean`.
- `StudioNav({connected,active?:'image'|'video'})`; image를 기본값으로 유지한다.
- `/video?sourceJobId=<UUID>`는 인증된 완료 이미지에서 참조를 등록하고 `image` 모드로 시작한다.

- [ ] RED: 응답 유실·localStorage 복구·참조 fetch 실패 후 재연결·모드 전환 중 늦게 도착한 참조 응답,
  10초→720p 전환 시 길이 유지와 제출 차단을 pure helper 테스트로 고정하고 실패 확인한다.
- [ ] helper와 세 화면 컴포넌트를 구현한다. 영상 전용 localStorage 키에 현재 요청과 마지막 성공 결과를 보존한다.
  새로고침 시 제출하지 않고 상태만 복구한다. 인증 401이면 login으로 이동한다.
- [ ] 출력 preset과 허용 길이, 실제 예상 재생 길이, 1080p ‘720p AI 보정 후 확대’를 표시한다.
  참조 업로드·조회는 기존 API와 ReferenceInput을 재사용하되 사진/영상 문구를 props로 구분한다.
  busy 중 설정·참조 변경을 잠그고 오류를 명시한다. 알려진 실행 정보가 없으면 ‘영상 처리 중’으로 표시한다.
- [ ] 결과에는 `<video controls playsInline preload="metadata">`, MP4 다운로드, 최종 크기·길이와 원문을 제공한다.
  오디오를 강제로 mute/autoplay하지 않는다. 이미지 결과에 영상으로 이어 만들기 링크를 추가한다.
  데스크톱·모바일 레이아웃과 기존 이미지 메뉴 회귀를 실제 브라우저로 확인한다.
- [ ] 테스트·타입 검사·lint·빌드 확인 후 `feat: add video studio and image-to-video navigation`으로 커밋한다.

## Task 6: 최대값 실측, 리뷰, PR와 운영 적용

**Files:** Create ignored `.data/verify-video.mjs`, `.data/video-verification/`의 결과·측정값;
update `lib/video/presets.ts`, README와 spec의 실제 검증 내역.

- [ ] 전체 테스트·타입 검사·lint·빌드를 실행한다. 테스트 baseline은 현재 43개다.
  버전 고정 의존성이 누락되면 기존 lockfile 그대로 복구하고 검사한다.
- [ ] 실행 직전 `nvidia-smi`, RAM·디스크, ComfyUI queue를 확인한다. 기존 작업을 취소하지 않는다.
  승인된 Z-Image 결과(빨간 머그컵) 또는 설치된 상업 허용 예시 이미지를 I2V 참조로 사용한다.
- [ ] text/image 각각 480p 10초, 720p 7초, 1080p 7초의 여섯 조합을 순서대로 검증한다.
  최대 조합이 실패하면 해당 모드·프리셋 상한을 낮춰 다시 검증한다. 다른 모델·가속 LoRA를 임의 적용하지 않는다.
  720p·1080p의 공통 생성 결과를 재사용할 수 있어도 두 출력의 완성본·미디어를 각각 확인한다.
- [ ] 매 단계 GPU·전체 RAM 피크와 시간, 실제 출력 크기·프레임·24fps·오디오 스트림·AV 길이를 기록한다.
  학습 업스케일 모델이 영상 latent만 받는지, 청크 경계의 깜빡임과 색 변화가 없는지 장면별로 확인한다.
  CPU 1080p 처리 중 전체 고해상도 프레임을 GPU에 적재하지 않는지 확인한다.
- [ ] 실측 성공 조합만 availability의 verified로 공개한다. 최종 UI와 서버의 cap을 일치시키고
  실제 검증 문서에 잠정값 대비 확정값과 검증되지 않은 조합을 구분한다.
- [ ] 브라우저에서 데스크톱·모바일 메뉴, 두 입력 방식, 작업 복구, 재생·음량·탐색, 다운로드를 검증하고 스크린샷을 남긴다.
  원문 보존, duplicate POST, 외부 HTTPS 인증·미디어 Range·비로그인 차단, 기존 이미지 생성도 확인한다.
- [ ] requesting-code-review 절차로 전체 브랜치를 독립 리뷰하고 중요 문제를 해결한다.
  기존 키·개인사진·로그가 stage되지 않았는지 확인하고 PR을 생성·첨부한다.
- [ ] 운영 적용이 승인된 범위라면 기존 `.next`를 검증된 workspace 내부 백업 경로에 보관하고
  새 빌드·comfy-studio 재시작·외부 HTTPS 확인을 수행한다. 실패 시 이전 빌드로 복원한다.
  PM2의 다른 앱과 Cloudflare 터널·ComfyUI 사용자 큐는 변경하지 않는다.
- [ ] Next.js feedback 후보를 한 번 점검하고 해당할 때만 AGENTS.md의 보고 절차를 실행한다.
  최종 결과에 PR, 사이트 반영 여부, 실측 상한과 생성 예시를 제시한다.

## Self-review

- Spec의 입력·길이·해상도·업스케일·보안·복구·오디오·모바일·실측 요구를 Tasks 1~6에 매핑했다.
- Task 간 public 타입과 함수 이름은 위 Interfaces를 기준으로 통일한다.
- 별도 고해상도 H3 전체 재생성, 모델 다운로드, 사용자 작업 취소는 계획에 포함하지 않았다.
- 원격 MP4는 `/view` Range를, CPU 최종 확대 결과는 동일 보안 정책의 로컬 Range 스트림을 사용한다.
- 제품 코드는 아직 변경하지 않았다. 이 문서를 사용자에게 보여주고 실행 방식 선택을 받은 뒤 시작한다.
