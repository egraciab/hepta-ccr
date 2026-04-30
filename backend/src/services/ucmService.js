const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
const settingModel = require('../models/settingModel');
const cdrModel = require('../models/cdrModel');
const licenseService = require('./licenseService');

const statusMap = {
  ANSWERED: 'contestada',
  FAILED: 'fallida',
  'NO ANSWER': 'no_contestada',
  BUSY: 'ocupado',
};

const nullIfEmpty = (value) => {
  if (value === undefined || value === null) return null;
  const str = String(value).trim();
  return str === '' ? null : str;
};

const parseDate = (value) => {
  const normalized = nullIfEmpty(value);
  if (!normalized) return null;
  return new Date(normalized);
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
  timeout: 5000,
  headers: { 'Content-Type': 'application/json' },
  httpsAgent: new https.Agent({ rejectUnauthorized: false }),
});

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

  const records = response.data?.response?.cdrs || response.data?.response?.records || [];
  return Array.isArray(records) ? records : [];
};

const transformRecord = (row) => {
  const dispositionRaw = nullIfEmpty(row.disposition || row.Disposition || row.status || 'NO ANSWER');
  return {
    uniqueid: nullIfEmpty(row.uniqueid || row.Uniqueid || row.recordid || row.id),
    src: nullIfEmpty(row.src || row.Source || row.calleridnum),
    dst: nullIfEmpty(row.dst || row.Destination || row.dstnum),
    start_time: parseDate(row.start || row.start_time || row.calldate),
    answer_time: parseDate(row.answer || row.answer_time),
    end_time: parseDate(row.end || row.end_time),
    duration: Number.parseInt(row.duration || '0', 10) || 0,
    billsec: Number.parseInt(row.billsec || '0', 10) || 0,
    disposition: statusMap[dispositionRaw] || dispositionRaw?.toLowerCase()?.replace(/\s+/g, '_') || 'no_contestada',
    channel_ext: nullIfEmpty(row.channel || row.channel_ext),
    dstchannel_ext: nullIfEmpty(row.dstchannel || row.dstchannel_ext),
    action_type: nullIfEmpty(row.action_type || row.direction),
    device_info: nullIfEmpty(row.device_info || row.accountcode),
    raw: row,
  };
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
  const transformed = rows.map(transformRecord).filter((r) => r.uniqueid && r.start_time);

  const lastImported = nullIfEmpty(map.ucm_last_imported_start_time);
  const filtered = lastImported
    ? transformed.filter((row) => new Date(row.start_time) > new Date(lastImported))
    : transformed;

  const inserted = await cdrModel.insertManyCdr(filtered);

  if (filtered.length) {
    const newest = filtered.map((row) => new Date(row.start_time)).sort((a, b) => b - a)[0];
    await settingModel.upsertSetting({ key: 'ucm_last_imported_start_time', value: newest.toISOString() });
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

module.exports = { getChallenge, login, fetchCDR, importCDR, testConnection };
