"""Parse FunctionGemma's documented call grammar without eval or code execution."""

import json
import re


class CallParser:
    def __init__(self, source):
        self.source = source
        self.index = 0

    def whitespace(self):
        while self.index < len(self.source) and self.source[self.index].isspace():
            self.index += 1

    def take(self, value):
        self.whitespace()
        if not self.source.startswith(value, self.index):
            raise ValueError("Malformed function call")
        self.index += len(value)

    def value(self, depth=0):
        if depth > 12:
            raise ValueError("Function call is too deeply nested")
        self.whitespace()
        if self.source.startswith("<escape>", self.index):
            self.index += 8
            end = self.source.find("<escape>", self.index)
            if end < 0:
                raise ValueError("Unterminated string")
            value = self.source[self.index : end]
            self.index = end + 8
            return value
        if self.source.startswith("{", self.index):
            self.take("{")
            result = {}
            self.whitespace()
            while not self.source.startswith("}", self.index):
                match = re.match(r"[A-Za-z_][A-Za-z_0-9]*", self.source[self.index :])
                if not match:
                    raise ValueError("Invalid field name")
                key = match[0]
                if key in result:
                    raise ValueError("Duplicate field")
                self.index += len(key)
                self.take(":")
                result[key] = self.value(depth + 1)
                self.whitespace()
                if self.source.startswith("}", self.index):
                    break
                self.take(",")
            self.take("}")
            return result
        if self.source.startswith("[", self.index):
            self.take("[")
            result = []
            self.whitespace()
            while not self.source.startswith("]", self.index):
                result.append(self.value(depth + 1))
                self.whitespace()
                if self.source.startswith("]", self.index):
                    break
                self.take(",")
            self.take("]")
            return result
        match = re.match(
            r"(?:true|false|null|-?\d+(?:\.\d+)?)", self.source[self.index :]
        )
        if not match:
            raise ValueError("Invalid argument value")
        self.index += len(match[0])
        return json.loads(match[0])


def parse_call(source, allowed):
    if len(source) > 20000:
        raise ValueError("Model output too large")
    source = (
        source.strip()
        .removesuffix("<start_function_response>")
        .removesuffix("<end_of_turn>")
        .removesuffix("<eos>")
        .strip()
    )
    parser = CallParser(source)
    parser.take("<start_function_call>call:")
    match = re.match(r"[A-Za-z_][A-Za-z_0-9]*", source[parser.index :])
    if not match or match[0] not in allowed:
        raise ValueError("Unknown function")
    parser.index += len(match[0])
    arguments = parser.value()
    parser.take("<end_function_call>")
    parser.whitespace()
    if parser.index != len(source) or not isinstance(arguments, dict):
        raise ValueError("Expected exactly one function call")
    return {"name": match[0], "arguments": arguments}
