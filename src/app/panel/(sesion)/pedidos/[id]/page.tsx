import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { loadOrder } from "@/lib/admin/loadOrder";
import { currentStaff } from "@/lib/supabase/server";
import { DetallePedido } from "./DetallePedido";

// This screen is always live per-request: an order changes as she works it,
// and a stale cached copy is worse than a fresh fetch.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const order = await loadOrder(id);
  return { title: order ? `Pedido #${order.number}` : "Pedido" };
}

export default async function PedidoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [order, staff] = await Promise.all([loadOrder(id), currentStaff()]);

  if (!order) notFound();

  const isTechAdmin = staff?.isTechAdmin ?? false;
  return (
    <DetallePedido
      order={order}
      canDelete={isTechAdmin}
      canIssueComprobante={isTechAdmin}
    />
  );
}
