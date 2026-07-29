import Link from "next/link";
import { loadBoard, type BoardCard } from "@/lib/admin/loadBoard";
import { currentStaff } from "@/lib/supabase/server";
import { money } from "@/lib/format";
import { Badge } from "@/components/ui/Badge";
import { SalirButton } from "../SalirButton";

export const metadata = { title: "Hoy" };
export const dynamic = "force-dynamic";

/**
 * Hoy — the daily anchor, and the screen she opens by default.
 *
 * Three sections, in the order the day happens: what goes out, what comes back,
 * what is late. Nothing else — no charts, no revenue counter. An empty section
 * says so in one line and takes no more room than that, so the sections that
 * do have work in them are what fills the screen.
 */

function daysLate(agreedReturn: string, today: string): number {
  const a = Date.parse(`${agreedReturn}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86400000));
}

function Card({ card, late }: { card: BoardCard; late?: number }) {
  return (
    <li>
      <Link
        href={`/panel/pedidos/${card.id}`}
        className="flex items-center gap-3 rounded-lg border border-rule bg-paper p-4 transition-colors duration-fast ease-out hover:border-rule-strong"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-semibold text-ink">
            {card.customerName}
          </p>
          <p className="type-mono mt-0.5 truncate text-sm text-stone-text">
            {card.itemSummary}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {card.fulfilment === "delivery" && (
            <Badge variant="brand">Entrega</Badge>
          )}
          {late !== undefined && late > 0 && (
            <span className="type-label text-mamey-text">
              {late === 1 ? "1 día tarde" : `${late} días tarde`}
            </span>
          )}
          {card.balance > 0 && (
            <span className="type-mono text-sm text-mamey-text tabular-nums">
              debe {money(card.balance)}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}

function Section({
  title,
  cards,
  empty,
  render,
}: {
  title: string;
  cards: BoardCard[];
  empty: string;
  render: (card: BoardCard) => React.ReactNode;
}) {
  return (
    <section>
      <h2 className="flex items-baseline gap-2">
        <span className="type-display text-xl text-ink">{title}</span>
        {cards.length > 0 && (
          <span className="type-mono text-sm text-stone-text">
            {cards.length}
          </span>
        )}
      </h2>
      {cards.length === 0 ? (
        <p className="mt-2 text-base text-stone-text">{empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">{cards.map(render)}</ul>
      )}
    </section>
  );
}

export default async function HoyPage() {
  const [staff, board] = await Promise.all([currentStaff(), loadBoard()]);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-8">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="type-label text-stone-text">Panel</p>
          <h1 className="type-display mt-1 text-3xl text-ink">
            Buenas, {staff?.name}
          </h1>
        </div>
        <SalirButton />
      </div>

      <div className="mt-8 flex flex-col gap-10">
        <Section
          title="Sale hoy"
          cards={board.saleToday}
          empty="Nada sale hoy."
          render={(card) => <Card key={card.id} card={card} />}
        />

        <Section
          title="Regresa hoy"
          cards={board.returnToday}
          empty="Nada regresa hoy."
          render={(card) => <Card key={card.id} card={card} />}
        />

        <Section
          title="Atrasados"
          cards={board.overdue}
          empty="Nada atrasado. Todo al día."
          render={(card) => (
            <Card
              key={card.id}
              card={card}
              late={daysLate(card.agreedReturnDate, board.today)}
            />
          )}
        />
      </div>
    </main>
  );
}
