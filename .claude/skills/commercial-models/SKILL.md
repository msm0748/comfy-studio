---
name: commercial-models
description: ComfyUI 작업(이미지·영상·오디오 생성, 워크플로 구성, 모델 선택·다운로드)을 하는 모든 에이전트 작업에서 반드시 먼저 참고. 상업적 사용이 가능한 모델만 사용하도록 허용/금지 모델 목록과 규칙을 제공.
---

# 상업적 사용 가능 모델만 사용

이 프로젝트의 결과물은 상업용(광고 콘텐츠 등)이다. **ComfyUI 에이전트 작업을 할 때마다 이 목록을 먼저 확인하고, 상업적 사용이 가능한 모델만 사용한다.**

## 허용 (상업적 사용 가능)

| 모델 | 라이선스 | 비고 |
|---|---|---|
| Z-Image Turbo | Apache-2.0 | |
| Qwen-Image-2512 + Lightning LoRA | Apache-2.0 | |
| Krea 2 Turbo | Krea 2 Community | 연 매출 $1M 미만, 50석 미만 조건 |
| ACE-Step 1.5 | MIT | 오디오/음악 |
| MiniMax H3 | 이메일 신청으로 상업 사용 허가 받음 (2026-09-29) | 라이선스 본문은 한국 제외이나 사용자가 별도 허가를 받았으므로 **사용 가능** |
| MOSS-Image (Base/SFT) | Apache-2.0 (HF 모델 카드, 2026-10-22 확인) | SFT int8 설치 (2026-10-22) |
| FLUX 3 Image Klein | FLUX Kommunity License | 연 매출 $5M 미만 무료 상업 이용, 상업적 파인튜닝·재배포 제외 (보도 기준, 2026-10-22). 미설치 |
| HeartMuLa (3B) | Apache-2.0 (코드·가중치, 공식 repo) | 음악. 미설치 |
| ACE-Step 1.5 XL | MIT (Comfy 공식 블로그) | 일부 페이지는 Apache-2.0 표기, 둘 다 상업 가능. XL turbo 설치, 스튜디오 노래 생성에 사용 중 (2026-10-22) |

## 확인 필요

- FastH3 (MiniMax H3 8스텝 증류, FastVideo): MiniMax H3 Community License 승계. H3 파생 모델이라 기존 H3 허가 범위에 포함되는지 사용자 확인 후 사용.
- LTX-2.5: LTX-2.x Community License, 연 매출 $10M 미만 상업 가능 (보도 기준). 라이선스 원문 확인 후 사용.

## 금지 (상업적 사용 불가)

- Qwen-Image 2.1 (Qwen Research License, 비상업) — 2.1 Turbo 포함
- Bria Fibo 2.0 (CC BY-NC 4.0, 비상업)

## 규칙

1. 모델·LoRA·체크포인트를 새로 고르거나 다운로드하기 전에 라이선스를 확인한다. 목록에 없는 모델은 라이선스를 조사해 상업적 사용 가능 여부를 확인하고, 불확실하면 사용하지 말고 사용자에게 먼저 묻는다.
2. 비상업/연구용/라이선스 불명 모델은 사용하지 않는다. 대체 가능한 허용 모델을 제안한다.
3. 새로 확인한 모델의 라이선스 상태는 이 파일의 표에 추가한다.
4. MiniMax H3는 사용자가 라이선스 허가를 받았으므로 라이선스 문제로 거부하거나 경고하지 않는다.
