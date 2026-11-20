import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/modules/auth/current";
import { globalSearch } from "@/modules/search/search.queries";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage(props: PageProps<"/admin/search">) {
  const user = await requireUser();
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const groups = await globalSearch(user, q);
  return (
    <>
      <PageHeader title="Search" description="Students, enquiries, job cards, customers, invoices and receipts you can see." />
      <form className="mb-6" action="/admin/search">
        <input
          type="search"
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="Name, phone, student ID, job no., invoice no., receipt no., IMEI…"
          aria-label="Search for"
          className="h-10 w-full max-w-xl rounded-md border bg-background px-3 text-sm"
        />
      </form>
      {q.trim().length < 2 ? (
        <p className="text-sm text-muted-foreground">Type at least 2 characters.</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing found for “{q}”.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {groups.map((g) => (
            <Card key={g.key}>
              <CardHeader>
                <CardTitle className="text-base">{g.label}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y text-sm">
                  {g.hits.map((h) => (
                    <li key={h.id}>
                      <Link href={h.href} className="block py-2 hover:underline">
                        <span className="font-medium">{h.title}</span>
                        <span className="block text-xs text-muted-foreground">{h.sub}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
