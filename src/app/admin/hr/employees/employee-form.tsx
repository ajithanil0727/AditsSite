"use client";

import { FormDialog } from "@/components/forms/form-dialog";
import { SelectField, TextareaField, TextField } from "@/components/forms/fields";
import { saveEmployeeAction } from "@/modules/hr/hr.actions";
import { EMPLOYEE_STATUS_LABELS, EMPLOYEE_STATUSES, employeeSchema, type EmployeeInput } from "@/modules/hr/hr.schemas";

type Opt = { value: string; label: string };
export type EmployeeFormOptions = {
  branches: Opt[];
  departments: Opt[];
  designations: Opt[];
  shifts: Opt[];
  managers: Opt[];
  users: Opt[];
};

export function EmployeeFormDialog({
  trigger,
  options,
  initial,
  today,
  sensitive,
}: {
  trigger: React.ReactNode;
  options: EmployeeFormOptions;
  initial?: EmployeeInput;
  today: string;
  sensitive: boolean;
}) {
  const defaults: EmployeeInput = initial ?? {
    branchId: options.branches[0]?.value ?? "",
    name: "",
    phone: "",
    email: "",
    dob: "",
    gender: null,
    address: "",
    departmentId: null,
    designationId: null,
    managerId: null,
    shiftId: null,
    userId: null,
    joinDate: today,
    exitDate: "",
    status: "ACTIVE",
    pan: "",
    bankName: "",
    bankAccountNo: "",
    ifsc: "",
  };
  return (
    <FormDialog
      wide
      trigger={trigger}
      title={initial ? "Edit employee" : "New employee"}
      description={initial ? undefined : "The employee ID is given automatically (e.g. PKD-E001)."}
      schema={employeeSchema}
      defaultValues={defaults}
      action={saveEmployeeAction}
      successMessage="Employee saved"
    >
      {(form) => (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField control={form.control} name="name" label="Full name" />
          <TextField control={form.control} name="phone" label="Mobile number" inputMode="tel" maxLength={14} />
          <SelectField control={form.control} name="branchId" label="Branch" options={options.branches} />
          <TextField control={form.control} name="email" label="Email" type="email" />
          <SelectField
            control={form.control}
            name="designationId"
            label="Designation"
            options={options.designations}
            allowNone="—"
          />
          <SelectField
            control={form.control}
            name="departmentId"
            label="Department"
            options={options.departments}
            allowNone="—"
          />
          <SelectField
            control={form.control}
            name="managerId"
            label="Reports to"
            options={options.managers.filter((m) => m.value !== initial?.id)}
            allowNone="—"
          />
          <SelectField control={form.control} name="shiftId" label="Shift" options={options.shifts} allowNone="—" />
          <TextField control={form.control} name="joinDate" label="Joined on" type="date" />
          <TextField control={form.control} name="dob" label="Date of birth" type="date" />
          <SelectField
            control={form.control}
            name="gender"
            label="Gender"
            allowNone="—"
            options={[
              { value: "MALE", label: "Male" },
              { value: "FEMALE", label: "Female" },
              { value: "OTHER", label: "Other" },
            ]}
          />
          <SelectField
            control={form.control}
            name="userId"
            label="Login (for leave and payslips)"
            options={options.users}
            allowNone="No login"
          />
          <TextareaField control={form.control} name="address" label="Address" rows={2} className="sm:col-span-2" />
          {initial && (
            <>
              <SelectField
                control={form.control}
                name="status"
                label="Status"
                options={EMPLOYEE_STATUSES.map((s) => ({ value: s, label: EMPLOYEE_STATUS_LABELS[s] }))}
              />
              <TextField control={form.control} name="exitDate" label="Last working day" type="date" />
            </>
          )}
          {sensitive && (
            <>
              <p className="pt-2 text-sm font-medium sm:col-span-2">
                Bank and PAN (only people with permission see these)
              </p>
              <TextField control={form.control} name="pan" label="PAN" maxLength={10} />
              <TextField control={form.control} name="bankName" label="Bank" />
              <TextField control={form.control} name="bankAccountNo" label="Account number" inputMode="numeric" />
              <TextField control={form.control} name="ifsc" label="IFSC" maxLength={11} />
            </>
          )}
        </div>
      )}
    </FormDialog>
  );
}
