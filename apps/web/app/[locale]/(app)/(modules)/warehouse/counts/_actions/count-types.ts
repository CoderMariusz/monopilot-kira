export const COUNT_TYPES = ['cycle', 'full', 'spot'] as const;
export type CountType = (typeof COUNT_TYPES)[number];

export const COUNT_SESSION_STATUSES = ['open', 'counting', 'review', 'closed', 'cancelled'] as const;
export type CountSessionStatus = (typeof COUNT_SESSION_STATUSES)[number] | (string & {});

export const COUNT_LINE_STATUSES = ['pending', 'counted', 'approved', 'applied', 'rejected'] as const;
export type CountLineStatus = (typeof COUNT_LINE_STATUSES)[number];

export type DecimalString = string;

export type CreateCountSessionInput = {
  warehouseId: string;
  countType: CountType;
};

export type CountSession = {
  id: string;
  warehouseId: string;
  warehouseCode: string | null;
  countType: CountType | (string & {});
  status: CountSessionStatus;
  createdAt: string | null;
  lineCount: number;
  countedLineCount: number;
  varianceLineCount: number;
  varianceQty: DecimalString;
};

export type CountLine = {
  id: string;
  sessionId: string;
  locationId: string;
  locationCode: string | null;
  itemId: string;
  itemCode: string | null;
  itemName: string | null;
  lpId: string | null;
  lpNumber: string | null;
  countedQty: DecimalString | null;
  varianceQty: DecimalString | null;
  status: CountLineStatus;
  uom: string | null;
};

export type CountSessionDetail = CountSession & {
  lines: CountLine[];
};

export type RecordCountInput = {
  sessionId: string;
  locationId: string;
  itemId: string;
  lpId?: string | null;
  countedQty: DecimalString | number;
  batchNumber?: string | null;
  batch_number?: string | null;
  expiryDate?: string | Date | null;
  expiry_date?: string | Date | null;
};

export type CountSignature = {
  password: string;
  reason?: string | null;
  nonce?: string;
};

export type ApproveAndApplyVarianceInput = {
  countLineId: string;
  signature: CountSignature;
};

export type ApplyVarianceResult = {
  countLineId: string;
  adjustmentId: string;
  direction: 'increase' | 'decrease';
  adjustmentQty: DecimalString;
  varianceQty: DecimalString;
  lpId: string | null;
  esignRef: string;
  status: 'applied';
};
