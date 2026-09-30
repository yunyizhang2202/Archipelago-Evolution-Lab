"""Build an offline, dependency-free source bundle from this checkout."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
paths = [root / name for name in ("README.md", "VALIDATION.md", "package.json", "server.cjs")]
for directory in ("dist", "tests", "scripts"):
    paths.extend(p for p in (root / directory).rglob("*") if p.is_file() and p.suffix not in (".zip", ".pyc"))
with ZipFile(root / "dist/source.zip", "w", ZIP_DEFLATED) as bundle:
    for source in sorted(set(paths)):
        bundle.write(source, "archipelago-evolution/" + source.relative_to(root).as_posix())
with ZipFile(root / "dist/source.zip") as bundle:
    assert bundle.testzip() is None
    assert "archipelago-evolution/dist/index.html" in bundle.namelist()
    print(f"Offline bundle verified: {len(bundle.namelist())} files, {(root / 'dist/source.zip').stat().st_size} bytes")
