import { logControllerError } from '../../config/logger.js';
import { getCachedPrice } from '../../services/priceOracleService.js';

/** GET /api/v1/market/xlm-usd */
const getXlmUsd = async (req, res) => {
  try {
    const entry = await getCachedPrice();
    if (!entry) {
      return res.status(503).json({
        error: { code: 'PRICE_UNAVAILABLE', message: 'XLM/USD price is temporarily unavailable.' },
      });
    }
    return res.json(entry);
  } catch (err) {
    logControllerError('marketController.getXlmUsd', err, req);
    return res.status(503).json({
      error: { code: 'PRICE_UNAVAILABLE', message: 'XLM/USD price is temporarily unavailable.' },
    });
  }
};

export default { getXlmUsd };
