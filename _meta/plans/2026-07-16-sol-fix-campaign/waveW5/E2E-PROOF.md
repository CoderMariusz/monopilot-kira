# W5 verification proof (prod deploy 42c7da23, dpl 30aoxmcu2)
No new migrations (pure code wave). Build green + i18n parity 604. Layers: [CODE] Opus verification · [UNIT] vitest per-track · [GATE] tsc+build+suite.
| Finding | Proof |
|---|---|
| C081 FEFO explicit-LP | [CODE] manual consume requires explicit LP, no silent FEFO default. |
| C082 FEFO deviation esign | [CODE+UNIT] deviation requires reason+e-sign (signEvent, throw-rollback). |
| C083 over-consume override | [CODE] desktop approval/override path (scanner parity). |
| C084 catch-weight | [CODE] catchWeightKg preserved on output LP. |
| C086 low-yield reason log | [CODE] reason override → event log. |
| C092 output modal reset | [CODE] stale validation cleared. |
| C091 void-correction QA | [CODE] QA controls hidden when no LP. |
| C093 dependency tab | [CODE] linked WO identity shown. |
| C077 released WIP WO start | [CODE] release snapshot allows start. |
| C078 root WO error | [CODE] precise dependency error. |
| C079 downtime label+shift | [CODE] line label not UUID + shift. |
| C080 actual complete | [CODE] shown in overview. |
| C087 completed WO finance | [CODE] wo_events lateral join (NULL completed_at pilot included). |
| C089 dashboard today | [CODE] fresh postings counted. |
| C088 analytics/reporting KPI | [CODE] unified yield/waste source. |
| C090 dashboard exact kg | [CODE] no integer round; formatter in _lib/dashboard-format (dashboard-data stays server-only). |

## Summary
- 16 findings. Cursor-primary. tsc 0, build green, i18n parity 604, ZERO test regressions (suite 55 fail < 60 baseline; 3 in-module fails pre-existing verified vs W4-close). No new migrations.
- Opus fixes: analytics num-import conflict; dashboard 'use server' sync-export → moved formatter to _lib.
- FABLE regression #1 (post-W4) PASSED before W5.
