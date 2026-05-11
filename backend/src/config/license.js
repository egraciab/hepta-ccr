const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LICENSE_PATH = process.env.LICENSE_PATH || '/config/license.json';
const MACHINE_ID_PATH = process.env.MACHINE_ID_PATH || '/etc/machine-id';
const LICENSE_SECRET = process.env.LICENSE_SECRET || 'hepta-ccr-offline-license-secret';

const stableStringify = (value) => {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};

const signingPayload = (license) => {
  const { signature, ...payload } = license || {};
  return stableStringify(payload);
};

const signLicense = (license) => crypto.createHmac('sha256', LICENSE_SECRET).update(signingPayload(license)).digest('hex');

const parseDate = (value, endOfDay = false) => {
  if (!value) return null;
  const raw = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) && endOfDay ? `${raw}T23:59:59.999Z` : raw;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const loadLicense = () => {
  if (!fs.existsSync(LICENSE_PATH)) {
    const error = new Error(`Licencia no encontrada en ${LICENSE_PATH}`);
    error.code = 'LICENSE_MISSING';
    throw error;
  }

  try {
    return JSON.parse(fs.readFileSync(LICENSE_PATH, 'utf8'));
  } catch (cause) {
    const error = new Error(`Licencia inválida: no se pudo leer JSON en ${LICENSE_PATH}`);
    error.code = 'LICENSE_INVALID_JSON';
    error.cause = cause;
    throw error;
  }
};

const getMachineId = () => {
  try {
    const machineId = fs.readFileSync(MACHINE_ID_PATH, 'utf8').trim();
    if (!machineId) throw new Error('machine-id vacío');
    return machineId;
  } catch (cause) {
    const error = new Error(`No se pudo leer machine-id desde ${MACHINE_ID_PATH}`);
    error.code = 'MACHINE_ID_UNAVAILABLE';
    error.cause = cause;
    throw error;
  }
};

const verifySignature = (license) => {
  if (!license?.signature) return false;
  const expected = signLicense(license);
  const actual = String(license.signature).trim();
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(actual, 'hex');
  return expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);
};

const validateLicense = () => {
  const license = loadLicense();
  const machineId = getMachineId();

  if (!verifySignature(license)) {
    const error = new Error('Firma de licencia inválida');
    error.code = 'LICENSE_INVALID_SIGNATURE';
    throw error;
  }

  const licensedMachine = String(license.machine_id || '').trim();
  if (!licensedMachine) {
    const error = new Error('Licencia sin machine_id');
    error.code = 'LICENSE_MACHINE_ID_MISSING';
    throw error;
  }

  if (licensedMachine !== 'auto' && licensedMachine !== machineId) {
    const error = new Error('Licencia no corresponde a esta máquina');
    error.code = 'LICENSE_MACHINE_ID_MISMATCH';
    throw error;
  }

  const supportUntil = parseDate(license.support_until, true);
  const supportExpired = supportUntil ? supportUntil < new Date() : false;

  return {
    valid: true,
    supportExpired,
    client: license.client || license.customer || '',
    support_until: license.support_until || null,
    type: license.type || 'perpetual',
    issued_at: license.issued_at || null,
    machine_id: licensedMachine,
    current_machine_id: machineId,
    features: Array.isArray(license.features) ? license.features : ['full'],
    reason: supportExpired ? 'Soporte vencido; operación permitida por licencia perpetua' : 'Licencia perpetua activa',
  };
};

module.exports = {
  loadLicense,
  verifySignature,
  getMachineId,
  validateLicense,
  signLicense,
  signingPayload,
  stableStringify,
};
