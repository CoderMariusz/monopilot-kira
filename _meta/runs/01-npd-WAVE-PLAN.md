# 01-npd — Intra-module Wave Plan

Derived from task `dependencies` (STATUS.md) — layered by dependency depth. Within a
wave, tasks are mutually independent and fan out (concurrency 12). Migrate+test gate
serialized on the single local Postgres. T-071 & T-076 (Sensory) are **deferred** —
owned by 03-technical (cross-module, not built here).

## Wave A — Schema foundation (T1-schema, depend only on T-001 or nothing)
- **A0 (serialization point, alone):** T-001 (product table + fa view, mig 075)
- **A1 (fan-out, each owns a pre-allocated mig#):** T-002, T-003, T-004, T-005, T-006,
  T-030, T-036, T-041, T-049, T-054, T-069, T-070, T-080, T-083
- Plus T-092 (Shared BOM SSOT schema — no existing file).

## Wave B — Schema layer-2 + seeds (depend on Wave-A tables)
T-007, T-015, T-016, T-032, T-037, T-050, T-055, T-056, T-063, T-077, T-101, T-093.
(T-056 after T-055; T-016 after T-003; T-037 after T-036; serialize those edges.)

## Wave C — Server Actions (T2-api) + compute cores
T-008, T-009, T-010, T-011, T-012, T-013, T-014, T-017, T-018, T-028, T-029, T-031,
T-033, T-038, T-039, T-042, T-043, T-044, T-045, T-047, T-048, T-051, T-057, T-058,
T-064, T-065, T-072, T-073, T-078, T-081, T-084, T-085, T-089, T-090, T-095, T-096,
T-097, T-099, T-100.
(HARD/Opus cores here: T-065 formulation compute, T-073 costing waterfall, T-038
allergen cascade, T-042 exceljs builder, T-089 GDPR erasure, T-093 BOM writer.)

## Wave D — UI (T3-ui, Opus impl-ui + parity)
T-019, T-021, T-022, T-023, T-024, T-026, T-027, T-034, T-035, T-040, T-052, T-059,
T-066, T-074, T-075, T-079, T-082, T-086, T-102, T-103, T-104, T-107, T-108, T-109,
T-110, T-113, T-114, T-115, T-116, T-119, T-120, T-123, T-124, T-125, T-128, T-129,
T-132, T-133, T-136, T-137.

## Wave E — Wiring + Parity + E2E (T4 + ROOT groups)
T-020, T-025, T-046, T-053, T-060, T-061, T-062, T-067, T-068, T-087, T-088, T-091,
T-094, T-098, T-105, T-106, T-111, T-112, T-117, T-118, T-121, T-122, T-126, T-127,
T-130, T-131, T-134, T-135, T-138, T-139.

## Deferred (cross-module, NOT built here)
T-071 (Sensory schema), T-076 (Sensory UI) → 03-technical.
