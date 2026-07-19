import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { exportToCSV } from '../../lib/csvExport';

interface ResolutionHistogramProps {
  data: {
    p50_hours: number;
    p90_hours: number;
    p99_hours: number;
    histogram: { bucket_hours: number; count: number }[];
  };
  isLoading: boolean;
  isError: unknown;
}

export const ResolutionHistogram: React.FC<ResolutionHistogramProps> = ({
  data,
  isLoading,
  isError,
}) => {
  const chartData = useMemo(() => {
    if (!data?.histogram) return [];
    return data.histogram.map((item) => ({
      bucket: `${item.bucket_hours}-${item.bucket_hours + 24}h`,
      count: item.count,
    }));
  }, [data]);

  const handleExport = () => {
    exportToCSV(chartData, 'resolution-time-histogram');
  };

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64 bg-red-50 text-red-500 rounded-lg border border-red-100">
        Failed to load resolution time data
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
          <h3 className="font-semibold text-slate-800">Resolution Time</h3>
          <p className="text-sm text-slate-500">Distribution of hours to resolve disputes</p>
        </div>
        <button
          onClick={handleExport}
          disabled={!chartData.length}
          className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-md transition-colors border border-slate-200 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      {data && (
        <div className="flex gap-4 mb-4 text-sm">
          <div className="bg-slate-50 px-3 py-2 rounded-md">
            <span className="text-slate-500 mr-2">P50:</span>
            <span className="font-medium">{data.p50_hours}h</span>
          </div>
          <div className="bg-slate-50 px-3 py-2 rounded-md">
            <span className="text-slate-500 mr-2">P90:</span>
            <span className="font-medium">{data.p90_hours}h</span>
          </div>
          <div className="bg-slate-50 px-3 py-2 rounded-md">
            <span className="text-slate-500 mr-2">P99:</span>
            <span className="font-medium">{data.p99_hours}h</span>
          </div>
        </div>
      )}

      <div className="flex-1 min-h-[250px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis
              dataKey="bucket"
              tick={{ fontSize: 12, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: '8px',
                border: 'none',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
              }}
              formatter={((value: number) => [value, 'Disputes']) as never}
            />
            <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
