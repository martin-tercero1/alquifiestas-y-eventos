import { loadBrowseCatalog } from "@/lib/admin/loadInventory";
import { NuevaProforma } from "./NuevaProforma";

export const metadata = { title: "Nueva proforma" };
export const dynamic = "force-dynamic";

export default async function NuevaPage() {
  // Eager-loaded so the browse-by-category accordion is instant. The catalog is
  // small; one query beats making her wait on a tap to see a shelf's contents.
  const catalog = await loadBrowseCatalog();
  return <NuevaProforma catalog={catalog} />;
}
