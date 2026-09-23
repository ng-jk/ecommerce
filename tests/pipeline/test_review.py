import pytest

from tools.pipeline.proofs import REQUIRED, audit_source
from tools.pipeline.review import inspect_text


def test_size_limit_counts_blank_lines():
    assert inspect_text("a.py", "\n" * 1000) == []
    assert "R01" in inspect_text("a.py", "\n" * 1001)[0]


@pytest.mark.parametrize(
    "source", ['import {fetch} from "../data/api"', 'import React from "react"']
)
def test_domain_cannot_import_outer_layers(source):
    assert inspect_text("src/domain/cart.ts", source)


def test_presentation_cannot_fetch_or_store():
    assert inspect_text("src/presentation/Home.tsx", 'fetch("/api")')
    assert inspect_text("src/presentation/Home.tsx", "sessionStorage.getItem('token')")


def test_missing_theorems_and_proof_holes_fail():
    with pytest.raises(ValueError):
        audit_source("theorem unrelated : True := by trivial")
    with pytest.raises(ValueError):
        audit_source("sorry")
    source = "\n".join(f"theorem {name} : True := by trivial" for name in REQUIRED)
    with pytest.raises(ValueError):
        audit_source(source)


@pytest.mark.parametrize(
    "path",
    [
        "package-lock.json",
        "backend/composer.lock",
        "README.md",
        "compose.yaml",
        "schema.d.ts",
        "packages/generated/client.ts",
    ],
)
def test_size_limit_excludes_non_authored_logic(path):
    assert inspect_text(path, "\n" * 1001) == []
