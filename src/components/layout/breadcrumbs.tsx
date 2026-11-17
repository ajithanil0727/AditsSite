"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { SEGMENT_LABELS } from "./nav-config";

export function Breadcrumbs() {
  const segments = usePathname().split("/").filter(Boolean);
  const crumbs = segments.map((segment, i) => ({
    href: "/" + segments.slice(0, i + 1).join("/"),
    label: SEGMENT_LABELS[segment] ?? "Details",
  }));
  // "/admin/settings" has no page of its own: render it as plain text.
  return (
    <Breadcrumb className="hidden md:block">
      <BreadcrumbList>
        {crumbs.map((c, i) => (
          <Fragment key={c.href}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {i === crumbs.length - 1 || c.href === "/admin/settings" ? (
                <BreadcrumbPage>{c.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink asChild>
                  <Link href={c.href}>{c.label}</Link>
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
