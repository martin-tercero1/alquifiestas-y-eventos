import type { Metadata } from "next";
import { loadInventory, loadCategories } from "@/lib/admin/loadInventory";
import { Inventario } from "./Inventario";

export const metadata: Metadata = { title: "Inventario" };
export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const [products, categories] = await Promise.all([
    loadInventory(),
    loadCategories(),
  ]);

  return <Inventario initial={products} categories={categories} />;
}
