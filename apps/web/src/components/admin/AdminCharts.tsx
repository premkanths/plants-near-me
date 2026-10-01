'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AdminAnalytics } from '@/lib/admin-types';

const STATUS_COLOURS: Record<string, string> = {
  ORDERED: '#a1a1aa',
  ACCEPTED: '#38bdf8',
  PACKING: '#818cf8',
  READY_FOR_PICKUP: '#a78bfa',
  OUT_FOR_DELIVERY: '#fbbf24',
  DELIVERED: '#10b981',
  REJECTED: '#f43f5e',
};

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-3 text-xs font-semibold tracking-wider text-zinc-400 uppercase">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Short axis label: "01 Oct" rather than the full ISO date.
 *
 * Recharts hands formatters a loose `ReactNode`/`ValueType`, so these take
 * `unknown` and narrow themselves rather than fighting the library's types.
 */
const dayLabel = (iso: unknown) =>
  new Date(`${String(iso)}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  });

const money = (value: unknown) => `₹${Number(value).toLocaleString('en-IN')}`;

export function AdminCharts({ analytics }: { analytics: AdminAnalytics }) {
  const { daily, topVendors, vendorOrderStatus, topPlants } = analytics;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="lg:col-span-2">
        <Panel title={`Orders and revenue · last ${analytics.days} days`}>
          <ResponsiveContainer width="100%" height={260}>
            {/* Bars for counts, a line for rupees: two very different scales,
                so revenue gets its own right-hand axis. */}
            <ComposedChart data={daily} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
              <XAxis dataKey="day" tickFormatter={dayLabel} fontSize={11} minTickGap={24} />
              <YAxis yAxisId="left" allowDecimals={false} fontSize={11} />
              <YAxis yAxisId="right" orientation="right" fontSize={11} width={60} />
              <Tooltip
                labelFormatter={dayLabel}
                formatter={(value: unknown, name: unknown) =>
                  name === 'Revenue'
                    ? ([money(value), 'Revenue'] as [string, string])
                    : ([String(value), 'Orders'] as [string, string])
                }
              />
              <Legend />
              <Bar
                yAxisId="left"
                dataKey="orders"
                name="Orders"
                fill="#34d399"
                radius={[4, 4, 0, 0]}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="revenue"
                name="Revenue"
                stroke="#0f766e"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <Panel title="Top nurseries by delivered revenue">
        {topVendors.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">No deliveries in this window.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={topVendors} layout="vertical" margin={{ left: 24, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
              <XAxis type="number" fontSize={11} />
              <YAxis type="category" dataKey="name" width={120} fontSize={11} />
              <Tooltip
                formatter={(value: unknown) => [money(value), 'Revenue'] as [string, string]}
              />
              <Bar dataKey="revenue" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <Panel title="Vendor order pipeline">
        {vendorOrderStatus.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">No orders yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie
                data={vendorOrderStatus}
                dataKey="count"
                nameKey="status"
                innerRadius={50}
                outerRadius={85}
                paddingAngle={2}
              >
                {vendorOrderStatus.map((slice) => (
                  <Cell key={slice.status} fill={STATUS_COLOURS[slice.status] ?? '#a1a1aa'} />
                ))}
              </Pie>
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </Panel>

      <div className="lg:col-span-2">
        <Panel title="Best selling plants">
          {topPlants.length === 0 ? (
            <p className="py-6 text-center text-sm text-zinc-500">Nothing sold yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topPlants} margin={{ left: -16, right: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                <XAxis dataKey="plantName" fontSize={11} />
                <YAxis allowDecimals={false} fontSize={11} />
                <Tooltip
                  formatter={(value: unknown) => [String(value), 'Units sold'] as [string, string]}
                />
                <Bar dataKey="quantity" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Panel>
      </div>
    </div>
  );
}
