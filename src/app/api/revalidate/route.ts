import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { currentStaff } from "@/lib/supabase/server";

// TEMP diagnostic: verify revalidatePath purges these pages on Vercel. Removed
// in the follow-up commit.
const TEMP_TEST_KEY = "74e2bb0dd8ab86363ca564a5ceb00097";

export async function GET(req: NextRequest) {
  if (req.nextUrl.searchParams.get("key") !== TEMP_TEST_KEY) {
    return NextResponse.json({ ok: false, error: "no_autorizado" }, { status: 401 });
  }
  revalidatePath("/catalogo", "layout");
  revalidatePath("/");
  return NextResponse.json({ ok: true, revalidated: true, via: "test" });
}

/**
 * On-demand catalog revalidation.
 *
 * The public catalog pages are statically pre-rendered (revalidate = 300), so a
 * staff edit in the panel — hiding a variant, changing a price or a quantity —
 * would otherwise not show until the ISR window elapsed or the site was
 * redeployed. The panel calls this route right after a successful catalog write
 * to refresh those pages immediately instead.
 *
 * Authorization is the signed-in staff session itself: `currentStaff()` calls
 * getUser(), which verifies with Supabase, so only a real staff member can
 * trigger a rebuild. No shared secret to manage. Revalidation is idempotent and
 * cheap, so there is nothing to abuse even if it is called often.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
  const staff = await currentStaff();
  if (!staff) {
    return NextResponse.json({ ok: false, error: "no_autorizado" }, { status: 401 });
  }

  // 'layout' revalidates /catalogo and everything nested under it (category and
  // product pages), and '/' covers the home page's catalog highlights.
  revalidatePath("/catalogo", "layout");
  revalidatePath("/");

  return NextResponse.json({ ok: true, revalidated: true });
}
