'use client';

import React, { useState, useEffect } from 'react';
import { format, subDays, startOfMonth } from 'date-fns';
import { DayPicker } from 'react-day-picker';
import type { DateRange } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { useVolumeAnalytics, useDisputeRateAnalytics, useResolutionTimeAnalytics, useCohortAnalytics } from '../../../../hooks/useAnalytics';
import { VolumeChart } from '../../../../components/charts/VolumeChart';
import { DisputeRateChart } from '../../../../components/charts/DisputeRateChart';
import { ResolutionHistogram } from '../../../../components/charts/ResolutionHistogram';
import { CohortHeatmap } from '../../../../components/charts/CohortHeatmap';

export default function AnalyticsDashboard() {
  const [granularity, setGranularity] = useState<'day' | 'week' | 'month'>('day');
  
  // Date Range State
  const [preset, setPreset] = useState<'7d' | '30d' | '90d' | 'custom'>('30d');
  const [dateRange, setDateRange] = useState<DateRange>({
    from: subDays(new Date(), 30),
    to: new Date()
  });
  const [isPickerOpen, setIsPickerOpen] = useState(false);

  // Cohort State
  const [cohortMonth, setCohortMonth] = useState<string>(format(startOfMonth(subDays(new Date(), 60)), 'yyyy-MM'));

  // Handlers
  const handlePreset = (p: '7d' | '30d' | '90d') => {
    setPreset(p);
    setDateRange({
      from: subDays(new Date(), p === '7d' ? 7 : p === '30d' ? 30 : 90),
      to: new Date()
    });
    setIsPickerOpen(false);
  };

  const handleCustomRange = (range: DateRange | undefined) => {
    if (range) {
      setDateRange(range);
      setPreset('custom');
    }
  };

  // Format dates for API
  const fromISO = dateRange.from ? dateRange.from.toISOString() : '';
  const toISO = dateRange.to ? dateRange.to.toISOString() : '';

  // Data Hooks
  const volumeData = useVolumeAnalytics(fromISO, toISO, granularity);
  const disputeRateData = useDisputeRateAnalytics(fromISO, toISO, granularity);
  const resolutionData = useResolutionTimeAnalytics(fromISO, toISO);
  const cohortData = useCohortAnalytics(cohortMonth);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Platform Analytics</h1>
          <p className="text-slate-500">Monitor volume, dispute rates, and platform health.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Granularity Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {(['day', 'week', 'month'] as const).map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                className={`px-3 py-1.5 text-sm font-medium rounded-md capitalize transition-colors ${
                  granularity === g ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          {/* Preset Buttons */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button onClick={() => handlePreset('7d')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${preset === '7d' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>7d</button>
            <button onClick={() => handlePreset('30d')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${preset === '30d' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>30d</button>
            <button onClick={() => handlePreset('90d')} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${preset === '90d' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}>90d</button>
            <button onClick={() => setIsPickerOpen(!isPickerOpen)} className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${preset === 'custom' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500'}`}>Custom</button>
          </div>
        </div>
      </div>

      {/* Date Picker Popover */}
      {isPickerOpen && (
        <div className="absolute z-10 mt-2 bg-white rounded-xl shadow-xl border border-slate-200 p-4 right-6">
          <DayPicker
            mode="range"
            selected={dateRange}
            onSelect={handleCustomRange}
            className="border-none"
          />
          <div className="flex justify-end mt-4">
            <button onClick={() => setIsPickerOpen(false)} className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium">Done</button>
          </div>
        </div>
      )}

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="h-[400px]">
          <VolumeChart 
            data={volumeData.data} 
            isLoading={volumeData.isLoading} 
            isError={volumeData.isError} 
          />
        </div>
        <div className="h-[400px]">
          <DisputeRateChart 
            data={disputeRateData.data} 
            isLoading={disputeRateData.isLoading} 
            isError={disputeRateData.isError} 
          />
        </div>
        <div className="h-[400px]">
          <ResolutionHistogram 
            data={resolutionData.data} 
            isLoading={resolutionData.isLoading} 
            isError={resolutionData.isError} 
          />
        </div>
        <div className="h-[400px]">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-slate-700">Select Cohort Month:</label>
            <input 
              type="month" 
              value={cohortMonth}
              onChange={(e) => setCohortMonth(e.target.value)}
              className="border-slate-200 rounded-md shadow-sm text-sm"
            />
          </div>
          <CohortHeatmap 
            data={cohortData.data} 
            isLoading={cohortData.isLoading} 
            isError={cohortData.isError} 
            cohortMonth={cohortMonth}
          />
        </div>
      </div>
    </div>
  );
}
