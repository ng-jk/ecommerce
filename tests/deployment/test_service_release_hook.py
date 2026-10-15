"""A domain release must prepare secrets, back up, migrate and probe before promotion."""

import pytest

from tools import manual_release


def configuration():
    return {
        "directory": "/srv/shop3i-production",
        "env_file": "/srv/secrets/production.env",
        "project": "shop3i-production",
        "database": "commerce_production",
        "database_user": "commerce_production",
        "worker_readiness_url": "https://api.example.test/api/v1/shops/fashion/products",
        "readiness_urls": ["https://api.example.test/up"],
        "profiles": ["assistant", "services"],
    }


@pytest.mark.parametrize("sudo", [False, True])
def test_domains_are_prepared_after_build_and_verified_before_core_readiness(sudo):
    config = {**configuration(), "sudo_docker": sudo}
    script = manual_release.remote_script(config, "a" * 40, environment="production")
    build = script.index("--profile assistant build")
    prepare = script.index("tools.service_release prepare")
    core_backup = script.index("pg_dump")
    core_migration = script.index("artisan migrate --force")
    domains = script.index("tools.service_release deploy")
    public_probe = script.index("curl --fail")
    assert build < prepare < core_backup < core_migration < domains < public_probe
    assert "--environment production" in script
    assert "--runtime /srv/shop3i-production/service-runtime" in script
    assert "--env-file /srv/shop3i-production/service-runtime/compose.env" in script
    assert "-f compose.server.services.yaml" in script
    assert script.count("--release " + "a" * 40) == 2
    assert "stop -t 40 worker service-worker crm-worker helpdesk-worker" in script
    assert "lending-worker" in script
    assert "--sudo-docker" in script if sudo else "--sudo-docker" not in script
    assert "migrate:rollback" not in script


def test_domain_release_requires_known_explicit_environment():
    for environment in (None, "other"):
        with pytest.raises(ValueError, match="explicit release environment"):
            manual_release.remote_script(
                configuration(), "a" * 40, environment=environment
            )


def test_loaded_images_still_run_domain_provisioning_before_application_up():
    script = manual_release.remote_script(
        configuration(),
        "a" * 40,
        image_mode="load",
        bundle_sha256="b" * 64,
        environment="testing",
    )
    assert script.index("load -i") < script.index("tools.service_release prepare")
    assert "--environment testing" in script
    assert "--release " + "a" * 40 in script
