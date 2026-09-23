import io
import json
import runpy
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from tools.pipeline import __main__ as cli
from tools.pipeline import proofs


@pytest.mark.parametrize(
    "mode", ["test", "verify", "dirty", "failure", "review_failure"]
)
def test_cli_dispatch_and_fail_closed_evidence(tmp_path, monkeypatch, mode):
    monkeypatch.setattr(cli, "ROOT", tmp_path)
    monkeypatch.setattr(
        "sys.argv", ["pipeline", "test" if mode == "test" else "verify"]
    )
    monkeypatch.setattr(
        cli,
        "sys",
        SimpleNamespace(
            argv=["pipeline", "test" if mode == "test" else "verify"],
            stdout=SimpleNamespace(reconfigure=Mock()),
            stderr=type(
                "ErrorStream",
                (io.StringIO,),
                {"reconfigure": lambda self, **kwargs: None},
            )(),
        ),
    )
    calls = []
    for name in ("lint", "test", "integration", "coverage", "build"):
        monkeypatch.setattr(cli.stages, name, lambda name=name: calls.append(name))
    monkeypatch.setattr(cli, "prove", lambda: calls.append("prove"))
    monkeypatch.setattr(
        cli, "review", lambda: ["bad source"] if mode == "review_failure" else []
    )
    monkeypatch.setattr(
        cli,
        "run",
        lambda args: (
            "dirty"
            if mode == "dirty" and "status" in args
            else ("" if "status" in args else "abc123")
        ),
    )
    if mode == "failure":

        def fail():
            raise RuntimeError("unit failure")

        monkeypatch.setattr(cli.stages, "test", fail)
    result = cli.main()
    assert result == (1 if mode in ("dirty", "failure", "review_failure") else 0)
    evidence = tmp_path / "test-results/verified.json"
    assert evidence.exists() is (mode == "verify")
    if mode == "verify":
        assert json.loads(evidence.read_text())["gates"] == cli.GATES
        assert calls.index("build") < calls.index("integration")


def test_module_entry_dispatches_to_main(tmp_path, monkeypatch):
    monkeypatch.setattr("sys.argv", ["pipeline", "test"])
    for name in ("test",):
        monkeypatch.setattr(cli.stages, name, lambda: None)
    # Real stdout/stderr wrappers support reconfigure; pytest streams may not.
    for name in ("stdout", "stderr"):
        monkeypatch.setattr(
            "sys." + name,
            type(
                "Stream", (io.StringIO,), {"reconfigure": lambda self, **kwargs: None}
            )(),
        )
    with (
        pytest.raises(SystemExit) as result,
        pytest.warns(RuntimeWarning, match="found in sys.modules"),
    ):
        runpy.run_module("tools.pipeline", run_name="__main__")
    assert result.value.code == 0


@pytest.mark.parametrize("outcome", ["valid", "hole", "axiom", "missing"])
@pytest.mark.parametrize("local", [False, True])
def test_lean_build_and_axiom_audit(tmp_path, monkeypatch, outcome, local):
    (tmp_path / "formal/.lake").mkdir(parents=True)
    (tmp_path / "formal/model.lean").write_text("logical model")
    (tmp_path / "formal/.lake/ignored.lean").write_text("sorry")
    executable = (
        tmp_path
        / ".tools/elan/bin"
        / ("lake.exe" if proofs.os.name == "nt" else "lake")
    )
    if local:
        executable.parent.mkdir(parents=True)
        executable.write_text("placeholder")
    monkeypatch.setattr(proofs, "ROOT", tmp_path)
    audit = Mock()
    monkeypatch.setattr(proofs, "audit_source", audit)
    output = "\n".join("Commerce." + name for name in proofs.REQUIRED)
    if outcome == "hole":
        output += " sorryAx"
    elif outcome == "axiom":
        output += " depends on axioms: [Untrusted.axiom]"
    elif outcome == "missing":
        output = ""
    else:
        output += " depends on axioms: [propext, Classical.choice, Quot.sound]"
    calls = []
    monkeypatch.setattr(
        proofs, "run", lambda args, **kwargs: calls.append(args) or output
    )
    if outcome == "valid":
        proofs.prove()
    else:
        with pytest.raises(ValueError):
            proofs.prove()
    audit.assert_called_once_with("logical model")
    assert calls[0][1:] == ["build", "Commerce"]
    assert calls[0][0] == (str(executable) if local else "lake")
