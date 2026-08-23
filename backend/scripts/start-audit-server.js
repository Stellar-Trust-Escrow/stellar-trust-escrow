/**
 * start-audit-server.js
 *
 * Boots a minimal Express app — using the *real* config/helmetOptions.js,
 * the actual security policy under test — for the sole purpose of the
 * security-headers CI audit.
 *
 * Deliberately does NOT boot the full production server.js. As of this
 * PR, server.js cannot start at all: paymentController.js, reputationController.js,
 * and workers/scheduler.js each import a services/*.js file that doesn't
 * exist in the repo (kycService.js, reputationService.js,
 * escrowArchiveService.js — paymentService.js was the same problem and is
 * fixed in this PR since it was blocking, isolated, and small; the other
 * three are unrelated pre-existing gaps spanning payments, reputation, and
 * archival, well outside this issue's scope to fix). Requiring the full
 * app to boot would make the security-headers audit hostage to unrelated,
 * much larger missing work. This script applies the exact same
 * helmetOptions used in server.js, so what's being audited is the real
 * policy, just without the currently-broken route tree behind it.
 *
 * Usage: node scripts/start-audit-server.js [port]
 */
import express from 'express';
import helmet from 'helmet';
import { helmetOptions, permissionsPolicyMiddleware } from '../config/helmetOptions.js';

const PORT = process.argv[2] || process.env.PORT || 4000;

const app = express();
app.use(helmet(helmetOptions));
app.use(permissionsPolicyMiddleware);

app.get('/api/health/live', (_req, res) => res.status(200).json({ status: 'ok' }));
app.use((_req, res) => res.status(404).json({ error: 'not found' }));

app.listen(PORT, () => {
  console.log(`Audit server listening on :${PORT}`);
});
