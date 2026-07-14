export type PickListLineDetail = {
  id: string;
  lineNo: number | null;
  itemCode: string | null;
  itemName: string | null;
  licensePlateCode: string | null;
  quantityToPick: string;
  quantityPicked: string;
  status: string;
};

export type PickListDetail = {
  id: string;
  pickListNumber: string;
  status: string;
  salesOrderId: string;
  salesOrderNumber: string;
  lines: PickListLineDetail[];
};
