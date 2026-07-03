/**
 * English fallbacks for WIP library labels — plain module so RSC pages can
 * Object.keys() the bundle when next-intl keys are not merged yet.
 */

export type WipLibraryLabels = {
  breadcrumbRoot: string;
  listTitle: string;
  listDescription: string;
  listErrorTitle: string;
  listErrorBody: string;
  listEmptyTitle: string;
  listEmptyBodyCreate: string;
  listEmptyBodyView: string;
  listViewerOnly: string;
  listSearchPlaceholder: string;
  listFilterActive: string;
  listFilterArchived: string;
  listNoMatches: string;
  listNewDefinition: string;
  listColName: string;
  listColBaseUom: string;
  listColVersion: string;
  listColStatus: string;
  listColReusable: string;
  listColProcessCount: string;
  listColWhereUsed: string;
  listColActions: string;
  listOpenDetail: string;
  statusDraft: string;
  statusActive: string;
  statusArchived: string;
  reusableYes: string;
  reusableNo: string;
  createModalTitle: string;
  createModalName: string;
  createModalBaseUom: string;
  createModalCancel: string;
  createModalSubmit: string;
  createModalSaving: string;
  createError: string;
  detailBreadcrumb: string;
  detailErrorTitle: string;
  detailNotFoundTitle: string;
  detailNotFoundBody: string;
  detailViewerOnly: string;
  detailSave: string;
  detailSaving: string;
  detailSaved: string;
  detailSaveError: string;
  detailArchive: string;
  detailArchiving: string;
  detailArchiveConfirmTitle: string;
  detailArchiveConfirmBody: string;
  detailArchiveCancel: string;
  detailArchiveConfirm: string;
  headerName: string;
  headerDescription: string;
  headerBaseUom: string;
  headerYieldPct: string;
  headerReusable: string;
  headerStatus: string;
  headerVersion: string;
  headerItemCode: string;
  compositionTitle: string;
  compositionSubtitle: string;
  compositionAdd: string;
  compositionColItem: string;
  compositionColQty: string;
  compositionColUom: string;
  compositionColActions: string;
  compositionRemove: string;
  compositionEmpty: string;
  processTitle: string;
  processSubtitle: string;
  processAdd: string;
  processEmpty: string;
  processEmptyBody: string;
  processDuration: string;
  processAdditionalCost: string;
  processThroughput: string;
  processThroughputUom: string;
  processSetupCost: string;
  processEdit: string;
  processRemove: string;
  processRolesHeader: string;
  processRoleGroup: string;
  processHeadcount: string;
  processRatePerHour: string;
  processSave: string;
  processCancel: string;
  processPickerLabel: string;
  processPickerPlaceholder: string;
  processPickerEmpty: string;
  processPickerCancel: string;
  whereUsedTitle: string;
  whereUsedSubtitle: string;
  whereUsedColProject: string;
  whereUsedColFgCode: string;
  whereUsedColAcceptedVersion: string;
  whereUsedEmpty: string;
  pickerTrigger: string;
  pickerSearchLabel: string;
  pickerSearchPlaceholder: string;
  pickerLoading: string;
  pickerEmpty: string;
  pickerCancel: string;
  pickerError: string;
  pickerCreateItemCta: string;
};

export const WIP_LIBRARY_DEFAULT_LABELS: WipLibraryLabels = {
  breadcrumbRoot: 'Technical',
  listTitle: 'WIP library',
  listDescription: 'Org-wide work-in-progress definitions — composition, process chain, and yield per output unit.',
  listErrorTitle: 'Could not load WIP definitions',
  listErrorBody: 'Try refreshing the page. If the problem persists, contact your administrator.',
  listEmptyTitle: 'No WIP definitions yet',
  listEmptyBodyCreate: 'Create a definition from scratch or publish one from an NPD production component chain.',
  listEmptyBodyView: 'No definitions are available in this organization.',
  listViewerOnly: 'You have read-only access to the WIP library.',
  listSearchPlaceholder: 'Search by name or item code…',
  listFilterActive: 'Active',
  listFilterArchived: 'Archived',
  listNoMatches: 'No definitions match your filters.',
  listNewDefinition: 'New definition',
  listColName: 'Name',
  listColBaseUom: 'Base UoM',
  listColVersion: 'Version',
  listColStatus: 'Status',
  listColReusable: 'Reusable',
  listColProcessCount: 'Processes',
  listColWhereUsed: 'Where used',
  listColActions: 'Actions',
  listOpenDetail: 'Open',
  statusDraft: 'Draft',
  statusActive: 'Active',
  statusArchived: 'Archived',
  reusableYes: 'Reusable',
  reusableNo: 'Not reusable',
  createModalTitle: 'New WIP definition',
  createModalName: 'Name',
  createModalBaseUom: 'Base unit of measure',
  createModalCancel: 'Cancel',
  createModalSubmit: 'Create',
  createModalSaving: 'Creating…',
  createError: 'Could not create the definition.',
  detailBreadcrumb: 'WIP library',
  detailErrorTitle: 'Could not load this definition',
  detailNotFoundTitle: 'Definition not found',
  detailNotFoundBody: 'This WIP definition may have been removed or you may not have access.',
  detailViewerOnly: 'You have read-only access to this definition.',
  detailSave: 'Save',
  detailSaving: 'Saving…',
  detailSaved: 'Saved',
  detailSaveError: 'Could not save changes.',
  detailArchive: 'Archive',
  detailArchiving: 'Archiving…',
  detailArchiveConfirmTitle: 'Archive this definition?',
  detailArchiveConfirmBody: 'Archived definitions cannot be reused in new formulations. Existing references stay read-only until projects accept updates.',
  detailArchiveCancel: 'Cancel',
  detailArchiveConfirm: 'Archive',
  headerName: 'Name',
  headerDescription: 'Description',
  headerBaseUom: 'Base UoM',
  headerYieldPct: 'Yield %',
  headerReusable: 'Reusable in formulations',
  headerStatus: 'Status',
  headerVersion: 'Version',
  headerItemCode: 'Item code',
  compositionTitle: 'Composition',
  compositionSubtitle: 'Raw materials per 1 output unit of this WIP.',
  compositionAdd: '+ Add ingredient',
  compositionColItem: 'Item',
  compositionColQty: 'Qty / output unit',
  compositionColUom: 'UoM',
  compositionColActions: 'Actions',
  compositionRemove: 'Remove',
  compositionEmpty: 'No composition lines yet.',
  processTitle: 'Process chain',
  processSubtitle: 'Ordered manufacturing operations with duration, cost, throughput, and staffing.',
  processAdd: '+ Add process',
  processEmpty: 'No processes yet',
  processEmptyBody: 'Add operations from your manufacturing operations master.',
  processDuration: 'Duration (h)',
  processAdditionalCost: 'Additional cost',
  processThroughput: 'Throughput / hour',
  processThroughputUom: 'Throughput UoM',
  processSetupCost: 'Setup cost',
  processEdit: 'Edit',
  processRemove: 'Remove',
  processRolesHeader: 'Roles',
  processRoleGroup: 'Role group',
  processHeadcount: 'Headcount',
  processRatePerHour: 'Rate / hour',
  processSave: 'Save',
  processCancel: 'Cancel',
  processPickerLabel: 'Search operations',
  processPickerPlaceholder: 'Filter by name…',
  processPickerEmpty: 'No matching operations',
  processPickerCancel: 'Cancel',
  whereUsedTitle: 'Where used',
  whereUsedSubtitle: 'NPD projects referencing this definition and their accepted version.',
  whereUsedColProject: 'Project',
  whereUsedColFgCode: 'FG code',
  whereUsedColAcceptedVersion: 'Accepted version',
  whereUsedEmpty: 'Not referenced by any project.',
  pickerTrigger: '+ Add item',
  pickerSearchLabel: 'Search items',
  pickerSearchPlaceholder: 'Search by code or name…',
  pickerLoading: 'Searching…',
  pickerEmpty: 'No matching items',
  pickerCancel: 'Cancel',
  pickerError: 'Item search failed',
  pickerCreateItemCta: 'Create an item in Technical',
};

/** Map next-intl `technical.wip.*` keys to label bundle fields. */
export const WIP_LABEL_KEY_MAP: Record<keyof WipLibraryLabels, string> = {
  breadcrumbRoot: 'breadcrumbRoot',
  listTitle: 'list.title',
  listDescription: 'list.description',
  listErrorTitle: 'list.errorTitle',
  listErrorBody: 'list.errorBody',
  listEmptyTitle: 'list.emptyTitle',
  listEmptyBodyCreate: 'list.emptyBodyCreate',
  listEmptyBodyView: 'list.emptyBodyView',
  listViewerOnly: 'list.viewerOnly',
  listSearchPlaceholder: 'list.searchPlaceholder',
  listFilterActive: 'list.filter.active',
  listFilterArchived: 'list.filter.archived',
  listNoMatches: 'list.noMatches',
  listNewDefinition: 'list.newDefinition',
  listColName: 'list.columns.name',
  listColBaseUom: 'list.columns.baseUom',
  listColVersion: 'list.columns.version',
  listColStatus: 'list.columns.status',
  listColReusable: 'list.columns.reusable',
  listColProcessCount: 'list.columns.processCount',
  listColWhereUsed: 'list.columns.whereUsed',
  listColActions: 'list.columns.actions',
  listOpenDetail: 'list.openDetail',
  statusDraft: 'status.draft',
  statusActive: 'status.active',
  statusArchived: 'status.archived',
  reusableYes: 'reusable.yes',
  reusableNo: 'reusable.no',
  createModalTitle: 'create.title',
  createModalName: 'create.name',
  createModalBaseUom: 'create.baseUom',
  createModalCancel: 'create.cancel',
  createModalSubmit: 'create.submit',
  createModalSaving: 'create.saving',
  createError: 'create.error',
  detailBreadcrumb: 'detail.breadcrumb',
  detailErrorTitle: 'detail.errorTitle',
  detailNotFoundTitle: 'detail.notFoundTitle',
  detailNotFoundBody: 'detail.notFoundBody',
  detailViewerOnly: 'detail.viewerOnly',
  detailSave: 'detail.save',
  detailSaving: 'detail.saving',
  detailSaved: 'detail.saved',
  detailSaveError: 'detail.saveError',
  detailArchive: 'detail.archive',
  detailArchiving: 'detail.archiving',
  detailArchiveConfirmTitle: 'detail.archiveConfirmTitle',
  detailArchiveConfirmBody: 'detail.archiveConfirmBody',
  detailArchiveCancel: 'detail.archiveCancel',
  detailArchiveConfirm: 'detail.archiveConfirm',
  headerName: 'header.name',
  headerDescription: 'header.description',
  headerBaseUom: 'header.baseUom',
  headerYieldPct: 'header.yieldPct',
  headerReusable: 'header.reusable',
  headerStatus: 'header.status',
  headerVersion: 'header.version',
  headerItemCode: 'header.itemCode',
  compositionTitle: 'composition.title',
  compositionSubtitle: 'composition.subtitle',
  compositionAdd: 'composition.add',
  compositionColItem: 'composition.columns.item',
  compositionColQty: 'composition.columns.qty',
  compositionColUom: 'composition.columns.uom',
  compositionColActions: 'composition.columns.actions',
  compositionRemove: 'composition.remove',
  compositionEmpty: 'composition.empty',
  processTitle: 'process.title',
  processSubtitle: 'process.subtitle',
  processAdd: 'process.add',
  processEmpty: 'process.empty',
  processEmptyBody: 'process.emptyBody',
  processDuration: 'process.duration',
  processAdditionalCost: 'process.additionalCost',
  processThroughput: 'process.throughput',
  processThroughputUom: 'process.throughputUom',
  processSetupCost: 'process.setupCost',
  processEdit: 'process.edit',
  processRemove: 'process.remove',
  processRolesHeader: 'process.rolesHeader',
  processRoleGroup: 'process.roleGroup',
  processHeadcount: 'process.headcount',
  processRatePerHour: 'process.ratePerHour',
  processSave: 'process.save',
  processCancel: 'process.cancel',
  processPickerLabel: 'process.picker.label',
  processPickerPlaceholder: 'process.picker.placeholder',
  processPickerEmpty: 'process.picker.empty',
  processPickerCancel: 'process.picker.cancel',
  whereUsedTitle: 'whereUsed.title',
  whereUsedSubtitle: 'whereUsed.subtitle',
  whereUsedColProject: 'whereUsed.columns.project',
  whereUsedColFgCode: 'whereUsed.columns.fgCode',
  whereUsedColAcceptedVersion: 'whereUsed.columns.acceptedVersion',
  whereUsedEmpty: 'whereUsed.empty',
  pickerTrigger: 'picker.trigger',
  pickerSearchLabel: 'picker.searchLabel',
  pickerSearchPlaceholder: 'picker.searchPlaceholder',
  pickerLoading: 'picker.loading',
  pickerEmpty: 'picker.empty',
  pickerCancel: 'picker.cancel',
  pickerError: 'picker.error',
  pickerCreateItemCta: 'picker.createItemCta',
};
