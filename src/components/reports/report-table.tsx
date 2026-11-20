import { formatDate, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Column, Row } from "@/modules/reports/reports";

export function formatCell(col: Column, v: Row[string]) {
  if (v === null || v === undefined || v === "") return "—";
  if (col.type === "money") return formatINR(Number(v));
  if (col.type === "date") return formatDate(String(v));
  if (col.type === "percent") return `${v}%`;
  if (col.type === "number") return Number(v).toLocaleString("en-IN");
  return String(v);
}

const right = (c: Column) => c.type === "money" || c.type === "number" || c.type === "percent";

/** Plain table (no client JS) so it prints well too. */
export function ReportTable({ columns, rows, totals, compact }: { columns: Column[]; rows: Row[]; totals: Row; compact?: boolean }) {
  const hasTotals = columns.some((c) => c.total);
  return (
    <table className={cn("w-full border-collapse", compact ? "text-xs" : "text-sm")}>
      <thead>
        <tr className="border-b text-left">
          {columns.map((c) => (
            <th key={c.key} className={cn("px-2 py-2 font-medium whitespace-nowrap text-muted-foreground", right(c) && "text-right")}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={columns.length} className="px-2 py-10 text-center text-muted-foreground">
              Nothing for this period.
            </td>
          </tr>
        )}
        {rows.map((r, i) => (
          <tr key={i} className="border-b last:border-0">
            {columns.map((c) => (
              <td key={c.key} className={cn("px-2 py-1.5", right(c) && "text-right tabular-nums whitespace-nowrap")}>
                {formatCell(c, r[c.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
      {hasTotals && rows.length > 0 && (
        <tfoot>
          <tr className="border-t-2 font-semibold">
            {columns.map((c, i) => (
              <td key={c.key} className={cn("px-2 py-2", right(c) && "text-right tabular-nums whitespace-nowrap")}>
                {c.total ? formatCell(c, totals[c.key] ?? 0) : i === 0 ? `Total (${rows.length})` : ""}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
  );
}
