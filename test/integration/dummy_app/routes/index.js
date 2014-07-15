'use strict';

var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
  res.send(200, { title: 'api-driver dummy test app' });
});

module.exports = router;
