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
        AutoTokenizer=SimpleNamespace(
            from_pretrained=MagicMock(return_value=tokenizer)
        ),
        AutoModelForCausalLM=SimpleNamespace(
            from_pretrained=MagicMock(return_value=model)
        ),
    )
    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.setitem(sys.modules, "transformers", transformers)
    return Engine(), tokenizer, model


def test_model_loading_requires_safe_weights_and_rejects_remote_code(
    inference, monkeypatch
):
    monkeypatch.setenv("FUNCTIONGEMMA_MODEL", "configured/model")
    transformers = sys.modules["transformers"]
    transformers.AutoTokenizer.from_pretrained.reset_mock()
    transformers.AutoModelForCausalLM.from_pretrained.reset_mock()
    engine = Engine()
    transformers.AutoTokenizer.from_pretrained.assert_called_once_with(
        "configured/model", trust_remote_code=False
    )
    transformers.AutoModelForCausalLM.from_pretrained.assert_called_once_with(
        "configured/model",
        dtype=engine.torch.float32,
        use_safetensors=True,
        trust_remote_code=False,
        weights_only=True,
    )


@pytest.mark.parametrize(
    "loader_name,error",
    [
        ("AutoModelForCausalLM", OSError("No safetensors checkpoint available")),
        ("AutoModelForCausalLM", ValueError("Model requires remote code")),
        ("AutoTokenizer", ValueError("Tokenizer requires remote code")),
    ],
)
def test_unsafe_or_unavailable_model_fails_without_fallback(
    inference, loader_name, error
):
    transformers = sys.modules["transformers"]
    tokenizer_loader = transformers.AutoTokenizer.from_pretrained
    model_loader = transformers.AutoModelForCausalLM.from_pretrained
    tokenizer_loader.reset_mock()
    model_loader.reset_mock()
    loader = getattr(transformers, loader_name).from_pretrained
    loader.side_effect = error
    with pytest.raises(type(error)) as caught:
        Engine()
    assert caught.value is error
    assert loader.call_count == 1
    assert loader.call_args.kwargs["trust_remote_code"] is False
    if loader_name == "AutoTokenizer":
        model_loader.assert_not_called()
    else:
        assert loader.call_args.kwargs["use_safetensors"] is True
        assert loader.call_args.kwargs["weights_only"] is True
    inference[2].generate.assert_not_called()


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
