/**
 * Class entity shape.
 * id, classCode, startTime, endTime, name (optional), term (optional), createdAt.
 */
function createClass(data) {
  return {
    id: data.id,
    classCode: data.classCode,
    startTime: data.startTime,
    endTime: data.endTime,
    name: data.name ?? null,
    term: data.term ?? null,
    createdAt: data.createdAt,
  };
}

module.exports = { createClass };
