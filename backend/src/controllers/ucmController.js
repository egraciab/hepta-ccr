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
    res.status(202).json({ data: { accepted: true, ...ucmService.getImportStatus(), message: 'Importación en proceso' } });
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

const importStatus = async (_req, res, next) => {
  try {
    res.json({ data: ucmService.getImportStatus() });
  } catch (error) {
    next(error);
  }
};

const debugRaw = async (_req, res, next) => {
  try {
    res.json({ data: ucmService.getDebugRaw() });
  } catch (error) {
    next(error);
  }
};

module.exports = { testConnection, importCdr, importStatus, debugRaw };
