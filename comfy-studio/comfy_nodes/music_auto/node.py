import torch
import comfy.model_management
import comfy.ops
from comfy.text_encoders.ace15 import generate_audio_codes
from comfy.text_encoders.llama import BaseGenerate, BaseQwen3
from .policy import MIN_SECONDS, MAX_SECONDS, CODE_RATE, finished_audio_shape, planner_prompt, unconditional_prompt, duration_prompt, parse_duration_plan

class DurationDecoder(BaseQwen3, BaseGenerate):
    """Use Comfy's text sampler with ACE's existing weights, without patching its model."""
    def __init__(self, transformer):
        self.model = transformer.model


class ComfyStudioMusicAuto:
    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {
            'clip': ('CLIP',),
            'tags': ('STRING', {'multiline': True}),
            'lyrics': ('STRING', {'multiline': True}),
            'language': (['ko', 'en', 'ja'],),
            'seed': ('INT', {'default': 0, 'min': 0, 'max': 0xffffffffffffffff}),
            'bpm': ('INT', {'default': 120, 'min': 10, 'max': 300}),
            'keyscale': ('STRING', {'default': 'A major'}),
            'timesignature': (['2', '3', '4', '6'],),
        }}

    RETURN_TYPES = ('CONDITIONING', 'LATENT', 'FLOAT')
    RETURN_NAMES = ('positive', 'latent', 'seconds')
    FUNCTION = 'generate'
    CATEGORY = 'ComfyStudio/music'

    @torch.inference_mode()
    def generate(self, clip, tags, lyrics, language, seed, bpm, keyscale, timesignature):
        tokenizer, encoder = clip.tokenizer, clip.cond_stage_model
        if not hasattr(tokenizer, 'qwen3_06b') or not hasattr(encoder, 'lm_model'):
            raise ValueError('This node requires the installed ACE-Step 1.5 text encoder.')
        max_tokens = MAX_SECONDS * CODE_RATE
        tokens = clip.tokenize(tags, lyrics=lyrics, language=language, seed=seed,
                               duration=MAX_SECONDS, bpm=bpm, keyscale=keyscale,
                               timesignature=int(timesignature), generate_audio_codes=False,
                               min_tokens=max_tokens, max_tokens=max_tokens)
        # Use Comfy's normal loading/context machinery and reserve the full LM budget.
        clip.encode_from_tokens_scheduled(tokens)
        model = getattr(encoder, encoder.lm_model) if isinstance(encoder.lm_model, str) else encoder.qwen3_06b
        with comfy.model_management.cuda_device_context(clip.patcher.load_device):
            # ACE's automatic mode first plans missing duration metadata from the song.
            # This is guidance only: output still requires a genuine EOS before the budget.
            plan_tokens = tokenizer.qwen3_06b.tokenize_with_weights(duration_prompt(tags, lyrics, bpm), disable_weights=True)
            plan_ids = [[token for token, _ in batch] for batch in plan_tokens]
            embeds, _, _, embeds_info = model.process_tokens(plan_ids, model.execution_device)
            newline = tokenizer.qwen3_06b.tokenizer.encode('\n', add_special_tokens=False)
            with comfy.ops.use_quantized_matmul(model, model.execution_device):
                planned_ids = DurationDecoder(model.transformer).generate(embeds, do_sample=False, max_length=8,
                                                                         stop_tokens=newline + [151645], embeds_info=embeds_info)
            planned_seconds = parse_duration_plan(tokenizer.qwen3_06b.decode(planned_ids))
            positive = tokenizer.qwen3_06b.tokenize_with_weights(
                planner_prompt(tags, lyrics, bpm, keyscale, timesignature, planned_seconds), disable_weights=True)
            negative = tokenizer.qwen3_06b.tokenize_with_weights(unconditional_prompt(), disable_weights=True)
            codes = generate_audio_codes(model, positive, negative,
                                         min_tokens=MIN_SECONDS * CODE_RATE,
                                         max_tokens=max_tokens, seed=seed, cfg_scale=2.0,
                                         temperature=0.85, top_p=0.9, top_k=0, min_p=0.0)
        seconds, latent_length = finished_audio_shape(codes)
        # Re-encode the text metadata with the measured plan duration, without a second LM run.
        actual = clip.tokenize(tags, lyrics=lyrics, language=language, seed=seed,
                               duration=seconds, bpm=bpm, keyscale=keyscale,
                               timesignature=int(timesignature), generate_audio_codes=False)
        positive_conditioning = clip.encode_from_tokens_scheduled(actual)
        conditioning = [[tensor, {**metadata, 'audio_codes': [codes]}]
                        for tensor, metadata in positive_conditioning]
        latent = {'samples': torch.zeros((1, 64, latent_length),
                                         device=comfy.model_management.intermediate_device(),
                                         dtype=comfy.model_management.intermediate_dtype()),
                  'type': 'audio', 'downscale_ratio_temporal': 1764}
        return {'ui': {'music_auto': [{'durationSeconds': seconds, 'ended': True, 'version': 1}]},
                'result': (conditioning, latent, seconds)}
