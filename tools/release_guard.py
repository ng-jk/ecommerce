"""Validate resolved remote Compose targets without printing secret configuration."""

import argparse
import json
import sys
from urllib.parse import urlsplit


def validate(config, database, database_user, worker_url, readiness_urls):
    services = config.get("services", {})
    api = urlsplit(worker_url)
    expected_url = api.scheme + "://" + api.netloc
    origins = {
        urlsplit(url).scheme + "://" + urlsplit(url).netloc for url in readiness_urls
    }
    for service in ["backend", "worker"]:
        env = services.get(service, {}).get("environment", {})
        if (
            env.get("DB_DATABASE") != database
            or env.get("DB_USERNAME") != database_user
            or env.get("APP_URL", "").rstrip("/") != expected_url
        ):
            raise ValueError(
                "Resolved commerce database, role or API origin does not match deployment configuration"
            )
    gateway = services.get("gateway", {}).get("environment", {})
    for name in ["FASHION_HOST", "ELECTRONICS_HOST", "ADMIN_HOST", "API_HOST"]:
        if "https://" + str(gateway.get(name, "")) not in origins:
            raise ValueError(
                "Resolved gateway domain is outside configured readiness origins"
            )
    if gateway["API_HOST"] != api.netloc:
        raise ValueError("Resolved gateway API host does not match worker probe")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("database")
    parser.add_argument("database_user")
    parser.add_argument("worker_url")
    parser.add_argument("readiness_urls", nargs="+")
    args = parser.parse_args()
    validate(
        json.load(sys.stdin),
        args.database,
        args.database_user,
        args.worker_url,
        args.readiness_urls,
    )


if __name__ == "__main__":
    main()
