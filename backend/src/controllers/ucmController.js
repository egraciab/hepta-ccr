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
    res.json({ data: await ucmService.importCDR() });
  } catch (error) {
    next(error);
  }
};

module.exports = { testConnection, importCdr };
