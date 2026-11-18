import type { Metadata } from "next";
import { ArrowRightIcon, MessageCircleIcon, PencilIcon, PhoneIcon } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { StatusBadge, toTone } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatDateTime } from "@/lib/format";
import { requirePagePermission } from "@/modules/auth/current";
import { whatsappLink } from "@/modules/leads/lead-logic";
import { ACTIVITY_LABELS, LEAD_TYPE_LABELS } from "@/modules/leads/leads.schemas";
import { getLead } from "@/modules/leads/leads.queries";
import { LeadFormDialog } from "../lead-form";
import { leadPageOptions } from "../shared";
import { ActivityForm, AssignSelect, DeleteLead, StatusDialog } from "./lead-actions";

export const metadata: Metadata = { title: "Enquiry" };

/** "YYYY-MM-DDTHH:mm" in IST for <input type="datetime-local">. */
const toLocalInput = (d: Date | null) => (d ? new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16) : "");

const KIND_TONE: Record<string, string> = {
  CALL: "bg-sky text-sky-foreground",
  VISIT: "bg-mint text-mint-foreground",
  WHATSAPP: "bg-mint text-mint-foreground",
  NOTE: "bg-secondary text-secondary-foreground",
  STATUS_CHANGE: "bg-lavender text-lavender-foreground",
  ASSIGNMENT: "bg-secondary text-secondary-foreground",
  ENQUIRY: "bg-peach text-peach-foreground",
  CONVERSION: "bg-mint text-mint-foreground",
};

export default async function LeadPage(props: PageProps<"/admin/leads/[id]">) {
  const user = await requirePagePermission("leads.view");
  const { id } = await props.params;
  const lead = await getLead(user, id);
  if (!lead) notFound();
  const sp = await props.searchParams;
  const opts = await leadPageOptions(user);
  const converted = lead.enrollment || lead.jobCard;
  const convertHref =
    lead.type === "COURSE" ? `/admin/students/new?lead=${lead.id}` : `/admin/service/intake?lead=${lead.id}`;
  const assignees = opts.assignees.filter((a) => !a.branchIds || a.branchIds.includes(lead.branchId));

  return (
    <>
      {sp.merged && (
        <p className="mb-4 rounded-md bg-peach px-3 py-2 text-sm text-peach-foreground">
          This number already had an open enquiry, so the new one was added to it.
        </p>
      )}
      <PageHeader
        title={lead.name}
        description={`${LEAD_TYPE_LABELS[lead.type]} enquiry · ${lead.branch.name} · received ${formatDate(lead.createdAt)} via ${lead.source.name}${lead.enquiryCount > 1 ? ` · enquired ${lead.enquiryCount} times` : ""}`}
        actions={
          <>
            <Button asChild variant="outline">
              <a href={`tel:+91${lead.phone}`}>
                <PhoneIcon /> Call
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={whatsappLink(lead.phone)} target="_blank" rel="noopener noreferrer">
                <MessageCircleIcon /> WhatsApp
              </a>
            </Button>
            {lead.canEdit && !lead.deletedAt && (
              <LeadFormDialog
                options={{
                  ...opts.form,
                  branches: opts.form.branches.some((b) => b.value === lead.branchId)
                    ? opts.form.branches
                    : [...opts.form.branches, { value: lead.branch.id, label: lead.branch.name }],
                }}
                initial={{
                  id: lead.id,
                  type: lead.type,
                  branchId: lead.branchId,
                  sourceId: lead.sourceId,
                  name: lead.name,
                  phone: lead.phone,
                  altPhone: lead.altPhone ?? "",
                  email: lead.email ?? "",
                  city: lead.city ?? "",
                  courseId: lead.courseId,
                  deviceTypeId: lead.deviceTypeId,
                  deviceText: lead.deviceText ?? "",
                  problemText: lead.problemText ?? "",
                  message: lead.message ?? "",
                  assignedToId: null,
                  nextFollowUpAt: toLocalInput(lead.nextFollowUpAt),
                }}
                trigger={
                  <Button variant="outline">
                    <PencilIcon /> Edit
                  </Button>
                }
              />
            )}
            {lead.canDelete && <DeleteLead leadId={lead.id} deleted={!!lead.deletedAt} />}
          </>
        }
      />

      {lead.deletedAt && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">This enquiry is deleted.</p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-6">
          {lead.isOpen && lead.canEdit && !lead.deletedAt && (
            <Card>
              <CardHeader>
                <CardTitle>Log follow-up</CardTitle>
              </CardHeader>
              <CardContent>
                <ActivityForm
                  leadId={lead.id}
                  nextFollowUp={lead.nextFollowUpAt ? formatDateTime(lead.nextFollowUpAt) : ""}
                />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="grid gap-4">
                {lead.activities.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span
                      className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${KIND_TONE[a.kind] ?? ""}`}
                    >
                      {ACTIVITY_LABELS[a.kind] ?? a.kind}
                    </span>
                    <div className="min-w-0 flex-1">
                      {a.note && <p className="text-sm whitespace-pre-wrap">{a.note}</p>}
                      {a.followUpAt && (
                        <p className="text-xs text-muted-foreground">Next follow-up {formatDateTime(a.followUpAt)}</p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDateTime(a.createdAt)} · {a.user?.name ?? "Website"}
                      </p>
                    </div>
                  </li>
                ))}
                <li className="flex gap-3">
                  <span className="h-fit shrink-0 rounded-full bg-sky px-2 py-0.5 text-xs font-medium text-sky-foreground">
                    Received
                  </span>
                  <div className="text-sm">
                    {lead.message && <p className="whitespace-pre-wrap">{lead.message}</p>}
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(lead.createdAt)} · {lead.source.name}
                    </p>
                  </div>
                </li>
              </ol>
            </CardContent>
          </Card>
        </div>

        <div className="grid content-start gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Status</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex items-center justify-between gap-2">
                <StatusBadge tone={toTone(lead.status.color)}>{lead.status.name}</StatusBadge>
                {lead.canEdit && !lead.deletedAt && (
                  <StatusDialog leadId={lead.id} statuses={opts.statuses} currentId={lead.statusId} />
                )}
              </div>
              {lead.lostReason && <p className="text-sm text-muted-foreground">Lost: {lead.lostReason}</p>}
              {lead.nextFollowUpAt && lead.isOpen && (
                <p className={lead.overdue ? "text-sm font-medium text-destructive" : "text-sm"}>
                  Next follow-up: {formatDateTime(lead.nextFollowUpAt)}
                  {lead.overdue && " (overdue)"}
                </p>
              )}
              <div className="grid gap-1.5">
                <span className="text-sm font-medium">Counsellor</span>
                {lead.canAssign && !lead.deletedAt ? (
                  <AssignSelect
                    leadId={lead.id}
                    current={lead.assignedToId}
                    options={assignees.map((a) => ({ value: a.value, label: a.label }))}
                  />
                ) : (
                  <span className="text-sm">{lead.assignedTo?.name ?? "Unassigned"}</span>
                )}
              </div>
              {converted ? (
                <div className="rounded-md bg-mint px-3 py-2 text-sm text-mint-foreground">
                  Converted {lead.convertedAt ? formatDate(lead.convertedAt) : ""}:{" "}
                  {lead.enrollment ? (
                    <Link href={`/admin/students/${lead.enrollment.studentId}`} className="font-medium underline">
                      {lead.enrollment.course.name} admission
                    </Link>
                  ) : (
                    <Link href={`/admin/service/jobs/${lead.jobCard!.id}`} className="font-medium underline">
                      job {lead.jobCard!.jobNo}
                    </Link>
                  )}
                </div>
              ) : (
                lead.canConvert &&
                !lead.deletedAt && (
                  <Button asChild>
                    <Link href={convertHref}>
                      {lead.type === "COURSE" ? "Convert: admit student" : "Convert: open job card"} <ArrowRightIcon />
                    </Link>
                  </Button>
                )
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                <dt className="text-muted-foreground">Phone</dt>
                <dd>
                  {lead.phone}
                  {lead.altPhone ? `, ${lead.altPhone}` : ""}
                </dd>
                {lead.email && (
                  <>
                    <dt className="text-muted-foreground">Email</dt>
                    <dd className="break-all">{lead.email}</dd>
                  </>
                )}
                {lead.city && (
                  <>
                    <dt className="text-muted-foreground">City</dt>
                    <dd>{lead.city}</dd>
                  </>
                )}
                {lead.type === "COURSE" ? (
                  <>
                    <dt className="text-muted-foreground">Course</dt>
                    <dd>{lead.course?.name ?? "Not decided"}</dd>
                  </>
                ) : (
                  <>
                    <dt className="text-muted-foreground">Device</dt>
                    <dd>{[lead.deviceType?.name, lead.deviceText].filter(Boolean).join(" · ") || "—"}</dd>
                    <dt className="text-muted-foreground">Problem</dt>
                    <dd>{lead.problemText || "—"}</dd>
                  </>
                )}
              </dl>
              {(lead.student || lead.customer) && (
                <div className="mt-4 grid gap-1 border-t pt-3 text-sm">
                  {lead.student && (
                    <Link href={`/admin/students/${lead.student.id}`} className="hover:underline">
                      Already a student: {lead.student.name} ({lead.student.studentCode})
                    </Link>
                  )}
                  {lead.customer && (
                    <Link href={`/admin/service/customers/${lead.customer.id}`} className="hover:underline">
                      Service customer: {lead.customer.name}
                    </Link>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {lead.others.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Other enquiries from this number</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {lead.others.map((o) => (
                  <Link
                    key={o.id}
                    href={`/admin/leads/${o.id}`}
                    className="flex items-center justify-between gap-2 text-sm hover:underline"
                  >
                    <span>
                      {LEAD_TYPE_LABELS[o.type]} · {formatDate(o.createdAt)}
                    </span>
                    <StatusBadge tone={toTone(o.status.color)}>{o.status.name}</StatusBadge>
                  </Link>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
