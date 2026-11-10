"""Run with python scripts/test_init_project.py."""
import tempfile
import unittest
from pathlib import Path
from init_project import initialize, START


class InitializationTests(unittest.TestCase):
    def test_dry_run_and_idempotence_preserve_user_content(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as tmp:
            root = Path(tmp)
            rules = root / 'AGENTS.md'
            original = '# Rules\r\n保持中文。\r\n'.encode('utf-8')
            rules.write_bytes(original)
            self.assertTrue(initialize(root, dry_run=True))
            self.assertEqual(list(root.iterdir()), [rules])
            self.assertEqual(rules.read_bytes(), original)
            initialize(root)
            self.assertTrue(rules.read_bytes().startswith(original))
            current = root / '.project-memory/current.md'
            current.write_text('用户最新检查点', encoding='utf-8')
            before = {p.relative_to(root): p.read_bytes() for p in root.rglob('*') if p.is_file()}
            self.assertEqual(initialize(root), [])
            self.assertEqual(before, {p.relative_to(root): p.read_bytes() for p in root.rglob('*') if p.is_file()})

    def test_invalid_markers_fail_before_mutation(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as tmp:
            root = Path(tmp)
            (root / 'AGENTS.md').write_text(START, encoding='utf-8')
            with self.assertRaises(ValueError):
                initialize(root)
            self.assertFalse((root / '.project-memory').exists())

    def test_missing_project_is_not_created(self):
        with tempfile.TemporaryDirectory(dir=Path.cwd()) as tmp:
            missing = Path(tmp) / 'missing'
            with self.assertRaises(FileNotFoundError):
                initialize(missing)
            self.assertFalse(missing.exists())


if __name__ == '__main__':
    unittest.main()
