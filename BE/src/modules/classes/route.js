const express = require('express');
const controller = require('./controller');

const router = express.Router();

router.get('/', controller.list);
router.get('/:id', controller.getById);
router.post('/', controller.create);

module.exports = router;
