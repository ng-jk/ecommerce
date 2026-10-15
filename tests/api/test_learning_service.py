"""Real platform → signed Learning inbox → isolated worker → durable receipt flows."""

import subprocess
import uuid

from test_platform_identity import identity, success


def grant_test_learning(organization_id):
    assert type(organization_id) is int and organization_id > 0
    command = ["docker", "exec", "commerce-tests-db-1", "psql", "-U", "commerce", "-d", "commerce_test", "-v", "ON_ERROR_STOP=1", "-Atc"]
    assert subprocess.run(command + ["SELECT current_database()"], check=True, capture_output=True, text=True).stdout.strip() == "commerce_test"
    evidence = "synthetic-learning-wire-" + uuid.uuid4().hex
    subprocess.run(command + [
        ("INSERT INTO application_entitlement_grants (organization_id,application_key,source,evidence_ref,starts_at,created_at,updated_at) "
        f"VALUES ({organization_id},'learning','operator','{evidence}',now()-interval '1 second',now(),now())")
    ], check=True, capture_output=True, text=True)


def learning_workspace():
    owner, _, _ = identity()
    organization = success(owner, "POST", "organizations", {
        "code": "learning-" + uuid.uuid4().hex, "name": "Learning integration"
    })["organization"]
    grant_test_learning(organization["id"])
    prefix = f"organizations/{organization['id']}"
    catalog = success(owner, "GET", prefix + "/application-catalog?application_key=learning&per_page=1")
    assert catalog["data"][0]["entitled"] is True
    assert catalog["data"][0]["available"] is True
    installed = success(owner, "POST", prefix + "/applications/learning/install", {"expected_version": 0})["application"]
    return owner, prefix, prefix + "/learning", installed


def learner(owner, prefix):
    client, user, _ = identity()
    invitation = success(owner, "POST", prefix + "/memberships", {"platform_user_id": user["id"], "role": "member"})["membership"]
    accepted = success(client, "POST", prefix + f"/memberships/{invitation['id']}/accept", {"expected_version": invitation["version"]})["membership"]
    assert accepted["status"] == "active"
    return client, user


def test_learning_author_and_learner_all_twenty_one_commands():
    owner, prefix, base, installed = learning_workspace()
    student, _ = learner(owner, prefix)
    outsider, _ = learner(owner, prefix)

    course = success(owner, "POST", base + "/courses", {
        "code": "native-course", "title": "Native course", "description": "Introduction", "access_mode": "free"
    })["course"]
    assert success(owner, "GET", base + "/author/courses?page=1&per_page=1")["data"][0]["id"] == course["id"]
    assert success(owner, "GET", base + f"/author/courses/{course['id']}?page=1&per_page=1")["course"]["status"] == "draft"
    updated = success(owner, "PUT", base + f"/courses/{course['id']}", {
        "expected_version": course["version"], "title": "Native course updated", "description": "Introduction", "access_mode": "free"
    })["course"]
    assert updated["version"] == course["version"] + 1
    lesson = success(owner, "POST", base + "/lessons", {
        "course_id": course["id"], "expected_version": updated["version"], "title": "Lesson one", "content": "Read this", "position": 1
    })["lesson"]
    assert success(owner, "GET", base + f"/author/lessons/{lesson['id']}")["lesson"]["content"] == "Read this"
    changed_lesson = success(owner, "PUT", base + f"/lessons/{lesson['id']}", {
        "expected_version": lesson["version"], "title": "Lesson revised", "content": "Read this again", "position": 1
    })["lesson"]
    assert changed_lesson["version"] == lesson["version"] + 1

    current = success(owner, "GET", base + f"/author/courses/{course['id']}")["course"]
    assessment = success(owner, "POST", base + "/assessments", {
        "course_id": course["id"], "expected_version": current["version"], "title": "Quiz", "questions": [
            {"prompt": "Which answer?", "options": ["A", "B"], "correct_index": 1}
        ], "pass_score": 100, "attempt_limit": 2
    })["assessment"]
    answer_key = success(owner, "GET", base + f"/author/assessments/{assessment['id']}")["assessment"]
    assert answer_key["questions"][0]["correct_index"] == 1
    changed_assessment = success(owner, "PUT", base + f"/assessments/{assessment['id']}", {
        "expected_version": assessment["version"], "title": "Quiz revised", "questions": [
            {"prompt": "Which answer?", "options": ["A", "B"], "correct_index": 1}
        ], "pass_score": 100, "attempt_limit": 2
    })["assessment"]
    assert changed_assessment["version"] == assessment["version"] + 1
    before_publish = success(owner, "GET", base + f"/author/courses/{course['id']}")["course"]
    published = success(owner, "POST", base + f"/courses/{course['id']}/publish", {"expected_version": before_publish["version"]})["course"]
    assert published["status"] == "published"
    immutable = owner.call("PUT", base + f"/lessons/{lesson['id']}", {
        "expected_version": changed_lesson["version"], "title": "Late edit", "content": "Must fail", "position": 1
    })
    assert immutable["http_status"] == 409

    assert success(student, "GET", base + "/courses?page=1&per_page=1")["data"][0]["id"] == course["id"]
    invisible = student.call("GET", base + f"/courses/{course['id']}")
    assert invisible["http_status"] in {403, 404}
    enrollment = success(student, "POST", base + "/enrollments", {"course_id": course["id"]})["enrollment"]
    assert success(student, "GET", base + "/enrollments?page=1&per_page=1")["data"][0]["id"] == enrollment["id"]
    assert success(outsider, "GET", base + "/enrollments")["meta"]["total"] == 0
    detail = success(student, "GET", base + f"/courses/{course['id']}?page=1&per_page=1")
    assert detail["lessons"]["data"][0]["id"] == lesson["id"]
    hidden = success(student, "GET", base + f"/assessments/{assessment['id']}")["assessment"]
    assert "correct_index" not in hidden["questions"][0]
    read = success(student, "GET", base + f"/lessons/{lesson['id']}")
    assert read["progress"]["lessons_delivered"] == 1
    assert read["progress"]["delivery_is_not_proof_of_study"] is True
    assert success(student, "GET", base + f"/enrollments/{enrollment['id']}")["progress"]["lessons_delivered"] == 1
    denied = outsider.call("GET", base + f"/enrollments/{enrollment['id']}")
    assert denied["http_status"] == 404
    result = success(student, "POST", base + f"/assessments/{assessment['id']}/attempts", {"answers": [1]})
    assert result["attempt"]["score"] == 100 and result["enrollment"]["status"] == "complete"
    assert success(student, "GET", base + "/attempts?page=1&per_page=1")["data"][0]["id"] == result["attempt"]["id"]
    archived = success(owner, "POST", base + f"/courses/{course['id']}/archive", {"expected_version": published["version"]})["course"]
    assert archived["status"] == "archived"
    denied_after_archive = student.call("GET", base + f"/lessons/{lesson['id']}")
    assert denied_after_archive["http_status"] == 404
    disabled = success(owner, "POST", prefix + "/applications/learning/disable", {"expected_version": installed["version"]})["application"]
    assert owner.call("GET", base + "/author/courses")["http_status"] == 403
    success(owner, "POST", prefix + "/applications/learning/reenable", {"expected_version": disabled["version"]})


def test_learning_paid_course_requires_verified_grant_and_rejects_unknown_input():
    owner, prefix, base, _ = learning_workspace()
    student, _ = learner(owner, prefix)
    course = success(owner, "POST", base + "/courses", {
        "code": "paid-native", "title": "Paid course", "description": "No public paid claim", "access_mode": "paid"
    })["course"]
    lesson = success(owner, "POST", base + "/lessons", {
        "course_id": course["id"], "expected_version": course["version"], "title": "Lesson", "content": "Content", "position": 1
    })["lesson"]
    current = success(owner, "GET", base + f"/author/courses/{course['id']}")["course"]
    success(owner, "POST", base + "/assessments", {
        "course_id": course["id"], "expected_version": current["version"], "title": "Quiz",
        "questions": [{"prompt": "Choose", "options": ["A", "B"], "correct_index": 0}], "pass_score": 50, "attempt_limit": 1
    })
    current = success(owner, "GET", base + f"/author/courses/{course['id']}")["course"]
    success(owner, "POST", base + f"/courses/{course['id']}/publish", {"expected_version": current["version"]})
    assert student.call("POST", base + "/enrollments", {"course_id": course["id"]})["http_status"] == 403
    assert student.call("GET", base + f"/lessons/{lesson['id']}")["http_status"] in {403, 404}
    invalid = owner.call("POST", base + "/courses", {
        "code": "extra-field", "title": "X", "description": "Y", "access_mode": "free", "organization_id": 999
    })
    assert invalid["http_status"] == 422 and "organization_id" in invalid["result"]["validation_error"]
