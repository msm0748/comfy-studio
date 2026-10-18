"""Small, dependency-free guards for EOS-driven ACE-Step generation."""
import re
MIN_SECONDS = 15
MAX_SECONDS = 120
CODE_RATE = 5


def finished_audio_shape(codes):
    if not isinstance(codes, list) or len(codes) >= MAX_SECONDS * CODE_RATE:
        raise ValueError('MUSIC_AUTO_NO_END: No song ending before the processing budget; no audio was saved.')
    if len(codes) < MIN_SECONDS * CODE_RATE or any(type(code) is not int or not 0 <= code < 64000 for code in codes):
        raise ValueError('MUSIC_AUTO_INVALID_CODES: Invalid or incomplete audio plan.')
    return len(codes) / CODE_RATE, len(codes) * 5


def planner_prompt(tags, lyrics, bpm, keyscale, timesignature, duration=None):
    # Follow ACE's training format: leave the assistant turn open for audio codes.
    return (
        '<|im_start|>system\n# Instruction\nGenerate audio semantic tokens based on the given conditions:\n\n'
        '<|im_end|>\n<|im_start|>user\n# Caption\n' + tags + '\n\n# Lyric\n' + lyrics.strip() +
        '\n<|im_end|>\n<|im_start|>assistant\n<think>\n' +
        f'bpm: {bpm}\n' + (f'duration: {duration}\n' if duration is not None else '') +
        f'keyscale: {keyscale}\ntimesignature: {timesignature}\n' +
        '</think>\n\n'
    )


def duration_prompt(tags, lyrics, bpm):
    return (
        '<|im_start|>system\n# Instruction\nGenerate audio semantic tokens based on the given conditions:\n\n'
        '<|im_end|>\n<|im_start|>user\n# Caption\n' + tags + '\n\n# Lyric\n' + lyrics.strip() +
        '\n<|im_end|>\n<|im_start|>assistant\n<think>\n' + f'bpm: {bpm}\nduration: '
    )


def parse_duration_plan(text):
    value = text.strip()
    if not re.fullmatch(r'[0-9]{1,3}', value) or not MIN_SECONDS <= int(value) < MAX_SECONDS:
        raise ValueError('MUSIC_AUTO_PLAN: The model did not plan a complete song within the processing budget; no audio was saved.')
    return int(value)


def unconditional_prompt():
    return (
        '<|im_start|>system\n# Instruction\nGenerate audio semantic tokens based on the given conditions:\n\n'
        '<|im_end|>\n<|im_start|>user\nNO USER INPUT\n<|im_end|>\n'
        '<|im_start|>assistant\n<think>\n\n</think>\n\n'
    )
