const cdrModel = require('../models/cdrModel');

const AGENTS = ['Alice', 'Bob', 'Carla', 'Diego', 'Eva'];
const STATUSES = ['answered', 'missed', 'failed'];

const randomItem = (list) => list[Math.floor(Math.random() * list.length)];

const randomPhone = (prefix) => `+1${prefix}${Math.floor(1000000 + Math.random() * 8999999)}`;

const createMockRecords = (count = 100) => {
  const parsedCount = Number.parseInt(count, 10);
  const safeCount = Number.isNaN(parsedCount) ? 100 : Math.min(Math.max(parsedCount, 1), 5000);

  const records = Array.from({ length: safeCount }, () => {
    const duration = Math.floor(Math.random() * 600);
    const daysAgo = Math.floor(Math.random() * 30);
    const minutesAgo = Math.floor(Math.random() * 1440);

    const callDate = new Date(Date.now() - (daysAgo * 24 * 60 + minutesAgo) * 60 * 1000);

    return {
      call_date: callDate.toISOString(),
      source: randomPhone('2'),
      destination: randomPhone('3'),
      duration,
      status: randomItem(STATUSES),
      agent: randomItem(AGENTS),
    };
  });

  return records;
};

const fetchCdr = async (filters) => cdrModel.getAllCdr(filters);
const fetchStats = async (filters) => cdrModel.getStats(filters);

const generateMockCdr = async (count) => {
  const records = createMockRecords(count);
  const inserted = await cdrModel.insertMockCdr(records);

  return {
    inserted,
  };
};

module.exports = {
  fetchCdr,
  fetchStats,
  generateMockCdr,
};
