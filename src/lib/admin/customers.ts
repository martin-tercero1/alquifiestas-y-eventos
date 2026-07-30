import { panelClient } from "@/lib/supabase/panel";
import type { Database } from "@/lib/supabase/types";
import type { EditResult } from "./inventory";

type CustomerUpdate = Database["public"]["Tables"]["customers"]["Update"];

/**
 * Creating and editing a contact from the phone. Plain table writes over the
 * customers' staff RLS — a name is required, a phone is not (a quarter of the
 * book has none), and everything else the old Odoo export carried is left
 * untouched.
 */

const OFFLINE =
  "No se pudo guardar: parece que no hay conexión. Probá otra vez en un momento.";
const FAILED = "No se pudo guardar. Probá otra vez.";

function message(error: { message?: string } | null): string {
  return /fetch|network|failed to fetch/i.test(error?.message ?? "")
    ? OFFLINE
    : FAILED;
}

/** Empty string means "no phone", stored as null so it reads as absent. */
function cleanPhone(phone: string): string | null {
  const trimmed = phone.trim();
  return trimmed === "" ? null : trimmed;
}

export type CreateResult =
  | { ok: true; id: string }
  | { ok: false; message: string };

export async function createCustomer(
  name: string,
  phone: string,
  cedula?: string,
): Promise<CreateResult> {
  const { data, error } = await panelClient()
    .from("customers")
    .insert({
      name: name.trim(),
      phone: cleanPhone(phone),
      cedula: cleanPhone(cedula ?? ""),
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, message: message(error) };
  return { ok: true, id: data.id };
}

export async function updateCustomer(
  id: string,
  fields: {
    name?: string;
    phone?: string;
    cedula?: string;
    notes?: string | null;
  },
): Promise<EditResult> {
  const patch: CustomerUpdate = {};
  if (fields.name !== undefined) patch.name = fields.name.trim();
  if (fields.phone !== undefined) patch.phone = cleanPhone(fields.phone);
  if (fields.cedula !== undefined) patch.cedula = cleanPhone(fields.cedula);
  if ("notes" in fields) patch.notes = fields.notes;

  const { error } = await panelClient()
    .from("customers")
    .update(patch)
    .eq("id", id);

  return error ? { ok: false, message: message(error) } : { ok: true };
}
