"""Reusable packaging fee and bulk discount logic; no company-name branching."""

import json
import sys

from sdk import finish, get, set_value

quote = json.loads(sys.argv[1])
settings = get("pricing")
if settings is None:
    settings = {
        "packaging_fee_minor": 50,
        "discount_threshold_minor": 10000,
        "discount_basis_points": 500,
    }
    set_value("pricing", settings)
subtotal = quote["subtotal_minor"]
discount = (
    subtotal * settings["discount_basis_points"] // 10000
    if subtotal >= settings["discount_threshold_minor"]
    else 0
)
finish(
    {
        "fee_minor": min(settings["packaging_fee_minor"], subtotal),
        "discount_minor": discount,
        "currency": quote["currency"],
    }
)
