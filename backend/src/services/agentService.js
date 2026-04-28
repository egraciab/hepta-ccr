const agentModel = require('../models/agentModel');

module.exports = {
  listAgents: agentModel.listAgents,
  createAgent: agentModel.createAgent,
  updateAgent: agentModel.updateAgent,
  deleteAgent: agentModel.deleteAgent,
};
