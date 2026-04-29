const axios = require('axios');
const settingModel = require('../models/settingModel');
const licenseService = require('./licenseService');

const getSettingsMap = async () => {
  const settings = await settingModel.listSettings();
  return Object.fromEntries(settings.map((item) => [item.key, item.value]));
};

const buildBaseUrl = ({ ucm_ip, ucm_port }) => `http://${ucm_ip}:${ucm_port || '8089'}`;

const testConnection = async () => {
  const status = licenseService.getStatus();
  if (status.restricted) {
    const error = new Error('Licencia inválida o expirada');
    error.status = 403;
    throw error;
  }

  const map = await getSettingsMap();
  if (!map.ucm_ip || !map.ucm_api_user || !map.ucm_api_password) {
    const error = new Error('Configura IP, puerto y credenciales de UCM');
    error.status = 400;
    throw error;
  }

  const baseUrl = buildBaseUrl(map);

  try {
    await axios.get(`${baseUrl}/api`, {
      timeout: 5000,
      auth: {
        username: map.ucm_api_user,
        password: map.ucm_api_password,
      },
    });

    return { success: true, message: `Conexión exitosa con ${baseUrl}` };
  } catch (_error) {
    return { success: false, message: `No fue posible conectar con ${baseUrl}` };
  }
};

const fetchCDRFromUCM = async () => {
  const status = licenseService.getStatus();
  if (status.restricted) {
    const error = new Error('Licencia inválida o expirada');
    error.status = 403;
    throw error;
  }

  return { success: true, records: [], message: 'Integración UCM lista para implementar sincronización real.' };
};

module.exports = {
  testConnection,
  fetchCDRFromUCM,
};
