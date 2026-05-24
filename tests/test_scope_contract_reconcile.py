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

R_W10W11_007_PRODUCTION_SETTINGS_PAGES = [
    "apps/web/app/[locale]/(app)/(admin)/settings/email/page.tsx",
    "apps/web/app/[locale]/(app)/(admin)/settings/audit/page.tsx",
    "apps/web/app/[locale]/(app)/(admin)/settings/integrations/page.tsx",
    "apps/web/app/[locale]/(app)/(admin)/settings/modules/page.tsx",
]

R_W10W11_007_FORBIDDEN_LITERAL_DEFAULTS = {
    "Apex Foods": "tenant/org display name must come from context/loader or be explicitly unavailable",
    "no-reply@monopilot.apex.pl": "email sender identity must come from context/loader or be explicitly unavailable",
    "org-apex": "org id must come from context/loader, not a hardcoded sample tenant",
}

R_W10W11_007_FORBIDDEN_DEFAULT_PATTERNS = {
    re.compile(r"totalLast24h\s*:\s*1248"): "integration 24h sync KPI must not fall back to fabricated 1248 total",
    re.compile(r"activeSessionCount\s*:\s*[^\n,]*\?\?\s*28"): "modules active-session KPI must not fall back to fabricated 28 sessions",
}


def _settings_permission_literals(source: str) -> list[str]:
    return re.findall(r"'((?:settings)\.[a-z_][a-z_0-9]*\.[a-z_][a-z_0-9]*)'", source)


def test_r_w10w11_007_production_settings_pages_do_not_embed_fake_org_identity_or_kpis():
    """Production settings pages must fail closed instead of rendering Opus-audited fake tenant/KPI defaults."""
    failures: list[str] = []

    for relative_path in R_W10W11_007_PRODUCTION_SETTINGS_PAGES:
        source_path = REPO_ROOT / relative_path
        assert source_path.exists(), f"R-W10W11-007 coverage target is missing: {relative_path}"
        source = source_path.read_text()

        for literal, reason in R_W10W11_007_FORBIDDEN_LITERAL_DEFAULTS.items():
            if literal in source:
                failures.append(f"{relative_path}: hardcoded {literal!r}; {reason}")

        for pattern, reason in R_W10W11_007_FORBIDDEN_DEFAULT_PATTERNS.items():
            match = pattern.search(source)
            if match:
                failures.append(f"{relative_path}: hardcoded default {match.group(0)!r}; {reason}")

    assert failures == [], "\n".join(failures)


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
