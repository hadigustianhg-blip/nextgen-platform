"use client";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const rupiah = (value: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0,
}).format(value);

export function ProfitLossChart({ rows }: { rows: Array<{ date: string; totalIncome: string; totalExpense: string; profitLoss: string }> }) {
  const data = rows.map((row) => ({
    date: row.date.slice(8, 10),
    Pemasukan: Number(row.totalIncome),
    Pengeluaran: Number(row.totalExpense),
    "Profit/Loss": Number(row.profitLoss),
  }));
  return <div className="h-80 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 12, right: 18, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
        <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }}/>
        <YAxis tickFormatter={(value) => `${Math.round(Number(value) / 1000)}k`} tick={{ fontSize: 11, fill: "#64748b" }}/>
        <Tooltip formatter={(value) => rupiah(Number(value))} labelFormatter={(value) => `Tanggal ${value}`}/>
        <Legend/>
        <Line type="monotone" dataKey="Pemasukan" stroke="#15803d" strokeWidth={2} dot={false}/>
        <Line type="monotone" dataKey="Pengeluaran" stroke="#dc2626" strokeWidth={2} dot={false}/>
        <Line type="monotone" dataKey="Profit/Loss" stroke="#1e3a8a" strokeWidth={3} dot={false}/>
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
