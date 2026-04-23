/**
 * Chaos Engineering Middleware
 *
 * Express middleware that injects faults based on the currently active
 * chaos experiment. Only active when CHAOS_ENABLED=true.
 *
 * Usage (in server.js / app setup):
 *
 *   import { chaosMiddleware } from './chaos/chaosMiddleware.js';
 *   app.use(chaosMiddleware);
 *
 * Activation:
 *
 *   CHAOS_ENABLED=true CHAOS_EXPERIMENT=db-latency node server.js
 *
 * Or at runtime via the chaos runner:
 *
 *   node chaos/runner.js --experiment db-latency --duration 60
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';
import {
  isChaosEnabled,
  injectLatency,
  injectHttpError,
  withProbability,
} from './faultInjector.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Experiment loader ────────────────────────────────────────────────────────

let _experiments = null;

function loadExperiments() {
  if (!_experiments) {
    const configPath = path.join(__dirname, 'config', 'experiments.json');
    _experiments = JSON.parse(readFileSync(configPath, 'utf8')).experiments;
  }
  return _experiments;
}

/**
 * Returns the currently configured experiment, or null.
 * Resolved from the CHAOS_EXPERIMENT env var.
 */
function getActiveExperiment() {
  if (!isChaosEnabled()) return null;

  const id = process.env.CHAOS_EXPERIMENT;
  if (!id) return null;

  const experiments = loadExperiments();
  const experiment = experiments.find((e) => e.id === id);
  if (!experiment) {
    console.warn(`[Chaos] Unknown experiment id: "${id}"`);
  }
  return experiment ?? null;
}

// ─── Route matcher ────────────────────────────────────────────────────────────

/**
 * Returns true if the request path matches any of the experiment's target routes.
 *
 * @param {string[]} routes  e.g. ['*', '/api/v1/escrows']
 * @param {string}   reqPath e.g. '/api/v1/escrows/123'
 */
function routeMatches(routes, reqPath) {
  return routes.some((pattern) => {
    if (pattern === '*') return true;
    return reqPath.startsWith(pattern);
  });
}

// ─── Middleware ───────────────────────────────────────────────────────────────

/**
 * Express middleware that injects the configured chaos fault before
 * each matched request reaches its handler.
 *
 * @type {import('express').RequestHandler}
 */
export async function chaosMiddleware(req, res, next) {
  if (!isChaosEnabled()) return next();

  const experiment = getActiveExperiment();
  if (!experiment) return next();

  if (!routeMatches(experiment.routes, req.path)) return next();

  const { type, config, id: experimentId } = experiment;

  try {
    switch (type) {
      case 'latency':
        await withProbability(config.probability ?? 1.0, () =>
          injectLatency(config.delayMs, config.jitterMs ?? 0, experimentId),
        );
        return next();

      case 'http-error':
        await withProbability(config.probability ?? 1.0, async () => {
          injectHttpError(res, config.statusCode, config.message, experimentId);
        });
        // injectHttpError sends the response; only call next() if not injected
        if (!res.headersSent) return next();
        return;

      case 'error':
        // DB/Stellar errors are injected at the service layer; here we just
        // set a request-scoped flag that service wrappers can read.
        req.chaosExperiment = experiment;
        return next();

      case 'timeout':
        // Signal to service wrappers that they should apply a tight timeout.
        req.chaosExperiment = experiment;
        return next();

      default:
        console.warn(`[Chaos] Unknown fault type: "${type}"`);
        return next();
    }
  } catch (err) {
    // Chaos faults should never crash the server
    console.error('[Chaos] Middleware error:', err.message);
    return next();
  }
}

/**
 * Returns the active experiment attached to a request (if any).
 *
 * @param {import('express').Request} req
 * @returns {object|null}
 */
export function getRequestExperiment(req) {
  return req.chaosExperiment ?? null;
}

/**
 * Helper for service functions: checks whether the active experiment
 * targets a specific service type ('database' | 'stellar' | 'api').
 *
 * @param {import('express').Request} req
 * @param {string} target
 * @returns {boolean}
 */
export function experimentTargets(req, target) {
  const exp = getRequestExperiment(req);
  return exp?.target === target;
}
