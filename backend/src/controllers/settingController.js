const settingService = require('../services/settingService');

const list = async (_req, res, next) => {
  try {
    res.json({ data: await settingService.listSettings() });
  } catch (error) {
    next(error);
  }
};

const upsert = async (req, res, next) => {
  try {
    res.json({ data: await settingService.upsertSetting(req.body) });
  } catch (error) {
    next(error);
  }
};

const testConnection = async (_req, res, next) => {
  try {
    res.json({ data: await settingService.testConnection() });
  } catch (error) {
    next(error);
  }
};

module.exports = { list, upsert, testConnection };
