/** Property kinds shown as colored chips in the table. */
export type PropertyKind =
  | "office"
  | "retail"
  | "residential"
  | "medical"
  | "industrial"
  | "other";

export type PropertyStatus = "active" | "onboarding" | "attention" | "paused";

export type PropertyRow = {
  id: string;
  name: string;
  address: string;
  kind: PropertyKind;
  client_id: string;
  client_name: string;
  assignments_per_week: number;
  status: PropertyStatus;
  team_lead_id: string | null;
  team_lead_name: string | null;
  team_lead_initials: string | null;
  is_new: boolean;
};

export type PropertiesSummary = {
  total: number;
  activelyServiced: number;
  newlyOnboarded30d: number;
  needsAttention: number;
  newThisQuarter: number;
};

export type PropertiesListParams = {
  q?: string;
  kind?: PropertyKind | "all";
  status?: PropertyStatus | "all";
  page?: number;
  pageSize?: number;
  sort?: "name" | "assignments" | "client";
  direction?: "asc" | "desc";
};

export type PropertiesListResult = {
  rows: PropertyRow[];
  total: number;
};

export type PropertyArea = {
  id: string;
  name: string;
  floor: string | null;
  zone: string | null;
  size_sqm: number | null;
  frequency: string | null;
};

export type PropertyDetail = {
  id: string;
  name: string;
  address_line1: string;
  address_line2: string | null;
  postal_code: string;
  city: string;
  country: string;
  size_sqm: number | null;
  notes: string | null;
  // Structured location detail
  floor: string | null;
  building_section: string | null;
  access_code: string | null;
  // Structured safety + access notes
  allergies: string | null;
  restricted_areas: string | null;
  safety_regulations: string | null;
  // Cleaning concept document (PDF in property-documents bucket)
  cleaning_concept_path: string | null;
  latitude: number | null;
  longitude: number | null;
  client_id: string;
  client_name: string;
  client_type: string;
  kind: PropertyKind;
  status: PropertyStatus;
  rooms: number | null;
  weekly_frequency: number;
  team_size: number;
  contract_end: string | null;
  created_at: string;
  // Aggregates
  assignment_count: number;
  document_count: number;
  area_count: number;
  // Lists
  team: { id: string; name: string; initials: string; role: string }[];
  areas: PropertyArea[];
};
