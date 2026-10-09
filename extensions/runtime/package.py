"""Build a reproducible reference ZIP; approval is an explicit registry operation."""

import argparse
import hashlib
import zipfile
from pathlib import Path


def build(destination):
    source = Path(__file__).with_name("reference")
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in ("__main__.py", "sdk.py", "manifest.json"):
            item = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            item.external_attr = 0o100444 << 16
            archive.writestr(item, (source / name).read_bytes())
    return hashlib.sha256(Path(destination).read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("output")
    print(build(parser.parse_args().output))


if __name__ == "__main__":
    main()
