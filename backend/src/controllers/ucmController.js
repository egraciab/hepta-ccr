const ucmService = require('../services/ucmService');

const testConnection = async (_req, res, next) => {
  try {
    res.json({ data: await ucmService.testConnection() });
  } catch (error) {
    next(error);
  }
};

const fetchCdr = async (_req, res, next) => {
  try {
    res.json({ data: await ucmService.fetchCDRFromUCM() });
  } catch (error) {
    next(error);
  }
};

module.exports = { testConnection, fetchCdr };
