const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
const settingModel = require('../models/settingModel');
const cdrModel = require('../models/cdrModel');
const pool = require('../config/db');
const licenseService = require('./licenseService');

const statusMap = {
  ANSWERED: 'contestada',
  FAILED: 'fallida',
  'NO ANSWER': 'no_contestada',
  BUSY: 'ocupado',
};

let lastRawResponse = null;
let lastFieldStats = {
  detectedFields: [],
  fieldCounts: {},
  sampleRecord: null,
};

const isDebugEnabled = () => String(process.env.UCM_DEBUG || 'false').toLowerCase() === 'true';

const nullIfEmpty = (value) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
};

const parseDate = (value) => {
  const normalized = nullIfEmpty(value);
  if (!normalized) return null;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

const saveRawPayload = async (payload) => {
  await pool.query('INSERT INTO cdr_raw (payload) VALUES ($1)', [payload]);
};

const detectFields = (records) => {
  const counts = {};
  const allKeys = new Set();

  records.forEach((record) => {
    Object.keys(record || {}).forEach((key) => {
      allKeys.add(key);
      counts[key] = (counts[key] || 0) + 1;
    });
  });

  const detectedFields = Array.from(allKeys).sort();
  lastFieldStats = {
    detectedFields,
    fieldCounts: counts,
    sampleRecord: records[0] || null,
  };

  if (isDebugEnabled()) {
    console.log('Detected fields:', detectedFields);
  }
};

const getChallenge = async (baseUrl, user) => {
  const response = await postApi(baseUrl, {
    request: { action: 'challenge', user, version: '1.0' },
  });

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

  const response = await postApi(baseUrl, {
    request: { action: 'login', user, token },
  });

  const cookie = response.data?.response?.cookie;
  if (response.data?.status !== 0 || !cookie) {
    const error = new Error('Login UCM falló');
    error.status = 502;
    throw error;
  }

  return cookie;
};

const fetchCDR = async (baseUrl, cookie, options = {}) => {
  const response = await postApi(baseUrl, {
    request: {
      action: 'cdrapi',
      cookie,
      format: 'json',
      numRecords: options.numRecords || 100,
      offset: options.offset || 0,
    },
  });

  lastRawResponse = response.data;
  await saveRawPayload(response.data);

  if (isDebugEnabled()) {
    console.log('==== UCM RAW RESPONSE START ====');
    console.dir(response.data, { depth: null });
    console.log('==== UCM RAW RESPONSE END ====');
  }

  const records = response.data?.response?.cdrs || response.data?.response?.records || [];
  const normalizedRecords = Array.isArray(records) ? records : [];
  detectFields(normalizedRecords);
  return normalizedRecords;
};

const transformRecord = (record) => {
  const dispositionRaw = nullIfEmpty(record.disposition || record.status || null);

  const mapped = {
    uniqueid: nullIfEmpty(record.uniqueid || record.Uniqueid || record.recordid || record.id),
    src: nullIfEmpty(record.src || record.Source || record.calleridnum),
    dst: nullIfEmpty(record.dst || record.Destination || record.dstnum),
    start_time: parseDate(record.starttime || record.start || record.start_time || record.calldate),
    answer_time: parseDate(record.answertime || record.answer || record.answer_time),
    end_time: parseDate(record.endtime || record.end || record.end_time),
    duration: Number.parseInt(record.duration || '0', 10) || 0,
    billsec: Number.parseInt(record.billsec || '0', 10) || 0,
    disposition: statusMap[dispositionRaw] || dispositionRaw || 'unknown',
    channel_ext: nullIfEmpty(record.channel || record.channel_ext),
    dstchannel_ext: nullIfEmpty(record.dstchannel || record.dstchannel_ext),
    action_type: nullIfEmpty(record.action_type || record.direction),
    device_info: nullIfEmpty(record.device_info || record.accountcode),
    raw: record,
  };

  if (isDebugEnabled()) {
    console.log('[UCM] mapped record:', mapped);
  }

  return mapped;
};

const getBaseUrl = (map) => {
  const url = nullIfEmpty(map.ucm_base_url);
  if (!url) return null;
  return url.replace(/\/+$/, '');
};

const importCDR = async () => {
  assertLicenseEnabled();

  const map = await getSettingsMap();
  const baseUrl = getBaseUrl(map);
  if (!baseUrl || !map.ucm_api_user || !map.ucm_api_password) {
    const error = new Error('Configura URL base y credenciales de UCM');
    error.status = 400;
    throw error;
  }

  const cookie = await login(baseUrl, map.ucm_api_user, map.ucm_api_password);
  const rows = await fetchCDR(baseUrl, cookie, { numRecords: 100, offset: 0 });
  const transformed = rows.map(transformRecord).filter((row) => row.uniqueid);

  console.log(`[UCM] registros recibidos: ${rows.length}`);

  const lastImported = nullIfEmpty(map.ucm_last_imported_start_time);
  const filtered = lastImported
    ? transformed.filter((row) => row.start_time && new Date(row.start_time) > new Date(lastImported))
    : transformed;

  const inserted = await cdrModel.insertManyCdr(filtered);
  console.log(`[UCM] registros insertados: ${inserted}`);

  if (filtered.length) {
    const newest = filtered
      .map((row) => (row.start_time ? new Date(row.start_time) : null))
      .filter(Boolean)
      .sort((a, b) => b - a)[0];

    if (newest) {
      await settingModel.upsertSetting({ key: 'ucm_last_imported_start_time', value: newest.toISOString() });
    }
  }

  return { success: true, fetched: rows.length, imported: inserted };
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

const getDebugRaw = () => ({ raw: lastRawResponse });
const getFieldStats = () => lastFieldStats;

module.exports = {
  getChallenge,
  login,
  fetchCDR,
  importCDR,
  testConnection,
  getDebugRaw,
  getFieldStats,
};
