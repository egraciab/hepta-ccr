const cdrModel = require('../models/cdrModel');
const { parse } = require('csv-parse/sync');

const parseCsvBuffer = (buffer) => {
  const rows = parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
  return rows.map((row, idx) => ({
    uniqueid: row.uniqueid || `csv-${Date.now()}-${idx}`,
    src: row.src || row.source || null,
    dst: row.dst || row.destination || null,
    start_time: row.start_time || row.call_date || null,
    answer_time: row.answer_time || null,
    end_time: row.end_time || null,
    duration: Number(row.duration || 0),
    billsec: Number(row.billsec || 0),
    disposition: row.disposition || row.status || 'no_contestada',
    channel_ext: row.channel_ext || row.agent || null,
    dstchannel_ext: row.dstchannel_ext || null,
    action_type: row.action_type || null,
    device_info: row.device_info || null,
    raw: row,
  }));
};

module.exports = {
  getCdr: cdrModel.getCdr,
  getDashboardStats: cdrModel.getDashboardStats,
  insertManyCdr: cdrModel.insertManyCdr,
  parseCsvBuffer,
};
