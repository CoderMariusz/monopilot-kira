export type FactoryReleaseStatusValue =
  | 'pending_npd_release'
  | 'pending_technical_approval'
  | 'approved_for_factory'
  | 'released_to_factory'
  | 'blocked';

export type ReleaseBlocker = {
  type: string;
  message: string;
  remediationHref: string;
};

export type FactoryReleaseStatus = {
  id: string;
  orgId: string;
  projectId: string;
  productCode: string;
  releaseStatus: FactoryReleaseStatusValue;
  factoryAvailableAt: string | null;
  factoryApprovedBy: string | null;
  releaseEventId: number | null;
  activeBomHeaderId: string | null;
  activeFactorySpecId: string | null;
  releaseBlockers: ReleaseBlocker[];
  requestedBy: string | null;
  requestedAt: string | null;
};

export type BundleInput = {
  projectId: string;
  productCode: string;
  activeBomHeaderId: string;
  activeFactorySpecId: string;
};

export type BlockInput = BundleInput & {
  blockers: ReleaseBlocker[];
};

export type D365ExportInput = {
  projectId: string;
  productCode: string;
  d365ExportRunId: string;
};

export type GetFactoryReleaseStatusInput = {
  projectId: string;
  productCode: string;
};
