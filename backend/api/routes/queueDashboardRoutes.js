/**
 * Queue Monitoring Dashboard Routes
 *
 * Provides real-time queue metrics and monitoring endpoints
 * for the BullMQ-based Stellar event processing system.
 *
 * @module queueDashboard
 */

import express from 'express';
import { 
  stellarEventsQueue, 
  deadLetterQueue, 
  queueMetrics,
  connection 
} from '../lib/queueConfig.js';

const router = express.Router();

/**
 * Get comprehensive queue statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const [
      mainQueueCounts,
      deadLetterCounts,
      mainQueueWaiting,
      mainQueueActive,
      mainQueueCompleted,
      mainQueueFailed,
      deadLetterWaiting,
      deadLetterActive,
      redisInfo
    ] = await Promise.all([
      stellarEventsQueue.getJobCounts(),
      deadLetterQueue.getJobCounts(),
      stellarEventsQueue.getWaiting(),
      stellarEventsQueue.getActive(),
      stellarEventsQueue.getCompleted(),
      stellarEventsQueue.getFailed(),
      deadLetterQueue.getWaiting(),
      deadLetterQueue.getActive(),
      connection.info()
    ]);

    const stats = {
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      metrics: {
        totalJobs: queueMetrics.totalJobs,
        completedJobs: queueMetrics.completedJobs,
        failedJobs: queueMetrics.failedJobs,
        retryCount: queueMetrics.retryCount,
        deadLetterCount: queueMetrics.deadLetterCount,
        failureRate: queueMetrics.getFailureRate(),
        successRate: queueMetrics.getSuccessRate(),
        processingTime: queueMetrics.getProcessingTime(),
      },
      mainQueue: {
        ...mainQueueCounts,
        waitingJobs: mainQueueWaiting.length,
        activeJobs: mainQueueActive.length,
        recentCompleted: mainQueueCompleted.slice(-10),
        recentFailed: mainQueueFailed.slice(-10),
      },
      deadLetterQueue: {
        ...deadLetterCounts,
        waitingJobs: deadLetterWaiting.length,
        activeJobs: deadLetterActive.length,
      },
      redis: {
        connected: connection.status === 'ready',
        version: redisInfo.redis_version,
        usedMemory: redisInfo.used_memory_human,
        connectedClients: redisInfo.connected_clients,
      },
      alerts: {
        highFailureRate: queueMetrics.getFailureRate() > 5,
        redisConnected: connection.status === 'ready',
        queueProcessingActive: mainQueueActive.length > 0,
      }
    };

    res.json(stats);
  } catch (error) {
    console.error('[Dashboard] Error fetching queue stats:', error);
    res.status(500).json({ error: 'Failed to fetch queue statistics' });
  }
});

/**
 * Get recent jobs with detailed information
 */
router.get('/jobs', async (req, res) => {
  try {
    const { 
      state = 'waiting', 
      limit = 50, 
      offset = 0,
      queue = 'main' 
    } = req.query;

    const targetQueue = queue === 'dead-letter' ? deadLetterQueue : stellarEventsQueue;
    
    let jobs;
    switch (state) {
      case 'waiting':
        jobs = await targetQueue.getWaiting(0, parseInt(limit));
        break;
      case 'active':
        jobs = await targetQueue.getActive();
        break;
      case 'completed':
        jobs = await targetQueue.getCompleted(0, parseInt(limit));
        break;
      case 'failed':
        jobs = await targetQueue.getFailed(0, parseInt(limit));
        break;
      default:
        jobs = await targetQueue.getWaiting(0, parseInt(limit));
    }

    const jobDetails = await Promise.all(
      jobs.map(async (job) => {
        const jobData = await job.getData();
        return {
          id: job.id,
          name: job.name,
          data: jobData,
          opts: job.opts,
          progress: job.progress,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
        };
      })
    );

    res.json({
      jobs: jobDetails,
      pagination: {
        limit: parseInt(limit),
        offset: parseInt(offset),
        total: jobDetails.length,
      }
    });
  } catch (error) {
    console.error('[Dashboard] Error fetching jobs:', error);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

/**
 * Get detailed job information by ID
 */
router.get('/jobs/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { queue = 'main' } = req.query;
    
    const targetQueue = queue === 'dead-letter' ? deadLetterQueue : stellarEventsQueue;
    const job = await targetQueue.getJob(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const jobData = await job.getData();
    const jobLogs = await job.getLogs();
    
    res.json({
      id: job.id,
      name: job.name,
      data: jobData,
      opts: job.opts,
      progress: job.progress,
      processedOn: job.processedOn,
      finishedOn: job.finishedOn,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      logs: jobLogs,
      queueKey: job.queueKey,
    });
  } catch (error) {
    console.error('[Dashboard] Error fetching job details:', error);
    res.status(500).json({ error: 'Failed to fetch job details' });
  }
});

/**
 * Retry a failed job
 */
router.post('/jobs/:id/retry', async (req, res) => {
  try {
    const { id } = req.params;
    const { queue = 'main' } = req.query;
    
    const targetQueue = queue === 'dead-letter' ? deadLetterQueue : stellarEventsQueue;
    const job = await targetQueue.getJob(id);
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    if (job.finishedOn && !job.failedReason) {
      return res.status(400).json({ error: 'Job was not failed, cannot retry' });
    }

    // Clone the job to retry it
    await job.retry();
    
    res.json({ message: 'Job queued for retry', jobId: id });
  } catch (error) {
    console.error('[Dashboard] Error retrying job:', error);
    res.status(500).json({ error: 'Failed to retry job' });
  }
});

/**
 * Clean up completed/failed jobs
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { 
      state = 'completed', 
      keepLast = 100,
      queue = 'main' 
    } = req.body;
    
    const targetQueue = queue === 'dead-letter' ? deadLetterQueue : stellarEventsQueue;
    
    let cleanedCount = 0;
    if (state === 'completed') {
      cleanedCount = await targetQueue.clean(0, keepLast, 'completed');
    } else if (state === 'failed') {
      cleanedCount = await targetQueue.clean(0, keepLast, 'failed');
    }
    
    res.json({ 
      message: `Cleaned up ${cleanedCount} ${state} jobs`,
      cleanedCount 
    });
  } catch (error) {
    console.error('[Dashboard] Error cleaning up jobs:', error);
    res.status(500).json({ error: 'Failed to cleanup jobs' });
  }
});

/**
 * Pause/Resume queue processing
 */
router.post('/queue/:action', async (req, res) => {
  try {
    const { action } = req.params;
    const { queue = 'main' } = req.query;
    
    if (!['pause', 'resume'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use pause or resume' });
    }
    
    const targetQueue = queue === 'dead-letter' ? deadLetterQueue : stellarEventsQueue;
    
    if (action === 'pause') {
      await targetQueue.pause();
      res.json({ message: `${queue} queue paused` });
    } else {
      await targetQueue.resume();
      res.json({ message: `${queue} queue resumed` });
    }
  } catch (error) {
    console.error('[Dashboard] Error controlling queue:', error);
    res.status(500).json({ error: 'Failed to control queue' });
  }
});

/**
 * Reset queue metrics
 */
router.post('/metrics/reset', async (req, res) => {
  try {
    queueMetrics.reset();
    res.json({ message: 'Queue metrics reset successfully' });
  } catch (error) {
    console.error('[Dashboard] Error resetting metrics:', error);
    res.status(500).json({ error: 'Failed to reset metrics' });
  }
});

/**
 * HTML Dashboard (simple version)
 */
router.get('/', (req, res) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stellar Event Queue Dashboard</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; }
        .card { background: white; padding: 20px; margin: 10px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
        .metric { text-align: center; padding: 15px; background: #f8f9fa; border-radius: 6px; }
        .metric-value { font-size: 2em; font-weight: bold; color: #007bff; }
        .metric-label { color: #666; margin-top: 5px; }
        .alert { padding: 10px; border-radius: 4px; margin: 10px 0; }
        .alert-warning { background: #fff3cd; border: 1px solid #ffeaa7; color: #856404; }
        .alert-danger { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
        .btn { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; margin: 5px; }
        .btn-primary { background: #007bff; color: white; }
        .btn-warning { background: #ffc107; color: black; }
        .btn-danger { background: #dc3545; color: white; }
        .refresh { float: right; }
        .status { display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 0.8em; }
        .status-success { background: #d4edda; color: #155724; }
        .status-warning { background: #fff3cd; color: #856404; }
        .status-danger { background: #f8d7da; color: #721c24; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Stellar Event Queue Dashboard <button class="btn btn-primary refresh" onclick="location.reload()">Refresh</button></h1>
        
        <div id="alerts"></div>
        
        <div class="card">
            <h2>Queue Metrics</h2>
            <div class="metrics" id="metrics"></div>
        </div>
        
        <div class="card">
            <h2>Queue Status</h2>
            <div id="queue-status"></div>
        </div>
        
        <div class="card">
            <h2>Recent Jobs</h2>
            <div id="recent-jobs"></div>
        </div>
        
        <div class="card">
            <h2>Queue Controls</h2>
            <button class="btn btn-warning" onclick="pauseQueue()">Pause Queue</button>
            <button class="btn btn-primary" onclick="resumeQueue()">Resume Queue</button>
            <button class="btn btn-danger" onclick="cleanupJobs()">Cleanup Jobs</button>
            <button class="btn btn-primary" onclick="resetMetrics()">Reset Metrics</button>
        </div>
    </div>

    <script>
        async function fetchStats() {
            try {
                const response = await fetch('/admin/queues/stats');
                const stats = await response.json();
                updateDashboard(stats);
            } catch (error) {
                console.error('Error fetching stats:', error);
            }
        }
        
        function updateDashboard(stats) {
            // Update alerts
            const alertsDiv = document.getElementById('alerts');
            alertsDiv.innerHTML = '';
            
            if (stats.alerts.highFailureRate) {
                alertsDiv.innerHTML += '<div class="alert alert-warning">⚠️ High failure rate detected: ' + stats.metrics.failureRate.toFixed(2) + '%</div>';
            }
            if (!stats.alerts.redisConnected) {
                alertsDiv.innerHTML += '<div class="alert alert-danger">❌ Redis connection lost</div>';
            }
            if (!stats.alerts.queueProcessingActive && stats.mainQueue.waitingJobs > 0) {
                alertsDiv.innerHTML += '<div class="alert alert-warning">⚠️ Queue has waiting jobs but no active processing</div>';
            }
            
            // Update metrics
            const metricsDiv = document.getElementById('metrics');
            metricsDiv.innerHTML = \`
                <div class="metric">
                    <div class="metric-value">\${stats.metrics.totalJobs}</div>
                    <div class="metric-label">Total Jobs</div>
                </div>
                <div class="metric">
                    <div class="metric-value">\${stats.metrics.completedJobs}</div>
                    <div class="metric-label">Completed</div>
                </div>
                <div class="metric">
                    <div class="metric-value">\${stats.metrics.failedJobs}</div>
                    <div class="metric-label">Failed</div>
                </div>
                <div class="metric">
                    <div class="metric-value">\${stats.metrics.failureRate.toFixed(2)}%</div>
                    <div class="metric-label">Failure Rate</div>
                </div>
                <div class="metric">
                    <div class="metric-value">\${stats.mainQueue.waitingJobs}</div>
                    <div class="metric-label">Waiting</div>
                </div>
                <div class="metric">
                    <div class="metric-value">\${stats.mainQueue.activeJobs}</div>
                    <div class="metric-label">Active</div>
                </div>
                <div class="metric">
                    <div class="metric-value">\${stats.deadLetterCount}</div>
                    <div class="metric-label">Dead Letter</div>
                </div>
                <div class="metric">
                    <div class="metric-value">\${(stats.metrics.processingTime / 1000 / 60).toFixed(1)}m</div>
                    <div class="metric-label">Uptime</div>
                </div>
            \`;
            
            // Update queue status
            const statusDiv = document.getElementById('queue-status');
            statusDiv.innerHTML = \`
                <p><strong>Redis Status:</strong> <span class="status \${stats.redis.connected ? 'status-success' : 'status-danger'}">\${stats.redis.connected ? 'Connected' : 'Disconnected'}</span></p>
                <p><strong>Redis Version:</strong> \${stats.redis.version}</p>
                <p><strong>Memory Usage:</strong> \${stats.redis.usedMemory}</p>
                <p><strong>Connected Clients:</strong> \${stats.redis.connectedClients}</p>
            \`;
            
            // Update recent jobs
            const jobsDiv = document.getElementById('recent-jobs');
            const recentFailed = stats.mainQueue.recentFailed.slice(0, 5);
            if (recentFailed.length > 0) {
                jobsDiv.innerHTML = '<h3>Recent Failed Jobs</h3><ul>' + 
                    recentFailed.map(job => \`
                        <li>
                            <strong>Job \${job.id}:</strong> \${job.failedReason}
                            <button class="btn btn-primary" onclick="retryJob('\${job.id}')">Retry</button>
                        </li>
                    \`).join('') + '</ul>';
            } else {
                jobsDiv.innerHTML = '<p>No recent failed jobs</p>';
            }
        }
        
        async function pauseQueue() {
            try {
                await fetch('/admin/queues/queue/pause', { method: 'POST' });
                alert('Queue paused');
                fetchStats();
            } catch (error) {
                alert('Error pausing queue: ' + error.message);
            }
        }
        
        async function resumeQueue() {
            try {
                await fetch('/admin/queues/queue/resume', { method: 'POST' });
                alert('Queue resumed');
                fetchStats();
            } catch (error) {
                alert('Error resuming queue: ' + error.message);
            }
        }
        
        async function cleanupJobs() {
            try {
                await fetch('/admin/queues/cleanup', { 
                    method: 'POST', 
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ state: 'completed', keepLast: 50 })
                });
                alert('Jobs cleaned up');
                fetchStats();
            } catch (error) {
                alert('Error cleaning up jobs: ' + error.message);
            }
        }
        
        async function resetMetrics() {
            try {
                await fetch('/admin/queues/metrics/reset', { method: 'POST' });
                alert('Metrics reset');
                fetchStats();
            } catch (error) {
                alert('Error resetting metrics: ' + error.message);
            }
        }
        
        async function retryJob(jobId) {
            try {
                await fetch(\`/admin/queues/jobs/\${jobId}/retry\`, { method: 'POST' });
                alert('Job queued for retry');
                fetchStats();
            } catch (error) {
                alert('Error retrying job: ' + error.message);
            }
        }
        
        // Auto-refresh every 5 seconds
        setInterval(fetchStats, 5000);
        fetchStats();
    </script>
</body>
</html>`;
  
  res.send(html);
});

export default router;
