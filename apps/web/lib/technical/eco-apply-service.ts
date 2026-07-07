/**
 * ECO apply-on-close — NN-TEC-3.
 *
 * ECO line items are descriptive metadata (action/target/before/after) and are NOT
 * an executable change payload. The honest Phase-2-minimum variant:
 *   1. During `implementing`, the engineer clones/edits the target BOM or factory
 *      spec through the normal Technical workflows.
 *   2. They link the superseding version on the ECO (`linkEcoSupersession`).
 *   3. On close (`applying` = implementing → closed), this service validates the
 *      linkage and publishes the linked BOM via `publishBomVersion` (canonical
 *      supersede machinery). Factory-spec ECOs only validate the linked spec has
 *      reached an approved/released terminal state (release bundle stays separate).
 */

import { publishBomVersion } from './bom-publish-service';
import type { OrgActionContext, QueryClient } from '../../app/[locale]/(app)/(modules)/technical/eco/_actions/shared';
import {
  ECO_EXT_SUPERSEDING_BOM_HEADER_ID,
  ECO_EXT_SUPERSEDING_FACTORY_SPEC_ID,
} from '../../app/[locale]/(app)/(modules)/technical/eco/_actions/shared';

export type EcoApplyError = 'supersession_required' | 'supersession_invalid' | 'forbidden' | 'persistence_failed';

export type EcoApplyResult =
  | {
      ok: true;
      data: {
        applied: boolean;
        bomPublished?: { bomHeaderId: string; productId: string; version: number };
        factorySpecLinked?: { factorySpecId: string; status: string };
      };
    }
  | { ok: false; error: EcoApplyError; message?: string };

type EcoTargetRow = {
  id: string;
  target_bom_header_id: string | null;
  target_factory_spec_id: string | null;
  target_item_id: string | null;
  ext_jsonb: Record<string, unknown>;
};

type BomRow = {
  id: string;
  product_id: string | null;
  version: number;
  status: string;
  supersedes_bom_header_id: string | null;
};

type FactorySpecRow = {
  id: string;
  version: number;
  status: string;
  supersedes_factory_spec_id: string | null;
};

function readUuid(ext: Record<string, unknown>, key: string): string | null {
  const value = ext[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function loadEcoTarget(client: QueryClient, changeOrderId: string): Promise<EcoTargetRow | null> {
  const { rows } = await client.query<EcoTargetRow>(
    `select id,
            target_bom_header_id,
            target_factory_spec_id,
            target_item_id,
            ext_jsonb
       from public.technical_change_orders
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [changeOrderId],
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    ext_jsonb:
      row.ext_jsonb && typeof row.ext_jsonb === 'object' && !Array.isArray(row.ext_jsonb)
        ? (row.ext_jsonb as Record<string, unknown>)
        : {},
  };
}

async function loadBom(client: QueryClient, bomHeaderId: string): Promise<BomRow | null> {
  const { rows } = await client.query<BomRow>(
    `select id, product_id, version, status, supersedes_bom_header_id
       from public.bom_headers
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [bomHeaderId],
  );
  return rows[0] ?? null;
}

async function loadFactorySpec(client: QueryClient, specId: string): Promise<FactorySpecRow | null> {
  const { rows } = await client.query<FactorySpecRow>(
    `select id, version, status, supersedes_factory_spec_id
       from public.factory_specs
      where org_id = app.current_org_id()
        and id = $1::uuid`,
    [specId],
  );
  return rows[0] ?? null;
}

function validateSupersedingBom(target: BomRow, superseding: BomRow): string | null {
  if (target.product_id !== superseding.product_id) {
    return 'superseding BOM must belong to the same product as the ECO target BOM';
  }
  const directLineage = superseding.supersedes_bom_header_id === target.id;
  const newerVersion = Number(superseding.version) > Number(target.version);
  if (!directLineage && !newerVersion) {
    return 'superseding BOM must be a newer version or clone-on-write child of the ECO target BOM';
  }
  if (!['technical_approved', 'active'].includes(superseding.status)) {
    return `superseding BOM is ${superseding.status}; expected technical_approved or active`;
  }
  return null;
}

function validateSupersedingFactorySpec(target: FactorySpecRow, superseding: FactorySpecRow): string | null {
  const directLineage = superseding.supersedes_factory_spec_id === target.id;
  const newerVersion = Number(superseding.version) > Number(target.version);
  if (!directLineage && !newerVersion) {
    return 'superseding factory spec must be a newer version or clone-on-write child of the ECO target spec';
  }
  if (!['approved_for_factory', 'released_to_factory'].includes(superseding.status)) {
    return `superseding factory spec is ${superseding.status}; complete Technical release before closing the ECO`;
  }
  return null;
}

export async function applyEcoOnClose(ctx: OrgActionContext, changeOrderId: string): Promise<EcoApplyResult> {
  const eco = await loadEcoTarget(ctx.client, changeOrderId);
  if (!eco) return { ok: false, error: 'persistence_failed', message: 'change order not found' };

  const supersedingBomHeaderId = readUuid(eco.ext_jsonb, ECO_EXT_SUPERSEDING_BOM_HEADER_ID);
  const supersedingFactorySpecId = readUuid(eco.ext_jsonb, ECO_EXT_SUPERSEDING_FACTORY_SPEC_ID);

  if (eco.target_bom_header_id) {
    if (!supersedingBomHeaderId) {
      return {
        ok: false,
        error: 'supersession_required',
        message: 'link the superseding BOM version before closing this ECO',
      };
    }

    const [targetBom, supersedingBom] = await Promise.all([
      loadBom(ctx.client, eco.target_bom_header_id),
      loadBom(ctx.client, supersedingBomHeaderId),
    ]);
    if (!targetBom || !supersedingBom) {
      return { ok: false, error: 'supersession_invalid', message: 'linked BOM header not found' };
    }

    const bomValidation = validateSupersedingBom(targetBom, supersedingBom);
    if (bomValidation) return { ok: false, error: 'supersession_invalid', message: bomValidation };

    if (supersedingBom.status === 'technical_approved') {
      const publish = await publishBomVersion(ctx, {
        bomHeaderId: supersedingBom.id,
        productId: supersedingBom.product_id!,
        version: Number(supersedingBom.version),
      });
      if (!publish.ok) {
        if (publish.error === 'forbidden') return { ok: false, error: 'forbidden', message: publish.message };
        return { ok: false, error: 'supersession_invalid', message: publish.message ?? publish.error };
      }
      return {
        ok: true,
        data: {
          applied: true,
          bomPublished: {
            bomHeaderId: publish.data.bomHeaderId,
            productId: publish.data.productId,
            version: publish.data.version,
          },
        },
      };
    }

    return {
      ok: true,
      data: {
        applied: true,
        bomPublished: {
          bomHeaderId: supersedingBom.id,
          productId: supersedingBom.product_id!,
          version: Number(supersedingBom.version),
        },
      },
    };
  }

  if (eco.target_factory_spec_id) {
    if (!supersedingFactorySpecId) {
      return {
        ok: false,
        error: 'supersession_required',
        message: 'link the superseding factory spec before closing this ECO',
      };
    }

    const [targetSpec, supersedingSpec] = await Promise.all([
      loadFactorySpec(ctx.client, eco.target_factory_spec_id),
      loadFactorySpec(ctx.client, supersedingFactorySpecId),
    ]);
    if (!targetSpec || !supersedingSpec) {
      return { ok: false, error: 'supersession_invalid', message: 'linked factory spec not found' };
    }

    const specValidation = validateSupersedingFactorySpec(targetSpec, supersedingSpec);
    if (specValidation) return { ok: false, error: 'supersession_invalid', message: specValidation };

    return {
      ok: true,
      data: {
        applied: true,
        factorySpecLinked: { factorySpecId: supersedingSpec.id, status: supersedingSpec.status },
      },
    };
  }

  return { ok: true, data: { applied: false } };
}

export async function validateEcoSupersessionLink(
  client: QueryClient,
  params: {
    changeOrderId: string;
    supersedingBomHeaderId?: string | null;
    supersedingFactorySpecId?: string | null;
  },
): Promise<{ ok: true } | { ok: false; error: 'supersession_invalid' | 'invalid_state'; message: string }> {
  const eco = await loadEcoTarget(client, params.changeOrderId);
  if (!eco) return { ok: false, error: 'invalid_state', message: 'change order not found' };

  if (params.supersedingBomHeaderId) {
    if (!eco.target_bom_header_id) {
      return { ok: false, error: 'supersession_invalid', message: 'this ECO does not target a BOM' };
    }
    const [targetBom, supersedingBom] = await Promise.all([
      loadBom(client, eco.target_bom_header_id),
      loadBom(client, params.supersedingBomHeaderId),
    ]);
    if (!targetBom || !supersedingBom) {
      return { ok: false, error: 'supersession_invalid', message: 'BOM header not found' };
    }
    const message = validateSupersedingBom(targetBom, supersedingBom);
    if (message) return { ok: false, error: 'supersession_invalid', message };
  }

  if (params.supersedingFactorySpecId) {
    if (!eco.target_factory_spec_id) {
      return { ok: false, error: 'supersession_invalid', message: 'this ECO does not target a factory spec' };
    }
    const [targetSpec, supersedingSpec] = await Promise.all([
      loadFactorySpec(client, eco.target_factory_spec_id),
      loadFactorySpec(client, params.supersedingFactorySpecId),
    ]);
    if (!targetSpec || !supersedingSpec) {
      return { ok: false, error: 'supersession_invalid', message: 'factory spec not found' };
    }
    const message = validateSupersedingFactorySpec(targetSpec, supersedingSpec);
    if (message) return { ok: false, error: 'supersession_invalid', message };
  }

  return { ok: true };
}
