#!/usr/bin/env node

/* 
 * Cbftp API for NodeJS: cbapi.js
 * Examples: cbapi_examples.js
 * Docs: https://cbftp.eu/svn/cbftp/API
 */

'use strict';
//const request = require('request');
const https = require('https');

// Default Options

const options = {
    hostname: '127.0.0.1',
    port: 55477,
    password: 'bestpass',
    rejectUnauthorized: false,
    json: true,   // GET: Automatically parses the JSON string in the response
                  // POST: Automatically stringifies the body to JSON
    headers: {}
}
const debug = 0
// process.env["NODE_TLS_REJECT_UNAUTHORIZED"] = 0;

// JSON Objects (used as 'templates')


let cbObjRaw = {
  "command": "site deluser me",
  "sites": [               // run on these sites
    "SITE1"
  ],
  "sites_with_sections": [ // run on sites with these sections defined
    "SEC1"
  ],
  "sites_all": true,       // run on all sites
  "path": "/some/path",    // the path to cwd to before running command
  "path_section": "SEC1",  // section to cwd to before running command
  "timeout": 10,           // max wait before failing
  "async": false           // if false, wait for command to finish before
                           // responding. If true, respond with a request
                           // id and let command run in the background
}

let cbObjCommand = {
  "command": "",
  "sites": "",
  "path": "/",
  "timeout": 10,
  "async": false,
  "sites_all": false
}

let cbObjSite = {
  "name": "",
  "addresses": "",
  "allow_download": "YES",            // (YES/NO/MATCH_ONLY)
  "allow_upload": "YES",              // (YES/NO)
  "base_path": "/",
  "broken_pasv": false,
  "cepr": true,
  "cpsv": true,
  "disabled": false,
  // "except_source_sites": [ "" ],
  // "except_target": [ "" ],
  "force_binary_mode": false,
  "leave_free_slot": true,
  "list_command": "STAT_L",           // (STAT_L/LIST)
  "max_idle_time": 60,
  "max_logins": 3,
  "max_sim_down": 2,
  "max_sim_down_complete": 0,
  "max_sim_down_pre": 0,
  "max_sim_down_transferjob": 0,
  "max_sim_up": 3,
  "password": "",
  "pret": false,
  "priority": "HIGH",                  // (VERY_LOW/LOW/NORMAL/HIGH/VERY_HIGH)
  "sections": [
    { "name": "PREDIR", "path": "" },
    { "name": "PRECMD", "path": "" }
   ],
  "sscn": false,
  "stay_logged_in": false,
  "tls_mode": "AUTH_TLS",              // (NONE/AUTH_TLS/IMPLICIT)
  "tls_transfer_policy": "PREFER_OFF", // (ALWAYS_OFF/PREFER_OFF/...)
  "transfer_protocol": "IPV4_ONLY",    // (IPV4_ONLY/PREFER_IPV4/...)
  "transfer_source_policy": "ALLOW",   // (ALLOW/BLOCK)
  "transfer_target_policy": "BLOCK",
  "user": "",
  "xdupe": true
}

let cbObjSpreadJob = {
  "section": "PREDIR",
  "name": "",
  "sites": "",
  "sites_dlonly": "",
  "sites_all": true,
  "reset": true,
  "profile": "DISTRIBUTE"   // (RACE/DISTRIBUTE/PREPARE)
}

let cbObjResetSpreadJob = {
  "hard": false  // optional
}

let cbObjAbortSpreadJob = {
  "delete": "NONE", // (optional, NONE/INCOMPLETE/OWN/ALL)
  "sites": [ "" ]   // (optional) if specified, remove these sites from job
                    // instead of aborting
}

let cbObjFxpJob = {
  "src_site": "SITE1",
  "src_section": "SECTION1",        // src_section or src_path
  "dst_site": "SITE2",
  //"dst_path": "/MISC",              // dst_section or dst_path
  "dst_section": "SECTION2",
  "name": "LATEST_DISTRO_1.0-NEW"
}

let cbObjFxpDirJob = {
  "src_site": "SITE1",
  "src_path": "/MISC",
  "dst_site": "SITE2",
  "dst_path": "/MISC",
  "name": "LATEST_DISTRO_1.0-NEW"
}

let cbObjUploadJob = {
  "src_site": "SITE1",
  "src_section": "SECTION1",        // src_section or src_path
  "name": "LATEST_DISTRO_1.0-NEW",
  //"dst_path": "/linux-isos"         // optional
}

let cbObjDownloadJob = {
  "dst_site": "SITE1",
  //"dst_path": "/linux-isos",        // dst_section or dst_path
  "dst_section": "SECTION1",
  "name": "LATEST_DISTRO_1.0-NEW",
  //"src_path": "/linux-isos"         // optional
}

let cbObjSection = {
  "name": "TESTSEC1",
  "hotkey": 7,           // optional, 0-9
  "num_jobs": 0,         // optional, why would anyone edit this?
  "skiplist": [
    {
      "action": "DENY",     // (ALLOW/DENY/UNIQUE/SIMILAR)
      "dir": false,
      "file": true,
      "pattern": "*asdf*",
      "regex": false,
      "scope": "ALL"   // (IN_RACE/ALL)
    }
  ]
}

let cbObjSiteSection = {
  "name": "TESTSEC1",
  "path": "/some/path"
}

// GET Request

function cbGet(options, method, urn, callback) {
  options.method = method
  options.path = urn
  options.headers =  {
    'Authorization': 'Basic ' + new Buffer.from(':' + options.password).toString('base64'),
    'Content-Type': 'application/json' //'application/x-www-form-urlencoded'
  }
  if (debug) console.debug('CBAPI: DEBUG > cbGet options', options)
  let data = ''
  const req = https.get(options, (res) => {
    if (debug > 0) console.debug(`CBAPI: DEBUG > cbGet > statusCode=${res.statusCode}`)
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      callback(res, data)
    });
  });
  req.on('error', (error) => {
    console.error('CBAPI:', error)
  });
}

// POST, DELETE, PATCH Requests

function cbPut(options, method, urn, requestData, callback) {
  options.method = method
  options.path = urn
  options.headers = {
    Authorization: 'Basic ' + new Buffer.from(':' + options.password).toString('base64')
  }
  if (method === 'POST')  options.headers['Content-Type'] = 'application/json'
  if (method === 'PATCH') options.headers['Content-Type'] = 'application/x-www-form-urlencoded'
  if ((method === 'POST') || (method === 'PATCH')) options.headers['Content-Length'] = requestData.length
  if (debug) console.debug('CBAPI: DEBUG > cbPut options', options)
  let data = ''
  const req = https.request(options, (res) => {
    if (debug) console.debug(`CBAPI: DEBUG > cbPut statusCode: ${res.statusCode}`)
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      callback(res, data)
    });
  });
  req.on('error', (error) => {
    console.error('CBAPI:', error)
  });
  if (method === 'POST' || method === 'PATCH') req.write(requestData)
  req.end()
}

module.exports.cbDebug = debug
module.exports.cbOptions = options
module.exports.cbObjCommand = cbObjCommand
module.exports.cbObjRaw = cbObjRaw
module.exports.cbObjSite = cbObjSite
module.exports.cbObjSpreadJob = cbObjSpreadJob
module.exports.cbObjAbortSpreadJob = cbObjAbortSpreadJob
module.exports.cbObjResetSpreadJob = cbObjResetSpreadJob
module.exports.cbObjFxpJob = cbObjFxpJob
module.exports.cbObjFxpDirJob = cbObjFxpDirJob
module.exports.cbObjUploadJob = cbObjUploadJob
module.exports.cbObjDownloadJob = cbObjDownloadJob
module.exports.cbObjSection = cbObjSection
module.exports.cbObjSiteSection = cbObjSiteSection

module.exports.cbGet = cbGet;
module.exports.cbPut = cbPut;
