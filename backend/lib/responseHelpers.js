const success = (res, data, meta = {}) =>
  res.json({ data, meta: { timestamp: new Date().toISOString(), ...meta } });

const paginated = (res, data, pagination) =>
  res.json({ data, meta: { timestamp: new Date().toISOString(), pagination } });

const error = (res, status, code, message, fields) =>
  res.status(status).json({ error: { code, message, ...(fields && { fields }) } });

module.exports = { success, paginated, error };
