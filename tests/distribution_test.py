import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

SPEC = importlib.util.spec_from_file_location('distribution', Path(__file__).parents[1] / 'scripts/prepare-distribution.py')
distribution = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(distribution)


class DistributionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.original = distribution.ROOT
        distribution.ROOT = self.root
        plugin = self.root / 'plugin'
        plugin.mkdir()
        self.manifest = {'id': 'independent', 'version': '0.6.1', 'requiredPermissions': {'network': {'domains': ['https://api.github.com']}, 'launchProcess': {'schemes': ['https']}}}
        (plugin / 'manifest.json').write_text(json.dumps(self.manifest))
        (plugin / 'distribution.json').write_text(json.dumps({'channel': 'independent', 'marketplaceUrl': None}))
        (plugin / 'index.html').write_text('<main>Actual plugin fixture</main>')

    def tearDown(self):
        distribution.ROOT = self.original
        self.temp.cleanup()

    def test_stage_keeps_independent_id_and_source_files(self):
        target = distribution.stage('independent')
        self.assertEqual(json.loads((target / 'manifest.json').read_text())['id'], 'independent')
        self.assertEqual((target / 'index.html').read_bytes(), (self.root / 'plugin/index.html').read_bytes())

    def test_marketplace_requires_real_id_url_and_removes_github_network(self):
        for plugin_id, url in [(None, None), ('independent', 'https://exchange.adobe.com/test'), ('portal-id', 'https://evil.example')]:
            with self.assertRaises(ValueError):
                distribution.stage('marketplace', plugin_id, url)
        target = distribution.stage('marketplace', 'portal-id', 'https://exchange.adobe.com/apps/cc/123/example')
        m = json.loads((target / 'manifest.json').read_text())
        self.assertEqual(m['id'], 'portal-id')
        self.assertNotIn('network', m['requiredPermissions'])
        self.assertEqual(json.loads((self.root / 'plugin/manifest.json').read_text())['id'], 'independent')

    def make_ccx(self, alter=False, extra=False):
        target = self.root / 'Halftone-DTF-0.6.1.ccx'
        with ZipFile(target, 'w') as archive:
            for p in (self.root / 'plugin').iterdir():
                archive.writestr(p.name, b'wrong' if alter and p.name == 'index.html' else p.read_bytes())
            if extra:
                archive.writestr('unreviewed.js', 'dangerous')
        return target

    def test_official_ccx_must_match_source_commit_exactly(self):
        self.assertEqual(distribution.validate_ccx(self.make_ccx())['version'], '0.6.1')
        for kwargs in [{'alter': True}, {'extra': True}]:
            with self.assertRaises(ValueError):
                distribution.validate_ccx(self.make_ccx(**kwargs))

    def test_release_metadata_cannot_be_generated_without_native_evidence(self):
        (self.root / 'scripts').mkdir()
        (self.root / 'scripts/check-release.js').write_text('process.exit(1)')
        with self.assertRaises(Exception):
            distribution.release(self.make_ccx(), self.root / 'halftone-update.json')
        self.assertFalse((self.root / 'halftone-update.json').exists())


if __name__ == '__main__':
    unittest.main()
