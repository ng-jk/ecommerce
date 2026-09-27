"""Opt-in real-model API checks. Requires the isolated stack and actual FunctionGemma."""

import json
import uuid
from pathlib import Path

from tests.api.conftest import sanitize
from tests.api.test_assistant_matrix import Assistant


def test_real_model_requests_and_record_routing_quality():
    guest = Assistant("fashion")
    login = guest.invoke(
        "register",
        {
            "name": "Language Tester",
            "email": f"language-{uuid.uuid4()}@example.test",
            "password": "Password2026!",
            "password_confirmation": "Password2026!",
            "device_name": "language test",
        },
    )
    customer = Assistant("fashion", login["token"])
    admin_auth = guest.invoke(
        "login",
        {
            "email": "admin@fashion.demo",
            "password": "Portfolio2026!",
            "device_name": "language test",
        },
    )
    admin = Assistant("fashion", admin_auth["token"])
    catalog = guest.invoke("catalog")
    product_id = catalog["products"]["data"][0]["id"]
    cases = json.loads(Path("tests/inference/language-cases.json").read_text())
    reports = []
    actors = {"public": guest, "user": customer, "admin": admin}
    for case in cases:
        actor = actors[case["role"]]
        message = case["message"].replace("product 1", f"product {product_id}")
        request = {"message": message}
        response = actor.client.finish(
            *actor.client.submit("POST", "assistant", request, receipt=actor.receipt)
        )
        result = response["result"]
        selected = [tool["name"] for tool in result.get("available_actions", [])]
        reports.append(
            {
                **case,
                "request": request,
                "response": sanitize(response),
                "selected_correctly": selected == [case["expected"]],
            }
        )
        # Never confirm evaluation proposals: even an incorrect choice must not execute.
        assert not result.get("executed_action"), response
        assert response["http_status"] in {200, 422, 404}, response
    output = Path("test-results/assistant")
    output.mkdir(parents=True, exist_ok=True)
    summary = {
        "model": "google/functiongemma-270m-it",
        "metric": "free-form tool selection through the real assistant API with runtime schemas",
        "correct": sum(row["selected_correctly"] for row in reports),
        "total": len(reports),
        "cases": reports,
    }
    (output / "language-evaluation.json").write_text(
        json.dumps(summary, indent=2), encoding="utf-8"
    )
    print(
        f"Real model selected expected tools: {summary['correct']}/{summary['total']}"
    )
    # At least one complete natural-language read with confirmation must really work.
    draft = guest.turn({"message": "List all products"})
    assert draft["available_actions"][0]["name"] == "catalog", draft
    assert draft["status"] == "needs_confirmation"
    completed = guest.turn(
        {
            "conversation_id": draft["conversation_id"],
            "conversation_version": draft["conversation_version"],
            "confirm": True,
        }
    )
    assert completed["api_result"]["products"]["data"]
    (output / "live-confirmation.json").write_text(
        json.dumps(sanitize({"proposal": draft, "completion": completed}), indent=2),
        encoding="utf-8",
    )
