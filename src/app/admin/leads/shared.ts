import "server-only";
import type { CurrentUser } from "@/modules/auth/current";
import { getSelectableBranches } from "@/modules/auth/current";
import { leadFormOptions } from "@/modules/leads/leads.queries";
import { can, canAccessBranch } from "@/modules/rbac/access";
import type { LeadFormOptions } from "./lead-form";

/** Options for the lead forms and filters, limited to branches the user works with. */
export async function leadPageOptions(user: CurrentUser) {
  const branches = (await getSelectableBranches(user)).filter((b) => canAccessBranch(user.access, "leads.view", b.id));
  const opts = await leadFormOptions(
    user,
    branches.map((b) => b.id),
  );
  const form: LeadFormOptions = {
    branches: branches
      .filter((b) => canAccessBranch(user.access, "leads.create", b.id))
      .map((b) => ({ value: b.id, label: b.name })),
    sources: opts.sources,
    courses: opts.courses,
    deviceTypes: opts.deviceTypes,
    assignees: opts.assignees,
    canAssign: can(user.access, "leads.assign"),
  };
  return { ...opts, form };
}
