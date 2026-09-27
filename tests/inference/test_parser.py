import pytest
from call_parser import parse_call


def test_parser_preserves_strings_and_nested_json_without_execution():
    result = parse_call(
        '<start_function_call>call:cart{items:[{id:1,active:true},{id:2,active:false}],note:<escape>a,{b}: "quoted"<escape>,price:1.5,nothing:null}<end_function_call><end_of_turn>',
        {"cart"},
    )
    assert result == {
        "name": "cart",
        "arguments": {
            "items": [{"id": 1, "active": True}, {"id": 2, "active": False}],
            "note": 'a,{b}: "quoted"',
            "price": 1.5,
            "nothing": None,
        },
    }
    assert parse_call(
        " <start_function_call>call:cart{items:[],empty:{}}<end_function_call><eos>",
        {"cart"},
    )["arguments"] == {"items": [], "empty": {}}


@pytest.mark.parametrize(
    "source",
    [
        "x" * 20001,
        "plain text",
        "<start_function_call>call:unknown{}<end_function_call>",
        "<start_function_call>call:cart{a:1,a:2}<end_function_call>",
        "<start_function_call>call:cart{a:<escape>unfinished}<end_function_call>",
        "<start_function_call>call:cart{!a:1}<end_function_call>",
        "<start_function_call>call:cart{a:execute()}<end_function_call>",
        "<start_function_call>call:cart[]<end_function_call>",
        "<start_function_call>call:cart{}<end_function_call>extra",
        "<start_function_call>call:cart{a:1 b:2}<end_function_call>",
        "<start_function_call>call:cart{a:[1,2]}<end_function_call><start_function_call>call:cart{}<end_function_call>",
        "<start_function_call>call:cart{a:"
        + "[" * 14
        + "1"
        + "]" * 14
        + "}<end_function_call>",
    ],
)
def test_parser_rejects_unsafe_malformed_or_multiple_calls(source):
    with pytest.raises(ValueError):
        parse_call(source, {"cart"})


def test_model_response_stop_token_is_accepted_but_response_content_is_not():
    output = "<start_function_call>call:catalog{}<end_function_call><start_function_response>"
    assert parse_call(output, {"catalog"}) == {"name": "catalog", "arguments": {}}
    with pytest.raises(ValueError):
        parse_call(output + "invented result", {"catalog"})


def test_object_fields_allow_spaces_after_commas():
    assert parse_call(
        "<start_function_call>call:update{stock:2, active:true}<end_function_call>",
        {"update"},
    ) == {"name": "update", "arguments": {"stock": 2, "active": True}}
