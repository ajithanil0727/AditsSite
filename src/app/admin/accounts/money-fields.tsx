"use client";

import { useWatch, type Control, type FieldValues, type Path } from "react-hook-form";
import { SelectField } from "@/components/forms/fields";

type Opt = { value: string; label: string };

/** Payment mode + the branch's cash/bank accounts. */
export function PaymentFields<T extends FieldValues>({
  control,
  branchId,
  modes,
  accounts,
  modeName,
  accountName,
}: {
  control: Control<T, unknown, unknown>;
  branchId: string | null | undefined;
  modes: Opt[];
  accounts: (Opt & { branchId: string })[];
  modeName: Path<T>;
  accountName: Path<T>;
}) {
  return (
    <>
      <SelectField control={control} name={modeName} label="Paid by" options={modes} />
      <SelectField
        control={control}
        name={accountName}
        label="From / into account"
        options={accounts.filter((a) => a.branchId === branchId)}
        placeholder={branchId ? "Select…" : "Pick the branch first"}
      />
    </>
  );
}

export function useBranch<T extends FieldValues>(control: Control<T, unknown, unknown>, name: Path<T>) {
  return useWatch({ control, name }) as string | null | undefined;
}
