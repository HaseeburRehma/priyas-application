import { NextResponse } from "next/server";

/**
 * GET /api/v1/openapi.json
 *
 * Hand-written OpenAPI 3.0 document describing the public v1 surface.
 * Kept inline (no yaml/openapi-builder library) so we don't drag a new
 * dependency into the bundle. When you add or change a v1 route, edit
 * the `spec` object below.
 */
export const dynamic = "force-dynamic";

const PAGE_PARAMS = [
  {
    name: "page",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 1, default: 1 },
  },
  {
    name: "pageSize",
    in: "query",
    required: false,
    schema: { type: "integer", minimum: 1, maximum: 200, default: 25 },
  },
];

function listResponses(itemRef: string) {
  return {
    "200": {
      description: "Paginated list",
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["data", "pagination"],
            properties: {
              data: { type: "array", items: { $ref: itemRef } },
              pagination: { $ref: "#/components/schemas/Pagination" },
            },
          },
        },
      },
    },
    "401": { $ref: "#/components/responses/Unauthorized" },
    "403": { $ref: "#/components/responses/Forbidden" },
    "429": { $ref: "#/components/responses/RateLimited" },
    "500": { $ref: "#/components/responses/ServerError" },
  };
}

function itemResponses(itemRef: string) {
  return {
    "200": {
      description: "Single resource",
      content: {
        "application/json": {
          schema: {
            type: "object",
            required: ["data"],
            properties: { data: { $ref: itemRef } },
          },
        },
      },
    },
    "401": { $ref: "#/components/responses/Unauthorized" },
    "403": { $ref: "#/components/responses/Forbidden" },
    "404": { $ref: "#/components/responses/NotFound" },
    "500": { $ref: "#/components/responses/ServerError" },
  };
}

export function GET() {
  const serverUrl =
    process.env.NEXT_PUBLIC_BASE_URL ?? "https://example.com";

  const spec = {
    openapi: "3.0.3",
    info: {
      title: "Priya's Reinigungsservice — Public API",
      version: "1.0.0",
      description:
        "Versioned external REST API for integrations. Authentication is via bearer API keys issued in Settings → API Keys. All endpoints are scoped to the issuing organisation.",
      contact: {
        name: "Priya's Reinigungsservice",
        email: "support@priyas-reinigungsservice.de",
      },
    },
    servers: [{ url: `${serverUrl}/api/v1`, description: "Production" }],
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Clients" },
      { name: "Properties" },
      { name: "Employees" },
      { name: "Shifts" },
      { name: "Invoices" },
    ],
    paths: {
      "/clients": {
        get: {
          tags: ["Clients"],
          summary: "List clients",
          description: "Paginated list of clients. Requires `read:clients`.",
          parameters: [
            ...PAGE_PARAMS,
            {
              name: "q",
              in: "query",
              required: false,
              schema: { type: "string" },
              description: "Free-text search across display_name, email, phone.",
            },
            {
              name: "type",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["all", "residential", "commercial", "alltagshilfe"],
                default: "all",
              },
            },
          ],
          security: [{ bearerAuth: ["read:clients"] }],
          responses: listResponses("#/components/schemas/Client"),
        },
      },
      "/clients/{id}": {
        get: {
          tags: ["Clients"],
          summary: "Get client by ID",
          security: [{ bearerAuth: ["read:clients"] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: itemResponses("#/components/schemas/ClientDetail"),
        },
      },
      "/properties": {
        get: {
          tags: ["Properties"],
          summary: "List properties",
          security: [{ bearerAuth: ["read:properties"] }],
          parameters: [
            ...PAGE_PARAMS,
            { name: "q", in: "query", required: false, schema: { type: "string" } },
            {
              name: "kind",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "all",
                  "office",
                  "retail",
                  "residential",
                  "medical",
                  "industrial",
                  "other",
                ],
                default: "all",
              },
            },
            {
              name: "status",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["all", "active", "onboarding", "attention", "paused"],
                default: "all",
              },
            },
          ],
          responses: listResponses("#/components/schemas/Property"),
        },
      },
      "/properties/{id}": {
        get: {
          tags: ["Properties"],
          summary: "Get property by ID",
          security: [{ bearerAuth: ["read:properties"] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: itemResponses("#/components/schemas/PropertyDetail"),
        },
      },
      "/employees": {
        get: {
          tags: ["Employees"],
          summary: "List employees",
          security: [{ bearerAuth: ["read:employees"] }],
          parameters: [
            ...PAGE_PARAMS,
            { name: "q", in: "query", required: false, schema: { type: "string" } },
            {
              name: "role",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["all", "pm", "field", "trainee"],
                default: "all",
              },
            },
            {
              name: "status",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["all", "active", "on_leave", "inactive"],
                default: "all",
              },
            },
          ],
          responses: listResponses("#/components/schemas/Employee"),
        },
      },
      "/employees/{id}": {
        get: {
          tags: ["Employees"],
          summary: "Get employee by ID (returns EmployeeDetail shape)",
          security: [{ bearerAuth: ["read:employees"] }],
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              schema: { type: "string", format: "uuid" },
            },
          ],
          responses: itemResponses("#/components/schemas/EmployeeDetail"),
        },
      },
      "/shifts": {
        get: {
          tags: ["Shifts"],
          summary: "List shifts in a date range",
          description:
            "Returns every shift starting within `[from, to]` (inclusive). Max range 92 days.",
          security: [{ bearerAuth: ["read:shifts"] }],
          parameters: [
            {
              name: "from",
              in: "query",
              required: true,
              schema: { type: "string", format: "date-time" },
            },
            {
              name: "to",
              in: "query",
              required: true,
              schema: { type: "string", format: "date-time" },
            },
          ],
          responses: listResponses("#/components/schemas/Shift"),
        },
      },
      "/invoices": {
        get: {
          tags: ["Invoices"],
          summary: "List invoices",
          security: [{ bearerAuth: ["read:invoices"] }],
          parameters: [
            ...PAGE_PARAMS,
            { name: "q", in: "query", required: false, schema: { type: "string" } },
            {
              name: "status",
              in: "query",
              required: false,
              schema: {
                type: "string",
                enum: ["all", "draft", "sent", "paid", "overdue", "cancelled"],
                default: "all",
              },
            },
          ],
          responses: listResponses("#/components/schemas/Invoice"),
        },
      },
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "OpaqueToken",
          description:
            "Issue an API key in Settings → API Keys, then send it as `Authorization: Bearer pk_live_...`.",
        },
      },
      responses: {
        Unauthorized: {
          description: "Missing or invalid API key",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        Forbidden: {
          description: "Key lacks the required scope",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        NotFound: {
          description: "Resource not found",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        RateLimited: {
          description: "Per-key rate limit exceeded (60 req/min)",
          headers: {
            "Retry-After": {
              schema: { type: "integer" },
              description: "Seconds to wait before retrying.",
            },
          },
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
        ServerError: {
          description: "Unexpected server error",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/Error" },
            },
          },
        },
      },
      schemas: {
        Pagination: {
          type: "object",
          required: ["page", "pageSize", "total", "totalPages"],
          properties: {
            page: { type: "integer", minimum: 1 },
            pageSize: { type: "integer", minimum: 1 },
            total: { type: "integer", minimum: 0 },
            totalPages: { type: "integer", minimum: 0 },
          },
        },
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "string",
              description: "Stable, machine-readable error code.",
              example: "invalid_api_key",
            },
          },
        },
        Client: {
          type: "object",
          required: [
            "id",
            "display_name",
            "customer_type",
            "property_count",
            "status",
            "is_new",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            display_name: { type: "string" },
            customer_type: {
              type: "string",
              enum: ["residential", "commercial", "alltagshilfe"],
            },
            email: { type: "string", nullable: true },
            phone: { type: "string", nullable: true },
            property_count: { type: "integer" },
            status: {
              type: "string",
              enum: ["active", "review", "onboarding", "ended"],
            },
            contract_start: {
              type: "string",
              format: "date",
              nullable: true,
            },
            is_new: { type: "boolean" },
          },
        },
        ClientDetail: {
          type: "object",
          required: [
            "id",
            "display_name",
            "customer_type",
            "archived",
            "created_at",
            "updated_at",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            display_name: { type: "string" },
            customer_type: {
              type: "string",
              enum: ["residential", "commercial", "alltagshilfe"],
            },
            contact_name: { type: "string", nullable: true },
            email: { type: "string", nullable: true },
            phone: { type: "string", nullable: true },
            tax_id: { type: "string", nullable: true },
            insurance_provider: { type: "string", nullable: true },
            insurance_number: { type: "string", nullable: true },
            care_level: { type: "integer", nullable: true },
            notes: { type: "string", nullable: true },
            archived: { type: "boolean" },
            created_at: { type: "string", format: "date-time" },
            updated_at: { type: "string", format: "date-time" },
            property_count: { type: "integer" },
            assignment_count: { type: "integer" },
            ytd_invoiced_cents: { type: "integer" },
          },
        },
        Property: {
          type: "object",
          required: [
            "id",
            "name",
            "address",
            "kind",
            "client_id",
            "client_name",
            "assignments_per_week",
            "status",
            "is_new",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            address: { type: "string" },
            kind: {
              type: "string",
              enum: [
                "office",
                "retail",
                "residential",
                "medical",
                "industrial",
                "other",
              ],
            },
            client_id: { type: "string", format: "uuid" },
            client_name: { type: "string" },
            assignments_per_week: { type: "integer" },
            status: {
              type: "string",
              enum: ["active", "onboarding", "attention", "paused"],
            },
            team_lead_id: { type: "string", nullable: true },
            team_lead_name: { type: "string", nullable: true },
            is_new: { type: "boolean" },
          },
        },
        PropertyDetail: {
          type: "object",
          required: ["id", "name", "client_id", "kind", "created_at"],
          properties: {
            id: { type: "string", format: "uuid" },
            name: { type: "string" },
            address_line1: { type: "string" },
            address_line2: { type: "string", nullable: true },
            postal_code: { type: "string" },
            city: { type: "string" },
            country: { type: "string" },
            size_sqm: { type: "number", nullable: true },
            notes: { type: "string", nullable: true },
            client_id: { type: "string", format: "uuid" },
            client_name: { type: "string" },
            client_type: { type: "string" },
            kind: {
              type: "string",
              enum: [
                "office",
                "retail",
                "residential",
                "medical",
                "industrial",
                "other",
              ],
            },
            status: {
              type: "string",
              nullable: true,
              enum: ["active", "onboarding", "attention", "paused"],
            },
            weekly_frequency: { type: "integer" },
            team_size: { type: "integer" },
            assignment_count: { type: "integer" },
            created_at: { type: "string", format: "date-time" },
          },
        },
        Employee: {
          type: "object",
          required: ["id", "full_name", "status", "role_chip"],
          properties: {
            id: { type: "string", format: "uuid" },
            full_name: { type: "string" },
            email: { type: "string", nullable: true },
            phone: { type: "string", nullable: true },
            hire_year: { type: "integer", nullable: true },
            languages: {
              type: "array",
              items: { type: "string", enum: ["de", "en", "ta"] },
            },
            role_chip: { type: "string", enum: ["pm", "field", "trainee"] },
            hours_this_week: { type: "integer" },
            weekly_target: { type: "integer" },
            status: {
              type: "string",
              enum: ["active", "on_leave", "inactive", "overtime"],
            },
            vacation_used: { type: "integer" },
            vacation_total: { type: "integer" },
          },
        },
        EmployeeDetail: {
          type: "object",
          required: ["id", "full_name", "status", "role_chip", "weekly_hours"],
          properties: {
            id: { type: "string", format: "uuid" },
            full_name: { type: "string" },
            email: { type: "string", nullable: true },
            phone: { type: "string", nullable: true },
            hire_date: { type: "string", format: "date", nullable: true },
            status: {
              type: "string",
              enum: ["active", "on_leave", "inactive"],
            },
            role_chip: { type: "string", enum: ["pm", "field", "trainee"] },
            auth_role: {
              type: "string",
              nullable: true,
              enum: ["admin", "dispatcher", "employee"],
            },
            hourly_rate_eur: { type: "number", nullable: true },
            weekly_hours: { type: "number" },
            hours_this_week: { type: "integer" },
            hours_this_month: { type: "integer" },
            shifts_this_month: { type: "integer" },
            shifts_total: { type: "integer" },
            upcoming_shifts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  starts_at: { type: "string", format: "date-time" },
                  property_name: { type: "string" },
                  client_name: { type: "string" },
                  duration_h: { type: "number" },
                },
              },
            },
            recent_time_entries: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string", format: "uuid" },
                  check_in_at: { type: "string", format: "date-time" },
                  check_out_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                  },
                  property_name: { type: "string" },
                  hours: { type: "number" },
                },
              },
            },
          },
        },
        Shift: {
          type: "object",
          required: [
            "id",
            "title",
            "property_id",
            "client_id",
            "service_lane",
            "status",
            "starts_at",
            "ends_at",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            title: { type: "string" },
            property_id: { type: "string", format: "uuid" },
            property_name: { type: "string" },
            client_id: { type: "string", format: "uuid" },
            client_name: { type: "string" },
            service_lane: {
              type: "string",
              enum: ["priyas", "alltagshilfe"],
            },
            status: {
              type: "string",
              enum: [
                "scheduled",
                "in_progress",
                "completed",
                "cancelled",
                "no_show",
              ],
            },
            starts_at: { type: "string", format: "date-time" },
            ends_at: { type: "string", format: "date-time" },
            employee_id: {
              type: "string",
              format: "uuid",
              nullable: true,
            },
            notes: { type: "string", nullable: true },
          },
        },
        Invoice: {
          type: "object",
          required: [
            "id",
            "invoice_number",
            "client_id",
            "status",
            "issue_date",
            "total_cents",
          ],
          properties: {
            id: { type: "string", format: "uuid" },
            invoice_number: { type: "string" },
            client_id: { type: "string", format: "uuid" },
            client_name: { type: "string" },
            status: {
              type: "string",
              enum: ["draft", "sent", "paid", "overdue", "cancelled"],
            },
            issue_date: { type: "string", format: "date" },
            due_date: { type: "string", format: "date", nullable: true },
            total_cents: { type: "integer" },
            paid_at: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            lexware_id: { type: "string", nullable: true },
            days_overdue: { type: "integer", nullable: true },
          },
        },
      },
    },
  };

  return NextResponse.json(spec, {
    headers: { "cache-control": "public, max-age=300" },
  });
}
