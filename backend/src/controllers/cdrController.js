const cdrService = require('../services/cdrService');

const parseFilters = (query) => ({
  startDate: query.startDate,
  endDate: query.endDate,
  agent: query.agent,
  status: query.status,
});

const getCdrRecords = async (req, res, next) => {
  try {
    const records = await cdrService.fetchCdr(parseFilters(req.query));
    res.json({ data: records });
  } catch (error) {
    next(error);
  }
};

const getStats = async (req, res, next) => {
  try {
    const stats = await cdrService.fetchStats(parseFilters(req.query));
    res.json({ data: stats });
  } catch (error) {
    next(error);
  }
};

const createMockCdr = async (req, res, next) => {
  try {
    const count = req.body?.count ?? req.query?.count ?? 100;
    const result = await cdrService.generateMockCdr(count);
    res.status(201).json({ message: 'Mock CDR records generated', data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCdrRecords,
  getStats,
  createMockCdr,
};
