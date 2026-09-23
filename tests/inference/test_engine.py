import sys
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from engine import Engine


@pytest.fixture
def inference(monkeypatch):
    torch = MagicMock()
    tokenizer = MagicMock()
    model = MagicMock()
    inputs = {"input_ids": MagicMock()}
    inputs["input_ids"].shape = (1, 30)
    tokenizer.apply_chat_template.return_value = inputs
    tokenizer.decode.return_value = (
        "<start_function_call>call:catalog{}<end_function_call>"
    )
    transformers = SimpleNamespace(
        AutoTokenizer=SimpleNamespace(from_pretrained=lambda *a, **kw: tokenizer),
        AutoModelForCausalLM=SimpleNamespace(from_pretrained=lambda *a, **kw: model),
    )
    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.setitem(sys.modules, "transformers", transformers)
    return Engine(), tokenizer, model


def request():
    return {
        "message": "Show products",
        "tools": [{"type": "function", "function": {"name": "catalog"}}],
        "collected": {},
    }


def test_model_runs_greedy_bounded_inference_with_declared_tools(inference):
    engine, tokenizer, model = inference
    assert engine.infer(request()) == {"name": "catalog", "arguments": {}}
    assert model.generate.call_args.kwargs["max_new_tokens"] == 384
    assert model.generate.call_args.kwargs["do_sample"] is False
    assert tokenizer.apply_chat_template.call_args.kwargs["tools"] == request()["tools"]
    engine.infer({**request(), "collected": []})


@pytest.mark.parametrize(
    "payload",
    [
        None,
        {},
        {**request(), "message": 5},
        {**request(), "message": ""},
        {**request(), "message": "x" * 2001},
        {**request(), "tools": []},
        {**request(), "tools": 5},
        {**request(), "tools": [{}] * 21},
        {**request(), "collected": "bad"},
    ],
)
def test_model_rejects_invalid_requests(inference, payload):
    with pytest.raises(ValueError):
        inference[0].infer(payload)


def test_model_rejects_oversized_prompt_busy_and_releases_lock_after_failure(inference):
    engine, tokenizer, model = inference
    tokenizer.apply_chat_template.return_value["input_ids"].shape = (1, 12001)
    with pytest.raises(ValueError):
        engine.infer(request())
    tokenizer.apply_chat_template.return_value["input_ids"].shape = (1, 30)
    engine.lock.acquire()
    with pytest.raises(RuntimeError):
        engine.infer(request())
    engine.lock.release()
    model.generate.side_effect = RuntimeError("generation failed")
    with pytest.raises(RuntimeError):
        engine.infer(request())
    assert not engine.lock.locked()
