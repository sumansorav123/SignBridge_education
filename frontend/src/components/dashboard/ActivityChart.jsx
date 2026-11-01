import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatDate } from '@/lib/format'

export default function ActivityChart({ data = [], dataKey = 'lectures', label = 'Lectures' }) {
  const series = data.length
    ? data
    : Array.from({ length: 7 }, (_, index) => {
        const date = new Date()
        date.setDate(date.getDate() - (6 - index))
        return { date: date.toISOString().slice(0, 10), lectures: 0, minutes: 0 }
      })

  return (
    <div className="h-[220px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 8, left: -24, bottom: 0 }}>
          <defs>
            <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#26A3A8" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#26A3A8" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 6" stroke="currentColor" className="text-ink-200 dark:text-ink-800" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => formatDate(value, { day: 'numeric', month: 'short', year: undefined })}
            tick={{ fontSize: 10, fill: 'currentColor' }}
            className="text-ink-400"
            axisLine={false}
            tickLine={false}
            minTickGap={18}
          />
          <YAxis
            tick={{ fontSize: 10, fill: 'currentColor' }}
            className="text-ink-400"
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 14,
              border: '1px solid rgba(120,144,172,.25)',
              background: 'rgba(255,255,255,.96)',
              fontSize: 12,
              boxShadow: '0 12px 35px -20px rgba(15,27,45,.5)',
            }}
            labelFormatter={(value) => formatDate(value)}
            formatter={(value) => [value, label]}
          />
          <Area type="monotone" dataKey={dataKey} stroke="#26A3A8" strokeWidth={2.5} fill="url(#activityFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
