'use strict';

var express = require('express');
var router = express.Router();

/* GET home page. */
router.get('/', function(req, res) {
  res.send(200, { title: 'api-driver dummy test app' });
});

router.post('/reflect/cookie', function(req, res) {
  res.cookie(req.body.name, req.body.value);
  res.send(204);
});

router.post('/check/cookie', function(req, res) {
  res.send(
    req.cookies[req.body.name] === req.body.value
      ? 204
      : 400
  );
});

module.exports = router;
