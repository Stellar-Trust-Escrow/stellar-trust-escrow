import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { exportToCSV } from '../../lib/csvExport';

interface VolumeChartProps {
  data: {
    labels: string[];
    funded: number[];
    completed: number[];
    disputed: number[];
  };
  isLoading: boolean;
  isError: unknown;
}

export const VolumeChart: React.FC<VolumeChartProps> = ({ data, isLoading, isError }) => {
  const chartData = useMemo(() => {
    if (!data?.labels) return [];
    return data.labels.map((label, index) => ({
      date: new Date(label).toLocaleDateString(),
      funded: data.funded[index] || 0,
      completed: data.completed[index] || 0,
      disputed: data.disputed[index] || 0,
    }));
  }, [data]);

  const handleExport = () => {
    exportToCSV(chartData, 'volume-analytics');
  };

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64 bg-red-50 text-red-500 rounded-lg border border-red-100">
        Failed to load volume data
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
          <h3 className="font-semibold text-slate-800">Escrow Volume</h3>
          <p className="text-sm text-slate-500">Volume breakdown over time</p>
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
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorFunded" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorCompleted" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorDisputed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
            <XAxis dataKey="date" tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
            <YAxis tick={{fontSize: 12, fill: '#64748b'}} tickLine={false} axisLine={false} />
            <Tooltip 
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }}/>
            <Area type="monotone" dataKey="funded" name="Funded" stackId="1" stroke="#3b82f6" fill="url(#colorFunded)" />
            <Area type="monotone" dataKey="completed" name="Completed" stackId="2" stroke="#10b981" fill="url(#colorCompleted)" />
            <Area type="monotone" dataKey="disputed" name="Disputed" stackId="3" stroke="#ef4444" fill="url(#colorDisputed)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
