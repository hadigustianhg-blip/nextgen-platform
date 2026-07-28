"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { SlaPoint } from "@/modules/monitoring/dashboard.types";

export function SlaChart({ points }: { points: SlaPoint[] }) {
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 10, right: 5, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="slaFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563eb" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
          <YAxis domain={[90, 100]} tickLine={false} axisLine={false} tick={{ fill: "#94a3b8", fontSize: 11 }} />
          <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0", fontSize: 12 }} formatter={(value) => [`${value}%`, "SLA"]} />
          <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} fill="url(#slaFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
