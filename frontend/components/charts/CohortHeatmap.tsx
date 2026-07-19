import React from 'react';
import { exportToCSV } from '../../lib/csvExport';

interface CohortHeatmapProps {
  data: {
    weeks: number[];
    retention: number[];
  };
  isLoading: boolean;
  isError: any;
  cohortMonth: string;
}

export const CohortHeatmap: React.FC<CohortHeatmapProps> = ({ data, isLoading, isError, cohortMonth }) => {
  const handleExport = () => {
    if (!data?.weeks) return;
    const csvData = data.weeks.map((w, i) => ({
      week: w,
      retention_percent: data.retention[i].toFixed(2)
    }));
    exportToCSV(csvData, `cohort-retention-${cohortMonth}`);
  };

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64 bg-red-50 text-red-500 rounded-lg border border-red-100">
        Failed to load cohort data
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 bg-slate-50 animate-pulse rounded-lg">
        <div className="text-slate-400">Loading heatmap...</div>
      </div>
    );
  }

  // Calculate color intensity
  const getColor = (retention: number) => {
    if (retention === 0) return 'bg-slate-50';
    if (retention < 20) return 'bg-indigo-100';
    if (retention < 40) return 'bg-indigo-200';
    if (retention < 60) return 'bg-indigo-300';
    if (retention < 80) return 'bg-indigo-400';
    return 'bg-indigo-500 text-white';
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex flex-col h-full">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-semibold text-slate-800">Cohort Retention Heatmap</h3>
          <p className="text-sm text-slate-500">8-week retention for {cohortMonth}</p>
        </div>
        <button 
          onClick={handleExport}
          disabled={!data?.weeks?.length}
          className="px-3 py-1.5 text-sm font-medium text-slate-600 bg-slate-50 hover:bg-slate-100 rounded-md transition-colors border border-slate-200 disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>
      
      <div className="flex-1 overflow-x-auto min-h-[200px]">
        {data?.weeks && (
          <div className="min-w-[600px]">
            <div className="grid grid-cols-9 gap-1 mb-1">
              <div className="text-xs font-medium text-slate-500 p-2">Cohort</div>
              {data.weeks.map(w => (
                <div key={w} className="text-xs font-medium text-slate-500 text-center p-2">
                  Week {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-9 gap-1">
              <div className="text-sm font-medium text-slate-700 p-3 bg-slate-50 rounded-l-md flex items-center">
                {cohortMonth}
              </div>
              {data.retention.map((ret, i) => (
                <div 
                  key={i} 
                  className={`p-3 text-center text-sm rounded-sm flex items-center justify-center transition-colors hover:ring-2 hover:ring-indigo-300 ${getColor(ret)} ${ret >= 60 ? 'font-medium' : 'text-slate-600'}`}
                  title={`Week ${i + 1}: ${ret.toFixed(1)}%`}
                >
                  {ret > 0 ? `${ret.toFixed(0)}%` : '-'}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
