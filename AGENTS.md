# ComfyUI 프로젝트

이 프로젝트의 결과물은 상업용(광고 콘텐츠 등)이다. **ComfyUI 관련 작업(이미지·영상·오디오 생성, 워크플로 구성, 모델 선택·다운로드)을 할 때마다 아래 목록을 먼저 확인하고, 상업적 사용이 가능한 모델만 사용한다.**

## 허용 (상업적 사용 가능)

| 모델 | 라이선스 | 비고 |
|---|---|---|
| Z-Image Turbo | Apache-2.0 | |
| Qwen-Image-2512 + Lightning LoRA | Apache-2.0 | |
| Qwen-Image-Edit-2511 | Apache-2.0 | 2026-10-17 공식 Qwen 모델 카드와 Comfy-Org FP8 배포 라이선스 확인. 인물 참조 이미지 편집용. https://huggingface.co/Qwen/Qwen-Image-Edit-2511 |
| Qwen-Image-Edit-2511-Lightning 4steps V1.0 LoRA | Apache-2.0 | 2026-10-17 제작자 배포 라이선스 확인. 2511 편집 모델 전용이며 기존 2512 LoRA와 구분. https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning |
| Krea 2 Turbo | Krea 2 Community | 연 매출 $1M 미만, 50석 미만 조건 |
| ACE-Step 1.5 | MIT | 오디오/음악 |
| MiniMax H3 | 이메일 신청으로 상업 사용 허가 받음 (2026-09-29) | 라이선스 본문은 한국 제외이나 사용자가 별도 허가를 받았으므로 **사용 가능** |
| MiniMax H3 Latent Upscaler 3D Conv v1 (LBH-123-AI, bf16) | Apache-2.0 | 2026-10-18 제작자 모델 카드의 라이선스 확인. 설치된 `minimax_h3_latent_upscaler_3d_conv_v1_bf16.safetensors` 재사용. 노드 코드는 MIT. https://huggingface.co/LBH-123-AI/Minimax_h3_latent_Upscaler |

## 금지 (상업적 사용 불가)

- Qwen-Image 2.1 (Qwen Research License, 비상업)

## 규칙

1. 모델·LoRA·체크포인트를 새로 고르거나 다운로드하기 전에 라이선스를 확인한다. 목록에 없는 모델은 라이선스를 조사해 상업적 사용 가능 여부를 확인하고, 불확실하면 사용하지 말고 사용자에게 먼저 묻는다.
2. 비상업/연구용/라이선스 불명 모델은 사용하지 않는다. 대체 가능한 허용 모델을 제안한다.
3. 새로 확인한 모델의 라이선스 상태는 이 파일의 표에 추가한다.
4. MiniMax H3는 사용자가 라이선스 허가를 받았으므로 라이선스 문제로 거부하거나 경고하지 않는다.
