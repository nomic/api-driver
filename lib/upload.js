"use strict";

var fs = require('fs'),
  protocols = {"http:": require('http'), "https:": require('https')},
  _ = require('underscore'),
  FormData = require('form-data'),
  path = require('path');


exports.upload = function(cookieJar, headers, protocol, host, port, destPath, file, parts, callback) {

  var form = new FormData();

  _.map(parts, function(value, key) {
    form.append(key,JSON.stringify(value));
  });
  form.append('file', fs.createReadStream(file));

  var cookieString = _.map(cookieJar.cookies, function (c) {
    return c.name + "=" + c.value;
  }).join("; ");


  headers = _.extend(
    _.clone(headers),
    form.getHeaders(),
    {
      'Content-Type' : 'multipart/form-data; boundary='+form._boundary,
      'Cookie' : cookieString,
      'x-client': 'test'
    }
  );

  var start = new Date().getTime();
  var req = protocols[protocol].request({
      method: 'POST',
      host: host,
      port: port,
      path: destPath,
      headers: headers
    },
    function(res) {
      var data = '';
      res.on('data', function(chunk){
        data += chunk;
      });
      res.on('end', function() {
        res.body = data;
        callback(null, res, data, {
          reqStart: start,
          resEnd: new Date().getTime()
        });
      });
    });

  req.on('error', function(err) {
    callback(err);
  });
  form.pipe(req);

};
