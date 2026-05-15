"use client";

import { useState, useRef, useCallback, useEffect } from "react";

const STYLE = `
  .twk-panel{position:fixed;right:16px;bottom:16px;z-index:9999;width:280px;
    max-height:calc(100vh - 32px);display:flex;flex-direction:column;
    background:rgba(250,249,247,.78);color:#29261b;
    -webkit-backdrop-filter:blur(24px) saturate(160%);backdrop-filter:blur(24px) saturate(160%);
    border:.5px solid rgba(255,255,255,.6);border-radius:14px;
    box-shadow:0 1px 0 rgba(255,255,255,.5) inset,0 12px 40px rgba(0,0,0,.18);
    font:11.5px/1.4 ui-sans-serif,system-ui,-apple-system,sans-serif;overflow:hidden}
  .twk-hd{display:flex;align-items:center;justify-content:space-between;
    padding:10px 8px 10px 14px;cursor:move;user-select:none}
  .twk-hd b{font-size:12px;font-weight:600}
  .twk-x{appearance:none;border:0;background:transparent;color:rgba(41,38,27,.55);
    width:22px;height:22px;border-radius:6px;cursor:default;font-size:13px;line-height:1}
  .twk-x:hover{background:rgba(0,0,0,.06);color:#29261b}
  .twk-body{padding:2px 14px 14px;display:flex;flex-direction:column;gap:10px;
    overflow-y:auto;overflow-x:hidden;min-height:0}
  .twk-row{display:flex;flex-direction:column;gap:5px}
  .twk-row-h{flex-direction:row;align-items:center;justify-content:space-between;gap:10px}
  .twk-lbl{display:flex;justify-content:space-between;align-items:baseline;color:rgba(41,38,27,.72)}
  .twk-lbl>span:first-child{font-weight:500}
  .twk-val{color:rgba(41,38,27,.5)}
  .twk-sect{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;
    color:rgba(41,38,27,.45);padding:10px 0 0}
  .twk-sect:first-child{padding-top:0}
  .twk-slider{appearance:none;-webkit-appearance:none;width:100%;height:4px;margin:6px 0;
    border-radius:999px;background:rgba(0,0,0,.12);outline:none}
  .twk-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;
    border-radius:50%;background:#fff;border:.5px solid rgba(0,0,0,.12);
    box-shadow:0 1px 3px rgba(0,0,0,.2);cursor:default}
  .twk-seg{position:relative;display:flex;padding:2px;border-radius:8px;
    background:rgba(0,0,0,.06);user-select:none}
  .twk-seg-thumb{position:absolute;top:2px;bottom:2px;border-radius:6px;
    background:rgba(255,255,255,.9);box-shadow:0 1px 2px rgba(0,0,0,.12);
    transition:left .15s,width .15s}
  .twk-seg button{appearance:none;position:relative;z-index:1;flex:1;border:0;
    background:transparent;color:inherit;font:inherit;font-weight:500;min-height:22px;
    border-radius:6px;cursor:default;padding:4px 6px}
  .twk-toggle{position:relative;width:32px;height:18px;border:0;border-radius:999px;
    background:rgba(0,0,0,.15);transition:background .15s;cursor:default;padding:0;
    flex-shrink:0}
  .twk-toggle[data-on="1"]{background:#34c759}
  .twk-toggle i{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;
    background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s;display:block}
  .twk-toggle[data-on="1"] i{transform:translateX(14px)}
  .twk-chips{display:flex;gap:6px}
  .twk-chip{position:relative;appearance:none;flex:1;height:36px;padding:0;border:0;
    border-radius:6px;overflow:hidden;cursor:default;
    box-shadow:0 0 0 .5px rgba(0,0,0,.12)}
  .twk-chip[data-on="1"]{box-shadow:0 0 0 1.5px rgba(0,0,0,.85)}
`;

function readCookie(key: string): string | null {
  if (typeof document === "undefined") return null;
  const found = document.cookie.split(";").find((c) => c.trim().startsWith(key + "="));
  return found ? decodeURIComponent(found.split("=")[1] ?? "") : null;
}

function writeCookie(key: string, value: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${key}=${encodeURIComponent(value)};max-age=31536000;path=/`;
}

export function useTweaks<T extends Record<string, unknown>>(
  defaults: T,
  cookieKey?: string,
): [T, (key: keyof T, val: T[keyof T]) => void] {
  const [values, setValues] = useState<T>(() => {
    if (!cookieKey) return defaults;
    try {
      const raw = readCookie(cookieKey);
      if (raw) return { ...defaults, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return defaults;
  });

  const setTweak = useCallback((key: keyof T, val: T[keyof T]) => {
    setValues((prev) => {
      const next = { ...prev, [key]: val };
      if (cookieKey) writeCookie(cookieKey, JSON.stringify(next));
      return next;
    });
  }, [cookieKey]);

  return [values, setTweak];
}

const OPEN_COOKIE = "orchestria-tweaks-open";

export function TweaksPanel({ title = "Tweaks", children }: { title?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(() => {
    const val = readCookie(OPEN_COOKIE);
    return val === null ? true : val !== "0";
  });
  const dragRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef({ x: 16, y: 16 });
  const PAD = 16;

  const clamp = useCallback(() => {
    const panel = dragRef.current;
    if (!panel) return;
    const w = panel.offsetWidth, h = panel.offsetHeight;
    offsetRef.current = {
      x: Math.min(Math.max(PAD, window.innerWidth - w - PAD), Math.max(PAD, offsetRef.current.x)),
      y: Math.min(Math.max(PAD, window.innerHeight - h - PAD), Math.max(PAD, offsetRef.current.y)),
    };
    panel.style.right = offsetRef.current.x + "px";
    panel.style.bottom = offsetRef.current.y + "px";
  }, []);

  useEffect(() => {
    if (!open) return;
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, [open, clamp]);

  const onDragStart = (e: React.MouseEvent) => {
    const panel = dragRef.current;
    if (!panel) return;
    const r = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const startRight = window.innerWidth - r.right;
    const startBottom = window.innerHeight - r.bottom;
    const move = (ev: MouseEvent) => {
      offsetRef.current = { x: startRight - (ev.clientX - sx), y: startBottom - (ev.clientY - sy) };
      clamp();
    };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  const handleClose = () => {
    writeCookie(OPEN_COOKIE, "0");
    setOpen(false);
  };

  const handleOpen = () => {
    writeCookie(OPEN_COOKIE, "1");
    setOpen(true);
  };

  if (!open) {
    return (
      <>
        <style>{STYLE}</style>
        <button
          className="twk-reopen"
          style={{
            position: "fixed", right: 16, bottom: 16, zIndex: 9999,
            background: "rgba(250,249,247,.78)", color: "#29261b",
            WebkitBackdropFilter: "blur(24px)", backdropFilter: "blur(24px)",
            border: ".5px solid rgba(255,255,255,.6)", borderRadius: 10,
            boxShadow: "0 4px 16px rgba(0,0,0,.18)",
            padding: "7px 12px", fontSize: 11.5, fontWeight: 600, cursor: "default",
            fontFamily: "ui-sans-serif,system-ui,-apple-system,sans-serif",
          }}
          onClick={handleOpen}
        >
          ⚙ {title}
        </button>
      </>
    );
  }

  return (
    <>
      <style>{STYLE}</style>
      <div ref={dragRef} className="twk-panel" style={{ right: offsetRef.current.x, bottom: offsetRef.current.y }}>
        <div className="twk-hd" onMouseDown={onDragStart}>
          <b>{title}</b>
          <button className="twk-x" onMouseDown={(e) => e.stopPropagation()} onClick={handleClose}>✕</button>
        </div>
        <div className="twk-body">{children}</div>
      </div>
    </>
  );
}

export function TweakSection({ label }: { label: string }) {
  return <div className="twk-sect">{label}</div>;
}

export function TweakSlider({ label, value, min = 0, max = 100, step = 1, unit = "", onChange }: {
  label: string; value: number; min?: number; max?: number; step?: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="twk-row">
      <div className="twk-lbl"><span>{label}</span><span className="twk-val">{value}{unit}</span></div>
      <input type="range" className="twk-slider" min={min} max={max} step={step}
        value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

export function TweakToggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="twk-row twk-row-h">
      <div className="twk-lbl"><span>{label}</span></div>
      <button type="button" className="twk-toggle" data-on={value ? "1" : "0"}
        onClick={() => onChange(!value)}><i /></button>
    </div>
  );
}

export function TweakRadio({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const idx = Math.max(0, options.indexOf(value));
  const n = options.length;
  return (
    <div className="twk-row">
      <div className="twk-lbl"><span>{label}</span></div>
      <div ref={trackRef} className="twk-seg">
        <div className="twk-seg-thumb" style={{ left: `calc(2px + ${idx} * (100% - 4px) / ${n})`, width: `calc((100% - 4px) / ${n})` }} />
        {options.map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)}>{o}</button>
        ))}
      </div>
    </div>
  );
}

export function TweakColor({ label, value, options, onChange }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void;
}) {
  return (
    <div className="twk-row">
      <div className="twk-lbl"><span>{label}</span></div>
      <div className="twk-chips">
        {options.map((o) => (
          <button key={o} type="button" className="twk-chip" data-on={o === value ? "1" : "0"}
            style={{ background: o }} onClick={() => onChange(o)} />
        ))}
      </div>
    </div>
  );
}
