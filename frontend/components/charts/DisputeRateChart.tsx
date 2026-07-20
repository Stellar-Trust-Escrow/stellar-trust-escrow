import React, { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { exportToCSV } from '../../lib/csvExport';

interface DisputeRateChartProps {
  data: {
    labels: string[];
    dispute_rate: number[];
  };
  isLoading: boolean;
  isError: unknown;
}

export const DisputeRateChart: React.FC<DisputeRateChartProps> = ({ data, isLoading, isError }) => {
  const chartData = useMemo(() => {
    if (!data?.labels) return [];
    return data.labels.map((label, index) => ({
      date: new Date(label).toLocaleDateString(),
      rate: Number((data.dispute_rate[index] || 0).toFixed(2)),
    }));
  }, [data]);

  const handleExport = () => {
    exportToCSV(chartData, 'dispute-rate-analytics');
  };

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64 bg-red-50 text-red-500 rounded-lg border border-red-100">
        Failed to load dispute rate data
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 animate-pulse rounded-lg">
        <div className="text-slate-400">Loading chart...</div>
      </div>
    );
  }

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-semibold text-slate-800">Dispute Rate</h3>
          <p className="text-sm text-slate-500">% of escrows disputed</p>
        </div>
        <button
          onClick={handleExport}
          disabled={!chartData.length}
          className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-md transition-colors border border-slate-200 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>
      <div className="flex-1 min-h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              formatter={((value: number) => [`${value}%`, 'Dispute Rate']) as never}
            />
            <ReferenceLine
              y={5}
              stroke="#ef4444"
              strokeDasharray="3 3"
              label={{ position: 'top', value: '5% Threshold', fill: '#ef4444', fontSize: 10 }}
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="#8b5cf6"
              strokeWidth={2}
              dot={{ r: 3, fill: '#8b5cf6', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
