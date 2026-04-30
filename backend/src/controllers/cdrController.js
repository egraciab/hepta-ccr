const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const cdrService = require('../services/cdrService');
const ucmService = require('../services/ucmService');

const parseFilters = (query) => ({
  startDate: query.startDate,
  endDate: query.endDate,
  agent: query.agent,
  agentId: query.agent_id,
  status: query.status,
  hour: query.hour,
  search: query.search,
  page: query.page,
  limit: query.limit,
  sortBy: query.sortBy,
  sortOrder: query.sortOrder,
});

const statusLabel = { ANSWERED: 'contestada', 'NO ANSWER': 'perdida', FAILED: 'fallida', BUSY: 'ocupado' };


const fields = async (_req, res, next) => {
  try {
    res.json({ data: ucmService.getFieldStats() });
  } catch (error) {
    next(error);
  }
};

const listCdr = async (req, res, next) => {
  try {
    const filters = parseFilters(req.query);
    const data = await cdrService.getCdr(filters);
    res.json({ data });
  } catch (error) {
    next(error);
  }
};

const stats = async (req, res, next) => {
  try {
    const filters = parseFilters(req.query);
    const data = await cdrService.getDashboardStats(filters);

    if (!Number.isInteger(Number.parseInt(filters.hour, 10))) {
      return res.json({ data });
    }

    const hour = Number.parseInt(filters.hour, 10);
    const details = await cdrService.getCdr({ ...filters, page: 1, limit: 5000 });
    const hourRows = details.items.filter((row) => new Date(row.call_date).getHours() === hour);

    const perAgentMap = new Map();
    const perStatusMap = new Map();
    const perDayMap = new Map();
    let totalDuration = 0;

    hourRows.forEach((row) => {
      perAgentMap.set(row.agent, (perAgentMap.get(row.agent) || 0) + 1);
      perStatusMap.set(row.status, (perStatusMap.get(row.status) || 0) + 1);
      const day = new Date(row.call_date).toISOString().slice(0, 10);
      perDayMap.set(day, (perDayMap.get(day) || 0) + 1);
      totalDuration += Number(row.duration) || 0;
    });

    const answeredCalls = perStatusMap.get('answered') || 0;
    const missedCalls = perStatusMap.get('missed') || 0;
    const callsPerAgent = Array.from(perAgentMap.entries()).map(([agent, total]) => ({ agent, total }));
    const statusDistribution = Array.from(perStatusMap.entries()).map(([status, total]) => ({ status, total }));
    const callsPerDay = Array.from(perDayMap.entries()).map(([day, total]) => ({ day, total }));

    callsPerAgent.sort((a, b) => b.total - a.total);
    statusDistribution.sort((a, b) => b.total - a.total);
    callsPerDay.sort((a, b) => a.day.localeCompare(b.day));

    res.json({
      data: {
        ...data,
        totalCalls: hourRows.length,
        averageDuration: hourRows.length ? Number((totalDuration / hourRows.length).toFixed(2)) : 0,
        answeredCalls,
        missedCalls,
        topAgent: callsPerAgent[0]?.agent || 'N/A',
        callsPerAgent,
        statusDistribution,
        callsPerDay,
      },
    });
  } catch (error) {
    next(error);
  }
};

const clear = async (_req, res, next) => {
  try {
    await cdrService.clearCdr();
    res.json({ data: { cleared: true } });
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

const getExportRows = async (query) => {
  const filters = parseFilters(query);
  const result = await cdrService.getCdr({ ...filters, page: 1, limit: 5000 });
  return result.items;
};

const exportCsv = async (req, res, next) => {
  try {
    const rows = await getExportRows(req.query);
    const header = 'call_date,source,destination,duration,status,agent';
    const lines = rows.map((row) => [row.call_date.toISOString(), row.source, row.destination, row.duration, row.status, row.agent].join(','));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="cdr_export.csv"');
    res.send([header, ...lines].join('\n'));
  } catch (error) {
    next(error);
  }
};

const exportXlsx = async (req, res, next) => {
  try {
    const rows = await getExportRows(req.query);
    const exportData = rows.map((row) => ({
      fecha: row.call_date.toISOString(),
      origen: row.source,
      destino: row.destination,
      duracion: row.duration,
      estado: statusLabel[row.status] || row.status,
      agente: row.agent,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Llamadas');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_llamadas.xlsx"');
    res.send(buffer);
  } catch (error) {
    next(error);
  }
};

const exportPdf = async (req, res, next) => {
  try {
    const rows = await getExportRows(req.query);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_llamadas.pdf"');

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.pipe(res);

    doc.fontSize(16).text('Reporte de llamadas - HEPTA CCR', { align: 'center' });
    doc.moveDown();

    rows.slice(0, 120).forEach((row) => {
      doc
        .fontSize(9)
        .text(`${row.call_date.toISOString()} | ${row.source} -> ${row.destination} | ${row.duration}s | ${statusLabel[row.status] || row.status} | ${row.agent}`);
    });

    doc.end();
  } catch (error) {
    next(error);
  }
};

module.exports = { fields, listCdr, stats, clear, importCsv, exportCsv, exportXlsx, exportPdf };
