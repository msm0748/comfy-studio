import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('music_policy', Path(__file__).resolve().parents[1] / 'comfy_nodes/music_auto/policy.py')
policy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(policy)

class MusicAutoPolicyTests(unittest.TestCase):
    def test_eos_length_drives_exact_latent_size(self):
        result = policy.finished_audio_shape([7] * 367)
        self.assertEqual(result, (73.4, 1835))

    def test_budget_exhaustion_never_returns_chopped_audio(self):
        with self.assertRaisesRegex(ValueError, 'MUSIC_AUTO_NO_END'):
            policy.finished_audio_shape([7] * 600)
        with self.assertRaises(ValueError):
            policy.finished_audio_shape([])

    def test_planner_prompt_has_no_fixed_duration_and_preserves_lyrics(self):
        prompt = policy.planner_prompt('Warm piano', '[Verse]\n작은 빛', 120, 'A major', '4')
        self.assertNotIn('duration:', prompt)
        self.assertIn('[Verse]\n작은 빛', prompt)
        self.assertTrue(prompt.endswith('</think>\n\n'))
        self.assertEqual(prompt.count('<|im_end|>'), 2)

    def test_cfg_prompt_uses_training_dropout_format(self):
        prompt = policy.unconditional_prompt()
        self.assertIn('<|im_start|>user\nNO USER INPUT\n<|im_end|>', prompt)
        self.assertTrue(prompt.endswith('<think>\n\n</think>\n\n'))

    def test_model_duration_plan_is_bounded_and_never_clamped(self):
        self.assertEqual(policy.parse_duration_plan(' 48\n'), 48)
        for text in ['180\n', '14\n', '120\n', '48 seconds', '', '<|audio_code_2|>']:
            with self.assertRaisesRegex(ValueError, 'MUSIC_AUTO_PLAN'):
                policy.parse_duration_plan(text)
        prompt = policy.duration_prompt('Warm piano', '[Outro]\nGoodbye', 120)
        self.assertTrue(prompt.endswith('bpm: 120\nduration: '))
        self.assertIn('[Outro]\nGoodbye', prompt)
        self.assertIn('duration: 48\n', policy.planner_prompt('Piano', 'Lyrics', 120, 'A major', '4', 48))

if __name__ == '__main__':
    unittest.main()
