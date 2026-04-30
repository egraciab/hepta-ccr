const buildCdrWhereClause = (filters = {}) => {
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
  if (filters.search) {
    values.push(`%${filters.search}%`);
    clauses.push(`(source ILIKE $${values.length} OR destination ILIKE $${values.length} OR agent ILIKE $${values.length})`);
  }

  return {
    where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
};

module.exports = { buildCdrWhereClause };
