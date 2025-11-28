#!/usr/bin/env node

const cbApi = require('./cbapi.js');

/* DEFAULTS
cbApi.cbOptions.hostname: '127.0.0.1',
cbApi.cbOptions.port: 55477,
cbApi.cbOptions.password: 'bestpass',
*/

// set options
cbApi.cbOptions.debug = 0
cbApi.cbOptions.hostname = '127.0.0.1'
cbApi.cbOptions.port = 55443
cbApi.cbOptions.password = 'N0dejs=Peop'

let site = ''

// GET '/sites'
cbApi.cbGet(cbApi.cbOptions, 'GET', '/sites', function (res, data) {
  console.log("DEBUG: GET 'sites'")
  //console.log(data)
  console.log(JSON.parse(data))
});

// GET '/sites/SITE1'
site = 'SITE1'
cbApi.cbGet(cbApi.cbOptions, 'GET', '/sites/SITE1', function (res, data) {
  console.log("DEBUG: GET '/sites/" + site + "'")
  let tmp = JSON.parse(data)
  tmp.password = '***'
  console.log(tmp)
});

// DELETE '/sites/SITE1'
//site = 'SITE1'
site = 'SITE2'
cbApi.cbGet(cbApi.cbOptions, 'DELETE', '/sites/' + site, function (res, data) {
  console.log("DEBUG: DELETE 'sites/'" + site)
  console.log(res.statusCode)
});

// POST '/raw' command
cbApi.cbObjCommand.command = "SITE VERS"
cbApi.cbObjCommand.sites = [ "LOCAL", "SITE1" ]
cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCommand), function (res, data) {
  console.log("DEBUG: POST '/raw'", cbApi.cbObjCommand.command, "command")
  console.log(JSON.stringify(cbApi.cbObjCommand))
  console.log(res.statusCode)
  console.log(JSON.parse(data))
})

// POST 'command all'
cbApi.cbObjCmdAll.command = "SITE VERS"
cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCmdAll), function (res, data) {
  console.log("DEBUG: POST '/raw'", cbApi.cbObjCmdAll.command, "command (all)")
  console.log(JSON.stringify(cbApi.cbObjCmdAll))
  console.log(res.statusCode)
  console.log(JSON.parse(data))
})

// POST '/spreadjobs'
cbApi.cbObjSpreadJob.name = 'Some-Release'
cbApi.cbObjSpreadJob.sites = [ "LOCAL", "SITE1", "SITE2" ]
cbApi.cbPut(cbApi.cbOptions, 'POST','/spreadjobs', JSON.stringify(cbApi.cbObjSpreadJob), function (res, data) {
  console.log("DEBUG: POST '/spreadjobs'", cbApi.cbObjSpreadJob.name)
  console.log(JSON.stringify(cbApi.cbObjSpreadJob))
  console.log(res.statusCode)
})

// GET '/spreadjobs'
//jobname = 'LATEST_DISTRO_1.0-NEW'
cbApi.cbGet(cbApi.cbOptions, 'GET', '/spreadjobs', function (res, data) {
  console.log("DEBUG: GET '/spreadjobs'")
  console.log(res.statusCode)
});

// POST '/site/SITE1'
cbApi.cbObjSite.name = "SITE1"
cbApi.cbObjSite.addresses = [ "bnc1:123", "bnc2:456" ]
cbApi.cbObjSite.user = "myusername"
cbApi.cbObjSite.password = "mypassword"
//cbApi.cbObjSite.sections.PREDIR = "/groups/GRP"
cbApi.cbObjSite.sections[0].path = "/groups/GRP"
cbApi.cbPut(cbApi.cbOptions, 'POST', '/sites', JSON.stringify(cbApi.cbObjSite), function (res, data) {
  console.log("DEBUG: POST '/sites'", cbApi.cbObjSite.name)
  console.log(JSON.stringify(cbApi.cbObjSite))
  console.log(res.statusCode)
})

// GET '/filelist'
site = 'LOCAL'
let path = '/GRP'
let timeout = '2'
let url = '/filelist?site=' + site + '&path=' + path + '&timeout=' + timeout
cbApi.cbGet(cbApi.cbOptions, 'GET', url, function (res, data) {
  console.log("DEBUG: GET '/filelist?site=" + site + "'")
  console.log(res.statusCode)
  //console.log(String(Object.keys(JSON.parse(data))).replace(/,/g, '\n'))
  JSON.parse(data)
})
