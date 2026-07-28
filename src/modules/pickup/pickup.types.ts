export interface PickupSourceRecord {
  waybillNo: string;
  pickNetwork: string;
  destination: string;
  settlement: string;
  totalFreight: number | string;
  freight: number | string;
  weight: number | string;
  staff: string;
  sender: string;
  service: string;
  receiver: string;
  address: string;
}

export interface PickupEnvelope {
  total: number;
  data: PickupSourceRecord[];
}

export interface PickupSyncResult {
  runId: string;
  startedAt: Date;
  completedAt: Date;
  status: "SUCCESS" | "PARTIAL_SUCCESS";
  fetched: number;
  created: number;
  updated: number;
  duplicate: number;
  anomaly: number;
}

export interface PickupListInput {
  tenantId: string;
  outletId: string;
  page: number;
  pageSize: number;
  search?: string;
  staff?: string;
  destination?: string;
  settlement?: string;
  canViewPii: boolean;
}
