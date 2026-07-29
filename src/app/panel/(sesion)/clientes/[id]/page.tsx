import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadCustomer } from "@/lib/admin/loadCustomers";
import { ClienteDetalle } from "./ClienteDetalle";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const customer = await loadCustomer(id);
  return { title: customer?.name ?? "Cliente" };
}

export default async function ClientePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const customer = await loadCustomer(id);
  if (!customer) notFound();

  return <ClienteDetalle initial={customer} />;
}
