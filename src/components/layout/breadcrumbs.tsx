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
import { NON_LINK_SEGMENTS, SEGMENT_LABELS } from "./nav-config";

export function Breadcrumbs() {
  const segments = usePathname().split("/").filter(Boolean);
  const crumbs = segments.map((segment, i) => ({
    href: "/" + segments.slice(0, i + 1).join("/"),
    label: SEGMENT_LABELS[segment] ?? "Details",
  }));
  return (
    <Breadcrumb className="hidden md:block">
      <BreadcrumbList>
        {crumbs.map((c, i) => (
          <Fragment key={c.href}>
            {i > 0 && <BreadcrumbSeparator />}
            <BreadcrumbItem>
              {i === crumbs.length - 1 || NON_LINK_SEGMENTS.has(c.href) ? (
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
