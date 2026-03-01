const service = require('./service');
const { validateCreate } = require('./schema');

function list(req, res) {
  const classes = service.findAll();
  res.json(classes);
}

function getById(req, res) {
  const cls = service.findById(req.params.id);
  if (!cls) return res.status(404).json({ error: 'Class not found' });
  res.json(cls);
}

function create(req, res) {
  const result = validateCreate(req.body);
  if (!result.valid) {
    return res.status(400).json({ error: result.errors.join('; ') });
  }
  const cls = service.create(result.data);
  res.status(201).json(cls);
}

module.exports = { list, getById, create };
