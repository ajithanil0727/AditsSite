"use client";

import { Trash2Icon } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERMISSION_MODULES, type PermissionKey } from "@/lib/permissions";
import { deleteRoleAction, updateRoleAction } from "@/modules/roles/roles.actions";

type Role = {
  id: string;
  name: string;
  description: string;
  isSystem: boolean;
  discountLimitPercent: number;
  discountLimitAmount: number;
  permissions: string[];
};

export function PermissionMatrix({
  role,
  canManage,
  ownPermissions,
}: {
  role: Role;
  canManage: boolean;
  ownPermissions: string[];
}) {
  const [selected, setSelected] = useState(() => new Set(role.permissions));
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [pct, setPct] = useState(String(role.discountLimitPercent));
  const [amt, setAmt] = useState(String(role.discountLimitAmount));
  const [filter, setFilter] = useState("");
  const [pending, startTransition] = useTransition();
  const own = useMemo(() => new Set(ownPermissions), [ownPermissions]);

  const modules = Object.entries(PERMISSION_MODULES).filter(([, m]) =>
    m.label.toLowerCase().includes(filter.trim().toLowerCase()),
  );
  const editable = (key: string) => canManage && own.has(key);
  const toggle = (key: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const save = () =>
    startTransition(async () => {
      const res = await updateRoleAction({
        id: role.id,
        name,
        description,
        discountLimitPercent: pct,
        discountLimitAmount: amt,
        permissions: [...selected],
      });
      if (res.ok) toast.success("Role saved");
      else toast.error(res.error);
    });

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
          <CardDescription>
            Discount limit: the most this role can give without approval. 0 = every discount needs approval.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-2">
            <Label htmlFor="role-name">Name</Label>
            <Input id="role-name" value={name} disabled={!canManage} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role-desc">Description</Label>
            <Input
              id="role-desc"
              value={description}
              disabled={!canManage}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role-pct">Discount limit (%)</Label>
            <Input
              id="role-pct"
              type="number"
              min={0}
              max={100}
              value={pct}
              disabled={!canManage}
              onChange={(e) => setPct(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="role-amt">Discount limit (₹)</Label>
            <Input
              id="role-amt"
              type="number"
              min={0}
              value={amt}
              disabled={!canManage}
              onChange={(e) => setAmt(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Permissions</CardTitle>
            <CardDescription>
              {selected.size} selected. Greyed-out boxes are permissions you don&apos;t have yourself.
            </CardDescription>
          </div>
          <Input
            placeholder="Filter modules…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="sm:w-56"
          />
        </CardHeader>
        <CardContent className="divide-y">
          {modules.map(([moduleKey, mod]) => {
            const keys = Object.keys(mod.actions).map((a) => `${moduleKey}.${a}` as PermissionKey);
            const allOn = keys.every((k) => selected.has(k));
            const someOn = keys.some((k) => selected.has(k));
            const allEditable = keys.every(editable);
            return (
              <div key={moduleKey} className="grid gap-3 py-3 md:grid-cols-[14rem_1fr]">
                <label className="flex items-center gap-2 font-medium">
                  <Checkbox
                    checked={allOn ? true : someOn ? "indeterminate" : false}
                    disabled={!allEditable}
                    onCheckedChange={(v) => keys.forEach((k) => toggle(k, v === true))}
                    aria-label={`All ${mod.label} permissions`}
                  />
                  {mod.label}
                </label>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {Object.entries(mod.actions).map(([action, label]) => {
                    const key = `${moduleKey}.${action}`;
                    return (
                      <label key={key} className="flex items-center gap-2 text-sm" title={key}>
                        <Checkbox
                          checked={selected.has(key)}
                          disabled={!editable(key)}
                          onCheckedChange={(v) => toggle(key, v === true)}
                        />
                        {label}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {canManage && (
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          {!role.isSystem ? (
            <ConfirmAction
              title={`Delete ${role.name}?`}
              description="Only roles that no user has can be deleted."
              confirmLabel="Delete role"
              destructive
              action={() => deleteRoleAction({ id: role.id })}
              trigger={
                <Button variant="outline" className="text-destructive">
                  <Trash2Icon /> Delete role
                </Button>
              }
            />
          ) : (
            <span />
          )}
          <Button onClick={save} disabled={pending}>
            {pending ? "Saving…" : "Save role"}
          </Button>
        </div>
      )}
    </div>
  );
}
