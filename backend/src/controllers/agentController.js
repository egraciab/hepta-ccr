const agentService = require('../services/agentService');

const list = async (req, res, next) => {
  try {
    res.json({ data: await agentService.listAgents() });
  } catch (error) {
    next(error);
  }
};

const update = async (req, res, next) => {
  try {
    res.json({ data: await agentService.updateAgent(req.params.id, req.body) });
  } catch (error) {
    next(error);
  }
};

module.exports = { list, update };
