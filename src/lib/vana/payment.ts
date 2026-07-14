import type { DirectPaymentReceipt } from "@opendatalabs/vana-sdk/server";

export type BuilderPaymentMetadata = Pick<
  DirectPaymentReceipt,
  "asset" | "amount" | "breakdown" | "paidAt"
>;

export function toBuilderPaymentMetadata(
  payment: DirectPaymentReceipt | undefined,
): BuilderPaymentMetadata | null {
  if (!payment) return null;
  return {
    asset: payment.asset,
    amount: payment.amount,
    breakdown: payment.breakdown,
    paidAt: payment.paidAt,
  };
}

export function parseBuilderPaymentMetadata(value: unknown): BuilderPaymentMetadata | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !isRecord(value.breakdown)) {
    throw new Error("Invalid builder payment metadata.");
  }
  const { breakdown } = value;
  if (
    typeof value.asset !== "string" ||
    typeof value.amount !== "string" ||
    typeof value.paidAt !== "string" ||
    typeof breakdown.registrationFee !== "string" ||
    typeof breakdown.dataAccessFee !== "string" ||
    typeof breakdown.registrationPaid !== "boolean"
  ) {
    throw new Error("Invalid builder payment metadata.");
  }
  return {
    asset: value.asset,
    amount: value.amount,
    breakdown: {
      registrationFee: breakdown.registrationFee,
      dataAccessFee: breakdown.dataAccessFee,
      registrationPaid: breakdown.registrationPaid,
    },
    paidAt: value.paidAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
