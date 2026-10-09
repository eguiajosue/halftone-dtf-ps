"""Build reproducible ZIP/CCX candidate without requiring Adobe tools on Linux.
For release packaging use UXP Developer Tool on Windows and test in Photoshop.
Candidate files are never used by the automatic stable-release updater.
"""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'dist'
OUT.mkdir(exist_ok=True)
m = json.loads((ROOT / 'plugin/manifest.json').read_text())
version = m['version']
if not (ROOT / 'plugin/vendor/spectrum.js').is_file():
    raise RuntimeError('Run npm ci and npm run build:ui before packaging Spectrum.')

def write_zip(destination, entries):
    with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
        for arcname, file in entries:
            entry = ZipInfo(arcname, date_time=(2026, 10, 8, 0, 0, 0))
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, file.read_bytes())
    with ZipFile(destination) as archive:
        assert archive.testzip() is None

ccx = OUT / f'Halftone-DTF-{version}.ccx'
write_zip(ccx, [(str(p.relative_to(ROOT / 'plugin')), p) for p in sorted((ROOT/'plugin').rglob('*')) if p.is_file()])
sha = OUT/'SHA256SUMS.txt'
sha.write_text(f'{hashlib.sha256(ccx.read_bytes()).hexdigest()}  {ccx.name}\n')
updater = OUT / 'Halftone-DTF-Updater-Windows.zip'
write_zip(updater, [(p.name, p) for p in sorted((ROOT/'installer/windows').iterdir()) if p.is_file()])
entries = []
for p in sorted(ROOT.rglob('*')):
    rel = p.relative_to(ROOT)
    if not p.is_file() or '.git' in rel.parts or 'dist' in rel.parts or '__pycache__' in rel.parts or 'node_modules' in rel.parts or 'test-results' in rel.parts or 'playwright-report' in rel.parts: continue
    entries.append((f'Halftone-DTF/{rel.as_posix()}',p))
entries += [(f'Halftone-DTF/installer/{ccx.name}',ccx),(f'Halftone-DTF/installer/{sha.name}',sha)]
project = OUT / f'Halftone-DTF-{version}-proyecto.zip'
write_zip(project,entries)
print(project)
print(ccx)
print(updater)
