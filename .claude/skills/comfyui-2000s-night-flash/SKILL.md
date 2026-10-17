---
name: comfyui-2000s-night-flash
description: Use when the user asks for the saved 2000년대 밤거리 디카 플래시 style, early 2000s CCD compact-camera night snapshots, or variations of the saved woman outside a convenience store, using local ComfyUI.
---

# 2000년대 밤거리 디카 플래시

ComfyUI에서 사용자가 선택한 밤거리 디카 사진의 질감을 재사용한다. 인물·옷·장소·포즈는 요청에 맞게 바꾸고, 카메라 질감과 플래시 조명은 유지한다. 특정 인물의 동일한 얼굴을 보장하는 스킬은 아니다.

## 원본과 재사용

- `assets/reference.png`: 사용자가 선택한 생성 사진. 필요한 경우 이미지 뷰어로 확인한다.
- `references/original-prompt.txt`: 실제 생성에 쓴 영어 프롬프트 전체.
- `assets/prompt_api.json`: 실제 실행한 ComfyUI API 그래프.
- `assets/workflow.json`: ComfyUI에서 열 수 있는 편집용 워크플로.

원본 재현 요청이면 원본 프롬프트와 설정을 사용한다. 변형 요청이면 프롬프트의 인물·장면 부분만 수정하고 아래 스타일 블록을 유지한다. 결과를 생성할 때는 API 그래프를 작업 폴더에 복사해 수정하고 파일명 접두사를 새로 지정한다. 원본 파일을 덮어쓰지 않는다. 다른 시드는 새 구도를 만들며, 원본 시드도 프롬프트가 달라지면 같은 얼굴을 보장하지 않는다.

## 유지할 스타일

직광 온카메라 플래시가 가까운 인물을 밝히고 배경은 어둡게 남긴다. 약간 거친 하이라이트, 자연스러운 피부, 미세한 색 노이즈, 부드러운 저해상도 디테일, 제한된 다이내믹 레인지, 약한 황록색 화이트밸런스가 핵심이다. 4:3 일상 스냅사진으로 구성한다.

```text
Direct on camera compact camera flash, slightly harsh light on face, darker background with softly glowing storefront, understated everyday street scene. Candid photograph taken in 2003 using a small consumer 3 megapixel CCD compact digital camera, nostalgic Korean personal photo album. Ordinary imperfect snapshot rather than polished fashion photography. Soft low resolution detail, slight focus imprecision, visible fine chroma noise in shadows, mild JPEG compression texture, limited dynamic range, slightly blown pale highlights, modest saturation, subtle yellow green white balance cast, soft brown and olive shadows, warm skin, small camera lens, authentic dated digital photo quality. Natural unretouched skin, wistful quiet mood, believable anatomy. Horizontal 4:3 snapshot. No text, no date stamp, no watermarks, no decorative frame.
```

배경이 편의점이 아니면 `softly glowing storefront`를 해당 장소의 약한 실용광으로 바꾼다. 3메가픽셀과 JPEG는 프롬프트의 질감 지시이며 실제 파일 사양은 아래와 같다. 별도 후처리를 적용했다고 주장하지 않는다.

## 검증된 기본 설정

| 항목 | 값 |
|---|---|
| 모델 | z_image_turbo_bf16.safetensors (Z-Image Turbo) |
| 텍스트 인코더 | qwen_3_4b.safetensors, lumina2 |
| VAE | ae.safetensors |
| 해상도 / 배치 | 1024×768 / 1 |
| Steps / CFG | 9 / 1 |
| Sampler / Scheduler | res_multistep / simple |
| Denoise / AuraFlow shift | 1 / 3 (flow) |
| 원본 seed | 2026100354 |

ComfyUI 관련 작업 전 프로젝트 CLAUDE.md와 .claude/skills/commercial-models/SKILL.md의 상업 사용 정책을 적용한다. 하드웨어 적합성 지침은 C:/Users/msm13/.codex/skills/comfyui-hardware-fit/SKILL.md를 직접 읽고 현재 GPU 자원 및 대기열을 확인한다. 이 구성은 RTX 3090 24GB에서 실제 생성한 구성이다. 여러 장은 배치 1로 순차 실행한다. 로컬 설치된 모델과 노드를 먼저 사용한다.

이미지 생성 요청이면 API 실행 성공과 저장 파일을 확인하고 결과를 시각적으로 검토한 뒤 보여준다. 프롬프트만 요청하면 프롬프트를 제공하고 생성은 실행하지 않는다.

사용 예: “밤거리 디카 플래시 스타일로 비 오는 골목에서 우산 든 여자 3장 만들어줘.”

## Claude에서 실행

Claude Code에서 이 프로젝트(C:/ComfyUI)를 열고 `/comfyui-2000s-night-flash` 뒤에 원하는 장면을 입력한다. 원본과 참고 파일 경로는 이 SKILL.md가 있는 디렉터리를 기준으로 해석한다.

로컬 ComfyUI API 기본 주소는 http://127.0.0.1:8188 이다. 생성 요청이면 `/queue` 및 `/object_info`로 현재 상태와 노드를 확인하고, assets/prompt_api.json을 작업 폴더에 복사해 프롬프트와 시드, 출력 접두사를 수정한다. `/prompt`에 제출하고 `/history/{prompt_id}`에서 성공과 실제 출력 경로를 확인한다. 설치된 Python은 C:/ComfyUI/ComfyUI_windows_portable/python_embeded/python.exe 이다. 모델 파일은 복사본에 포함되지 않으며 설치된 모델을 사용한다.

로컬 PC에 접근할 수 없는 Claude 웹 대화에서는 동일한 스타일 프롬프트와 설정을 작성하는 용도로 사용한다. 로컬 API를 호출하거나 PC에 이미지를 생성했다고 주장하지 않는다.