"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/**
 * "La hoja" — the running count sheet.
 *
 * The site's cart, modelled on the object the business already uses: the ruled
 * proforma the owner fills in by hand when a customer walks in.
 *
 * Each line references a VARIANT — the rentable unit — never a product, and
 * carries its own denormalised name and price. That is deliberate: the sheet
 * has to render instantly from localStorage on a slow connection, without a
 * round-trip to look anything up, and it has to survive a page reload because
 * somebody comparing options on mobile data should not lose their work.
 *
 * The price stored here is for display only. The real price is snapshotted
 * server-side from the catalog when the request is submitted, so a stale sheet
 * can never quote a price the business no longer charges.
 */

const STORAGE_KEY = "alquifiestas.hoja.v2";

export type HojaLine = {
  variantId: string;
  quantity: number;
  /** Full display name: "Comal — Grande", or just "Comal". */
  name: string;
  productSlug: string;
  categorySlug: string;
  pricePerDay: number;
};

export type ResolvedLine = HojaLine & {
  /** quantity × price, for one 24-hour period. */
  perDay: number;
};

type HojaState = {
  lines: HojaLine[];
  /** Pickup date, YYYY-MM-DD. Null until the visitor picks one. */
  eventDate: string | null;
  days: number;
};

type HojaContext = HojaState & {
  resolved: ResolvedLine[];
  lineCount: number;
  itemCount: number;
  subtotalPerDay: number;
  total: number;
  ready: boolean;
  add: (line: Omit<HojaLine, "quantity">, quantity?: number) => void;
  setQuantity: (variantId: string, quantity: number) => void;
  remove: (variantId: string) => void;
  clear: () => void;
  setEventDate: (date: string | null) => void;
  setDays: (days: number) => void;
  quantityOf: (variantId: string) => number;
};

const Context = createContext<HojaContext | null>(null);

const EMPTY: HojaState = { lines: [], eventDate: null, days: 1 };

export function HojaProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<HojaState>(EMPTY);
  const [ready, setReady] = useState(false);

  // Read after mount, never during render — the server has no localStorage.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<HojaState>;
        setState({
          lines: Array.isArray(parsed.lines)
            ? parsed.lines.filter(
                (l) => typeof l?.variantId === "string" && l.quantity > 0,
              )
            : [],
          eventDate: parsed.eventDate ?? null,
          days: typeof parsed.days === "number" ? parsed.days : 1,
        });
      }
    } catch {
      // A corrupt sheet is not worth surfacing — start clean.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private browsing or quota — the sheet still works for this session.
    }
  }, [state, ready]);

  const add = useCallback(
    (line: Omit<HojaLine, "quantity">, quantity = 1) => {
      setState((prev) => {
        const existing = prev.lines.find((l) => l.variantId === line.variantId);
        const lines = existing
          ? prev.lines.map((l) =>
              l.variantId === line.variantId
                ? { ...l, ...line, quantity: l.quantity + quantity }
                : l,
            )
          : [...prev.lines, { ...line, quantity }];
        return { ...prev, lines };
      });
    },
    [],
  );

  const setQuantity = useCallback((variantId: string, quantity: number) => {
    setState((prev) => ({
      ...prev,
      lines:
        quantity <= 0
          ? prev.lines.filter((l) => l.variantId !== variantId)
          : prev.lines.map((l) =>
              l.variantId === variantId ? { ...l, quantity } : l,
            ),
    }));
  }, []);

  const remove = useCallback((variantId: string) => {
    setState((prev) => ({
      ...prev,
      lines: prev.lines.filter((l) => l.variantId !== variantId),
    }));
  }, []);

  const clear = useCallback(() => setState(EMPTY), []);

  const setEventDate = useCallback((eventDate: string | null) => {
    setState((prev) => ({ ...prev, eventDate }));
  }, []);

  const setDays = useCallback((days: number) => {
    setState((prev) => ({ ...prev, days: Math.max(1, Math.min(60, days)) }));
  }, []);

  const value = useMemo<HojaContext>(() => {
    const resolved: ResolvedLine[] = state.lines.map((line) => ({
      ...line,
      perDay: line.pricePerDay * line.quantity,
    }));

    const subtotalPerDay = resolved.reduce((sum, l) => sum + l.perDay, 0);

    return {
      ...state,
      resolved,
      lineCount: resolved.length,
      itemCount: resolved.reduce((sum, l) => sum + l.quantity, 0),
      subtotalPerDay,
      total: subtotalPerDay * state.days,
      ready,
      add,
      setQuantity,
      remove,
      clear,
      setEventDate,
      setDays,
      quantityOf: (variantId: string) =>
        state.lines.find((l) => l.variantId === variantId)?.quantity ?? 0,
    };
  }, [state, ready, add, setQuantity, remove, clear, setEventDate, setDays]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useHoja(): HojaContext {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("useHoja must be used inside HojaProvider");
  return ctx;
}

/**
 * The return date: the day the item is due back, derived from the pickup date
 * and the number of days. A rental is priced per 24 hours, so N días means the
 * item comes back N days after pickup (a one-día rental is due back the next
 * day).
 */
export function returnDate(eventDate: string, days: number): string {
  const [y, m, d] = eventDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + Math.max(days, 1)));
  return date.toISOString().slice(0, 10);
}
