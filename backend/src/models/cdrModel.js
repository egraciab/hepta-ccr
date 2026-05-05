const pool = require('../config/db');

const AGENT_DISPLAY_SQL = "COALESCE(NULLIF(agents.alias, ''), NULLIF(agents.name, ''), NULLIF(cdr.caller_name, ''), NULLIF(cdr.channel_ext, ''), NULLIF(cdr.src, ''), '-')";
const CDR_JOIN_SQL = "FROM cdr LEFT JOIN agents ON agents.extension = COALESCE(NULLIF(cdr.channel_ext, ''), NULLIF(cdr.src, ''))";

const buildWhere = (filters = {}) => {
  const clauses = ['(agents.id IS NULL OR agents.enabled = true)'];
  const values = [];

  if (filters.startDate) {
    values.push(filters.startDate);
    clauses.push(`cdr.start_time >= $${values.length}`);
  }
  if (filters.endDate) {
    values.push(filters.endDate);
    clauses.push(`cdr.start_time <= $${values.length}`);
  }
  if (filters.agent) {
    values.push(filters.agent);
    clauses.push(`${AGENT_DISPLAY_SQL} = $${values.length}`);
  }
  if (filters.disposition) {
    values.push(filters.disposition);
    clauses.push(`cdr.disposition = $${values.length}`);
  }
  if (filters.q) {
    values.push(`%${filters.q}%`);
    clauses.push(`(cdr.src ILIKE $${values.length} OR cdr.dst ILIKE $${values.length} OR cdr.caller_name ILIKE $${values.length} OR cdr.channel_ext ILIKE $${values.length} OR cdr.dstchannel_ext ILIKE $${values.length})`);
  }
  if (filters.hour !== undefined && filters.hour !== null && filters.hour !== '') {
    values.push(Number.parseInt(filters.hour, 10));
    clauses.push(`EXTRACT(HOUR FROM cdr.start_time) = $${values.length}`);
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, values };
};

const sortColumns = {
  id: 'cdr.id',
  call_date: 'cdr.start_time',
  start_time: 'cdr.start_time',
  source: 'cdr.src',
  src: 'cdr.src',
  destination: 'cdr.dst',
  dst: 'cdr.dst',
  duration: 'cdr.duration',
  disposition: 'cdr.disposition',
  status: 'cdr.disposition',
};

const getCdr = async (filters) => {
  const page = Math.max(Number.parseInt(filters.page || '1', 10), 1);
  const limit = Math.min(Math.max(Number.parseInt(filters.limit || '20', 10), 1), 200);
  const sortBy = sortColumns[filters.sortBy] || 'cdr.start_time';
  const sortOrder = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';

  const { where, values } = buildWhere(filters);
  const offset = (page - 1) * limit;

  const countResult = await pool.query(`SELECT COUNT(*)::int AS total ${CDR_JOIN_SQL} ${where}`, values);
  const rowsResult = await pool.query(
    `SELECT cdr.id,
            cdr.uniqueid,
            cdr.src AS source,
            cdr.dst AS destination,
            cdr.start_time AS call_date,
            cdr.duration,
            cdr.billsec,
            cdr.disposition AS status,
            ${AGENT_DISPLAY_SQL} AS agent
     ${CDR_JOIN_SQL}
     ${where}
     ORDER BY ${sortBy} ${sortOrder}, cdr.id DESC
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
    pool.query(`SELECT COUNT(*)::int AS total_calls,
                       COALESCE(ROUND(AVG(CASE WHEN cdr.billsec > 0 THEN cdr.billsec ELSE cdr.duration END)::numeric,2),0) AS average_duration,
                       COALESCE(SUM(CASE WHEN cdr.disposition='contestada' THEN 1 ELSE 0 END),0)::int AS answered_calls,
                       COALESCE(SUM(CASE WHEN cdr.disposition IN ('perdida','fallida','ocupado') THEN 1 ELSE 0 END),0)::int AS missed_calls
                ${CDR_JOIN_SQL}
                ${where}`, values),
    pool.query(`SELECT ${AGENT_DISPLAY_SQL} AS agent, COUNT(*)::int AS total
                ${CDR_JOIN_SQL}
                ${where}
                GROUP BY 1
                ORDER BY total DESC`, values),
    pool.query(`SELECT DATE(cdr.start_time) AS day, COUNT(*)::int AS total
                ${CDR_JOIN_SQL}
                ${where}
                GROUP BY DATE(cdr.start_time)
                ORDER BY day ASC`, values),
    pool.query(`SELECT cdr.disposition AS status, COUNT(*)::int AS total
                ${CDR_JOIN_SQL}
                ${where}
                GROUP BY cdr.disposition
                ORDER BY total DESC`, values),
    pool.query(`SELECT EXTRACT(HOUR FROM cdr.start_time)::int AS hour, COUNT(*)::int AS total
                ${CDR_JOIN_SQL}
                ${where}
                GROUP BY EXTRACT(HOUR FROM cdr.start_time)
                ORDER BY hour ASC`, values),
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
    const q = `INSERT INTO cdr (uniqueid, src, dst, start_time, answer_time, end_time, duration, billsec, disposition, channel, dstchannel, channel_ext, dstchannel_ext, accountcode, caller_name, action_owner, action_type, src_trunk_name, dst_trunk_name, device_info, lastapp, lastdata, raw)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
               ON CONFLICT (uniqueid) DO NOTHING`;
    let inserted = 0;
    for (const r of records) {
      const res = await client.query(q, [r.uniqueid, r.src, r.dst, r.start_time, r.answer_time, r.end_time, r.duration, r.billsec, r.disposition, r.channel, r.dstchannel, r.channel_ext, r.dstchannel_ext, r.accountcode, r.caller_name, r.action_owner, r.action_type, r.src_trunk_name, r.dst_trunk_name, r.device_info, r.lastapp, r.lastdata, r.raw]);
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

const clearCdr = async () => {
  await pool.query('TRUNCATE TABLE cdr RESTART IDENTITY');
};

module.exports = { getCdr, getDashboardStats, insertManyCdr, clearCdr };
