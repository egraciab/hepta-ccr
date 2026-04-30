const agentService = require('../services/agentService');

const list = async (_req, res, next) => {
  try {
    res.json({ data: await agentService.listAgents() });
  } catch (error) {
    next(error);
  }
};

const create = async (req, res, next) => {
  try {
    res.status(201).json({ data: await agentService.createAgent(req.body) });
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

const remove = async (req, res, next) => {
  try {
    const ok = await agentService.deleteAgent(req.params.id);
    res.json({ data: { deleted: ok } });
  } catch (error) {
    next(error);
  }
};

module.exports = { list, create, update, remove };
