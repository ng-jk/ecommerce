"""Bounded real-worker contention; no claim of exhaustive/deterministic schedules.

Two additional PHP worker processes compete with the normal test-stack worker.
HTTP producers start at the same barrier, but OS/SQL scheduling is uncontrolled.
"""

import subprocess
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

from tests.api.test_multi_payments import _admin
from tests.api.test_plugins import account, result
from tests.api.test_worker_api import Client


def promote_synthetic_admin(user_id):
    """Change only the newly registered numeric fixture in the isolated test DB."""
    assert type(user_id) is int and user_id > 0
    command = [
        "docker",
        "exec",
        "commerce-tests-db-1",
        "psql",
        "-U",
        "commerce",
        "-d",
        "commerce_test",
        "-v",
        "ON_ERROR_STOP=1",
        "-Atc",
    ]
    observed = subprocess.run(
        command + ["SELECT current_database()"],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert observed.stdout.strip() == "commerce_test"
    promoted = subprocess.run(
        command
        + [
            (
                "UPDATE users SET role = 'admin', updated_at = CURRENT_TIMESTAMP "
                f"WHERE id = {user_id} AND role = 'customer' "
                "AND current_database() = 'commerce_test' "
                "AND name = 'Plugin isolation customer' "
                "AND shop_id = (SELECT id FROM shops WHERE slug = 'fashion') "
                "RETURNING id"
            )
        ],
        check=True,
        capture_output=True,
        text=True,
        timeout=30,
    )
    assert promoted.stdout.splitlines() == [str(user_id), "UPDATE 1"]


def test_two_admin_credits_and_recipient_reads_preserve_all_points(clean_plugin_data):
    first = Client("fashion", _admin("fashion"))
    second, _, second_id = account("fashion")
    promote_synthetic_admin(second_id)
    recipient, _, recipient_id = account("fashion")
    other_admin = Client("electronics", _admin("electronics"))
    other_recipient, _, _ = account("electronics")
    setup = {
        "plugin_id": "loyalty",
        "enabled": True,
        "customer_enabled": True,
        "max_credit": 50,
    }
    result(first, "POST", "admin/plugins", setup)
    other_plugin = result(other_admin, "POST", "admin/plugins", setup)["plugin"]
    assert result(recipient, "GET", "plugins/loyalty/balance")["balance"]["points"] == 0
    assert (
        result(other_recipient, "GET", "plugins/loyalty/balance")["balance"]["points"]
        == 0
    )

    barrier = Barrier(5)
    rounds = 5

    def produce(client, points):
        barrier.wait(timeout=30)
        accepted = []
        for index in range(rounds):
            if points is None:
                response, headers = client.submit("GET", "plugins/loyalty/balance")
            else:
                response, headers = client.submit(
                    "POST",
                    "admin/plugins/loyalty/credit",
                    {
                        "user_id": recipient_id,
                        "points": points,
                        "reason": f"Multi-worker credit {points}/{index}",
                    },
                )
            assert response.status_code == 202, response.text
            accepted.append((response, headers))
        terminals = [client.finish(response, headers) for response, headers in accepted]
        assert all(item["status"] == "succeeded" for item in terminals), terminals
        assert all(item["http_status"] == 200 for item in terminals), terminals
        return terminals

    def supplement_worker():
        barrier.wait(timeout=30)
        for _ in range(rounds * 3):
            subprocess.run(
                [
                    "docker",
                    "exec",
                    "commerce-tests-worker-1",
                    "php",
                    "artisan",
                    "commerce:work",
                    "--once",
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=45,
            )

    with ThreadPoolExecutor(max_workers=5) as pool:
        producers = [
            pool.submit(produce, first, 1),
            pool.submit(produce, second, 2),
            pool.submit(produce, recipient, None),
        ]
        workers = [pool.submit(supplement_worker) for _ in range(2)]
        terminals = [entry for future in producers for entry in future.result()]
        for future in workers:
            future.result()

    assert len({item["operation_id"] for item in terminals}) == rounds * 3
    expected = rounds * 3
    assert (
        result(recipient, "GET", "plugins/loyalty/balance")["balance"]["points"]
        == expected
    )
    # Every read must see a committed snapshot within the total credit bound.
    assert all(
        0 <= item["result"]["balance"]["points"] <= expected for item in terminals
    )
    assert (
        result(other_recipient, "GET", "plugins/loyalty/balance")["balance"]["points"]
        == 0
    )
    assert (
        result(other_admin, "GET", f"admin/plugins/{other_plugin['id']}")["plugin"]
        == other_plugin
    )
