/**
 * StatCard Component
 *
 * Small card displaying a single metric with label, value, and optional icon.
 *
 * @param {object} props
 * @param {string} props.label
 * @param {string|number} props.value
 * @param {string} [props.icon]
 * @param {string} [props.trend]   — TODO (contributor): show +/- trend indicator
 */

export default function StatCard({ label, value, icon, trend: _trend }) {
  return (
    <div className="card flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
        {icon && <span className="text-lg">{icon}</span>}
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
      {/* TODO (contributor — easy): add trend arrow and percentage */}
    </div>
  );
}
