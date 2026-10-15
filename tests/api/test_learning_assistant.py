"""Real assistant discovery, confirmation, and isolated Learning execution."""

from test_learning_service import learning_workspace


def assistant(owner, action, data):
    preview_response, headers = owner.submit("POST", "assistant", {"action": action, "data": data})
    preview = owner.finish(preview_response, headers)
    assert preview["status"] == "succeeded", preview
    result = preview["result"]
    if result["status"] == "needs_confirmation":
        confirmation, _ = owner.submit("POST", "assistant", {
            "conversation_id": result["conversation_id"],
            "conversation_version": result["conversation_version"], "confirm": True,
        }, receipt=headers["X-Operation-Token"])
        confirmed = owner.finish(confirmation, headers)
        assert confirmed["status"] == "succeeded", confirmed
        result = confirmed["result"]
    assert result["status"] == "completed", result
    return result


def test_learning_assistant_discovers_and_executes_versioned_service_actions():
    owner, prefix, base, _ = learning_workspace()
    organization_id = int(prefix.rsplit("/", 1)[1])
    discovered_response, headers = owner.submit("POST", "assistant", {"discover": True})
    discovered = owner.finish(discovered_response, headers)
    assert discovered["status"] == "succeeded", discovered
    names = {item["name"] for item in discovered["result"]["available_actions"]}
    assert {"standaloneLearningCreateCourse", "standaloneLearningAuthorCourses", "standaloneLearningPublishCourse"} <= names
    created = assistant(owner, "standaloneLearningCreateCourse", {
        "organization_id": organization_id, "code": "ai-learning", "title": "AI Learning",
        "description": "Confirmed author action", "access_mode": "free",
    })
    assert created["executed_action"] == "learning.courses.create"
    course = created["api_result"]["course"]
    listed = assistant(owner, "standaloneLearningAuthorCourses", {"organization_id": organization_id, "page": 1, "per_page": 20})
    assert any(item["id"] == course["id"] for item in listed["api_result"]["data"])
    assert base.endswith("/learning")
