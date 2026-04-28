const settingModel = require('../models/settingModel');

module.exports = {
  listSettings: settingModel.listSettings,
  upsertSetting: settingModel.upsertSetting,
};
