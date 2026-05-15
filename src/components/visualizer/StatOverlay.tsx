"use client";

interface Stats {
  active: number;
  total: number;
  tokens: number;
  cost: number;
  spark: number[];
}

export default function StatOverlay({ stats }: { stats: Stats }) {
  return (
    <div className="stat-overlay">
      <div className="stat-card">
        <div className="lbl">Active agents</div>
        <div className="val">{stats.active}<small>/{stats.total}</small></div>
      </div>
      <div className="stat-card">
        <div className="lbl">Tokens · session</div>
        <div className="val mono">{(stats.tokens / 1000).toFixed(1)}<small>k</small></div>
        <div className="spark">
          {stats.spark.map((v, i) => (
            <span key={i} style={{ height: `${4 + v * 20}px`, opacity: 0.35 + v * 0.55 }} />
          ))}
        </div>
      </div>
      <div className="stat-card">
        <div className="lbl">Cost · hour</div>
        <div className="val mono">${stats.cost.toFixed(2)}<small> / $25.00</small></div>
        <div className="spark" style={{ height: 6, marginTop: 8 }}>
          <span style={{ flex: stats.cost / 25, height: 4, background: "#E07A5F", opacity: 0.85, borderRadius: 2 }} />
          <span style={{ flex: 1 - stats.cost / 25, height: 4, background: "rgba(255,255,255,0.06)", opacity: 1, borderRadius: 2 }} />
        </div>
      </div>
    </div>
  );
}
