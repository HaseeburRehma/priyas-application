export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export type InvoiceKind = "regular" | "alltagshilfe";

export type ExportTarget = "internal" | "lexware";

export type InvoiceEmailStatus =
  | "pending"
  | "queued"
  | "sent"
  | "delivered"
  | "bounced"
  | "failed";

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  client_id: string;
  client_name: string;
  status: InvoiceStatus;
  invoice_kind: InvoiceKind;
  issue_date: string;
  due_date: string | null;
  total_cents: number;
  paid_amount_cents: number;
  outstanding_cents: number;
  paid_at: string | null;
  lexware_id: string | null;
  email_status: InvoiceEmailStatus;
  days_overdue: number | null;
};

export type InvoicesSummary = {
  total: number;
  totalAmountCents: number;
  paidCount: number;
  paidAmountCents: number;
  openCount: number;
  openAmountCents: number;
  overdueCount: number;
  overdueAmountCents: number;
  collectedThisMonthCents: number;
  forecast30dCents: number;
};

export type InvoicesListParams = {
  q?: string;
  status?: InvoiceStatus | "all";
  page?: number;
  pageSize?: number;
  sort?: "issue_date" | "total" | "client";
  direction?: "asc" | "desc";
};

export type InvoicesListResult = {
  rows: InvoiceRow[];
  total: number;
};

export type InvoiceLineItem = {
  id: string;
  description: string;
  quantity: number;
  unit_price_cents: number;
  tax_rate: number;
  position: number;
  shift_id: string | null;
};

export type InvoiceDetail = {
  id: string;
  invoice_number: string;
  status: InvoiceStatus;
  invoice_kind: InvoiceKind;
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
  notes: string | null;
  pdf_path: string | null;
  lexware_id: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  paid_amount_cents: number;
  email_status: InvoiceEmailStatus;
  email_sent_at: string | null;
  export_target: ExportTarget;
  client: {
    id: string;
    display_name: string;
    customer_type: "residential" | "commercial" | "alltagshilfe";
    email: string | null;
    billing_email: string | null;
    phone: string | null;
    tax_id: string | null;
    insurance_provider: string | null;
    insurance_number: string | null;
    service_code: string | null;
  };
  items: InvoiceLineItem[];
  payments: InvoicePayment[];
};

export type InvoicePayment = {
  id: string;
  amount_cents: number;
  paid_at: string;
  method: string | null;
  reference: string | null;
  notes: string | null;
};

export type AlltagshilfeBudget = {
  client_id: string;
  year: number;
  budget_cents: number;
  used_cents: number;
  reserved_cents: number;
  remaining_cents: number;
  usage_percent: number;
  alerted_80: boolean;
  alerted_90: boolean;
  alerted_100: boolean;
};
