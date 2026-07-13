/**
 * W5 lane L4 — re-export surface for the Production detail tab.
 * Implementation lives alongside the FG detail route; owned extensions are
 * under this directory (production-line-picker, process-yield-hint, constants).
 */
export {
  FaProductionTab,
  default,
  type FaProductionColumn,
  type FaProductionColumnType,
  type FaProductionTabLabels,
  type FaProductionTabProps,
  type FaProductionTabState,
  type OperationOption,
  type ProdDetailRow,
  type ProductionProcessLabels,
  type ComponentProcess,
} from '../[productCode]/_components/fa-production-tab';
