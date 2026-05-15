/**
 * Exporter registry. Resolves a client's `export_target` to a concrete
 * exporter instance. Add new providers by extending the switch below.
 */
import "server-only";
import { InternalExporter } from "./internal";
import { LexwareExporter } from "./lexware";
import type { ExporterId, InvoiceExporter } from "./types";

export type { ExporterId, ExportableInvoice, ExportResult, InvoiceExporter }
  from "./types";

export function resolveExporter(target: ExporterId): InvoiceExporter {
  switch (target) {
    case "lexware":
      return new LexwareExporter();
    case "internal":
    default:
      return new InternalExporter();
  }
}
