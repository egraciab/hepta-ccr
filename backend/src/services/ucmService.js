const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
const settingModel = require('../models/settingModel');
const cdrModel = require('../models/cdrModel');
const pool = require('../config/db');
const licenseService = require('./licenseService');

let lastRawResponse = null;
let importStatus = { running: false, startedAt: null, finishedAt: null, received: 0, inserted: 0, skipped: 0, error: null };
let lastFieldStats = { detectedFields: [], fieldCounts: {}, sampleRecord: null };

const dispositionMap = {
  ANSWERED: 'contestada',
  'NO ANSWER': 'perdida',
  FAILED: 'fallida',
  BUSY: 'ocupado',
};

const nullIfEmpty = (value) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
};

const getSettingsMap = async () => {
  const settings = await settingModel.listSettings();
  return Object.fromEntries(settings.map((item) => [item.key, item.value]));
};

const assertLicenseEnabled = () => {
  if (licenseService.getStatus().restricted) {
    const error = new Error('Licencia inválida o expirada');
    error.status = 403;
    throw error;
  }
};

const postApi = async (baseUrl, payload) => axios.post(`${baseUrl}/api`, payload, {
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
});

const getChallenge = async (baseUrl, user) => {
  const response = await postApi(baseUrl, { request: { action: 'challenge', user, version: '1.0' } });
  const challenge = response.data?.response?.challenge;
  if (!challenge) {
    const error = new Error('No se pudo obtener challenge desde UCM');
    error.status = 502;
    throw error;
  }
  return challenge;
};

const login = async (baseUrl, user, password) => {
  const challenge = await getChallenge(baseUrl, user);
  const token = crypto.createHash('md5').update(`${challenge}${password}`).digest('hex');
  const response = await postApi(baseUrl, { request: { action: 'login', user, token } });
  const cookie = response.data?.response?.cookie;
  if (response.data?.status !== 0 || !cookie) {
    const error = new Error('Login UCM falló');
    error.status = 502;
    throw error;
  }
  return cookie;
};


const isValidCdrRecord = (record) => Boolean(record && typeof record === 'object' && nullIfEmpty(record.uniqueid));

const extractCdrRecords = (cdrRoot = []) => {
  if (!Array.isArray(cdrRoot)) return [];

  return cdrRoot.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];

    const subRecords = Object.keys(entry)
      .filter((key) => /^sub_cdr_\d+$/.test(key))
      .sort((a, b) => Number(a.replace('sub_cdr_', '')) - Number(b.replace('sub_cdr_', '')))
      .map((key) => entry[key])
      .filter(isValidCdrRecord);

    if (subRecords.length) return subRecords;
    if (isValidCdrRecord(entry)) return [entry];
    if (isValidCdrRecord(entry.main_cdr)) return [entry.main_cdr];
    return [];
  });
};

const detectFields = (records) => {
  const fieldCounts = {};
  const fields = new Set();
  records.forEach((record) => {
    Object.keys(record || {}).forEach((field) => {
      fields.add(field);
      fieldCounts[field] = (fieldCounts[field] || 0) + 1;
    });
  });
  lastFieldStats = { detectedFields: Array.from(fields).sort(), fieldCounts, sampleRecord: records[0] || null };
};

const normalizeDisposition = (value) => dispositionMap[String(value || '').trim().toUpperCase()] || nullIfEmpty(value);

const fetchCDR = async (baseUrl, cookie, options = {}) => {
  const response = await postApi(baseUrl, {
    request: {
      action: 'cdrapi',
      cookie,
      format: 'json',
      numRecords: options.numRecords || 500,
      offset: options.offset || 0,
      start_date: options.startTime ? options.startTime.split(' ')[0] : undefined,
      end_date: options.endTime ? options.endTime.split(' ')[0] : undefined,
    },
  });

  lastRawResponse = response.data;
  await pool.query('INSERT INTO cdr_raw (payload) VALUES ($1)', [response.data]);

  const cdrRoot = Array.isArray(response.data?.response?.cdr_root) ? response.data.response.cdr_root : [];
  const records = extractCdrRecords(cdrRoot);
  detectFields(records);
  return records;
};

const buildRecordUniqueKey = (record) => {
  const uniqueId = nullIfEmpty(record.uniqueid) || nullIfEmpty(record.unique_id);
  if (uniqueId) return uniqueId;
  if (record.start && record.src && record.dst) return `${record.start}|${record.src}|${record.dst}`;
  return null;
};

const transformRecord = (record) => ({
  uniqueid: buildRecordUniqueKey(record),
  src: record.src,
  dst: record.dst,
  start_time: record.start,
  answer_time: record.answer || null,
  end_time: record.end || null,
  duration: Number(record.duration || 0),
  billsec: Number(record.billsec || 0),
  disposition: normalizeDisposition(record.disposition),
  channel: record.channel,
  dstchannel: record.dstchannel,
  channel_ext: record.channel_ext,
  dstchannel_ext: record.dstchannel_ext,
  accountcode: record.accountcode,
  caller_name: record.caller_name,
  action_owner: record.action_owner,
  action_type: record.action_type,
  src_trunk_name: record.src_trunk_name,
  dst_trunk_name: record.dst_trunk_name,
  device_info: record.device_info,
  lastapp: record.lastapp,
  lastdata: record.lastdata,
  raw: record,
});

const getBaseUrl = (map) => {
  const url = nullIfEmpty(map.ucm_base_url);
  return url ? url.replace(/\/+$/, '') : null;
};

const getLastStartTime = async () => {
  const dbMax = await pool.query('SELECT MAX(start_time) AS last_start_time FROM cdr');
  return dbMax.rows[0].last_start_time || null;
};

const persistSyncState = async (lastStartTime) => {
  await pool.query('INSERT INTO sync_state (last_start_time, last_run) VALUES ($1, NOW())', [lastStartTime]);
};

const syncAgentsFromRecords = async (records) => {
  for (const record of records) {
    const extension = nullIfEmpty(record.channel_ext) || nullIfEmpty(record.src);
    if (!extension) continue;
    const name = nullIfEmpty(record.caller_name) || extension;
    await pool.query(
      `INSERT INTO agents (name, extension, role, enabled, last_seen_at)
       VALUES ($1, $2, 'Sin asignar', true, NOW())
       ON CONFLICT (extension) DO UPDATE SET last_seen_at = NOW()`,
      [name, extension]
    );
  }
};

const isWithinImportRange = (record, rangeStart, rangeEnd, lastStartTime) => {
  if (!record.start_time) return false;
  const startedAt = new Date(record.start_time);
  if (Number.isNaN(startedAt.getTime())) return false;

  if (lastStartTime && startedAt <= new Date(lastStartTime)) return false;
  if (rangeStart && startedAt < new Date(rangeStart)) return false;
  if (rangeEnd && startedAt > new Date(rangeEnd)) return false;
  return true;
};

const fingerprintBatch = (records) => records.map((record) => record.uniqueid).filter(Boolean).join('|');

const importCDR = async ({ mode = 'incremental', startTime, endTime } = {}) => {
  importStatus = { running: true, startedAt: new Date().toISOString(), finishedAt: null, received: 0, inserted: 0, skipped: 0, error: null };

  try {
    assertLicenseEnabled();

    const map = await getSettingsMap();
    const baseUrl = getBaseUrl(map);
    if (!baseUrl || !map.ucm_api_user || !map.ucm_api_password) {
      const error = new Error('Configura URL base y credenciales de UCM');
      error.status = 400;
      throw error;
    }

    const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const lastStartTime = mode === 'incremental' ? await getLastStartTime() : null;
    const rangeStart = mode === 'full'
      ? (startTime || '2026-01-01 00:00:00')
      : (lastStartTime ? new Date(new Date(lastStartTime).getTime() + 1000).toISOString().replace('T', ' ').slice(0, 19) : '2026-01-01 00:00:00');
    const rangeEnd = endTime || now;

    const cookie = await login(baseUrl, map.ucm_api_user, map.ucm_api_password);
    const start_date = rangeStart.split(' ')[0];
    const end_date = rangeEnd.split(' ')[0];
    console.log('mode:', mode);
    console.log('IMPORT RANGE:', { startTime: rangeStart, endTime: rangeEnd, start_date, end_date });

    let offset = 0;
    const limit = 500;
    let totalFetched = 0;
    let totalProcessed = 0;
    let inserted = 0;
    let skipped = 0;
    let newestStart = null;
    const seenPageFingerprints = new Set();

    while (true) {
      const batch = await fetchCDR(baseUrl, cookie, {
        offset,
        numRecords: limit,
        startTime: rangeStart,
        endTime: rangeEnd,
      });

      const batchSize = batch.length;
      console.log('FETCH PAGE:', { offset, received: batchSize });

      if (!batch || batchSize === 0) break;

      const pageFingerprint = fingerprintBatch(batch);
      if (pageFingerprint && seenPageFingerprints.has(pageFingerprint)) {
        console.log('PAGINATION BREAK: repeated batch', { offset, batchSize, totalFetched });
        break;
      }
      if (pageFingerprint) seenPageFingerprints.add(pageFingerprint);

      totalFetched += batchSize;

      const transformed = batch.map(transformRecord).filter((row) => row.uniqueid);
      const filtered = transformed.filter((row) => isWithinImportRange(row, rangeStart, rangeEnd, lastStartTime));
      totalProcessed += filtered.length;
      skipped += transformed.length - filtered.length;

      const batchInserted = await cdrModel.insertManyCdr(filtered);
      inserted += batchInserted;
      skipped += filtered.length - batchInserted;

      await syncAgentsFromRecords(filtered);

      const batchNewestStart = filtered
        .map((row) => (row.start_time ? new Date(row.start_time) : null))
        .filter(Boolean)
        .sort((a, b) => b - a)[0];

      if (batchNewestStart && (!newestStart || batchNewestStart > newestStart)) {
        newestStart = batchNewestStart;
      }

      offset += limit;
      importStatus.received = totalFetched;
      importStatus.inserted = inserted;
      importStatus.skipped = skipped;

      console.log({ offset, batchSize, totalProcessed, inserted, skipped });
      console.log('PAGINATION:', { offset, batch: batchSize, totalFetched });

      if (batchSize < limit) break;
    }

    importStatus.received = totalFetched;
    importStatus.inserted = inserted;
    importStatus.skipped = skipped;

    console.log('IMPORT RESULT:', { totalFetched, inserted, skipped });

    if (newestStart) {
      const newestIso = newestStart.toISOString();
      await settingModel.upsertSetting({ key: 'ucm_last_imported_start_time', value: newestIso });
      await persistSyncState(newestIso);
    } else {
      await persistSyncState(lastStartTime || null);
    }

    importStatus.running = false;
    importStatus.finishedAt = new Date().toISOString();

    return {
      success: true,
      message: `Recibidos ${importStatus.received} | Insertados ${importStatus.inserted} | Omitidos ${importStatus.skipped}`,
      ...importStatus,
    };
  } catch (error) {

    importStatus.running = false;
    importStatus.finishedAt = new Date().toISOString();
    importStatus.error = error.message;
    throw error;
  }
};

const testConnection = async () => {
  assertLicenseEnabled();
  const map = await getSettingsMap();
  const baseUrl = getBaseUrl(map);
  if (!baseUrl || !map.ucm_api_user || !map.ucm_api_password) {
    const error = new Error('Configura URL base y credenciales de UCM');
    error.status = 400;
    throw error;
  }

  try {
    await login(baseUrl, map.ucm_api_user, map.ucm_api_password);
    return { success: true, message: `Conexión exitosa con ${baseUrl}` };
    } catch (error) {
    return { success: false, message: error.message };
  }
};

module.exports = {
  getChallenge,
  login,
  fetchCDR,
  importCDR,
  testConnection,
  getDebugRaw: () => ({ raw: lastRawResponse }),
  getFieldStats: () => lastFieldStats,
  getImportStatus: () => importStatus,
};
