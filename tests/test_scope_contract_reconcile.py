from pathlib import Path
import re


REPO_ROOT = Path(__file__).resolve().parents[1]
PERMISSIONS_ENUM = REPO_ROOT / "packages/rbac/src/permissions.enum.ts"
PERMISSIONS_VITEST = REPO_ROOT / "packages/rbac/src/__tests__/permissions.test.ts"

EXPECTED_SETTINGS_CORE_PERMISSIONS = [
    "settings.org.read",
    "settings.org.update",
    "settings.users.create",
    "settings.users.deactivate",
    "settings.users.invite",
    "settings.roles.assign",
    "settings.audit.read",
    "settings.impersonate.tenant",
]

FUTURE_T002_PERMISSION_MARKERS = [
    "ALL_SETTINGS_EXT_PERMISSIONS",
    "settings.schema.view",
    "settings.schema.edit",
    "settings.schema.promote_l1",
    "settings.rules.view",
    "settings.reference.view",
    "settings.reference.edit",
    "settings.reference.import",
    "settings.d365.view",
    "settings.d365.edit",
    "settings.d365.toggle",
    "settings.email.view",
    "settings.email.edit",
    "settings.onboarding.complete",
]


def _settings_permission_literals(source: str) -> list[str]:
    return re.findall(r"'((?:settings)\.[a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*)'", source)


def test_t001_settings_permission_contract_is_core_only_until_t002():
    enum_source = PERMISSIONS_ENUM.read_text()
    vitest_source = PERMISSIONS_VITEST.read_text()

    settings_literals = sorted(set(_settings_permission_literals(enum_source)))
    assert settings_literals == sorted(EXPECTED_SETTINGS_CORE_PERMISSIONS)

    for permission in EXPECTED_SETTINGS_CORE_PERMISSIONS:
        assert f"'{permission}'" in enum_source
        assert f"'{permission}'" in vitest_source
        assert re.fullmatch(r"settings\.[a-z_]+\.[a-z_]+", permission)

    assert re.search(
        r"export\s+const\s+ALL_SETTINGS_CORE_PERMISSIONS\s*=\s*\[[\s\S]*?\]\s*(?:satisfies|as)\s+readonly\s+Permission\[\]",
        enum_source,
    ), "ALL_SETTINGS_CORE_PERMISSIONS must be exported as a typed Permission[] literal"

    leaked_future_markers = [
        marker
        for marker in FUTURE_T002_PERMISSION_MARKERS
        if marker in enum_source or marker in vitest_source
    ]
    assert leaked_future_markers == [], (
        "T-001 must lock only the 8 settings core permissions; "
        "schema/rules/reference/d365/email/onboarding permissions belong to T-002"
    )
