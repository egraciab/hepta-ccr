const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const axios = require('axios');

const LICENSE_PATH = process.env.LICENSE_PATH || '/config/license.json';
const CACHE_PATH = process.env.LICENSE_CACHE_PATH || '/config/license_cache.json';
const REMOTE_URL = process.env.LICENSE_VALIDATE_URL || 'https://hepta.com.py/api/license/validate';
const GRACE_DAYS = Number.parseInt(process.env.LICENSE_GRACE_DAYS || '30', 10);
const CHECK_INTERVAL_MS = Number.parseInt(process.env.LICENSE_CHECK_INTERVAL_HOURS || '24', 10) * 60 * 60 * 1000;
const REMOTE_VALIDATION_DAYS = Number.parseInt(process.env.LICENSE_REMOTE_DAYS || '7', 10);

let state = {
  license: null,
  mode: 'restricted',
  valid: false,
  restricted: true,
  reason: 'Licencia no validada',
  fingerprint: '',
  last_validated_at: null,
  grace_until: null,
};

const readJsonSafe = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
};

const writeJsonSafe = (filePath, data) => {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (_error) {
    // ignore write errors
  }
};

const generateFingerprint = () => {
  let machineId = 'unknown-machine';
  try {
    machineId = fs.readFileSync('/etc/machine-id', 'utf8').trim();
  } catch (_error) {
    machineId = 'no-machine-id';
  }

  const hostname = os.hostname();
  const macs = Object.values(os.networkInterfaces())
    .flat()
    .filter((iface) => iface && !iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00')
    .map((iface) => iface.mac)
    .sort()
    .join(',');

  return crypto.createHash('sha256').update(`${machineId}|${hostname}|${macs}`).digest('hex');
};

const validateSignature = (license) => Boolean(license?.signature);

const licenseTimeValid = (license) => {
  const now = new Date();
  if (license.type === 'subscription') {
    return Boolean(license.valid_until && new Date(license.valid_until) >= now);
  }

  if (license.type === 'trial') {
    if (license.valid_until) {
      return new Date(license.valid_until) >= now;
    }

    if (!license.issued_at) return false;
    const trialEnd = new Date(license.issued_at);
    trialEnd.setDate(trialEnd.getDate() + 30);
    return trialEnd >= now;
  }

  return true;
};

const needsRemoteValidation = (lastValidatedAt) => {
  if (!lastValidatedAt) return true;
  const last = new Date(lastValidatedAt);
  const limit = new Date();
  limit.setDate(limit.getDate() - REMOTE_VALIDATION_DAYS);
  return last < limit;
};

const remoteValidate = async (license, fingerprint) => {
  const response = await axios.post(
    REMOTE_URL,
    { license_key: license.license_key, fingerprint },
    { timeout: 5000 }
  );

  return response.data;
};

const applyRestrictionState = ({ valid, mode, reason, license, cache, fingerprint }) => {
  const now = new Date();
  const graceUntil = cache?.grace_until ? new Date(cache.grace_until) : null;
  const restricted = !valid && (!graceUntil || graceUntil < now);

  state = {
    ...state,
    license,
    mode,
    valid,
    restricted,
    reason,
    fingerprint,
    last_validated_at: cache?.last_validated_at || null,
    grace_until: cache?.grace_until || null,
  };
};

const hasFeature = (feature) => {
  const features = state.license?.features || [];
  return features.includes('full') || features.includes(feature);
};

const validateLicense = async () => {
  const license = readJsonSafe(LICENSE_PATH);
  const cache = readJsonSafe(CACHE_PATH) || {};
  const fingerprint = generateFingerprint();

  if (!license) {
    applyRestrictionState({ valid: false, mode: 'restricted', reason: 'Licencia local no encontrada', license: null, cache, fingerprint });
    return state;
  }

  if (!validateSignature(license)) {
    applyRestrictionState({ valid: false, mode: 'restricted', reason: 'Firma de licencia inválida', license, cache, fingerprint });
    return state;
  }

  if (license.bound_to && license.bound_to !== fingerprint) {
    applyRestrictionState({ valid: false, mode: 'restricted', reason: 'Licencia no corresponde a esta máquina', license, cache, fingerprint });
    return state;
  }

  let valid = licenseTimeValid(license);
  let reason = valid ? 'Licencia válida' : 'Licencia expirada';

  if (needsRemoteValidation(cache.last_validated_at)) {
    try {
      const remote = await remoteValidate(license, fingerprint);
      valid = Boolean(remote.valid) && valid;
      reason = remote.valid ? reason : (remote.reason || 'Licencia rechazada por servidor');
      const grace = new Date();
      grace.setDate(grace.getDate() + GRACE_DAYS);
      writeJsonSafe(CACHE_PATH, {
        last_validated_at: new Date().toISOString(),
        grace_until: grace.toISOString(),
      });
      cache.last_validated_at = new Date().toISOString();
      cache.grace_until = grace.toISOString();
    } catch (_error) {
      reason = `${reason} (sin validación online, modo gracia si aplica)`;
    }
  }

  applyRestrictionState({ valid, mode: license.type || 'unknown', reason, license, cache, fingerprint });
  return state;
};

const initLicenseScheduler = () => {
  setInterval(() => {
    validateLicense().catch((error) => console.error('[LICENSE] validation interval error', error.message));
  }, CHECK_INTERVAL_MS);
};

const getStatus = () => ({
  mode: state.mode,
  valid: state.valid,
  restricted: state.restricted,
  reason: state.reason,
  features: state.license?.features || [],
  last_validated_at: state.last_validated_at,
  grace_until: state.grace_until,
});

module.exports = {
  validateLicense,
  initLicenseScheduler,
  getStatus,
  hasFeature,
};
