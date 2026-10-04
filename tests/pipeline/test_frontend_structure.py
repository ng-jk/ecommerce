from tools.pipeline.frontend_structure import inspect_structure


def test_complete_modules_and_infrastructure():
    paths = [
        "README.md",
        "frontend/screens.json",
        "packages/api-client/generated/a.ts",
        "packages/api-client/schema.d.ts",
        "packages/storefront/index.tsx",
        "frontend/admin/src/app/index.tsx",
    ]
    for kind, name, layers in [
        ("services", "cart", ["data", "logic"]),
        ("screens", "cart_screen", ["data", "logic", "interface"]),
    ]:
        root = f"packages/storefront/{kind}/{name}"
        paths.extend(
            [f"{root}/index.ts", *[f"{root}/{layer}/.gitkeep" for layer in layers]]
        )
    assert inspect_structure(paths) == []


def test_structure_rejects_missing_layers_legacy_source_and_bad_screen_names():
    results = inspect_structure(
        [
            "frontend/admin/src/domain/old.ts",
            "packages/x/screens/cart/view.tsx",
            "packages/x/services/cart/index.ts",
        ]
    )
    assert any("authored source" in item for item in results)
    assert any("_screen" in item for item in results)
    assert any("outside module" in item for item in results)
    assert any("missing data, logic" in item for item in results)
