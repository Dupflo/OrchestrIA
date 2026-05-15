/**
 * Minimal 5-field cron parser:  `minute hour day-of-month month day-of-week`
 * Supports `*`, `*\/N`, ranges `1-5`, CSV `1,3,5`, and combinations.
 *
 *   minute        0-59
 *   hour          0-23
 *   day-of-month  1-31
 *   month         1-12
 *   day-of-week   0-6 (Sunday=0)
 *
 * Used to compute the next firing time after a given timestamp.
 */

const RANGES: [number, number][] = [
  [0, 59],   // minute
  [0, 23],   // hour
  [1, 31],   // dom
  [1, 12],   // mon
  [0, 6],    // dow
];

type FieldSet = Set<number>;

function parseField(spec: string, idx: number): FieldSet {
  const [lo, hi] = RANGES[idx];
  const out = new Set<number>();
  for (const part of spec.split(",")) {
    let step = 1;
    let body = part;
    const slash = body.indexOf("/");
    if (slash !== -1) {
      step = parseInt(body.slice(slash + 1), 10);
      body = body.slice(0, slash);
      if (!Number.isFinite(step) || step <= 0) throw new Error(`bad step in cron field: ${part}`);
    }
    let rLo = lo, rHi = hi;
    if (body === "*" || body === "") {
      // full range
    } else if (body.includes("-")) {
      const [a, b] = body.split("-");
      rLo = parseInt(a, 10); rHi = parseInt(b, 10);
    } else {
      rLo = rHi = parseInt(body, 10);
    }
    if (!Number.isFinite(rLo) || !Number.isFinite(rHi) || rLo < lo || rHi > hi || rLo > rHi) {
      throw new Error(`bad cron field part: ${part}`);
    }
    for (let v = rLo; v <= rHi; v += step) out.add(v);
  }
  return out;
}

export interface ParsedCron {
  minute: FieldSet;
  hour: FieldSet;
  dom: FieldSet;
  mon: FieldSet;
  dow: FieldSet;
}

export function parseCron(expr: string): ParsedCron {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) throw new Error(`cron must have 5 fields, got ${fields.length}`);
  return {
    minute: parseField(fields[0], 0),
    hour:   parseField(fields[1], 1),
    dom:    parseField(fields[2], 2),
    mon:    parseField(fields[3], 3),
    dow:    parseField(fields[4], 4),
  };
}

/** Returns the next firing time strictly AFTER `fromMs`, in ms epoch. */
export function nextRun(cron: ParsedCron, fromMs: number): number {
  // Vixie cron rule: if BOTH dom and dow are restricted, OR them; if only one, AND it with date.
  const domAll = cron.dom.size === 31;
  const dowAll = cron.dow.size === 7;
  const useOr = !domAll && !dowAll;

  // Start at the next minute boundary
  const start = new Date(fromMs);
  start.setSeconds(0, 0);
  start.setMinutes(start.getMinutes() + 1);

  // Scan forward up to 4 years (any valid cron has at least one fire within 4 years)
  const limit = start.getTime() + 4 * 365 * 24 * 60 * 60 * 1000;
  const d = new Date(start);

  while (d.getTime() < limit) {
    const month = d.getMonth() + 1;
    if (!cron.mon.has(month)) {
      // jump to first of next month at 00:00
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    const dom = d.getDate();
    const dow = d.getDay();
    const dateOk = useOr
      ? (cron.dom.has(dom) || cron.dow.has(dow))
      : (cron.dom.has(dom) && cron.dow.has(dow));
    if (!dateOk) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (!cron.hour.has(d.getHours())) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
      continue;
    }
    if (!cron.minute.has(d.getMinutes())) {
      d.setMinutes(d.getMinutes() + 1, 0, 0);
      continue;
    }
    return d.getTime();
  }
  throw new Error(`no fire time within 4 years for cron: ${JSON.stringify(cron)}`);
}

/** Convert a cron expr to a human-readable phrase (best-effort, French). */
export function describeCron(expr: string): string {
  try {
    const f = expr.trim().split(/\s+/);
    if (f.length !== 5) return expr;
    const [m, h, dom, mon, dow] = f;

    let day = "every day";
    if (dow === "1-5") day = "weekdays";
    else if (dow === "0,6" || dow === "6,0") day = "weekends";
    else if (dow !== "*") day = `dow ${dow}`;
    else if (dom !== "*") day = `day ${dom}`;
    if (mon !== "*") day += ` (mon ${mon})`;

    let time = "";
    if (h === "*" && m === "*") time = "every minute";
    else if (h === "*" && m.startsWith("*/")) time = `every ${m.slice(2)} min`;
    else if (h.startsWith("*/") && m === "0") time = `every ${h.slice(2)}h`;
    else if (h !== "*" && m !== "*" && !h.includes("/") && !m.includes("/")) {
      time = `at ${h.padStart(2, "0")}:${m.padStart(2, "0")}`;
    } else {
      time = `${h}:${m}`;
    }
    return `${day} · ${time}`;
  } catch {
    return expr;
  }
}
