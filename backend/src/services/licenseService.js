const offlineLicense = require('../config/license');

const CHECK_INTERVAL_MS = Number.parseInt(process.env.LICENSE_CHECK_INTERVAL_HOURS || '24', 10) * 60 * 60 * 1000;

let state = {
  valid: false,
  restricted: true,
  supportExpired: false,
  reason: 'Licencia no validada',
  client: '',
  support_until: null,
  type: 'unknown',
  features: [],
  machine_id: null,
  current_machine_id: null,
};

const applyValidState = (status) => {
  state = {
    ...state,
    ...status,
    restricted: false,
    features: status.features?.length ? status.features : ['full'],
  };
  return state;
};

const applyInvalidState = (error) => {
  state = {
    ...state,
    valid: false,
    restricted: true,
    supportExpired: false,
    reason: error.message,
    features: [],
  };
  return state;
};

const validateLicense = async () => {
  try {
    const status = offlineLicense.validateLicense();
    applyValidState(status);
    if (state.supportExpired) {
      console.warn(`[LICENSE] ${state.reason}. Cliente: ${state.client || 'N/A'}. Soporte hasta: ${state.support_until || 'N/A'}`);
    } else {
      console.log(`[LICENSE] ${state.reason}. Cliente: ${state.client || 'N/A'}`);
    }
    return state;
  } catch (error) {
    applyInvalidState(error);
    console.error(`[LICENSE] ${error.message}`);
    throw error;
  }
};

const initLicenseScheduler = () => {
  setInterval(() => {
    try {
      const status = offlineLicense.validateLicense();
      applyValidState(status);
      if (status.supportExpired) {
        console.warn(`[LICENSE] ${status.reason}. Cliente: ${status.client || 'N/A'}. Soporte hasta: ${status.support_until || 'N/A'}`);
      }
    } catch (error) {
      applyInvalidState(error);
      console.error('[LICENSE] validation interval error', error.message);
    }
  }, CHECK_INTERVAL_MS);
};

const getStatus = () => ({
  valid: state.valid,
  restricted: state.restricted,
  supportExpired: state.supportExpired,
  client: state.client,
  support_until: state.support_until,
  type: state.type,
  reason: state.reason,
  features: state.features,
  machine_id: state.machine_id,
  current_machine_id: state.current_machine_id,
});

const hasFeature = (feature) => {
  if (!state.valid) return false;
  const features = state.features?.length ? state.features : ['full'];
  return features.includes('full') || features.includes(feature);
};

module.exports = {
  validateLicense,
  initLicenseScheduler,
  getStatus,
  hasFeature,
};
