const pool = require('../config/db');
const { buildCdrWhereClause } = require('../utils/queryFilters');

const getCdr = async (filters) => {
  const page = Math.max(Number.parseInt(filters.page || '1', 10), 1);
  const limit = Math.min(Math.max(Number.parseInt(filters.limit || '20', 10), 1), 200);
  const sortBy = ['call_date', 'source', 'destination', 'duration', 'status', 'agent'].includes(filters.sortBy)
    ? filters.sortBy
    : 'call_date';
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const { where, values } = buildCdrWhereClause(filters);
  const countQuery = `SELECT COUNT(*)::int AS total FROM cdr_records ${where}`;
  const dataQuery = `
    SELECT id, call_date, source, destination, duration, status, agent
    FROM cdr_records
    ${where}
    ORDER BY ${sortBy} ${sortOrder}
    LIMIT $${values.length + 1}
    OFFSET $${values.length + 2}
  `;

  const offset = (page - 1) * limit;

  const [countResult, rowsResult] = await Promise.all([
    pool.query(countQuery, values),
    pool.query(dataQuery, [...values, limit, offset]),
  ]);

  return {
    items: rowsResult.rows,
    total: countResult.rows[0].total,
    page,
    limit,
  };
};

const getDashboardStats = async (filters) => {
  const { where, values } = buildCdrWhereClause(filters);

  const totalsQuery = `
    SELECT
      COUNT(*)::int AS total_calls,
      COALESCE(ROUND(AVG(duration)::numeric, 2), 0) AS average_duration,
      COALESCE(SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END), 0)::int AS answered_calls,
      COALESCE(SUM(CASE WHEN status = 'missed' THEN 1 ELSE 0 END), 0)::int AS missed_calls
    FROM cdr_records
    ${where}
  `;

  const topAgentQuery = `
    SELECT agent, COUNT(*)::int AS total
    FROM cdr_records
    ${where}
    GROUP BY agent
    ORDER BY total DESC, agent ASC
    LIMIT 1
  `;

  const callsPerAgentQuery = `
    SELECT agent, COUNT(*)::int AS total
    FROM cdr_records
    ${where}
    GROUP BY agent
    ORDER BY total DESC, agent ASC
  `;

  const callsPerDayQuery = `
    SELECT DATE(call_date) AS day, COUNT(*)::int AS total
    FROM cdr_records
    ${where}
    GROUP BY DATE(call_date)
    ORDER BY day ASC
  `;

  const statusDistributionQuery = `
    SELECT status, COUNT(*)::int AS total
    FROM cdr_records
    ${where}
    GROUP BY status
    ORDER BY total DESC, status ASC
  `;

  const callsByHourQuery = `
    SELECT EXTRACT(HOUR FROM call_date)::int AS hour, COUNT(*)::int AS total
    FROM cdr_records
    ${where}
    GROUP BY EXTRACT(HOUR FROM call_date)
    ORDER BY hour ASC
  `;

  const [totals, topAgent, perAgent, perDay, perStatus, perHour] = await Promise.all([
    pool.query(totalsQuery, values),
    pool.query(topAgentQuery, values),
    pool.query(callsPerAgentQuery, values),
    pool.query(callsPerDayQuery, values),
    pool.query(statusDistributionQuery, values),
    pool.query(callsByHourQuery, values),
  ]);

  return {
    totalCalls: totals.rows[0].total_calls,
    averageDuration: Number(totals.rows[0].average_duration),
    answeredCalls: totals.rows[0].answered_calls,
    missedCalls: totals.rows[0].missed_calls,
    topAgent: topAgent.rows[0]?.agent || 'N/A',
    callsPerAgent: perAgent.rows,
    callsPerDay: perDay.rows,
    statusDistribution: perStatus.rows,
    callsByHour: perHour.rows,
  };
};

const insertManyCdr = async (records) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const query = `INSERT INTO cdr_records (call_date, source, destination, duration, status, agent)
                   VALUES ($1, $2, $3, $4, $5, $6)`;
    for (const record of records) {
      await client.query(query, [
        record.call_date,
        record.source,
        record.destination,
        Number(record.duration) || 0,
        record.status,
        record.agent,
      ]);
    }
    await client.query('COMMIT');
    return records.length;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

module.exports = {
  getCdr,
  getDashboardStats,
  insertManyCdr,
};
