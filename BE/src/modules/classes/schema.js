const { z } = require('zod');
const { validate } = require('../../utils');

const createClassSchema = z.object({
  classCode: z.string().min(1, 'classCode is required').trim(),
  startTime: z.string().min(1, 'startTime is required').trim(),
  endTime: z.string().min(1, 'endTime is required').trim(),
  name: z.string().trim().optional().nullable(),
  term: z.string().trim().optional().nullable(),
}).strict();

function validateCreate(body) {
  return validate(createClassSchema, body);
}

module.exports = { createClassSchema, validateCreate };
