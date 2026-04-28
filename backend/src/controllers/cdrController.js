const cdrService = require('../services/cdrService');

const parseFilters = (query) => ({
  startDate: query.startDate,
  endDate: query.endDate,
  agent: query.agent,
  status: query.status,
  search: query.search,
  page: query.page,
  limit: query.limit,
  sortBy: query.sortBy,
  sortOrder: query.sortOrder,
});

const listCdr = async (req, res, next) => {
  try {
    const data = await cdrService.getCdr(parseFilters(req.query));
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

const stats = async (req, res, next) => {
  try {
    const data = await cdrService.getDashboardStats(parseFilters(req.query));
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

const mock = async (req, res, next) => {
  try {
    const records = cdrService.generateMockRecords(req.body?.count || 100);
    const inserted = await cdrService.insertManyCdr(records);
    res.status(201).json({ data: { inserted } });
  } catch (error) {
    next(error);
  }
};

const importCsv = async (req, res, next) => {
  try {
    if (!req.file) {
      const error = new Error('CSV file is required');
      error.status = 400;
      throw error;
    }

    const records = cdrService.parseCsvBuffer(req.file.buffer);
    const inserted = await cdrService.insertManyCdr(records);

    res.status(201).json({ data: { inserted } });
  } catch (error) {
    next(error);
  }
};

const exportCsv = async (req, res, next) => {
  try {
    const result = await cdrService.getCdr({ ...parseFilters(req.query), page: 1, limit: 5000 });
    const header = 'call_date,source,destination,duration,status,agent';
    const lines = result.items.map((row) =>
      [row.call_date.toISOString(), row.source, row.destination, row.duration, row.status, row.agent].join(',')
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="cdr_export.csv"');
    res.send([header, ...lines].join('\n'));
  } catch (error) {
    next(error);
  }
};

module.exports = { listCdr, stats, mock, importCsv, exportCsv };
