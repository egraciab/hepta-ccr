const agentModel = require('../models/agentModel');

module.exports = {
  listAgents: agentModel.listAgents,
  updateAgent: agentModel.updateAgent,
};
