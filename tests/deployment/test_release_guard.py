import copy
import io
import json
import runpy

import pytest

from tools import release_guard as guard

URL = "https://api.example.test/api/v1/shops/fashion/products"
URLS = [
    "https://api.example.test/up",
    "https://fashion.example.test/",
    "https://electronics.example.test/",
    "https://admin.example.test/",
]
CONFIG = {
    "services": {
        "backend": {
            "environment": {
                "DB_DATABASE": "commerce_testing",
                "DB_USERNAME": "commerce_testing",
                "APP_URL": "https://api.example.test",
            }
        },
        "worker": {
            "environment": {
                "DB_DATABASE": "commerce_testing",
                "DB_USERNAME": "commerce_testing",
                "APP_URL": "https://api.example.test",
            }
        },
        "gateway": {
            "environment": {
                "FASHION_HOST": "fashion.example.test",
                "ELECTRONICS_HOST": "electronics.example.test",
                "ADMIN_HOST": "admin.example.test",
                "API_HOST": "api.example.test",
            }
        },
    }
}


def test_matching_resolved_config_is_accepted():
    guard.validate(CONFIG, "commerce_testing", "commerce_testing", URL, URLS)


@pytest.mark.parametrize(
    "service,field,bad",
    [
        ("backend", "DB_DATABASE", "commerce_production"),
        ("worker", "DB_USERNAME", "supabase_admin"),
        ("backend", "APP_URL", "https://production.example.test"),
        ("gateway", "ADMIN_HOST", "production.example.test"),
        ("gateway", "API_HOST", "fashion.example.test"),
    ],
)
def test_remote_environment_cannot_escape_expected_deployment(service, field, bad):
    config = copy.deepcopy(CONFIG)
    config["services"][service]["environment"][field] = bad
    with pytest.raises(ValueError):
        guard.validate(config, "commerce_testing", "commerce_testing", URL, URLS)


def test_cli_reads_secrets_from_stdin_without_printing(monkeypatch, capsys):
    monkeypatch.setattr(
        "sys.argv",
        ["release_guard.py", "commerce_testing", "commerce_testing", URL, *URLS],
    )
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(CONFIG)))
    guard.main()
    assert capsys.readouterr().out == ""
    monkeypatch.setattr("sys.argv", ["release_guard.py", "--help"])
    with pytest.raises(SystemExit) as result:
        runpy.run_path(guard.__file__, run_name="__main__")
    assert result.value.code == 0
