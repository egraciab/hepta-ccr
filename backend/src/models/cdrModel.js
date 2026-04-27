const pool = require('../config/db');

const buildWhereClause = (filters) => {
  const clauses = [];
  const values = [];

  if (filters.startDate) {
    values.push(filters.startDate);
    clauses.push(`call_date >= $${values.length}`);
  }

  if (filters.endDate) {
    values.push(filters.endDate);
    clauses.push(`call_date <= $${values.length}`);
  }

  if (filters.agent) {
    values.push(filters.agent);
    clauses.push(`agent = $${values.length}`);
  }

  if (filters.status) {
    values.push(filters.status);
    clauses.push(`status = $${values.length}`);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
};

const getAllCdr = async (filters) => {
  const { where, values } = buildWhereClause(filters);
  const query = `
    SELECT id, call_date, source, destination, duration, status, agent
    FROM cdr_records
    ${where}
    ORDER BY call_date DESC
    LIMIT 1000
  `;

  const { rows } = await pool.query(query, values);
  return rows;
};

const getStats = async (filters) => {
  const { where, values } = buildWhereClause(filters);

  const totalsQuery = `
    SELECT
      COUNT(*)::int AS total_calls,
      COALESCE(ROUND(AVG(duration)::numeric, 2), 0) AS average_duration
    FROM cdr_records
    ${where}
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

  const [totals, perAgent, perDay, perStatus] = await Promise.all([
    pool.query(totalsQuery, values),
    pool.query(callsPerAgentQuery, values),
    pool.query(callsPerDayQuery, values),
    pool.query(statusDistributionQuery, values),
  ]);

  return {
    totalCalls: totals.rows[0].total_calls,
    averageDuration: Number(totals.rows[0].average_duration),
    callsPerAgent: perAgent.rows,
    callsPerDay: perDay.rows,
    statusDistribution: perStatus.rows,
  };
};

const insertMockCdr = async (records) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const query = `
      INSERT INTO cdr_records (call_date, source, destination, duration, status, agent)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;

    for (const record of records) {
      await client.query(query, [
        record.call_date,
        record.source,
        record.destination,
        record.duration,
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
  getAllCdr,
  getStats,
  insertMockCdr,
};
