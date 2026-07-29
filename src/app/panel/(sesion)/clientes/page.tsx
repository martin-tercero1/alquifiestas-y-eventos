import type { Metadata } from "next";
import { loadCustomers } from "@/lib/admin/loadCustomers";
import { ClientesLista } from "./ClientesLista";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const customers = await loadCustomers();
  return <ClientesLista customers={customers} />;
}
