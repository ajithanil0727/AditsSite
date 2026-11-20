import type { Metadata } from "next";
import { DownloadIcon } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatINR } from "@/lib/format";
import { getActiveBranchId, requirePagePermission } from "@/modules/auth/current";
import { dayBook, moneyFormOptions } from "@/modules/accounts/accounts.queries";
import { can } from "@/modules/rbac/access";
import { PeriodPicker } from "../period-picker";
import { parsePeriod, periodPresets } from "../period";
import { AccountFilter, ContraDialog } from "./daybook-controls";

export const metadata: Metadata = { title: "Day book" };

export default async function DayBookPage(props: PageProps<"/admin/accounts/daybook">) {
  const user = await requirePagePermission("accounts.view_daybook");
  const sp = await props.searchParams;
  const today = periodPresets().today;
  const { from, to, presets } = parsePeriod(sp, { from: today, to: today });
  const accountId = typeof sp.account === "string" ? sp.account : null;
  const [book, options] = await Promise.all([
    dayBook(user, { from, to, accountId, activeBranchId: await getActiveBranchId(user) }),
    moneyFormOptions(user, "accounts.contra"),
  ]);
  const single = !!accountId;
  const qs = new URLSearchParams({ from, to, ...(accountId ? { account: accountId } : {}) });
  return (
    <>
      <PageHeader
        title="Day book"
        description="Every rupee in and out of each cash and bank account: fees, repair payments, expenses, refunds, partner money and transfers."
        actions={
          <>
            {can(user.access, "accounts.contra") && options.accounts.length > 1 && (
              <ContraDialog accounts={options.accounts} today={presets.today} />
            )}
            <Button asChild variant="outline">
              <a href={`/api/export/daybook?${qs}`}>
                <DownloadIcon /> Excel
              </a>
            </Button>
          </>
        }
      />
      <PeriodPicker from={from} to={to} presets={presets}>
        <AccountFilter accounts={book.accounts} value={accountId} />
      </PeriodPicker>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Opening balance", book.totals.opening],
          ["Money in", book.totals.inflow],
          ["Money out", book.totals.outflow],
          ["Closing balance", book.totals.closing],
        ].map(([label, v]) => (
          <Card key={label as string} className="py-4">
            <CardContent>
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="text-xl font-semibold tabular-nums">{formatINR(v as number)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {!single && book.balances.length > 1 && (
        <div className="mb-6 overflow-x-auto rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Account</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">In</TableHead>
                <TableHead className="text-right">Out</TableHead>
                <TableHead className="text-right">Closing</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {book.balances.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <a
                      href={`?${new URLSearchParams({ from, to, account: b.id })}`}
                      className="font-medium hover:underline"
                    >
                      {b.name}
                    </a>
                    <span className="ml-1 text-xs text-muted-foreground">{b.branchCode}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(b.opening)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(b.inflow)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatINR(b.outflow)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatINR(b.closing)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Entry</TableHead>
              {!single && <TableHead className="hidden md:table-cell">Account</TableHead>}
              <TableHead className="text-right">In</TableHead>
              <TableHead className="text-right">Out</TableHead>
              {single && <TableHead className="text-right">Balance</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {book.rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  No money moved in this period.
                </TableCell>
              </TableRow>
            )}
            {book.rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">{formatDate(r.date)}</TableCell>
                <TableCell>
                  <div className="font-medium">
                    {r.source}
                    {r.category ? ` · ${r.category}` : ""}
                  </div>
                  {r.narration && <div className="max-w-md truncate text-xs text-muted-foreground">{r.narration}</div>}
                </TableCell>
                {!single && <TableCell className="hidden text-sm md:table-cell">{r.account}</TableCell>}
                <TableCell className="text-right text-success tabular-nums">
                  {r.inflow ? formatINR(r.inflow) : ""}
                </TableCell>
                <TableCell className="text-right tabular-nums">{r.outflow ? formatINR(r.outflow) : ""}</TableCell>
                {single && <TableCell className="text-right tabular-nums">{formatINR(r.balance)}</TableCell>}
              </TableRow>
            ))}
          </TableBody>
          {book.rows.length > 0 && (
            <TableFooter>
              <TableRow>
                <TableCell colSpan={single ? 2 : 3} className="font-medium">
                  Total
                </TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatINR(book.totals.inflow)}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{formatINR(book.totals.outflow)}</TableCell>
                {single && (
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatINR(book.totals.closing)}
                  </TableCell>
                )}
              </TableRow>
            </TableFooter>
          )}
        </Table>
      </div>
      {book.truncated && (
        <p className="mt-2 text-sm text-muted-foreground">
          Showing the first 2,000 entries. Narrow the dates or pick one account.
        </p>
      )}
    </>
  );
}
