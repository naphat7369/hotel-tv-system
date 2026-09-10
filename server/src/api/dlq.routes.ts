import { Router, Request, Response } from 'express';
import {
  getDeadLetterEntries,
  requeueDeadLetterEntries,
  getStreamStats
} from '../lib/redis';
import { getMonitoringMetrics } from '../lib/monitoring';

const router = Router();

/**
 * GET /api/v1/analytics/admin/dlq
 * Inspect current Dead Letter Queue entries
 */
router.get('/dlq', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const entries = await getDeadLetterEntries(limit);
    const streamStats = await getStreamStats();

    res.status(200).json({
      count: entries.length,
      streamStats,
      entries
    });
  } catch (err: any) {
    console.error('[DLQ API] Error fetching DLQ entries:', err.message);
    res.status(500).json({ error: 'Failed to fetch DLQ entries', details: err.message });
  }
});

/**
 * POST /api/v1/analytics/admin/dlq/requeue
 * Requeue failed entries back into the active stream
 */
router.post('/dlq/requeue', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body; // Optional array of specific DLQ IDs to requeue
    const count = await requeueDeadLetterEntries(Array.isArray(ids) ? ids : undefined);

    res.status(200).json({
      success: true,
      requeuedCount: count,
      message: `Successfully requeued ${count} event(s) back into the processing stream.`
    });
  } catch (err: any) {
    console.error('[DLQ API] Error requeueing DLQ entries:', err.message);
    res.status(500).json({ error: 'Failed to requeue DLQ entries', details: err.message });
  }
});

/**
 * GET /api/v1/analytics/admin/metrics
 * Returns real-time health metrics including Redis stream depth and duration clamps
 */
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const streamStats = await getStreamStats();
    const monitoringMetrics = getMonitoringMetrics();

    res.status(200).json({
      timestamp: new Date().toISOString(),
      redis: streamStats,
      monitoring: monitoringMetrics
    });
  } catch (err: any) {
    res.status(500).json({ error: 'Failed to fetch metrics', details: err.message });
  }
});

export default router;
