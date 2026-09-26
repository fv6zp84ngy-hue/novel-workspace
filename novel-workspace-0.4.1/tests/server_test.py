import importlib.util
from pathlib import Path
import tempfile
import unittest
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1] / "scripts"))
spec = importlib.util.spec_from_file_location('serve', Path(__file__).resolve().parents[1] / 'scripts/serve.py')
serve = importlib.util.module_from_spec(spec)
spec.loader.exec_module(serve)

class PublicPathTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root/'index.html').write_text('public')
        (self.root/'private.txt').write_text('synthetic fixture')
        self.allowed = {'index.html'}
    def tearDown(self):
        self.tmp.cleanup()
    def test_root_and_query(self):
        self.assertEqual(serve.public_path('/?qa=1', self.root, self.allowed), self.root/'index.html')
    def test_unlisted_and_directory(self):
        for path in ['/private.txt','/src/','/.git/config','/../index.html','/%2e%2e/index.html','/a\\b','/%00']:
            self.assertIsNone(serve.public_path(path, self.root, self.allowed))
    def test_symlink_even_if_listed(self):
        (self.root/'linked.txt').symlink_to(self.root/'private.txt')
        self.assertIsNone(serve.public_path('/linked.txt', self.root, {'linked.txt'}))
    def test_symlink_parent_even_if_listed(self):
        (self.root/'real').mkdir()
        (self.root/'real'/'asset.js').write_text('public')
        (self.root/'alias').symlink_to(self.root/'real', target_is_directory=True)
        self.assertIsNone(serve.public_path('/alias/asset.js', self.root, {'alias/asset.js'}))

if __name__ == '__main__':
    unittest.main()
