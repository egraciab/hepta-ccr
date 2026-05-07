const licenseService = require('../services/licenseService');

const requireFeature = (feature) => (req, _res, next) => {
  const status = licenseService.getStatus();

  if (status.restricted) {
    const error = new Error('Sistema en modo restringido por licencia');
    error.status = 403;
    return next(error);
  }

  if (!licenseService.hasFeature(feature)) {
    const error = new Error(`La licencia no habilita la funcionalidad: ${feature}`);
    error.status = 403;
    return next(error);
  }

  return next();
};

const blockWhenRestricted = (req, _res, next) => {
  const status = licenseService.getStatus();
  if (status.restricted) {
    const error = new Error('Licencia inválida o expirada');
    error.status = 403;
    return next(error);
  }
  return next();
};

module.exports = {
  requireFeature,
  blockWhenRestricted,
};
