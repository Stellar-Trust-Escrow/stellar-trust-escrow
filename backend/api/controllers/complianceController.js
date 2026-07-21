const noop = (_req, res) => res.status(501).json({ error: 'Not implemented' });

const complianceController = {
  generateReport: noop,
  exportReport: noop,
  listSchedules: noop,
  createSchedule: noop,
  runSchedule: noop,
  disableSchedule: noop,
};

export default complianceController;
