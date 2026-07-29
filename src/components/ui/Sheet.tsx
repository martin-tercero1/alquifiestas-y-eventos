"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

/**
 * Bottom sheet.
 *
 * Uses CSS transitions rather than keyframes so an interrupted open/close
 * retargets from where it is instead of restarting from zero. Drag-to-dismiss
 * is velocity-based: a quick flick dismisses even if it barely moved, and
 * dragging upward past the top meets friction instead of a wall.
 */

const DURATION = 300;
const VELOCITY_THRESHOLD = 0.11; // px per ms
const DISTANCE_THRESHOLD = 120; // px

type Props = {
  open: boolean;
  onClose: () => void;
  /** Names the sheet for screen readers. */
  title: string;
  children: React.ReactNode;
  className?: string;
};

export function Sheet({ open, onClose, title, children, className }: Props) {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const [drag, setDrag] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragStart = useRef<{ y: number; time: number } | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  // Mount, then flip to visible on the next frame so the transition has two
  // distinct states to move between.
  useEffect(() => {
    if (open) {
      restoreFocus.current = document.activeElement as HTMLElement;
      setMounted(true);
      const raf = requestAnimationFrame(() => setVisible(true));
      return () => cancelAnimationFrame(raf);
    }
    setVisible(false);
    const timer = setTimeout(() => {
      setMounted(false);
      setDrag(0);
      restoreFocus.current?.focus();
    }, DURATION);
    return () => clearTimeout(timer);
  }, [open]);

  // Lock the page behind the sheet without letting it jump as the scrollbar goes.
  useEffect(() => {
    if (!mounted) return;
    const { body } = document;
    const previous = body.style.overflow;
    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      body.style.overflow = previous;
      body.style.paddingRight = "";
    };
  }, [mounted]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Move focus into the sheet once it is open.
  useEffect(() => {
    if (visible) panelRef.current?.focus();
  }, [visible]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragStart.current = { y: e.clientY, time: Date.now() };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const delta = e.clientY - dragStart.current.y;
    // Upward drag gets friction rather than a hard stop — things in the real
    // world slow down before they refuse to move.
    setDrag(delta < 0 ? delta / 4 : delta);
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!dragStart.current) return;
      const delta = e.clientY - dragStart.current.y;
      const elapsed = Date.now() - dragStart.current.time;
      const velocity = Math.abs(delta) / Math.max(elapsed, 1);
      dragStart.current = null;

      if (delta > 0 && (delta > DISTANCE_THRESHOLD || velocity > VELOCITY_THRESHOLD)) {
        setDrag(0);
        onClose();
      } else {
        setDrag(0);
      }
    },
    [onClose],
  );

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50" role="presentation">
      <div
        onClick={onClose}
        className={cn(
          "absolute inset-0 bg-ink/55 transition-opacity ease-out",
          visible ? "opacity-100" : "opacity-0",
        )}
        style={{ transitionDuration: `${DURATION}ms` }}
        data-motion-fade
      />

      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          "absolute inset-x-0 bottom-0 mx-auto flex max-h-[88svh] w-full max-w-2xl flex-col",
          "rounded-t-2xl bg-limewash shadow-sheet outline-none",
          className,
        )}
        style={{
          transform: visible ? `translateY(${drag}px)` : "translateY(100%)",
          transition: dragStart.current
            ? "none"
            : `transform ${DURATION}ms var(--ease-sheet)`,
        }}
      >
        {/* The grab handle is also the drag surface — dragging the scrollable
            body would fight the scroll. */}
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className="flex shrink-0 cursor-grab touch-none justify-center py-3 active:cursor-grabbing"
        >
          <span className="h-1 w-10 rounded-full bg-rule-strong" />
        </div>

        {children}
      </div>
    </div>
  );
}
