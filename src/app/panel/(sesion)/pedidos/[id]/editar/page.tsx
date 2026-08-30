import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { loadRequestForEdit } from "@/lib/admin/loadOrder";
import { EditarArticulos } from "./EditarArticulos";

export const metadata: Metadata = { title: "Editar pedido" };
export const dynamic = "force-dynamic";

export default async function EditarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const request = await loadRequestForEdit(id);

  // Editable while the order is a quote, a website request, or confirmed.
  // Anything past pickup — or not found — goes back to the detail view.
  if (!request) redirect(`/panel/pedidos/${id}`);

  return <EditarArticulos request={request} />;
}
