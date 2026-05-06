export type ShiftStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

/** Service "lane" — drives the colored pill in the sidebar. Inferred from
 *  the client's customer_type (alltagshilfe = red lane, others = green). */
export type ServiceLane = "priyas" | "alltagshilfe";

export type ShiftEvent = {
  id: string;
  title: string;
  property_id: string;
  property_name: string;
  client_id: string;
  client_name: string;
  service_lane: ServiceLane;
  status: ShiftStatus;
  starts_at: string;
  ends_at: string;
  team: { id: string; initials: string; tone: "primary" | "secondary" | "accent" | "warning" }[];
  notes: string | null;
};

/** A property closure that intersects the loaded week. */
export type ScheduleClosure = {
  id: string;
  property_id: string;
  property_name: string;
  start_date: string;
  end_date: string;
  reason:
    | "public_holiday"
    | "tenant_closed"
    | "renovation"
    | "weather"
    | "other";
};

/** An approved vacation that intersects the loaded week. */
export type ScheduleVacation = {
  id: string;
  employee_id: string;
  employee_name: string;
  start_date: string;
  end_date: string;
};

export type ScheduleWeek = {
  /** Mon..Sun, ISO date strings (yyyy-MM-dd). */
  days: string[];
  events: ShiftEvent[];
  closures: ScheduleClosure[];
  vacations: ScheduleVacation[];
  weekLabel: string;
  isoWeek: number;
};

export type ScheduleStatusFilter =
  | "completed"
  | "scheduled"
  | "in_progress"
  | "issue";
