import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { executeRule, RuleExecutionMode } from '../executor';
import * as cascadeHandlerModule from '../cascade-handler';
import type { Pool } from 'pg';

/**
 * Test suite for ADR-029 DSL executor stub
 * Tests rule_type discrimination, dry-run mode, cascading/gate/conditional/workflow rule types
 * Exercises the §7 allergen_changeover_gate example end-to-end
 */

describe('Rule Engine Executor (ADR-029)', () => {
  /**
   * AC1: Given the §7 allergen_changeover_gate JSON rule, when executor runs against a
   * wo.status_change.READY event with prev_wo.allergens overlapping next_wo.allergen_free_claim,
   * then fired=true and the actions list contains require: cleaning_validation_checklist_signed
   * and require: atp_swab_result max_rlu=10
   */
  describe('AC1: allergen_changeover_gate rule execution', () => {
    it('should evaluate allergen_changeover_gate rule and fire when allergen overlap detected', () => {
      const rule = {
        rule_id: 'allergen_changeover_gate',
        rule_type: 'gate' as const,
        triggers: ['wo.status_change.READY'],
        conditions: [
          {
            field: 'prev_wo.allergens',
            operator: 'CONTAINS_ANY',
            value: 'next_wo.allergen_free_claim',
          },
        ],
        actions: [
          { require: 'cleaning_validation_checklist_signed' },
          { require: 'atp_swab_result', max_rlu: 10 },
          { require: 'sign_off', count: 2, roles: ['quality_lead', 'production_lead'] },
        ],
        on_fail: { block_transition: true, notify: ['hygiene_lead'] },
      };

      const event = {
        event_type: 'wo.status_change.READY',
        prev_wo: {
          allergens: ['milk', 'peanut', 'soy'],
        },
        next_wo: {
          allergen_free_claim: ['milk', 'gluten'],
        },
      };

      const result = executeRule(rule, event, RuleExecutionMode.NORMAL);

      expect(result.fired).toBe(true);
      expect(result.actions).toBeDefined();
      expect(result.actions.length).toBeGreaterThanOrEqual(2);

      const cleaningAction = result.actions.find(
        (a) => a.require === 'cleaning_validation_checklist_signed',
      );
      expect(cleaningAction).toBeDefined();

      const atpAction = result.actions.find((a) => a.require === 'atp_swab_result');
      expect(atpAction).toBeDefined();
      expect(atpAction?.max_rlu).toBe(10);
    });

    it('should not fire allergen_changeover_gate when allergens do not overlap', () => {
      const rule = {
        rule_id: 'allergen_changeover_gate',
        rule_type: 'gate' as const,
        triggers: ['wo.status_change.READY'],
        conditions: [
          {
            field: 'prev_wo.allergens',
            operator: 'CONTAINS_ANY',
            value: 'next_wo.allergen_free_claim',
          },
        ],
        actions: [
          { require: 'cleaning_validation_checklist_signed' },
          { require: 'atp_swab_result', max_rlu: 10 },
        ],
        on_fail: { block_transition: true, notify: ['hygiene_lead'] },
      };

      const event = {
        event_type: 'wo.status_change.READY',
        prev_wo: {
          allergens: ['peanut', 'soy'],
        },
        next_wo: {
          allergen_free_claim: ['milk', 'gluten'],
        },
      };

      const result = executeRule(rule, event, RuleExecutionMode.NORMAL);

      expect(result.fired).toBe(false);
    });
  });

  /**
   * AC2: Given dry-run mode, when the executor runs against the same rule,
   * then no rows are inserted into outbox_events or any other table
   */
  describe('AC2: dry-run mode is side-effect-free', () => {
    it('should execute rule in dry-run mode without side effects', () => {
      const rule = {
        rule_id: 'allergen_changeover_gate',
        rule_type: 'gate' as const,
        triggers: ['wo.status_change.READY'],
        conditions: [
          {
            field: 'prev_wo.allergens',
            operator: 'CONTAINS_ANY',
            value: 'next_wo.allergen_free_claim',
          },
        ],
        actions: [
          { require: 'cleaning_validation_checklist_signed' },
          { require: 'atp_swab_result', max_rlu: 10 },
        ],
        on_fail: { block_transition: true, notify: ['hygiene_lead'] },
      };

      const event = {
        event_type: 'wo.status_change.READY',
        prev_wo: {
          allergens: ['milk', 'peanut', 'soy'],
        },
        next_wo: {
          allergen_free_claim: ['milk', 'gluten'],
        },
      };

      const result = executeRule(rule, event, RuleExecutionMode.DRY_RUN);

      // Result should still contain the evaluation
      expect(result.fired).toBe(true);
      expect(result.actions).toBeDefined();

      // But the result must indicate it's a dry-run (no side effects occurred)
      expect(result.dry_run).toBe(true);
      // Implementation contract: no outbox_events or DB mutations in dry-run
    });

    it('should return dry_run=true flag in result when mode is DRY_RUN', () => {
      const rule = {
        rule_id: 'test_rule',
        rule_type: 'cascading' as const,
        triggers: ['brief.import'],
        actions: [{ cascade: 'allergens', from: 'core', to: ['technical', 'packaging'] }],
      };

      const event = { event_type: 'brief.import', source_dept: 'core' };

      const normalResult = executeRule(rule, event, RuleExecutionMode.NORMAL);
      const dryRunResult = executeRule(rule, event, RuleExecutionMode.DRY_RUN);

      expect(normalResult.dry_run).toBeUndefined();
      expect(dryRunResult.dry_run).toBe(true);
    });
  });

  /**
   * AC3: Given rule_type='unknown', when executor is invoked,
   * then it throws an explicit error (not silent pass)
   */
  describe('AC3: rule_type discrimination and error handling', () => {
    it('should throw explicit error for unknown rule_type', () => {
      const rule = {
        rule_id: 'bad_rule',
        rule_type: 'unknown_type' as any,
        triggers: ['some.event'],
        actions: [],
      };

      const event = { event_type: 'some.event' };

      expect(() => {
        executeRule(rule, event, RuleExecutionMode.NORMAL);
      }).toThrow();

      // Error message must mention the unknown rule_type
      expect(() => {
        executeRule(rule, event, RuleExecutionMode.NORMAL);
      }).toThrow(/unknown|unsupported|rule_type/i);
    });

    it('should support all four rule_type values: cascading, conditional_required, gate, workflow', () => {
      const ruleTypes = ['cascading', 'conditional_required', 'gate', 'workflow'];
      const event = { event_type: 'test.event' };

      for (const ruleType of ruleTypes) {
        const rule = {
          rule_id: `test_${ruleType}`,
          rule_type: ruleType as any,
          triggers: ['test.event'],
          actions: [],
        };

        // Should not throw for valid rule_types
        expect(() => {
          executeRule(rule, event, RuleExecutionMode.NORMAL);
        }).not.toThrow();
      }
    });
  });

  /**
   * Rule type: cascading
   * Auto-fill downstream fields from upstream dept
   */
  describe('Cascading rule type', () => {
    it('should execute cascading rule and cascade allergens from core to downstream depts', () => {
      const rule = {
        rule_id: 'allergen_cascade_core',
        rule_type: 'cascading' as const,
        triggers: ['brief.import'],
        actions: [
          {
            cascade: 'allergens',
            from_dept: 'core',
            to_depts: ['technical', 'packaging', 'mrp', 'planning', 'production', 'price'],
          },
        ],
      };

      const event = {
        event_type: 'brief.import',
        source_dept: 'core',
        allergens: ['milk', 'peanut'],
      };

      const result = executeRule(rule, event, RuleExecutionMode.NORMAL);

      expect(result.fired).toBe(true);
      expect(result.actions).toBeDefined();
      expect(result.actions.length).toBeGreaterThan(0);
    });
  });

  /**
   * Rule type: conditional_required
   * Field requirements depend on other field values
   */
  describe('Conditional_required rule type', () => {
    it('should execute conditional_required rule requiring ATP swab when allergen-free claim present', () => {
      const rule = {
        rule_id: 'allergen_free_requires_atp',
        rule_type: 'conditional_required' as const,
        triggers: ['product.definition'],
        conditions: [
          {
            field: 'allergen_free_claim',
            operator: 'IS_SET',
            value: true,
          },
        ],
        actions: [
          {
            require: 'atp_swab_result',
            when_field: 'allergen_free_claim',
            error_message: 'ATP swab result required for allergen-free claims',
          },
        ],
      };

      const event = {
        event_type: 'product.definition',
        allergen_free_claim: true,
      };

      const result = executeRule(rule, event, RuleExecutionMode.NORMAL);

      expect(result.fired).toBe(true);
      expect(result.actions).toBeDefined();
    });

    it('should not fire conditional_required when condition not met', () => {
      const rule = {
        rule_id: 'allergen_free_requires_atp',
        rule_type: 'conditional_required' as const,
        triggers: ['product.definition'],
        conditions: [
          {
            field: 'allergen_free_claim',
            operator: 'IS_SET',
            value: true,
          },
        ],
        actions: [{ require: 'atp_swab_result' }],
      };

      const event = {
        event_type: 'product.definition',
        allergen_free_claim: false,
      };

      const result = executeRule(rule, event, RuleExecutionMode.NORMAL);

      expect(result.fired).toBe(false);
    });
  });

  /**
   * Rule type: gate
   * Block transitions before conditions are met
   */
  describe('Gate rule type', () => {
    it('should execute gate rule and block transition on failure', () => {
      const rule = {
        rule_id: 'price_blocking_gate',
        rule_type: 'gate' as const,
        triggers: ['price.release'],
        conditions: [
          {
            field: 'core.status',
            operator: 'EQUALS',
            value: 'APPROVED',
          },
          {
            field: 'production.status',
            operator: 'EQUALS',
            value: 'READY',
          },
        ],
        actions: [{ block_transition: false }],
        on_fail: { block_transition: true },
      };

      const event = {
        event_type: 'price.release',
        core: { status: 'APPROVED' },
        production: { status: 'READY' },
      };

      const result = executeRule(rule, event, RuleExecutionMode.NORMAL);

      expect(result.fired).toBe(true);
      expect(result.on_fail).toBeDefined();
    });
  });

  /**
   * Rule type: workflow
   * State machines defined as metadata
   */
  describe('Workflow rule type', () => {
    it('should execute workflow rule and define state transitions', () => {
      const rule = {
        rule_id: 'wo_state_machine',
        rule_type: 'workflow' as const,
        triggers: ['wo.created'],
        actions: [
          {
            transition: 'DRAFT',
            next_states: ['IN_PROGRESS', 'CANCELLED'],
            required_fields: ['part_number', 'qty'],
          },
        ],
      };

      const event = {
        event_type: 'wo.created',
        state: 'DRAFT',
      };

      const result = executeRule(rule, event, RuleExecutionMode.NORMAL);

      expect(result.fired).toBe(true);
      expect(result.actions).toBeDefined();
    });
  });

  /**
   * Core executor behavior tests
   */
  describe('Executor core behavior', () => {
    it('should return an ExecutorResult with fired and actions fields', () => {
      const rule = {
        rule_id: 'simple_rule',
        rule_type: 'cascading' as const,
        triggers: ['test.event'],
        actions: [],
      };

      const event = { event_type: 'test.event' };

      const result = executeRule(rule, event, RuleExecutionMode.NORMAL);

      expect(result).toHaveProperty('fired');
      expect(result).toHaveProperty('actions');
      expect(Array.isArray(result.actions)).toBe(true);
    });

    it('should include on_fail in result when rule defines it', () => {
      const rule = {
        rule_id: 'rule_with_on_fail',
        rule_type: 'gate' as const,
        triggers: ['test.event'],
        conditions: [{ field: 'status', operator: 'EQUALS', value: 'ACTIVE' }],
        actions: [],
        on_fail: { block_transition: true, notify: ['admin'] },
      };

      const event = { event_type: 'test.event', status: 'INACTIVE' };

      const result = executeRule(rule, event, RuleExecutionMode.NORMAL);

      expect(result.on_fail).toBeDefined();
    });

    it('should verify rule trigger matches event type before evaluation', () => {
      const rule = {
        rule_id: 'triggered_rule',
        rule_type: 'cascading' as const,
        triggers: ['wo.status_change.READY'],
        actions: [],
      };

      const wrongEvent = { event_type: 'wo.status_change.DRAFT' };
      const rightEvent = { event_type: 'wo.status_change.READY' };

      const wrongResult = executeRule(rule, wrongEvent, RuleExecutionMode.NORMAL);
      const rightResult = executeRule(rule, rightEvent, RuleExecutionMode.NORMAL);

      // Rule should not fire if trigger doesn't match event type
      expect(wrongResult.fired).toBe(false);
      // Rule should evaluate if trigger matches
      expect(rightResult.fired).toBeDefined();
    });
  });

  /**
   * FT-040 — cascading rule_type dispatches to runCascade when (pool, orgId)
   * are supplied and conditions hold. The dispatch is fire-and-forget so the
   * executor stays synchronous; tests assert the spy call.
   */
  describe('FT-040: cascading rule dispatches runCascade', () => {
    const fakePool = {} as unknown as Pool;
    let runCascadeSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      runCascadeSpy = vi
        .spyOn(cascadeHandlerModule, 'runCascade')
        .mockResolvedValue(undefined);
    });

    afterEach(() => {
      runCascadeSpy.mockRestore();
    });

    it('cascading: dispatches runCascade when pool + orgId provided and conditions met', () => {
      const rule = {
        rule_id: 'mfg_op_to_intermediate_code',
        rule_type: 'cascading' as const,
        triggers: ['fg.manufacturing_operation_changed'],
        actions: [{ cascade: 'intermediate_code' }],
      };

      const event = {
        event_type: 'fg.manufacturing_operation_changed',
        fg_id: '00000000-0000-0000-0000-0000000000aa',
        operation_field_index: 1,
        operation_name: 'Mix',
      };

      executeRule(rule, event, RuleExecutionMode.NORMAL, {
        pool: fakePool,
        orgId: '00000000-0000-0000-0000-000000000002',
      });

      expect(runCascadeSpy).toHaveBeenCalledTimes(1);
      const args = runCascadeSpy.mock.calls[0]?.[0] as
        | cascadeHandlerModule.RunCascadeArgs
        | undefined;
      expect(args).toBeDefined();
      expect(args!.orgId).toBe('00000000-0000-0000-0000-000000000002');
      expect(args!.fgId).toBe('00000000-0000-0000-0000-0000000000aa');
      expect(args!.operationFieldIndex).toBe(1);
      expect(args!.operationName).toBe('Mix');
      expect(args!.dryRun).toBe(false);
    });

    it('cascading: skips runCascade in DRY_RUN mode even when pool provided', () => {
      const rule = {
        rule_id: 'mfg_op_to_intermediate_code',
        rule_type: 'cascading' as const,
        triggers: ['fg.manufacturing_operation_changed'],
        actions: [{ cascade: 'intermediate_code' }],
      };

      const event = {
        event_type: 'fg.manufacturing_operation_changed',
        fg_id: '00000000-0000-0000-0000-0000000000aa',
        operation_field_index: 1,
        operation_name: 'Mix',
      };

      const result = executeRule(rule, event, RuleExecutionMode.DRY_RUN, {
        pool: fakePool,
        orgId: '00000000-0000-0000-0000-000000000002',
      });

      expect(result.fired).toBe(true);
      expect(result.dry_run).toBe(true);
      expect(runCascadeSpy).not.toHaveBeenCalled();
    });

    it('cascading: skips runCascade when no pool provided (backward-compat)', () => {
      const rule = {
        rule_id: 'mfg_op_to_intermediate_code',
        rule_type: 'cascading' as const,
        triggers: ['fg.manufacturing_operation_changed'],
        actions: [{ cascade: 'intermediate_code' }],
      };

      const event = {
        event_type: 'fg.manufacturing_operation_changed',
        fg_id: '00000000-0000-0000-0000-0000000000aa',
        operation_field_index: 1,
        operation_name: 'Mix',
      };

      // No opts at all — legacy unit-test invocation path
      executeRule(rule, event, RuleExecutionMode.NORMAL);

      expect(runCascadeSpy).not.toHaveBeenCalled();
    });

    it('cascading: skips runCascade when orgId missing even with pool', () => {
      const rule = {
        rule_id: 'mfg_op_to_intermediate_code',
        rule_type: 'cascading' as const,
        triggers: ['fg.manufacturing_operation_changed'],
        actions: [{ cascade: 'intermediate_code' }],
      };

      const event = {
        event_type: 'fg.manufacturing_operation_changed',
        fg_id: '00000000-0000-0000-0000-0000000000aa',
        operation_field_index: 1,
        operation_name: 'Mix',
      };

      executeRule(rule, event, RuleExecutionMode.NORMAL, { pool: fakePool });

      expect(runCascadeSpy).not.toHaveBeenCalled();
    });
  });
});
