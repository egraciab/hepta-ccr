const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const PDFDocument = require('pdfkit');
const cdrService = require('../services/cdrService');
const ucmService = require('../services/ucmService');

const parseFilters = (query) => ({
  startDate: query.startDate,
  endDate: query.endDate,
  agent: query.agent,
  disposition: query.disposition,
  direction: query.direction,
  hour: query.hour,
  q: query.q,
  page: query.page,
  limit: query.limit,
  sortBy: query.sortBy,
  sortOrder: query.sortOrder,
});

const STATUS_MAP = {
  ANSWERED: 'Contestada',
  FAILED: 'Fallida',
  'NO ANSWER': 'Perdida',
  BUSY: 'Ocupado',
};
const STATUS_ALIASES = { contestada: 'ANSWERED', contestadas: 'ANSWERED', perdida: 'NO ANSWER', perdidas: 'NO ANSWER', fallida: 'FAILED', fallidas: 'FAILED', ocupado: 'BUSY' };
const statusKey = (status) => {
  const raw = String(status || '').trim();
  const upper = raw.toUpperCase();
  return STATUS_MAP[upper] ? upper : STATUS_ALIASES[raw.toLowerCase()] || upper;
};
const statusLabel = (status) => STATUS_MAP[statusKey(status)] || status || '';
const directionLabel = (direction) => ({ incoming: 'Entrante', outgoing: 'Saliente' }[direction] || 'No determinada');

const csvEscape = (value) => {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const watermarkCandidates = [
  process.env.PDF_WATERMARK_LOGO,
  path.resolve(process.cwd(), 'assets/logo.png'),
  path.resolve(process.cwd(), '../frontend/assets/logo.png'),
  path.resolve(__dirname, '../../../frontend/assets/logo.png'),
].filter(Boolean);

const findWatermarkLogo = () => watermarkCandidates.find((candidate) => fs.existsSync(candidate));

const drawWatermark = (doc) => {
  const logoPath = findWatermarkLogo();
  if (!logoPath) return;
  const width = Math.min(260, doc.page.width * 0.46);
  const x = (doc.page.width - width) / 2;
  const y = (doc.page.height - width) / 2;
  doc.save();
  doc.opacity(0.08);
  doc.image(logoPath, x, y, { width });
  doc.restore();
};


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
    res.json({ data });
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
    const header = 'call_date,source,destination,duration,status,direction,agent';
    const lines = rows.map((row) => [row.call_date.toISOString(), row.source, row.destination, row.duration, statusLabel(row.status), directionLabel(row.direction), row.agent].map(csvEscape).join(','));

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
      estado: statusLabel(row.status),
      direccion: directionLabel(row.direction),
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
    const filters = parseFilters(req.query);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="reporte_llamadas.pdf"');

    const doc = new PDFDocument({ margin: 36, size: 'A4' });
    doc.pipe(res);

    const rangeLabel = `Rango: ${filters.startDate || 'inicio'} - ${filters.endDate || 'fin'}`;
    drawWatermark(doc);
    doc.fontSize(18).fillColor('#111827').text('Reporte de Llamadas', { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#4b5563').text(rangeLabel, { align: 'center' });
    doc.moveDown(1);

    const columns = [
      { label: 'Fecha', x: 36, width: 100 },
      { label: 'Origen', x: 136, width: 62 },
      { label: 'Destino', x: 198, width: 62 },
      { label: 'Duración', x: 260, width: 58 },
      { label: 'Estado', x: 318, width: 74 },
      { label: 'Dirección', x: 392, width: 70 },
      { label: 'Agente', x: 462, width: 96 },
    ];
    const rowHeight = 20;

    const drawHeader = () => {
      const y = doc.y;
      doc.rect(36, y, 522, rowHeight).fill('#e5e7eb').stroke('#9ca3af');
      doc.fillColor('#111827').fontSize(8).font('Helvetica-Bold');
      columns.forEach((column) => doc.text(column.label, column.x + 4, y + 6, { width: column.width - 8, align: 'left' }));
      doc.y = y + rowHeight;
      doc.font('Helvetica');
    };

    const drawRow = (row) => {
      if (doc.y + rowHeight > doc.page.height - 36) {
        doc.addPage();
        drawWatermark(doc);
        drawHeader();
      }
      const y = doc.y;
      doc.rect(36, y, 522, rowHeight).stroke('#d1d5db');
      doc.fillColor('#111827').fontSize(7);
      const values = [
        row.call_date ? new Date(row.call_date).toLocaleString('es-ES') : '',
        row.source || '',
        row.destination || '',
        `${row.billsec > 0 ? row.billsec : row.duration || 0}s`,
        statusLabel(row.status),
        directionLabel(row.direction),
        row.agent || '-',
      ];
      columns.forEach((column, index) => doc.text(String(values[index]), column.x + 4, y + 6, { width: column.width - 8, align: index === 3 ? 'right' : 'left' }));
      doc.y = y + rowHeight;
    };

    drawHeader();
    rows.slice(0, 500).forEach(drawRow);

    doc.moveDown(0.8);
    doc.fontSize(8).fillColor('#6b7280').text(`Total exportado: ${rows.length}`);
    doc.end();
  } catch (error) {
    next(error);
  }
};

const exportByFormat = async (req, res, next) => {
  const f = String(req.query.format || 'csv').toLowerCase();
  if (f === 'xlsx') return exportXlsx(req, res, next);
  if (f === 'pdf') return exportPdf(req, res, next);
  return exportCsv(req, res, next);
};

module.exports = { fields, listCdr, stats, clear, importCsv, exportCsv, exportXlsx, exportPdf, exportByFormat };
