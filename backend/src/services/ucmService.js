const axios = require('axios');
const https = require('https');
const settingModel = require('../models/settingModel');
const licenseService = require('./licenseService');

const getSettingsMap = async () => {
  const settings = await settingModel.listSettings();
  return Object.fromEntries(settings.map((item) => [item.key, item.value]));
};

const getBaseUrl = (map) => {
  if (map.ucm_base_url) {
    return map.ucm_base_url.replace(/\/+$/, '');
  }

  const protocol = map.ucm_protocol || 'http';
  const host = map.ucm_host || map.ucm_ip;
  const port = map.ucm_port || '8089';

  if (!host) return null;
  return `${protocol}://${host}:${port}`;
};

const assertLicenseEnabled = () => {
  const status = licenseService.getStatus();
  if (status.restricted) {
    const error = new Error('Licencia inválida o expirada');
    error.status = 403;
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
    await axios.get(`${baseUrl}/api`, {
      timeout: 5000,
      auth: {
        username: map.ucm_api_user,
        password: map.ucm_api_password,
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    return { success: true, message: `Conexión exitosa con ${baseUrl}` };
  } catch (error) {
    return {
      success: false,
      message: `No fue posible conectar con ${baseUrl}: ${error.message}`,
    };
  }
};

const fetchCDRFromUCM = async () => {
  assertLicenseEnabled();
  return {
    success: true,
    records: [],
    message: 'Integración UCM lista para implementar sincronización real.',
  };
};

module.exports = {
  testConnection,
  fetchCDRFromUCM,
};
