// Server-only: uses serverClient(), which reads request cookies via next/headers.
import { serverClient } from "@/lib/supabase/server";
import { business } from "@/lib/business";
import { parseSnapshot, type Comprobante } from "./types";

/**
 * Issues (or reuses) the comprobante for an order and returns the frozen data.
 *
 * The database does the real work: `issue_comprobante` is SECURITY DEFINER and
 * gated on `is_tech_admin()`, so a parent's session gets `no_autorizado` and the
 * route turns that into a 403. The business RUC travels from code (the one place
 * it lives) into the frozen document, so the record keeps the issuer's identity
 * as it was at issue time.
 */

export type IssueResult =
  | { ok: true; comprobante: Comprobante }
  | { ok: false; error: "no_autorizado" | "pedido_inexistente" | "error" };

export async function issueComprobante(orderId: string): Promise<IssueResult> {
  const supabase = await serverClient();

  const { data, error } = await supabase.rpc("issue_comprobante", {
    p_order_id: orderId,
    p_business_ruc: business.fiscal.ruc,
  });

  if (error) return { ok: false, error: "error" };

  const result = data as {
    ok: boolean;
    error?: string;
    number?: number;
    issued_at?: string;
    snapshot?: unknown;
  };

  if (!result?.ok) {
    if (result?.error === "no_autorizado")
      return { ok: false, error: "no_autorizado" };
    if (result?.error === "pedido_inexistente")
      return { ok: false, error: "pedido_inexistente" };
    return { ok: false, error: "error" };
  }

  return {
    ok: true,
    comprobante: {
      number: result.number!,
      issuedAt: result.issued_at!,
      snapshot: parseSnapshot(result.snapshot),
    },
  };
}
