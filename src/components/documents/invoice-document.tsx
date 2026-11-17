import { amountInWords, formatDate, formatINR } from "@/lib/format";
import { stateName } from "@/lib/india-states";

type Num = { toString(): string };
type Seller = {
  name?: string;
  tradeName?: string;
  branchName?: string;
  address?: string;
  phone?: string;
  email?: string | null;
  gstin?: string | null;
  stateCode?: string;
  stateName?: string | null;
};

export type InvoiceDoc = {
  kind: string;
  status: string;
  invoiceNo: string;
  invoiceDate: Date;
  sellerSnapshot: unknown;
  customerName: string;
  customerPhone: string | null;
  customerAddress: string | null;
  customerGstin: string | null;
  placeOfSupply: string | null;
  isInterState: boolean;
  subtotal: Num;
  cgstTotal: Num;
  sgstTotal: Num;
  igstTotal: Num;
  roundOff: Num;
  grandTotal: Num;
  amountPaid: Num;
  cancelReason: string | null;
  items: {
    id: string;
    description: string;
    hsnSac: string | null;
    qty: Num;
    unitPrice: Num;
    taxableValue: Num;
    taxRate: Num;
    cgst: Num;
    sgst: Num;
    igst: Num;
    total: Num;
  }[];
  jobCard: {
    jobNo: string;
    device: {
      imei: string | null;
      serialNo: string | null;
      modelText: string | null;
      brand: { name: string } | null;
      model: { name: string } | null;
    };
  } | null;
};

const n = (v: Num) => Number(v.toString());

/** A4 tax invoice / non-GST invoice. Used on screen and on the print page. */
export function InvoiceDocument({
  inv,
  logoUrl,
  terms,
}: {
  inv: InvoiceDoc;
  logoUrl?: string | null;
  terms?: string | null;
}) {
  const seller = (inv.sellerSnapshot ?? {}) as Seller;
  const gst = inv.kind === "TAX_INVOICE";
  const device = inv.jobCard
    ? [
        inv.jobCard.device.brand?.name,
        inv.jobCard.device.model?.name ?? inv.jobCard.device.modelText,
        inv.jobCard.device.imei
          ? `IMEI ${inv.jobCard.device.imei}`
          : inv.jobCard.device.serialNo
            ? `S/N ${inv.jobCard.device.serialNo}`
            : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : null;
  const due = Math.round((n(inv.grandTotal) - n(inv.amountPaid)) * 100) / 100;

  return (
    <article className="relative mx-auto max-w-[210mm] bg-card p-6 text-[13px] leading-snug text-card-foreground sm:p-8">
      {inv.status === "CANCELLED" && (
        <div className="mb-4 rounded-md border-2 border-destructive px-3 py-2 text-center font-semibold text-destructive">
          CANCELLED{inv.cancelReason ? `: ${inv.cancelReason}` : ""}
        </div>
      )}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {logoUrl && <img src={logoUrl} alt="" className="size-14 object-contain" />}
          <div>
            <div className="text-lg font-bold">{seller.tradeName || seller.name}</div>
            {seller.tradeName && seller.name && seller.tradeName !== seller.name && <div>{seller.name}</div>}
            <div className="text-muted-foreground">{seller.address}</div>
            <div className="text-muted-foreground">{[seller.phone, seller.email].filter(Boolean).join(" · ")}</div>
            {seller.gstin && <div className="font-medium">GSTIN: {seller.gstin}</div>}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tracking-wide">{gst ? "TAX INVOICE" : "INVOICE"}</div>
          <div className="mt-1">
            No. <span className="font-mono font-semibold">{inv.invoiceNo}</span>
          </div>
          <div>Date {formatDate(inv.invoiceDate)}</div>
          {gst && inv.placeOfSupply && (
            <div>
              Place of supply: {stateName(inv.placeOfSupply)} ({inv.placeOfSupply})
            </div>
          )}
        </div>
      </header>

      <section className="grid gap-4 border-b py-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase">Bill to</div>
          <div className="font-semibold">{inv.customerName}</div>
          {inv.customerAddress && <div>{inv.customerAddress}</div>}
          {inv.customerPhone && <div>{inv.customerPhone}</div>}
          {inv.customerGstin && <div>GSTIN: {inv.customerGstin}</div>}
        </div>
        {inv.jobCard && (
          <div className="sm:text-right">
            <div className="text-xs font-medium text-muted-foreground uppercase">Repair</div>
            <div>
              Job card <span className="font-mono">{inv.jobCard.jobNo}</span>
            </div>
            {device && <div>{device}</div>}
          </div>
        )}
      </section>

      <div className="overflow-x-auto py-4">
        <table className="w-full border-collapse text-[12px]">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1 pr-2">#</th>
              <th className="py-1 pr-2">Description</th>
              {gst && <th className="py-1 pr-2">HSN/SAC</th>}
              <th className="py-1 pr-2 text-right">Qty</th>
              <th className="py-1 pr-2 text-right">Rate</th>
              {gst && <th className="py-1 pr-2 text-right">Taxable</th>}
              {gst && !inv.isInterState && <th className="py-1 pr-2 text-right">CGST</th>}
              {gst && !inv.isInterState && <th className="py-1 pr-2 text-right">SGST</th>}
              {gst && inv.isInterState && <th className="py-1 pr-2 text-right">IGST</th>}
              <th className="py-1 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((i, idx) => (
              <tr key={i.id} className="border-b align-top">
                <td className="py-1.5 pr-2">{idx + 1}</td>
                <td className="py-1.5 pr-2">{i.description}</td>
                {gst && <td className="py-1.5 pr-2 font-mono">{i.hsnSac ?? ""}</td>}
                <td className="py-1.5 pr-2 text-right tabular-nums">{n(i.qty)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{n(i.unitPrice).toFixed(2)}</td>
                {gst && <td className="py-1.5 pr-2 text-right tabular-nums">{n(i.taxableValue).toFixed(2)}</td>}
                {gst && !inv.isInterState && (
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {n(i.cgst).toFixed(2)}
                    <div className="text-[10px] text-muted-foreground">{n(i.taxRate) / 2}%</div>
                  </td>
                )}
                {gst && !inv.isInterState && (
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {n(i.sgst).toFixed(2)}
                    <div className="text-[10px] text-muted-foreground">{n(i.taxRate) / 2}%</div>
                  </td>
                )}
                {gst && inv.isInterState && (
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {n(i.igst).toFixed(2)}
                    <div className="text-[10px] text-muted-foreground">{n(i.taxRate)}%</div>
                  </td>
                )}
                <td className="py-1.5 text-right tabular-nums">{n(i.total).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="flex flex-wrap justify-between gap-6">
        <div className="max-w-sm space-y-2">
          <div>
            <span className="text-muted-foreground">Amount in words: </span>
            <span className="font-medium">{amountInWords(n(inv.grandTotal))}</span>
          </div>
          {!gst && (
            <div className="text-xs text-muted-foreground">
              This branch is not registered under GST; no GST has been charged.
            </div>
          )}
          {gst && <div className="text-xs text-muted-foreground">Prices are inclusive of GST.</div>}
        </div>
        <dl className="grid min-w-56 grid-cols-2 gap-x-6 gap-y-0.5">
          {gst && (
            <>
              <dt className="text-muted-foreground">Taxable value</dt>
              <dd className="text-right tabular-nums">{n(inv.subtotal).toFixed(2)}</dd>
            </>
          )}
          {gst && !inv.isInterState && (
            <>
              <dt className="text-muted-foreground">CGST</dt>
              <dd className="text-right tabular-nums">{n(inv.cgstTotal).toFixed(2)}</dd>
              <dt className="text-muted-foreground">SGST</dt>
              <dd className="text-right tabular-nums">{n(inv.sgstTotal).toFixed(2)}</dd>
            </>
          )}
          {gst && inv.isInterState && (
            <>
              <dt className="text-muted-foreground">IGST</dt>
              <dd className="text-right tabular-nums">{n(inv.igstTotal).toFixed(2)}</dd>
            </>
          )}
          {n(inv.roundOff) !== 0 && (
            <>
              <dt className="text-muted-foreground">Round off</dt>
              <dd className="text-right tabular-nums">{n(inv.roundOff).toFixed(2)}</dd>
            </>
          )}
          <dt className="border-t pt-1 font-semibold">Total</dt>
          <dd className="border-t pt-1 text-right font-semibold tabular-nums">{formatINR(n(inv.grandTotal))}</dd>
          <dt className="text-muted-foreground">Received</dt>
          <dd className="text-right tabular-nums">{formatINR(n(inv.amountPaid))}</dd>
          <dt className="font-medium">Balance</dt>
          <dd className="text-right font-medium tabular-nums">{formatINR(due)}</dd>
        </dl>
      </section>

      <footer className="mt-10 flex flex-wrap items-end justify-between gap-6 border-t pt-4 text-xs text-muted-foreground">
        <div className="max-w-md whitespace-pre-wrap">
          {terms ??
            "Repair warranty as per the job card. Physical/liquid damage voids warranty. Goods once delivered are not taken back."}
        </div>
        <div className="text-right">
          <div className="mb-10">For {seller.tradeName || seller.name}</div>
          <div>Authorised signatory</div>
        </div>
      </footer>
    </article>
  );
}
