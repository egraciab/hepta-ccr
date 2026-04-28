const settingModel = require('../models/settingModel');

const validateSetting = ({ key, value }) => {
  if (!key || typeof key !== 'string') {
    const error = new Error('Clave de configuración inválida');
    error.status = 400;
    throw error;
  }

  if (typeof value !== 'string') {
    const error = new Error('Valor de configuración inválido');
    error.status = 400;
    throw error;
  }

  if (key === 'ucm_ip') {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;
    if (!ipRegex.test(value)) {
      const error = new Error('La IP de la central no tiene un formato válido');
      error.status = 400;
      throw error;
    }
  }

  if ((key === 'api_username' || key === 'api_password') && value.trim().length < 3) {
    const error = new Error('Las credenciales deben tener al menos 3 caracteres');
    error.status = 400;
    throw error;
  }
};

const testConnection = async () => {
  const settings = await settingModel.listSettings();
  const map = Object.fromEntries(settings.map((item) => [item.key, item.value]));

  if (!map.ucm_ip || !map.api_username || !map.api_password) {
    const error = new Error('Configura IP, usuario y contraseña antes de probar conexión');
    error.status = 400;
    throw error;
  }

  return {
    success: true,
    message: `Conexión simulada exitosa con UCM en ${map.ucm_ip}`,
  };
};

module.exports = {
  listSettings: settingModel.listSettings,
  upsertSetting: (payload) => {
    validateSetting(payload);
    return settingModel.upsertSetting(payload);
  },
  testConnection,
};
