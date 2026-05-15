"use client";

export default function Legend() {
  return (
    <div className="legend">
      <div className="row"><div className="sw" style={{ background: "#8be38b" }} />active</div>
      <div className="row"><div className="sw" style={{ background: "#e6b85c" }} />waiting</div>
      <div className="row"><div className="sw" style={{ background: "#e26d6d" }} />error</div>
      <div className="row"><div className="ln" />delegation</div>
      <div className="row"><div className="ln dashed" />idle link</div>
    </div>
  );
}
