const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
const settingModel = require('../models/settingModel');
const cdrModel = require('../models/cdrModel');
const pool = require('../config/db');
const licenseService = require('./licenseService');

let lastRawResponse = null;
let importStatus = { running: false, startedAt: null, finishedAt: null, received: 0, inserted: 0, skipped: 0, error: null };

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

  const records = response.data?.response?.cdr_root || [];
  return Array.isArray(records) ? records : [];
};

const transformRecord = (record) => ({
  uniqueid: record.uniqueid,
  src: record.src,
  dst: record.dst,
  start_time: record.start,
  answer_time: record.answer || null,
  end_time: record.end || null,
  duration: Number(record.duration || 0),
  billsec: Number(record.billsec || 0),
  disposition: record.disposition,
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
  const syncState = await pool.query('SELECT last_start_time FROM sync_state ORDER BY id DESC LIMIT 1');
  if (syncState.rowCount > 0 && syncState.rows[0].last_start_time) return syncState.rows[0].last_start_time;

  const dbMax = await pool.query('SELECT MAX(start_time) AS last_start_time FROM cdr');
  return dbMax.rows[0].last_start_time || null;
};

const persistSyncState = async (lastStartTime) => {
  await pool.query('INSERT INTO sync_state (last_start_time, last_run) VALUES ($1, NOW())', [lastStartTime]);
};

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
    let rangeStart;
    let rangeEnd = endTime || now;

    if (mode === 'full') {
      rangeStart = startTime || '2026-01-01 00:00:00';
    } else {
      const lastStart = await getLastStartTime();
      rangeStart = lastStart
        ? new Date(new Date(lastStart).getTime() + 1000).toISOString().replace('T', ' ').slice(0, 19)
        : '2026-01-01 00:00:00';
    }

    const cookie = await login(baseUrl, map.ucm_api_user, map.ucm_api_password);
    const start_date = rangeStart.split(' ')[0];
    const end_date = rangeEnd.split(' ')[0];
    console.log("UCM import mode:", mode);
    console.log("UCM import range:", { startTime: rangeStart, endTime: rangeEnd, start_date, end_date });
    const rows = await fetchCDR(baseUrl, cookie, { numRecords: 500, offset: 0, startTime: rangeStart, endTime: rangeEnd });
    const transformed = rows.map(transformRecord).filter((row) => row.uniqueid);
    console.log("UCM received:", rows.length);

    importStatus.received = rows.length;

    const inserted = await cdrModel.insertManyCdr(transformed);
    importStatus.inserted = inserted;
    importStatus.skipped = transformed.length - inserted;
    console.log("UCM inserted:", inserted);
    console.log("UCM skipped:", importStatus.skipped);

    const newestStart = transformed
      .map((row) => (row.start_time ? new Date(row.start_time) : null))
      .filter(Boolean)
      .sort((a, b) => b - a)[0];

    if (newestStart) {
      const newestIso = newestStart.toISOString();
      await settingModel.upsertSetting({ key: 'ucm_last_imported_start_time', value: newestIso });
      await persistSyncState(newestIso);
    } else {
      await persistSyncState(null);
    }

    
    await pool.query(`
      INSERT INTO agents (name, extension, role, enabled, last_seen_at)
      SELECT COALESCE(NULLIF(t.caller_name, ''), COALESCE(NULLIF(t.channel_ext, ''), NULLIF(t.src, ''))),
             COALESCE(NULLIF(t.channel_ext, ''), NULLIF(t.src, '')),
             'Sin asignar',
             true,
             NOW()
      FROM cdr t
      WHERE t.start_time >= NOW() - INTERVAL '1 day'
        AND COALESCE(NULLIF(t.channel_ext, ''), NULLIF(t.src, '')) IS NOT NULL
      ON CONFLICT (extension) DO UPDATE SET last_seen_at = NOW();
    `);

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
  getImportStatus: () => importStatus,
};
