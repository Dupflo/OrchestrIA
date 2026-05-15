"use client";

import { useState, useRef, useEffect } from "react";

export default function Commander({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [val, setVal] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="commander">
      <span className="prompt">›</span>
      <input
        ref={ref}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="spawn an agent — e.g. retriever://github.com/acme/billing"
        onKeyDown={(e) => {
          if (e.key === "Enter" && val.trim()) {
            onSubmit(val.trim());
            setVal("");
          }
        }}
      />
      <div className="hint"><span className="kbd">⌘K</span><span>focus</span></div>
    </div>
  );
}
