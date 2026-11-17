"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { defineAction } from "@/modules/rbac/action";
import { adjustSchema, partSchema, purchaseSchema, transferSchema, vendorPaymentSchema } from "./inventory.schemas";
import {
  adjustStock,
  cancelPurchase,
  cancelTransfer,
  createTransfer,
  dispatchTransfer,
  payVendor,
  postPurchase,
  receiveTransfer,
  savePart,
  savePurchaseDraft,
} from "./inventory.service";

const idSchema = z.object({ id: z.string().min(1) });

export const savePartAction = defineAction({ permission: "parts.manage", schema: partSchema }, async (input, ctx) => {
  const id = await savePart(ctx, input);
  refresh();
  return { id };
});

export const adjustStockAction = defineAction(
  { permission: "inventory.adjust", schema: adjustSchema },
  async (input, ctx) => {
    await adjustStock(ctx, input);
    refresh();
  },
);

export const createTransferAction = defineAction(
  { permission: "inventory.transfer", schema: transferSchema },
  async (input, ctx) => {
    const id = await createTransfer(ctx, input);
    redirect(`/admin/inventory/transfers/${id}`);
  },
);

export const dispatchTransferAction = defineAction(
  { permission: "inventory.transfer", schema: idSchema },
  async ({ id }, ctx) => {
    await dispatchTransfer(ctx, id);
    refresh();
  },
);

export const receiveTransferAction = defineAction(
  { permission: "inventory.receive_transfer", schema: idSchema },
  async ({ id }, ctx) => {
    await receiveTransfer(ctx, id);
    refresh();
  },
);

export const cancelTransferAction = defineAction(
  { permission: "inventory.transfer", schema: idSchema },
  async ({ id }, ctx) => {
    await cancelTransfer(ctx, id);
    refresh();
  },
);

export const savePurchaseAction = defineAction(
  { permission: "purchases.create", schema: purchaseSchema },
  async (input, ctx) => {
    const id = await savePurchaseDraft(ctx, input);
    redirect(`/admin/purchases/${id}`);
  },
);

export const postPurchaseAction = defineAction(
  { permission: "purchases.post", schema: idSchema },
  async ({ id }, ctx) => {
    await postPurchase(ctx, id);
    refresh();
  },
);

export const cancelPurchaseAction = defineAction(
  { permission: "purchases.cancel", schema: idSchema },
  async ({ id }, ctx) => {
    await cancelPurchase(ctx, id);
    refresh();
  },
);

export const payVendorAction = defineAction(
  { permission: "vendors.pay", schema: vendorPaymentSchema },
  async (input, ctx) => {
    await payVendor(ctx, input);
    refresh();
  },
);
