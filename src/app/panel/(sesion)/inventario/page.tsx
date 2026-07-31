import type { Metadata } from "next";
import { loadInventory, loadCategories } from "@/lib/admin/loadInventory";
import { currentStaff } from "@/lib/supabase/server";
import { Inventario } from "./Inventario";

export const metadata: Metadata = { title: "Inventario" };
export const dynamic = "force-dynamic";

export default async function InventarioPage() {
  const [products, categories, staff] = await Promise.all([
    loadInventory(),
    loadCategories(),
    currentStaff(),
  ]);

  return (
    <Inventario
      initial={products}
      categories={categories}
      canDelete={staff?.isTechAdmin ?? false}
    />
  );
}
