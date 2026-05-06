export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "cancelled";

export type InvoiceRow = {
  id: string;
  invoice_number: string;
  client_id: string;
  client_name: string;
  status: InvoiceStatus;
  issue_date: string;
  due_date: string | null;
  total_cents: number;
  paid_at: string | null;
  lexware_id: string | null;
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
  issue_date: string;
  due_date: string | null;
  paid_at: string | null;
  notes: string | null;
  pdf_path: string | null;
  lexware_id: string | null;
  subtotal_cents: number;
  tax_cents: number;
  total_cents: number;
  client: {
    id: string;
    display_name: string;
    email: string | null;
    phone: string | null;
    tax_id: string | null;
  };
  items: InvoiceLineItem[];
};
