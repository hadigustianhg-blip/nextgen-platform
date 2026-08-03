export type DashboardPeriod = {
  startDate: string;
  endDate: string;
};

export type DashboardSection<T> =
  | { status: "success"; data: T; updatedAt: string | null }
  | {
      status: "error";
      data: null;
      updatedAt: null;
      error: { code: "SOURCE_UNAVAILABLE"; message: string };
    };

export type MonitoringDashboardData = {
  target: number;
  summary: {
    achievement: number;
    totalTtd: number;
    totalPending: number;
    pickupRevenue: string;
    pickupWeight: string;
  };
  daily: Array<{
    date: string;
    achievement: number;
    target: number;
    totalTtd: number;
    pending: number;
    pickupRevenue: string;
    pickupWeight: string;
  }>;
};

export type DeliveryDashboardData = {
  summary: {
    codCash: string;
    codQris: string;
    dfod: string;
    totalSettlement: string;
  };
  daily: Array<{
    date: string;
    codCash: string;
    codQris: string;
    dfod: string;
    totalSettlement: string;
  }>;
};

export type OperationalDashboardData = {
  summary: {
    cashReceived: string;
    cashAvailable: string;
    operationalExpense: string;
    outstanding: string;
  };
  daily: Array<{
    date: string;
    cashReceived: string;
    cashAvailable: string;
    operationalExpense: string;
    outstanding: string;
  }>;
};

export type PaymentDashboardData = {
  cashOnHand: string;
  daily: Array<{ date: string; cashOnHand: string }>;
};

export type PickupPaymentDashboardData = {
  summary: {
    outstanding: string;
    outstandingWaybills: number;
    overdueOver7: number;
    notOverdue: number;
  };
};

export type SlaDashboardData = {
  target: number;
  averageSla: number;
  daily: Array<{ date: string; sla: number; target: number }>;
};

export type StuckDeliveryDashboardData = {
  totalInventory: number;
  daily: Array<{ date: string; totalInventory: number }>;
};

export type DashboardOverview = {
  period: DashboardPeriod;
  updatedAt: string;
  monitoring: DashboardSection<MonitoringDashboardData>;
  deliverySettlement: DashboardSection<DeliveryDashboardData>;
  operationalSettlement: DashboardSection<OperationalDashboardData>;
  paymentSettlement: DashboardSection<PaymentDashboardData>;
  pickupPayment: DashboardSection<PickupPaymentDashboardData>;
  sla: DashboardSection<SlaDashboardData>;
  stuckDelivery: DashboardSection<StuckDeliveryDashboardData>;
};
