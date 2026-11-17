/** Parse list-page search params (search, paging, sorting, show deleted). Shared by all admin lists. */
export type ListParams = {
  q: string;
  page: number;
  pageSize: number;
  sort: string | null;
  dir: "asc" | "desc";
  showDeleted: boolean;
  filters: Record<string, string>;
};

const PAGE_SIZES = [10, 20, 50, 100];

export function parseListParams(
  sp: Record<string, string | string[] | undefined>,
  opts: { sortable?: readonly string[]; defaultPageSize?: number } = {},
): ListParams {
  const one = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const page = Math.max(1, Number.parseInt(one("page") ?? "1", 10) || 1);
  const size = Number.parseInt(one("size") ?? "", 10);
  const sort = one("sort") ?? null;
  const filters: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (k.startsWith("f_") && typeof v === "string" && v) filters[k.slice(2)] = v;
  }
  return {
    q: (one("q") ?? "").trim().slice(0, 100),
    page,
    pageSize: PAGE_SIZES.includes(size) ? size : (opts.defaultPageSize ?? 20),
    sort: sort && opts.sortable?.includes(sort) ? sort : null,
    dir: one("dir") === "desc" ? "desc" : "asc",
    showDeleted: one("deleted") === "1",
    filters,
  };
}

export function paging(p: ListParams) {
  return { skip: (p.page - 1) * p.pageSize, take: p.pageSize };
}
