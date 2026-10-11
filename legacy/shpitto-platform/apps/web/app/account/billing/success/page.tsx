import { BillingSuccessClient } from "./BillingSuccessClient";

type BillingSuccessPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function BillingSuccessPage({ searchParams }: BillingSuccessPageProps) {
  const params = (await searchParams) || {};
  const orderId = String(firstParam(params.token) || firstParam(params.orderId) || "").trim();

  return <BillingSuccessClient orderId={orderId} />;
}
