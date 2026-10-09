"""The tool registry must stay synchronized with OpenAPI, including input schemas."""

import importlib.util
import json
import shutil
from pathlib import Path


def test_registry_matches_current_contract_and_rejects_unregistered_api(tmp_path):
    root = Path(__file__).resolve().parents[2]
    spec = importlib.util.spec_from_file_location(
        "registry_generator", root / "scripts/generate-assistant-registry.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    shutil.copytree(root / "docs/openapi", tmp_path / "docs/openapi")
    shutil.copy(root / "docs/openapi.json", tmp_path / "docs/openapi.json")
    (tmp_path / "backend/resources").mkdir(parents=True)
    module.ROOT = tmp_path
    module.generate()
    actual = (root / "backend/resources/assistant-tools.json").read_text()
    assert (tmp_path / "backend/resources/assistant-tools.json").read_text() == actual
    assert len(json.loads(actual)) == 35
    import pytest

    document = json.loads((tmp_path / "docs/openapi.json").read_text())
    document["paths"]["/new"] = {"post": {"operationId": "unregistered"}}
    (tmp_path / "docs/openapi.json").write_text(json.dumps(document))
    with pytest.raises(KeyError):
        module.generate()
