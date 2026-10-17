# Comfy Studio

로컬 ComfyUI를 간단하게 사용하는 Next.js 이미지 스튜디오입니다.
힉스필드처럼 이미지가 중심이 되는 어두운 작업 공간으로 구성했습니다.

## 실행

이 폴더에서 실행합니다. 다른 사이트의 3000번 포트와 구분해 3001번을 사용합니다.

```powershell
pnpm dev --hostname 127.0.0.1 --port 3001
```

접속: http://127.0.0.1:3001

프로덕션 실행:

```powershell
pnpm build
pnpm start --hostname 127.0.0.1 --port 3002
```

ComfyUI는 http://127.0.0.1:8188 에서 실행되어 있어야 합니다.
프로덕션 서버는 개발 서버와 구분해 3002번 포트를 사용합니다.
Cloudflare Tunnel은 `ai.koharu-market.com`을 `http://127.0.0.1:3002`로 연결합니다.
PM2로 실행하려면 `pm2 start ecosystem.config.cjs --only comfy-studio` 후 `pm2 save`를 실행합니다.
기존 `Koharu Market PM2` 로그인 작업이 저장된 앱 목록을 복원합니다.
`Comfy Studio PM2 Auto Start` 작업은 부팅 45초 후 S4U 계정으로 PM2 목록을 복원하므로
Windows 로그인 전에도 스튜디오와 Cloudflare 터널을 시작합니다. 기존 ComfyUI 부팅 작업은 별도로 실행됩니다.
등록 스크립트는 `scripts/Register-Autostart.ps1`, 실행 스크립트는 `scripts/Start-PM2.ps1`입니다.
등록은 관리자 PowerShell에서 한 번 실행하며 로그는 Git에서 제외한 `.data`에 기록합니다.
비밀번호 변경 후에는 `pm2 restart comfy-studio`를 실행합니다.
이 비밀번호와 세션 키는 서버 실행 시 읽으므로 변경 후 다시 빌드할 필요가 없습니다.

## 로그인 환경변수

`.env.example`을 `.env.local`로 복사한 뒤 `STUDIO_PASSWORD`에 8자 이상의 긴 비밀번호를,
`STUDIO_SESSION_SECRET`에 32자 이상의 무작위 값을 설정합니다. 설정 후 서버를 재시작합니다.
비밀번호가 없거나 세션 키가 짧으면 로그인과 생성 API는 차단됩니다.
`.env.local` 등 실제 환경변수 파일은 `.gitignore`로 제외하며 빈 `.env.example`만 추적합니다.
환경변수 이름에 `NEXT_PUBLIC_`을 붙이지 마세요.

로그인은 8시간 유효한 HttpOnly/SameSite 쿠키를 사용하고 HTTPS에서는 Secure를 적용합니다.
비밀번호나 세션 키를 바꾸면 기존 세션이 무효화됩니다. 연속 5회 실패하면 15분 동안 제한됩니다.
생성 API는 Proxy와 데이터 처리 경계에서 모두 인증하며 결과 이미지도 보호합니다.

## 사용

1. 설치된 이미지 모델을 선택합니다.
2. 원하는 장면의 프롬프트를 입력하거나 아이디어 카드를 누릅니다.
3. 추천 사이즈 또는 다른 사이즈를 고릅니다.
4. 이미지 생성하기를 누르고, 완성된 결과를 다운로드합니다.

영상 생성과 노래 생성은 아직 준비 중입니다.
아이디어 이미지는 기존 로컬 Z-Image 작업에서 가져온 예시이며 생성 기록이 아닙니다.

## 모델과 저장된 설정

- Z-Image Turbo: `T2I_Z-Image-Turbo.json`
- Qwen Image 2512: `T2I_Qwen-Image-2512.json`
- Krea 2 Turbo: `Krea2-Turbo-RTX3090.json`

워크플로 기본 위치:
`C:/ComfyUI/ComfyUI_windows_portable/ComfyUI/user/default/workflows`

스텝, CFG, 인코더, VAE, LoRA, 프롬프트 확장 스위치는 이 워크플로의 값을 사용합니다.
Qwen의 저장된 기본 Lightning 스위치는 꺼져 있으며 50스텝/CFG 4가 유지됩니다.
Z-Image와 Krea는 저장된 8스텝 설정입니다. 임의로 빠른 설정으로 교체하지 않습니다.

지원 범위는 위 세 워크플로 구조입니다. 지원하지 않는 변경이나 모델 파일/노드 누락은
해당 모델에 사용 불가 사유로 표시됩니다. 모델/사이즈 목록은 `lib/presets.ts`에서 관리합니다.
상업용 허용 목록은 상위 `C:/ComfyUI/AGENTS.md`를 따르며 Qwen Image 2.1은 제공하지 않습니다.

필요한 경우 `.env.example`을 `.env.local`로 복사해 주소와 워크플로 폴더를 변경합니다.
새 모델 추가 전에는 상업용 라이선스와 하드웨어 적합성을 다시 확인해야 합니다.

## 작업과 결과

작업 메타데이터는 `.data/jobs`에 저장하며 Git에는 넣지 않습니다.
이미지 원본은 ComfyUI output 폴더에 보관됩니다.
마지막 작업 ID와 마지막 성공 결과 ID는 브라우저 localStorage에 저장합니다.
같은 작업 번호의 재요청은 자동으로 중복 생성하지 않습니다.
서버 연결이 잠시 끊기면 같은 작업의 상태만 다시 조회합니다.
작업 오류나 메모리 부족 시 자동으로 다른 설정을 적용하지 않습니다.

## 검증

```powershell
pnpm test
pnpm typecheck
pnpm build
```

검사 범위: 인증, 요청 검증, 저장 프리셋/스위치 보존, 누락 모델, 작업 복구,
중복 제출 방지, 결과 경로 검증, 같은 출처 요청 검증을 포함합니다.
응답 유실 시 요청 번호와 입력을 먼저 저장하여 같은 작업을 복구하고,
서버 메타데이터 저장이 잠시 실패해도 접수된 작업을 실패로 바꾸지 않습니다.
현재 Windows 환경의 Tailwind 전용 로더에서 빌드 오류가 재현되어 화면은 표준 CSS로
작성했습니다. 추가 의존성 없이 기존 Next.js Turbopack으로 빌드합니다.

실제 Z-Image 1024×1024 이미지 한 장을 UI에서 생성했고 PNG 다운로드까지 확인했습니다.
Qwen/Krea는 저장 설정과 설치 모델/노드 검증을 완료했지만 실제 생성 시험은 하지 않았습니다.
