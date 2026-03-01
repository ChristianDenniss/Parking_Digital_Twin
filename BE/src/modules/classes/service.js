const db = require('../../db');
const { createClass } = require('./entity');

function findAll() {
  return db.getTable('classes');
}

function findById(id) {
  const classes = db.getTable('classes');
  return classes.find((c) => c.id === id) ?? null;
}

function create(data) {
  const classes = db.getTable('classes');
  const now = new Date().toISOString();
  const cls = createClass({
    id: db.id(),
    classCode: data.classCode,
    startTime: data.startTime,
    endTime: data.endTime,
    name: data.name,
    term: data.term,
    createdAt: now,
  });
  classes.push(cls);
  db.setTable('classes', classes);
  return cls;
}

module.exports = { findAll, findById, create };
