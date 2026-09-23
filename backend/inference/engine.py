"""Private CPU inference adapter. It never invokes tools or accesses commerce data."""

import json
import os
from threading import Lock

from call_parser import parse_call


class Engine:
    def __init__(self):
        import torch
        from transformers import AutoModelForCausalLM, AutoTokenizer

        self.torch = torch
        torch.set_num_threads(4)
        model = os.environ.get("FUNCTIONGEMMA_MODEL", "google/functiongemma-270m-it")
        self.tokenizer = AutoTokenizer.from_pretrained(model)
        self.model = AutoModelForCausalLM.from_pretrained(model, dtype=torch.float32)
        self.model.eval()
        self.lock = Lock()

    def infer(self, request):
        if not isinstance(request, dict) or set(request) != {
            "message",
            "tools",
            "collected",
        }:
            raise ValueError("Invalid inference request")
        message, tools = request["message"], request["tools"]
        if (
            not isinstance(message, str)
            or not 0 < len(message) <= 2000
            or not isinstance(tools, list)
            or not 0 < len(tools) <= 20
        ):
            raise ValueError("Invalid message or tool count")
        if not isinstance(request["collected"], dict) and request["collected"] != []:
            raise ValueError("Invalid collected fields")
        context = request["collected"]
        content = (
            message
            if not context
            else "Collected fields: "
            + json.dumps(context)
            + "\nNew user information: "
            + message
        )
        messages = [
            {
                "role": "developer",
                "content": "You are a model that can do function calling with the following functions",
            },
            {"role": "user", "content": content},
        ]
        inputs = self.tokenizer.apply_chat_template(
            messages,
            tools=tools,
            add_generation_prompt=True,
            tokenize=True,
            return_dict=True,
            return_tensors="pt",
        )
        if inputs["input_ids"].shape[-1] > 12000:
            raise ValueError("Input exceeds token budget")
        if not self.lock.acquire(blocking=False):
            raise RuntimeError("Inference busy")
        try:
            with self.torch.inference_mode():
                output = self.model.generate(
                    **inputs,
                    max_new_tokens=384,
                    do_sample=False,
                    max_time=20,
                    eos_token_id=[
                        self.tokenizer.eos_token_id,
                        self.tokenizer.convert_tokens_to_ids(
                            "<start_function_response>"
                        ),
                    ],
                )
            text = self.tokenizer.decode(
                output[0][inputs["input_ids"].shape[-1] :], skip_special_tokens=False
            )
            return parse_call(text, {tool["function"]["name"] for tool in tools})
        finally:
            self.lock.release()
