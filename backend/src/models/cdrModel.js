const pool = require('../config/db');

const buildWhere = (filters = {}) => {
  const clauses = [];
  const values = [];

  if (filters.startDate) {
    values.push(filters.startDate);
    clauses.push(`start_time >= $${values.length}`);
  }
  if (filters.endDate) {
    values.push(filters.endDate);
    clauses.push(`start_time <= $${values.length}`);
  }
  if (filters.agent) {
    values.push(filters.agent);
    clauses.push(`channel_ext ILIKE '%' || $${values.length} || '%'`);
  }
  if (filters.status) {
    values.push(filters.status);
    clauses.push(`disposition = $${values.length}`);
  }
  if (filters.search) {
    values.push(`%${filters.search}%`);
    clauses.push(`(src ILIKE $${values.length} OR dst ILIKE $${values.length} OR uniqueid ILIKE $${values.length})`);
  }
  if (filters.hour !== undefined && filters.hour !== null && filters.hour !== '') {
    values.push(Number.parseInt(filters.hour, 10));
    clauses.push(`EXTRACT(HOUR FROM start_time) = $${values.length}`);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', values };
};

const getCdr = async (filters) => {
  const page = Math.max(Number.parseInt(filters.page || '1', 10), 1);
  const limit = Math.min(Math.max(Number.parseInt(filters.limit || '20', 10), 1), 200);
  const sortBy = ['start_time', 'src', 'dst', 'duration', 'disposition'].includes(filters.sortBy) ? filters.sortBy : 'start_time';
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const { where, values } = buildWhere(filters);
  const offset = (page - 1) * limit;

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM cdr ${where}`, values);
  const rowsResult = await pool.query(
    `SELECT id, uniqueid, src AS source, dst AS destination, start_time AS call_date, duration, disposition AS status, channel_ext
     FROM cdr ${where}
     ORDER BY ${sortBy} ${sortOrder}
     LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, limit, offset]
  );

  const total = countResult.rows[0].total;
  return {
    items: rowsResult.rows,
    total,
    page,
    limit,
    total_records: total,
    total_pages: Math.max(1, Math.ceil(total / limit)),
  };
};

const getDashboardStats = async (filters) => {
  const { where, values } = buildWhere(filters);
  const [totals, perAgent, perDay, perStatus, perHour] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS total_calls, COALESCE(ROUND(AVG(duration)::numeric,2),0) AS average_duration,
              COALESCE(SUM(CASE WHEN disposition='ANSWERED' THEN 1 ELSE 0 END),0)::int AS answered_calls,
              COALESCE(SUM(CASE WHEN disposition IN ('NO ANSWER', 'FAILED') THEN 1 ELSE 0 END),0)::int AS missed_calls
              FROM cdr ${where}`, values),
    pool.query(`SELECT channel_ext AS agent, COUNT(*)::int AS total FROM cdr ${where} GROUP BY channel_ext ORDER BY total DESC`, values),
    pool.query(`SELECT DATE(start_time) AS day, COUNT(*)::int AS total FROM cdr ${where} GROUP BY DATE(start_time) ORDER BY day ASC`, values),
    pool.query(`SELECT disposition AS status, COUNT(*)::int AS total FROM cdr ${where} GROUP BY disposition ORDER BY total DESC`, values),
    pool.query(`SELECT EXTRACT(HOUR FROM start_time)::int AS hour, COUNT(*)::int AS total FROM cdr ${where} GROUP BY EXTRACT(HOUR FROM start_time) ORDER BY hour ASC`, values),
  ]);

  return {
    totalCalls: totals.rows[0].total_calls,
    averageDuration: Number(totals.rows[0].average_duration),
    answeredCalls: totals.rows[0].answered_calls,
    missedCalls: totals.rows[0].missed_calls,
    topAgent: perAgent.rows[0]?.agent || 'N/A',
    callsPerAgent: perAgent.rows,
    callsPerDay: perDay.rows,
    statusDistribution: perStatus.rows,
    callsByHour: perHour.rows,
  };
};

const insertManyCdr = async (records) => {
  if (!records.length) return 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = `INSERT INTO cdr (uniqueid, src, dst, start_time, answer_time, end_time, duration, billsec, disposition, channel, dstchannel, channel_ext, dstchannel_ext, accountcode, caller_name, lastapp, lastdata, raw)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
               ON CONFLICT (uniqueid) DO NOTHING`;
    let inserted = 0;
    for (const r of records) {
      const res = await client.query(q, [r.uniqueid, r.src, r.dst, r.start_time, r.answer_time, r.end_time, r.duration, r.billsec, r.disposition, r.channel, r.dstchannel, r.channel_ext, r.dstchannel_ext, r.accountcode, r.caller_name, r.lastapp, r.lastdata, r.raw]);
      inserted += res.rowCount;
    }
    await client.query('COMMIT');
    return inserted;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

module.exports = { getCdr, getDashboardStats, insertManyCdr };
