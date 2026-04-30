const ucmService = require('../services/ucmService');

const testConnection = async (_req, res, next) => {
  try {
    res.json({ data: await ucmService.testConnection() });
  } catch (error) {
    next(error);
  }
};

const importCdr = async (_req, res, next) => {
  try {
    res.status(202).json({ data: { accepted: true, message: 'Importación en proceso' } });
    setImmediate(async () => {
      try {
        await ucmService.importCDR();
      } catch (error) {
        console.error('[UCM] import background error', error.message);
      }
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { testConnection, importCdr };
