/**
 * Incident Controller
 *
 * REST API for incident lifecycle management.
 * All routes require admin authentication.
 */

import incidentService from '../../services/incidentService.js';

const createIncident = async (req, res) => {
  try {
    const { title, description, severity, affectedServices, commander, runbookUrl } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: 'title and description are required' });
    }
    const incident = await incidentService.createIncident({
      title,
      description,
      severity,
      affectedServices: affectedServices ?? [],
      commander,
      runbookUrl,
      createdBy: req.user?.address ?? req.headers['x-admin-api-key']?.slice(0, 8) ?? 'admin',
    });
    res.status(201).json(incident);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const listIncidents = (req, res) => {
  try {
    const { status, severity } = req.query;
    res.json(incidentService.listIncidents({ status, severity }));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const getIncident = (req, res) => {
  try {
    res.json(incidentService.getIncident(req.params.id));
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!status) return res.status(400).json({ error: 'status is required' });
    const actor = req.user?.address ?? 'admin';
    const incident = await incidentService.updateIncidentStatus(req.params.id, status, { actor, note });
    res.json(incident);
  } catch (err) {
    const code = err.message.includes('not found') ? 404
      : err.message.includes('Invalid transition') ? 422 : 500;
    res.status(code).json({ error: err.message });
  }
};

const attachPostMortem = (req, res) => {
  try {
    const incident = incidentService.attachPostMortem(req.params.id, req.body);
    res.json(incident);
  } catch (err) {
    const code = err.message.includes('not found') ? 404 : 422;
    res.status(code).json({ error: err.message });
  }
};

const getOnCall = (_req, res) => {
  res.json({
    current: incidentService.getCurrentOnCall(),
    schedule: incidentService.getOnCallSchedule(),
  });
};

export default { createIncident, listIncidents, getIncident, updateStatus, attachPostMortem, getOnCall };
