/**
 * "Today", from Nicaragua's point of view.
 *
 * The app is deployed on infrastructure that runs in UTC, but the business and
 * everyone using it are in Nicaragua (UTC−6, no daylight saving). Computing the
 * day from the server clock would roll "hoy" over to tomorrow at 6 p.m. local —
 * so an evening pickup would drop off today's board while the customer is still
 * at the counter. This pins the offset so the board matches the calendar on the
 * wall.
 *
 * On the client the browser's own local date is already Nicaragua time, so the
 * detail screen computes today directly; this is only for server-side loads.
 */
const MANAGUA_OFFSET_MS = 6 * 60 * 60 * 1000;

export function managuaToday(): string {
  return new Date(Date.now() - MANAGUA_OFFSET_MS).toISOString().slice(0, 10);
}
