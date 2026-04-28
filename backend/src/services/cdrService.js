const cdrModel = require('../models/cdrModel');
const { parse } = require('csv-parse/sync');

const AGENTS = ['Alice Johnson', 'Bob Smith', 'Carla Reyes', 'Diego Silva', 'Eva Brown'];
const STATUSES = ['answered', 'missed', 'busy'];

const random = (arr) => arr[Math.floor(Math.random() * arr.length)];

const generateMockRecords = (count = 100) => {
  const size = Math.min(Math.max(Number.parseInt(count, 10) || 100, 1), 5000);
  return Array.from({ length: size }, (_, i) => {
    const duration = Math.random() < 0.2 ? 0 : 20 + Math.floor(Math.random() * 500);
    const minutesOffset = Math.floor(Math.random() * 60 * 24 * 15);

    return {
      call_date: new Date(Date.now() - minutesOffset * 60000).toISOString(),
      source: `+12${String(10000000 + i)}`,
      destination: `+13${String(10000000 + i)}`,
      duration,
      status: random(STATUSES),
      agent: random(AGENTS),
    };
  });
};

const parseCsvBuffer = (buffer) => {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return records.map((row) => ({
    call_date: row.call_date,
    source: row.source,
    destination: row.destination,
    duration: Number(row.duration || 0),
    status: row.status,
    agent: row.agent,
  }));
};

module.exports = {
  getCdr: cdrModel.getCdr,
  getDashboardStats: cdrModel.getDashboardStats,
  insertManyCdr: cdrModel.insertManyCdr,
  generateMockRecords,
  parseCsvBuffer,
};
