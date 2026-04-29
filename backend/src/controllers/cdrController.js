const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
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

const statusLabel = {
  answered: 'contestadas',
  missed: 'perdidas',
  busy: 'ocupado',
};

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

const reset = async (_req, res, next) => {
  try {
    const inserted = await cdrService.resetAndSeedCdr();
    res.json({ data: { inserted } });
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
  const result = await cdrService.getCdr({ ...parseFilters(query), page: 1, limit: 5000 });
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

module.exports = { listCdr, stats, mock, reset, importCsv, exportCsv, exportXlsx, exportPdf };
