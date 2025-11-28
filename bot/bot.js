#!/usr/bin/env node

/*------------------------------------------------------------------------------
 *   SHIT:BOT - irc bot in nodejs                 |  -- don't worry, be crappy
 *   original by p*, hacked up some more by s*    |  >> Sponsored by: urmom 
 *------------------------------------------------------------------------------
 *   Watches, tags, packs, spreads and pre's (live) mp3 releases automatically 
 *------------------------------------------------------------------------------
 *   Needs: cbftp(api), (gl)ftpd and these helper scripts:
 *     - rel.sh:             ->  tag mp3, create nfo/m3u/sfv (cksfv, mediainfo)
 *     - lameinfo.py:        ->  get/set lameheader
 *     - fishwrap2.py        ->  blowfish wrapper fish.py (weechat)
 *     - xl-ipchanger.sh:    ->  gl addip from irc 
 *------------------------------------------------------------------------------

/* requires */
const irc = require("irc")
const dgram = require("dgram")
const exec = require('child_process').exec
const fs = require('fs')
const chokidar = require('chokidar')
const Mp3Parser = require('mp3-parser')
const Mp3Editor = require('./mp3editor.js')
const cbApi = require('./cbapi.js')
const Mp3Releaser = require('./mp3releaser.js');
const mp3duration = require('get-mp3-duration');
const net = require('net');

/* vars */
// scriptPath may be absolute path, e.g. const scriptPath = "/bot"
const scriptPath = process.argv[1].substring(0, process.argv[1].lastIndexOf("/"))
var watcher
var reqIds = []
var ircEnabled = 1
var enableUdp = 0                               // udp listener (legacy)
var enableMp3Rel = 0                            // try mp3releaser first (before rel.sh)
var force = 0                                   // force fixing mp3
var debug = 4                                   // debug level 0-4
//var debugUdp = 0                              // unused

/* arrays */
var dupe = []                                   // release dupecheck
// var wl = []                                  // unused (album crap?)
// var id = []                                  // unused (album crap?)`

/* setup irc vars */
var client
var iNum = 0
var ircConnected = 0
var ircJoin = 0

/* blowfish */
var dhSecret = {}
var enableKeyx = 1

const ver = "v2021-06-18"                       // 'semver is stupid' :)

cfg = require("./config");
const catchGroups = cfg.grpOpts.catchGroups.split("|")
const fishSplitRe = new RegExp('[\\s\\S]{1,' + parseInt(cfg.ircOpts.fishMsgLen) + '}', 'g')
const pollInterval = cfg.cbOpts.pollInt
const pollMaxAttempts = cfg.cbOpts.pollMax
const getSiteRe = new RegExp('^(addresses|allow_upload|allow_download|base_path|disabled|max_idle_time|max_logins|max_sim_down|max_sim_up|password|tls_mode|user)$')
const skipSiteRe = new RegExp('^(avg_speed|proxy_type|var|cpsv|sscn|cepr|pret|list_command|list_frequency|force_binary_mode|transfer_protocol|transfer_source_policy|transfer_target_policy|priority|xdupe)$')


/*-----------------------------------------------------------------------------
 * TODO: - replace rel.sh w/ 'native' id3 tagging in mp3releaser.js, e.g.
 *       - mp3-tag https://github.com/eidoriantan/mp3tag.js
 *       - jamp3 https://github.com/ffalt/jamp3
 *       - NOT node-id3 (which is id3v2 only)
 *         ( set encoding flags in lameheader: vbr, stereo, bitrate etc )
 *         ( https://john.freml.in/mp3-clean + github.com/jasoncox/mp3clean )
 *---------------------------------------------------------------------------*/


// irc connect (main)
function ircConnect(iNum, ircOpts) {
  if ((ircEnabled) && (!ircConnected)) {
    if (debug > 0) console.debug(`DEBUG: iNum=${iNum} ircConnected=${ircConnected} server=${ircOpts.servers[iNum].host} chan=${ircOpts.chan.main.name}`)
    consoleMsg(`+ IRC: Connecting to ${ircOpts.servers[iNum].host}:${ircOpts.servers[iNum].port}`)
    // irc settings
    client = new irc.Client(ircOpts.servers[iNum].host, ircOpts.nick, {
      //disabled: autoConnect: false,
      channels: [ `${ircOpts.chan.main.name} ${ircOpts.chan.main.key}` ],
      showErrors: true, debug: true,
      autoRejoin: true,
      retryCount: 30,                                     // changed: old=100, default=0
      retryDelay: 10000,                                  // changed: old=1200 default=2000 (10000ms=10s)
      secure: true, certExpired: true, selfSigned: true,  // old: secure=false,
      userName: ircOpts.name,
      password: ircOpts.servers[iNum].pass,
      port: ircOpts.servers[iNum].port,
      setUserMode: "+h",                                  // old: "+hx",
      localAddress: ircOpts.bind
    });
    // listen for connect event
    client.addListener('registered', function (message) {
      consoleMsg("- IRC: Connected to " + ircOpts.servers[iNum].host)
      ircConnected = 1
      if (ircOpts.chan.catch) client.join(ircOpts.chan.catch.name)
      if (ircOpts.chan.pre)   client.join(ircOpts.chan.pre.name)
      setTimeout(function() {
        chanMsg(`>> \x02SHIT\x02:BOT - ${cfg.group} - ${ver} \x02\x0303online\x0F`);
        trigUptime(true);
      }, 1000);       // changed: timeout 5000 -> 1000 (online msg)
    });
    // listen for error event
    client.addListener('error', function(message) {
      consoleMsg("! IRC: 'error' event message:", message);
        if (message.rawCommand === '402') {
          ircConnected = 0
          client.disconnect()
          consoleMsg("+ IRC: Reconnecting...")
          setTimeout(function() {
            ircConnect(iNum, ircOpts);
          }, 3000);
          if (iNum+1 < Object.keys(ircOpts.servers).length) {
            iNum++
          } else {
            iNum = 0
          }
        }
        if ((message.rawCommand === '404') || (message.rawCommand === '473')) {
          if (ircJoin <= 99) { 
            consoleMsg(`! IRC: error "${message.args}", joining "${ircOpts.chan.main.name}" (${ircJoin})`)
            setTimeout(function() {
              client.join(ircOpts.chan.main.name);
            }, 10000);
          }
          ircJoin++
        }
    });
    // listen for quit events
    client.addListener('quit', function (nick) {
      if (nick == ircOpts.nick) {
        consoleMsg("! IRC: Disconnected from: " + ircOpts.servers[iNum].host)
        ircConnected = 0
        client.disconnect()
        consoleMsg("+ IRC: Reconnecting...")
        setTimeout(function() {
          ircConnect(iNum, ircOpts);
        }, 3000);
        if (iNum+1 < Object.keys(ircOpts.servers).length) {
          iNum++
        } else {
          iNum = 0
        }
      }
    });
    /* unused: listen for quit untrigd raw events
    client.addListener('raw', function (message) {
      //debug: console.log(message)
      if (message.rawCommand === '253'){
        consoleMsg(`- IRC: LUSERS server: ${message.server} command: ${message.command} commandType: ${message.commandType} args: ${message.args}`)
      }
      if (message.rawCommand === '305'){
        consoleMsg(`- IRC: BACK command: ${message.command} commandType: ${message.commandType} args: ${message.args}`)
      }
      if (message.rawCommand === '306'){
        consoleMsg(`- IRC: AWAY command: ${message.command} commandType: ${message.commandType} args: ${message.args}`)
      }
      if ((message.rawCommand === '320') || (message.rawCommand === '338')) {
        consoleMsg(`- IRC: WHOIS server: ${message.server} command: ${message.command} commandType: ${message.commandType} args: ${message.args}`)
      }
    }); */
    /* unused: if (!ircConnected) return */

    // listen for irc commands in chan
    client.addListener(`message${ircOpts.chan.main.name}`, function (nick, to, text, message) {
      if (debug > 3) console.debug(`DEBUG: message listener ${ircOpts.chan.main.name} nick=${nick} text.args=${text.args}`)
      if (debug > 4) console.log("DEBUG: text =", text)
      var message
      if ((!isEmptyOrSpaces(text.args[1])) && (text.args[1].match(/^(\+OK|mcps) /))) {
        message = fishWrap('decrypt', ircOpts.chan.main.blow, text.args[1])
      } else {
        message = text.toString()
      }
      var ms = message.split(" ")
      msUC = ms[0].toUpperCase()
      if (msUC === "!HELP")                                     trigHelp(message)
      if (msUC === "!UPTIME")                                   trigUptime(message)
      if (msUC === "!REHASH")                                   trigRehash(message)
      if (msUC === "!RESTART")                                  trigRestart(message)
      if (msUC === "!KILL")                                     trigKill(message)
      if (msUC === "!DIE")                                      trigKill(message)
      if (msUC === "!JUMP")                                     trigJump(iNum, ircOpts, message)
      if (msUC === "!DIR")                                      trigDir(message)
      if (msUC === "!LS")                                       trigDir(message)
      if (msUC === "!DUPE" && ms[1])                            trigDupe(message) 
      if (msUC === "!DUPEADD" && ms[1])                         trigDupeAdd(message) 
      if (msUC === "!GO" && ms[1])                              trigGo(message)
      if (msUC === "!CFG")                                      trigConf(message)
      if (msUC === "!CONF")                                     trigConf(message)
      if (msUC === "!SHIT")                                     trigShit(message)
      if (msUC === "!CHECK")                                    trigLameCheck(message)
      // cbftp triggers
      if (cfg.cbOpts.enable) {
        if (msUC === "!SITES")                                  trigCbSites(message)
        if (msUC === "!MODSITE")                                trigCbModSite(message, null, null)
        if (msUC === "!MODSLOTS")                               trigCbModSite(message)
        if (msUC === "!MODPRE")                                 trigCbModSite(message)
        if (msUC === "!FILELIST")                               trigCbFileList(message)
        if (msUC === "!FLIST")                                  trigCbFileList(message)
        if (msUC === "!GETJOB")                                 trigCbSpread(message)
        if (msUC === "!GETJOBS")                                trigCbSpread(message)
        if (msUC === "!SPREADJOBS")                             trigCbSpread(message)
        if (msUC === "!TRANSFERJOBS")                           trigCbTransfer(message)
        if (msUC === "!TRANSFERJOB")                            trigCbTransfer(message)
        if (msUC === "!TRANSFERABORT")                          trigCbTransfer(message)
        if (msUC === "!TRANSFERABORTJOB")                       trigCbTransfer(message)
        if (msUC === "!TRANSFERJOBABORT")                       trigCbTransfer(message)
        if (msUC === "!ABORTTRANSFERJOB")                       trigCbTransfer(message)
        if (msUC === "!TRANSFERRESET")                          trigCbTransfer(message)
        if (msUC === "!SPEED")                                  trigCbSpeed(message, mode=1)
        if (msUC === "!SPEEDTEST")                              trigCbSpeed(message, mode=1)
        if (msUC === "!SPEEDCOPY" )                             trigCbSpeed(message, mode=2)
        if (msUC === "!SPEEDCLEAN")                             trigCbSpeed(message)
        if (msUC === "!SITE")                                   trigCbSite(message)
        if (msUC === "!ADDSITE")                                trigCbAddSite(message, null, null)
        if (msUC === "!DELSITE")                                trigCbDelSite(message)
        if (msUC === "!ABORTJOB")                               trigCbSpread(message)
        if (msUC === "!RESETJOB")                               trigCbSpread(message)
        if (msUC === "!RAW")                                    trigCbRaw(message)
        if (msUC === "!SPREAD")                                 trigCbSpread(message)
        if (msUC === "!PRE")                                    trigCbPre(message)
        if (msUC === "!STOP")                                   trigCbSpread(message)
        if (msUC === "!MODSITESECTION")                         trigCbModSiteSection(message)
        if (msUC === "!DELSITESECTION")                         trigCbDelSiteSection(message)
        //if (msUC === "!TRANSFER") trigCbTransfer (message)    // unused trigger
        //if (msUC === "!XWL") { wlshow() }                     // unused album crap(?)
      } else {
        chanMsg(` ! Cbftp is disabled`)
      }
    });
    // listen for pm's (use fish)
    client.addListener('pm', function (nick, text, message) {
        if (debug > 2) console.debug(`DEBUG: pm listener iNum=${iNum} nick=${nick} message.args=${message.args}`)
        if ((!isEmptyOrSpaces(message.args[1])) && (message.args[1].match(/^(\+OK|mcps) /)) && (dhSecret[nick])) {
        var dhDecMsg = fishWrap('decrypt', dhSecret[nick], message.args[1])
        let ms = dhDecMsg.split(' ')
        if (debug > 1) { 
          console.debug(`DEBUG: pm listener message ms[0]=${ms[0]} dhDecMsg="${dhDecMsg}" dhSecret[nick]=${dhSecret[nick]}`)
        } 
        if ((nick.match(ircOpts.owner)) && (ms[0].toUpperCase() === "!RESTART")) {
          if (debug > 1) console.debug('DEBUG: pm listener -> matched restart')
          trigRestart(dhDecMsg)
        }
        if ((dhDecMsg.match(/^!(addip|delip|listip|ipadds)/i))) {
          if (debug > 1) console.debug('DEBUG: pm listener -> matched changeip')
          trigIpChange(dhDecMsg, nick, dhSecret)
        }
        if (ms[0].toUpperCase() === "!ADDSITE") {
          if (debug > 1) console.debug('DEBUG: pm listener -> matched addsite')
          trigCbAddSite(dhDecMsg, nick, dhSecret)
        }
        if (ms[0].toUpperCase() === "!MODSITE") {
          if (debug > 1) console.debug('DEBUG: pm listener -> matched modsite')
          trigCbModSite(dhDecMsg, nick, dhSecret)
        }
        if (ms[0].toUpperCase() === "!MODPRE") {
          if (debug > 1) console.debug('DEBUG: pm listener -> matched modsite')
          trigCbModSite(dhDecMsg, nick, dhSecret)
        }
      }
    });
    // listen for notices (fish dh)
    client.addListener('notice', function (nick, to, text, message) {
      let txt = text.split(" ")
      if (debug > 2) console.debug(`DEBUG: notice listener iNum=${iNum} nick=${nick} text=${text}`)
      // server notices
      if (nick === undefined) {
        consoleMsg(`> NOTICE: ${text}`)
      } else {
        // fish dh key exchange
        if ((enableKeyx) && (nick != null)) {
          let genKey = false
          let cbcMode = false
          // generate my pub/priv keys, once
          if (!genKey) {
            var [myPrivkey, myPubkey] = fishWrap('DH1080gen').split(' ')
            console.debug(`DEBUG: myPrivkey=${myPrivkey} myPubkey=${myPubkey}`)
            genKey = true
          }
          // for CBC mode add prefix to key and suffix to text
          let pfKey = ""
          let suffix = ""
          if (text.match(/.*(_cbc|_CBC|.* CBC)/)) {
            cbcMode = true
            pfKey = "cbc:"
            suffix = "CBC"
          }
          // finish by sending my pubkey
          if (text.match('DH1080_INIT.*')) {
            client.notice(nick, `DH1080_FINISH${cbcMode ? `_cbc` : ''} ${myPubkey} ${suffix}`)
          }
          // set shared dh key, $txt[1] = OtherPubKey 
          let dhFinish = fishWrap('DH1080comp', myPrivkey, txt[1])
          dhSecret = { [nick]: `${pfKey}${dhFinish}` }
          if (debug > 2) console.debug('DEBUG: fishWrap dhSecret =', dhSecret)
        }
      }
    });
    /* (OLD) uses blowcli.pl, replaced by fishwrap.py
    // listen for notices (fish)
    client.addListener('notice', function (nick, to, text, message) {
      let txt = text.split(" ")
      let myPubkey
      if (debug > 2) console.debug(`DEBUG: notice listener iNum=${iNum} nick=${nick} text=${text}`)
      // server notices
      if (nick === undefined) {
        consoleMsg(`> NOTICE: ${text}}`)
      } else if (nick != null) {
        let mode = (text.match(/.*(_cbc|.*CBC)/)) ? 'cbc' : 'ebc'
        if (enableKeyx) {
          // initiate DH180 keyx
          if (text.match('DH1080_INIT.*')) {
            console.log("DEBUG: match DH1080_INIT text=" + text)
            let dhInit = String(blowCli('keyx', `"${nick} ${mode}"`)).split(' ')
            myPubkey = dhInit[2]
            if (nick === dhInit[0]) {
              client.notice(nick, `${dhInit[1]} ${myPubkey}`)
            }
          }
          // handle incoming DH1080 notices, txt[0]: keyx_header, txt[1]: peer_public
          if (text.match(/DH1080_(INIT|FINISH)/i)) {
            let keyx_header = txt[0]
            if ((mode === 'cbc') && (!txt[0].match(/_cbc/i))) {
              keyx_header += '_cbc'
            }
            let dhFinish = String(blowCli('keyx_handler', `send_text ${ircOpts.servers[iNum].host} "${keyx_header} ${txt[1]}" ${nick}`)).split(' ')
            if (debug > 2) {
              console.debug(`DEBUG: blowCli dhFinish=${dhFinish}`)
            }
            if (dhFinish) {
              if (dhFinish[0] === nick) {
                dhSecret = {[nick]: dhFinish[3].replace('cbc:','')}
                if (debug > 0) console.debug(`DEBUG: blowCli nick dhSecret="${dhSecret[nick]}"`)
                client.notice(nick, dhFinish[1] + ' ' + dhFinish[2] + ' ')
              }
            }
          }
        }
      }
    });
    */
    // listen for pre releases in pm
    client.addListener('pm', function (nick, text, message) {
      if (debug > 4) console.debug("DEBUG: pm precatcher:", message)
      if ((!isEmptyOrSpaces(message.args[1])) && (message.args[1].match(/^(\+OK|mcps) /)) && (dhSecret[nick])) {
        var message = fishWrap('decrypt', dhSecret[nick], message.args[1])
      } else {
        var message = message.args[1] 
      }
      // save and announce pres: PRE MP3 Release-Grp
      if (message && cfg.setOpts.ircAnnouncePre) {
        var ms = message.split(" ")
        if (ms[0]) {
          if (((ms[0].toUpperCase() === "PRE") && (ms[1].toUpperCase() === "MP3")) ) {
              dupe.push(ms[2])
              // announce pre
              groupName = ms[2].split("-").pop(-1);
              if (catchGroups.includes(groupName)) chanMsg(` > PRE: ${ms[2]}`)
            }
        }
        // save and announce newdirs: NEW MP3 Release-Grp
        if (cfg.setOpts.ircAnnounceNew) {
          if ((ms[0].toUpperCase() === "NEW") && (ms[1].toUpperCase() === "MP3")) {
            dupe.push(ms[2])
            groupName = ms[2].split("-").pop(-1);
            if (catchGroups.includes(groupName)) chanMsg(` > NEW: ${ms[2]}`)
          }
        }
        // also check for !addpre Some_Release
        if (((ms[0].toUpperCase() === "!ADDPRE") || (ms[0].toUpperCase() === "!ADDPRE")) && (ms[1])) {
          dupe.push(ms[1])
          groupName = ms[1].split("-").pop(-1);
          if (catchGroups.includes(groupName)) chanMsg(` > ADDPRE: ${ms[1]}`)
        }
      }
    });
    // listen for pre releases in (optional) catchchan
    if (ircOpts.chan.catch) {
      client.addListener(`message${ircOpts.chan.catch.name}`, function (from, message) {
        consoleMsg("- IRC: " + message)
        if ((message.match(/^(\+OK|mcps) /) && (ircOpts.chan.catch.blow))) {
          var message = fishWrap('decrypt', ircOpts.chan.catch.blow, message)
        }
        if (cfg.setOpts.ircAnnouncePre) {
          var ms = message.split(" ")
          if (ms[0]) {
            if ((ms[0].toUpperCase() === "PRE") && (ms[1].toUpperCase() === "MP3")) {
                dupe.push(ms[2])
                groupName = ms[2].split("-").pop(-1);
                if (catchGroups.includes(groupName)) chanMsg(` > PRE: ${ms[2]}`)
              }
          }
          if (cfg.setOpts.ircAnnounceNew) {
            if ((ms[0].toUpperCase() === "NEW") && (ms[1].toUpperCase() === "MP3")) {
              dupe.push(ms[2])
              groupName = ms[2].split("-").pop(-1);
              if (catchGroups.includes(groupName)) chanMsg(` > NEW ${ms[2]}`)
            }
          }
        }
      });
    }
    // announce releases in (optional) prechan
    if (ircOpts.chan.pre) {
        client.addListener(`message${ircOpts.chan.pre.name}`, function (from, message) {
          let lastMsg = ""
          if ((message.match(/^(\+OK|mcps) /) && (ircOpts.chan.pre.blow))) {
            let message = fishWrap('decrypt', ircOpts.chan.pre.blow, message)
          }
          let allRe = new RegExp('^(?:![a-z]+ )?([^ ]+[_-][^ ]+[0-9]+\-(?:' + cfg.grpOpts.catchGrps + ')(?:_?[iI][nN][tT])?)')
          let msgMatch = message.match(allRe)
          if (debug > 2) console.debug(`DEBUG: prechan message="${message}" msgMatch="${msgMatch}"`)
          if (msgMatch) {
            if (debug > 2) console.debug(`DEBUG: prechan match msgMatch[1]="${msgMatch[1]}" lastmsgMatch[1]="${lastmsgMatch[1]}"`)
            // announce only if message is different than last (once)
            if (msgMatch[1] != lastMsg) {
              dupe.push(msgMatch[1])
              let grpRe = new RegExp (`.*-${cfg.group}$`)
              let relType = (msgMatch[1].match(grpRe)) ? relType = "PRE" : relType = "NEW"
              if (cfg.setOpts.ircAnnounceNew) chanMsg(` > ${relType}: ${msgMatch[1]}`)
            }
            lastMsg = msgMatch[1]
          }
      });
    }
  }
}

// udp bind (ununsed)
if (enableUdp) {
  const udp = dgram.createSocket('udp4')
  udp.bind(55566)
}

/* incoming udp catch (ununsed)
if (enableUdp) {
    udp.on("message", function (msg, rinfo) {
    var msgn = msg.toString().replace(/(\r\n|\n|\r)/gm, '')
    if (msgn) {
      consoleMsg(`+ UDP incoming: ${msgn} from ${rinfo.address}:${rinfo.port}`)
      var msgw = msgn.split(":")
      if (msgw[1]) {
        if (msgw[0].toUpperCase() === "!GO") {
          handle(msgw[1])
        }
        if (msgw[0].toUpperCase() === "DONE") {
          consoleMsg(`+ PRE complete: ${msgw[1]}`)
          chanMsg(` + PRE complete: ${msgw[1]}`)
        }
      }
    }
  });
} */

/* outgoing udp (unused)
function outUdp (host, port, string) {
  if (enableUdp) {
    const clientudp = dgram.createSocket('udp4')
    if (string) {
      let message = new Buffer(String(string))
      clientudp.send(message, 0, message.length, port, host, function(err, bytes) {
          if (err) throw err
          clientudp.close()
      });
      let time = new Date().getTime()
      console.log(`${time} UDP outgoing: ${string}  ${host}:${port}`)
    }
  }
  return
} */

// dupe check function
function dupeCheck(string, callback) {
  var dupeStatus = 0
  let stringDelim = string.replace(',', '').split('(')
  let stringNew = stringDelim[0].split(' ').join('.*')
  if (debug > 3) console.log("DEBUG: dupe stringNew = ", stringNew)
  dupe.forEach(function(result) {
    let pattern = new RegExp(stringNew, 'i')
    if (debug > 3) {
      console.debug(`DEBUG: dupeCheck result=${result} pattern=${pattern} pattern.test=${pattern.test(result)}`)
    }
    if (pattern.test(result)) dupeStatus = result
  });
  callback(dupeStatus)
}

// check for lameinfo (header) using mediainfo, lameinfo.py and mp3-parser
function trigLameCheck(message) {
  if (cfg.setOpts.enableLameCheck) {
    let ms = message.split(' ')
    let trigger = ms[0]
    if (cfg.setOpts.enableLameCheck) {
      let params = ms.splice(1).join(' ')
      if (debug > 3) console.log(`DEBUG: trigger=${trigger} params=${params}`)
      if (params) {
        var release = params
        var releaseLower = release.toLowerCase()
        var releasePath = `${cfg.groupPath}/${release}`
      }
      var releaseFile = `${releasePath}/01-${releaseLower}.mp3`
      fs.stat(releaseFile, function(err) {
        if (!err) {
          var aMsg = "+ Checking lameheader and tags with mediainfo, lameinfo.py and mp3-parser ..."
          consoleMsg(aMsg)
          chanMsg(` ${aMsg}`)
          // check using mediainfo
          var checkExecString = `${mediainfo} "${releaseFile}" | grep -m 1 Writing || echo "ERR:NO_W_LIB"`
          if (debug > 0) console.debug('DEBUG: checkExecString =\n' + checkExecString)
          let checkExec = exec(checkExecString, function(err, stdout, stderr) {
            var cMsg = " > Unknown result from mediainfo"
            if (debug > 0) console.debug('DEBUG: stdout=', stdout)
            if (err) {
              cMsg = " \x02\x0304Medianfo Error:\x0F " + stderr
            } else if (stdout.match(/ERR:NO_W_LIB/)) {
              cMsg =" ! \x02\x03Failed\x0F - MediaInfo Writing library: MISSING - "
            } else {
              cMsg = " > OK - MediaInfo "
            }
            consoleMsg(`${cMsg} ${stdout.replace(/\s+/g, ' ')}`)
            chanMsg(`${cMsg} ${stdout.replace(/\s+/g, ' ')}`)
          });
          if (debug > 4) console.debug('DEBUG: checkExec =', checkExec)
          // check using lameinfo.py
          let lameinfoExecString = `${scriptPath}/lameinfo.py -c '${releaseFile}'`
          if (debug > 0) console.log(lameinfoExecString)
          let lameinfoExec = exec(lameinfoExecString, function(err, stdout, stderr) {
            if (err) {
              //var cMsg = " > Unknown result from lameinfo.py"
              consoleMsg(` Lameinfo Error: ${stderr}`)
              chanMsg(`Lameinfo Error: ${stderr}`)
            }
            if (stdout) {
              consoleMsg(" > Showing 'lameinfo.py -c' output:")
              consoleMsg (stdout)
              chanMsg(" > Showing \x1F'lameinfo.py -c'\x1F result:")
              let entryString = stdout.match(/INFO: entry string is "(.*)"/)
              let id3v1Tag = stdout.match(/INFO: id3v1 tag is "(.*)"/s)
              if (entryString) {
                stdout = stdout.replace(entryString[1], escape(entryString[1]))
              }
              if (id3v1Tag) { 
                stdout = stdout.replace(id3v1Tag[1], escape(id3v1Tag[1]))
              }
              stdout = stdout.replace(/((DEBUG|INFO|ERROR):.*)/g, '     $1')
              chanMsg(stdout)
            }
          });
          if (debug > 4) console.debug('DEBUG: lameinfoExec =', lameinfoExec)
          // check using Mp3Parser  
          var iMsg = "> Unknown result from Mp3Parser"
          var tagObject;
          if (tagObject = getTags(releaseFile)) {
            var duration = getDuration(releaseFile)
            var tagArray = []
            var tagFrames = [ [ 'TPE1' ], [ 'TALB' ], [ 'TCON' ], [ 'TYER' ], [ 'TENC' ] ];
            var timeStr
            if (duration) timeStr = ' | TIME' + ': ' + duration
            for (let i = 0; i < tagFrames.length; i++) {
              if (tagObject[tagFrames[i]]) {
                if (debug > 0) console.debug('DEBUG: tagObject tagFrames = ', tagObject[tagFrames[i]])
                tagArray.push(tagFrames[i] + ': ' + tagObject[tagFrames[i]])
              }
            }
            if (tagArray && tagArray.length) {
              iMsg = `> OK - Mp3Parser ID3v2 [${tagArray.join(' | ')}${timeStr}]`
            } else {
              iMsg = '! \x02Failed\x02 - Mp3Parser ID3v2: NO TAGS FOUND' + timeStr
            }
            consoleMsg(iMsg)
            chanMsg(' ' + iMsg)
          } else {
            iMsg = '! Mp3Parser Error'
            consoleMsg(iMsg)
            chanMsg(' ' + iMsg)
          }
        } else {
          consoleMsg(`! MISSING: ${releaseFile}`)
          consoleMsg(err)
          chanMsg(` ! \x02MISSING:\x02 ${releaseFile}`)
        }
      });
    } else {
      consoleMsg(` ! Lamecheck is disabled`)
    }
  }
}

// handle restart(self)
function trigRestart(message, restartMethod) {
  ircJoin = 0
  let ms = message.split(' ')
  let trigger = ms[0]
  // restart methods: simple, spawn or ''
  var restartMethod = ''
  if (trigger === "!restart") {
    consoleMsg("+ \x02Restarting\x02...")
    if (ircConnected) {
      chanMsg(" + \x02Restarting\x02...")
      if (restartMethod === "simple") {
        process.on("exit", function () {
          exec("node " + process.argv[1])
        });
        process.exit();
      } else if (restartMethod === "spawn") {
        const restartProcess = () => {
          spawn(process.argv[1], process.argv.slice(2), {
           detached: true, 
            stdio: ['ignore', out, err]
          }).unref()
        }
        if (debug > 4) console.debug('DEBUG: restartProcess =', restartProcess)
        process.exit()
      } else {
        if (debug > 0) console.log(getDateTime() + " + Process PID: " + process.pid);
        setTimeout(function () {
          process.on("exit", function () {
              require("child_process").spawn(process.argv.shift(), process.argv, {
                cwd: process.cwd(),
                  detached : true,
                  stdio: "inherit"
              });
          });
          process.exit();
        // changed from 5000 to 2500
        }, 2500);
      }
    }
  }
}

function trigRehash(message) {
  let ms = message.split(' ')
  let trigger = ms[0]
  ircJoin = 0
  if (trigger === "!rehash") {
    consoleMsg("- Rehashing...")
    chanMsg(" - Rehashing...")
    delete require.cache[require.resolve('./config.js')];
    //require(__filename);
    cfg = require("./config");
  }
}

function trigKill(message) {
  ircJoin = 0
  let ms = message.split(' ')
  let trigger = ms[0]
  if ((trigger === "!kill") || (trigger === "!die")) {
    consoleMsg("! Exiting...")
    chanMsg(" ! \x02\x03Exiting\x0F...")
    process.exit();
  }
}

function trigJump(iNum, ircOpts, message) {
  ircJoin = 0
  let ms = message.split(' ')
  let trigger = ms[0]
  if (trigger === "!jump") {
    consoleMsg("- Jumping irc server...")
    chanMsg(" - Jumping irc server...")
    client.disconnect()
    ircConnected = 0
    ircConnect(iNum, ircOpts, ircOpts.chan.main.name)
    if (iNum+1 < Object.keys(ircOpts.servers).length) {
      iNum++
    } else {
      iNum = 0
    }
  }
}

function trigDupe(message) {
  let ms = message.split(' ')
  let trigger = ms[0]
  let dupeString = ms[1]
  if (trigger === "!dupe") {
    dupeCheck(dupeString, function(dupeStatusRaw) {
      dupeStatus = dupeStatusRaw
    });
    // return if dupe found
    if (dupeStatus) {
      dMsg = `- Dupe found: ${dupeStatus}`
      consoleMsg(dMsg)
      chanMsg(` ${dMsg}`)
    } else {
      consoleMsg("- No dupe(s) found")
      chanMsg(" - No dupe(s) found")
    }
  }
}

function trigDir(message) {
  let ms = message.split(' ')
  let trigger = ms[0]
  if ((trigger === "!dir") || (trigger === "!ls")) {
    chanMsg(` - Listing local directory "${cfg.groupPath}"`)
    fs.stat(cfg.groupPath, function(err) {
      if (!err) {
        fs.readdirSync(cfg.groupPath).forEach(file => {
          consoleMsg(file)
          chanMsg(file)
        });
      }
    });
  }
}

// process release
function trigGo(message) {
  let ms = message.split("|")
  var release = ms[0].replace(/!go /i, '')
  var releaseFile
  let goMsg
  if (!release) {
    goMsg = "\x02\x03Error:\x0F No release dir, aborting"
    consoleMsg('! ' + goMsg)
    chanMsg(' ! ' + goMsg)
    return
  } else {
    var releaseLower = release.toLowerCase()
    var releasePath = cfg.groupPath + "/" + release
  }
  let pMsg = `+ Processing: "${release}"`
  consoleMsg(pMsg)
  if (debug > 4) console.log(" ")
  chanMsg(" " + pMsg)
  var tags = { }
  if (cfg.setOpts.enableTag == 1) {
    tags.notes = ""
    // build args
    for (i=1; i <= ms.length; i++) {
      if (ms[i]) {
        var mss = ms[i].split(":")
        if (mss[1]) {
          if (mss[0] === "genre")  tags.genre = mss[1]
          if (mss[0] === "artist") tags.artist = mss[1]
          if (mss[0] === "title")  tags.title = mss[1] 
          if (mss[0] === "date")   tags.date = mss[1]
          if (mss[0] === "notes")  tags.notes = mss[1]
        }
        if (mss[0] === "force")    force = 1
      }
    }
    // tag field checks
    if (!tags.date) {
      // date autotagger
      let dateRe = new RegExp(/-((:?0[1-9]|1[012])-(?:0[1-9]|[12][0-9]|3[01])-2[0-9]{3})-/)
      tags.date = release.match(dateRe) ? String(release.match(dateRe)[1]) : relDateFmt()
      goMsg = `- Tag: Using autotag date "${tags.date}"`
      consoleMsg(goMsg)
      if (cfg.setOpts.verbose > 0) chanMsg(' ' + goMsg)
    }
    if (!tags.genre) {
      goMsg = "! Error: No genre, aborting"
      consoleMsg(goMsg)
      chanMsg(' ' + goMsg)
      return
    }
    // get year from date
    try {
      dtSplit = tags.date.split("-")
      if (dtSplit[2]) {
        tags.year = dtSplit[2]
      }
    } catch (e) {
      console.error('ERROR: tag date', e);
    }
    if (!tags.year) {
      goMsg = "! Error: Year couldn't be extracted from date, aborting"
      consoleMsg(goMsg)
      chanMsg(` ${goMsg}`)
      return
    }
  } else {
    if (cfg.setOpts.verbose > 0) {
      let sMsg = "- Tagging is disabled, skipping ID3"
      consoleMsg (sMsg)
      chanMsg(' ' + sMsg)
    }
  }
  // always try to get artist - title to dupe
  if (!tags.artist) {
    // artist autotagger
    let artistRe = new RegExp('^(.*?)(?:_-_|-)')
    if (release.match(artistRe)) {
      tags.artist = String(release.match(artistRe)[1]).replace(/_/g, ' ')
      goMsg = "- Tag: No artist, using autotag " + '"' + tags.artist + '"'
      consoleMsg(goMsg)
      if (cfg.setOpts.verbose > 0) chanMsg(' ' + goMsg)
    }
    if (!tags.artist) {
      goMsg = "! Error: No artist, aborting"
      consoleMsg(goMsg)
      chanMsg(' ' + goMsg)
      return
    }
  }
  if (!tags.title) {    
    // title autotagger
    let titleRe
    if (release.match('_-_.*(?:[0-9]+|\(.*\))')) { 
      titleRe = new RegExp(`(?:.*)(?:_-_)(.*)(?:[0-9]+|\(.*\))-(?:${cfg.grpOpts.source})`)
    } else if (release.match('_-_.*-(?:${source})')) { 
      titleRe = new RegExp(`(?:.*)(?:_-_)(.*)-(?:${cfg.grpOpts.source})`)
    } else if (release.match(`[^_]-[^_].*-(?:${cfg.grpOpts.source})`)) {
      titleRe = new RegExp(`(?:.*[^_])-([^_].*)-(?:${cfg.grpOpts.source})`)
    }
    if (release.match(titleRe)) { 
      tmp = String(release.match(titleRe)[1])
      tmpRe = new RegExp(/(.*)_[0-9]+__.*/)
      tags.title = tmp.match(tmpRe) ? String(tmp.match(tmpRe)[1]).replace(/_/g, ' ') : tmp.replace(/_/g, ' ')
      goMsg = `- Tag: No title, using autotag "${tags.title}"`
      consoleMsg(goMsg)
      if (cfg.setOpts.verbose > 0) chanMsg(' ' + goMsg)
    }
    if (!tags.title) {
      goMsg = "! Error: No title, aborting"
      consoleMsg(goMsg)
      chanMsg(' ' + goMsg)
      return
    }
  }
  //var timeSearchStart = new Date().getTime()
  // check for dupe
  /* TODO: (?) wtf
    var dsng = release.replace('-GRP','').replace('-',' ').replace(/(CABLE|DAB|SAT)/','~')
    var ds = dsng.split("~")
    var dupeString = ds[0]
  */
  if (cfg.setOpts.enableDupe == 1) {
    var dupeStatus = false
    var dupeString = tags.artist + " - " + tags.title
    consoleMsg(`- Duping: ${dupeString}`)
    chanMsg(` - Checking for dupes: ${dupeString}`)
    dupeCheck(dupeString, (dupeStatusRaw) => {
      // return if dupe found
      if (dupeStatusRaw) {
        goMsg = `! Dupe found: "${dupeStatus}" for "${release}" (dupeString: "${dupeString}"), SKIPPING`
        consoleMsg("goMsg")
        chanMsg(' ' + goMsg)
        return
      } else {
        if (cfg.setOpts.verbose > 0) {
          consoleMsg("- No dupe(s) found")
          chanMsg(" - No dupe(s) found")
        }
      }
    });
  } else {
    if (cfg.setOpts.verbose > 0) {
      let sMsg = "- Dupecheck is disabled, skipping"
      consoleMsg (sMsg)
      chanMsg(' ' + sMsg)
    }
  }
  // pack, spread and pre release in correct orrder
  function doRelease() {
    fixLameInfo(cfg.setOpts.enableFixMp3, releaseFile, () => {
      fixMusicCRC(cfg.setOpts.enableFixMp3, releaseFile, () => {
        makeRelease(releaseLower, releasePath, releaseFile, tags, () => {
          if (cfg.setOpts.enableSpread) {
            spreadRel(release, () => {
              // dupe again
              if (cfg.setOpts.enableDupe == 1) {
                var dupeStatus = null
                dupeCheck(dupeString, (dupeStatusRaw) => {
                  if (dupeStatusRaw) {
                    let dMsg = `! Dupe found: ${dupeStatus} for ${release} (dupeString: "${dupeString}"), SKIPPING PRE`
                    consoleMsg(dMsg)
                    chanMsg(' ' + dMsg)
                    return
                  }
                }); // dupeCheck(again)
              }
              if (cfg.setOpts.enablePre == 1) {
                preRel(release, cbPreResult)
                consoleMsg(`+ \x02PRE Release\x02: ${release}`)
                chanMsg(` + PRE Release: ${release}`)
              } else {
                let dMsg = `- PRE Release is disabled (${release$}))`
                consoleMsg(dMsg)
                chanMsg(' ' + dMsg)
                return
              }
            }); // spreadRel
          } else {
            if (cfg.setOpts.verbose > 0) {
              consoleMsg("- Spreading is disabled, skippng")
              chanMsg(" - Spreading is disabled, skippng")
            }
          }
        }); // makeRelease
      }); // fixMusicCrc
    }); // fixLameInfo
  }; // doRelease
  
  // check if local release dir exists
  if (cfg.setOpts.localFtpSrc == 1) {
    fs.stat(releasePath, function(err) {
      if (err) {
        if (err.code === 'ENOENT') {
          consoleMsg("! Directory doesn't exist, aborting")
          chanMsg(" ! Directory doesn't exist, \x02aborting\x02")
        }
        return
      } else {
        releaseFile = `${releasePath}/01-${releaseLower}.mp3`
        consoleMsg("- Directory exists, proceeding")
        // check file exists
        if (debug > 0) console.debug(`DEBUG: releaseFile=${releaseFile}`)
        fs.stat(releaseFile, function(err) {
          if (err) {
            consoleMsg(`! File NOT FOUND: ${releaseFile}`)
            chanMsg(` ! \x02MISSING:\x02 ${releaseFile}`)
            return false
          }
        });
        // sudo chown release to bot user
        let chownExecString = `sudo chown -R ${cfg.grpOpts.botUser}:${cfg.grpOpts.botGroup} "${releasePath}"`
        if (debug > 0) console.debug(`DEBUG: chownExecString=${chownExecString}`)
        exec(chownExecString, function(err, stdout, stderr) {
        if (err) cMsg = ` \x02\x0304Chown Error:\x0F ${stderr}`
          // check file if is writable (sync)
          if (cfg.setOpts.enableFixMp3) {
            try {
              fs.accessSync(releaseFile, fs.constants.W_OK)
              //console.debug(`DEBUG: write access OK - ${releaseFile}`)
            }
            catch (e) {
              //cfg.setOpts.enableFixMp3 = 0
              consoleMsg(`! Chown ${chownExecString} ${e}`)
              chanMsg(` ! Chown ${chownExecString} ${e}`)
              return false
            }
          }
        });
      }
      doRelease()
    }); // check releasePath
  } else {
    if (cfg.setOpts.verbose > 0) {
      let dMsg = `- LOCAL ftp src is disabled, skipped release dir check)`
      consoleMsg(dMsg)
      chanMsg(' ' + dMsg)
    }
    doRelease()
  }
}

// fix LAME info header injection, uses python script
function fixLameInfo(enableFixMp3, releaseFile, callback) {
  if (enableFixMp3) {
    fMsg = "- Injecting LAME Info"
    consoleMsg(fMsg)
    if (cfg.setOpts.verbose > 0) {
      chanMsg(' ' + fMsg)
    }
    let lameinfoExecString
    lameinfoExecString = `${scriptPath}/lameinfo.py "${releaseFile}"`
    if (force == 1) {
      lameinfoExecString = `${scriptPath}/lameinfo.py -f "${releaseFile}"`
    }
    if (debug > 0) console.debug(`DEBUG: lameinfoExecString=${lameinfoExecString}`)
    let lameinfoExec = exec(lameinfoExecString, function(err, stdout, stderr, done) {
      if (err) {
        console.log(err)
        return false
      }
      if (stdout) {
        console.log(stdout)
      }
      if (stderr) {
        console.log(stderr)
        return false
      }
      if (stdout.match(/.*skip.*/g)) {
        let sMsg = "- Lameinfo: non-zero or non-empty, skipped injection"
        consoleMsg(sMsg)
        chanMsg(' ' + sMsg)
      }
      callback()
    });
    if (debug > 4) console.debug('DEBUG: lameinfoExec =', lameinfoExec)
  } else {
    if (cfg.setOpts.verbose > 0) {
      let sMsg = "- Fixing MP3 is disabled, skipping Lameinfo"
      consoleMsg (sMsg)
      chanMsg(' ' + sMsg)
    }
    callback()
  }
}

function fixMusicCRC (enableFixMp3, releaseFile, callback) {
  if (enableFixMp3) {
    try {
      var mp3editor = new Mp3Editor(releaseFile)
      if (debug > 0) console.debug('DEBUG: mp3editor.fixCRC()')
      consoleMsg("- Mp3Editor: Fixing Music CRC")
      if (cfg.setOpts.verbose > 0) {
        chanMsg(" - Mp3Editor: Fixing Music CRC")
      }
      mp3editor.fixCRC(function(err, stdout, stderr) {
        if (err) { 
          console.log(err) 
          chanMsg(" ! " + err)
          return false
        }
        if (stdout) {
          console.log(stdout)
          chanMsg(" ! " + stdout)
        }
        if (stderr) {
          console.log(stderr)
          chanMsg(" ! " + stderr)
          return false
        }
        if ((stdout.match(/.*No xingFrame.*/)) || (stderr.match(/.*No xingFrame.*/))) {
          chanMsg(" ! Mp3Editor: Xing frame \x02MISSING\x02")
          return false
        }
      });
      callback()
    }
    catch (e) {
      chanMsg(" ! Mp3Editor: fixMusicCRC " + e)
      return false
    }
    return false
  } else {
    if (cfg.setOpts.verbose > 0) {
      let sMsg = "- Fixing MP3 is disabled, skipping Music CRC"
      consoleMsg (sMsg)
      chanMsg(' ' + sMsg)
    }
    callback()
  }
}

// shell script rel.sh, uses cksfv, eyeD3 and mediainfo for tagging
function relSh (relType, releaseLower, releasePath, tags, callback) {
  if (cfg.getOpts.enableTag == 1) {
    let tagsArgs = `'${tags.artist}' '${tags.title}' '${tags.year}' '${tags.genre}' '${tags.date}' '${tags.notes}'`
    let relExecString = `${scriptPath}/rel.sh ${relType} '${releasePath}' '${releaseLower}' ${tagsArgs}`
    if (debug > 0) console.debug('DEBUG: relExecString=' + relExecString)
    let relExec = exec(relExecString, function(err, stdout, stderr) {
      if (debug > 4) console.debug(`DEBUG: lame tag relExec=${relExec} stdout=`, stdout)
      if (stdout.match(/ERR:NO_LAME/)) {
        err = "! Rel.sh: wrong lameinfo, incorrect version or MISSING"
        consoleMsg(err)
        chanMsg(' ' + err)
        return false
      }
      if (stdout.match(/ERR:NO_TIME/)) {
        err = "! RelSh: time not found, using default: 00:00"
        consoleMsg(err)
        chanMsg(' ' + err)
      }
      if (!err) {
        tMsg = `- RelSh: finished running "rel.sh" ${relType}"`
        consoleMsg(tMsg)
        if (cfg.setOpts.verbose > 0) {
          chanMsg(' ' + tMsg)
        }
        callback()
      } else {
        tMsg = `! RelSh: failed running "rel.sh ${relType}", aborting`
        consoleMsg(tMsg)
        chanMsg(' ' + tMsg)
        return false
      }
      /* removed: sfv added to rel.sh
      //createSfv(scriptPath, releasePath, releaseLower, () => {
      //  callback()
      });
      */
    });
  } else {
    if (cfg.setOpts.verbose > 0) {
      let sMsg = "- Tagging is disabled, skipped relSh"
      consoleMsg (sMsg)
      chanMsg(' ' + sMsg)
    }
    callback()
  }
}

/* shell script sfv.sh (cksfv), moved to rel.sh
function createSfv (scriptPath, releasePath, releaseLower, callback) {
  var sfvExecString = scriptPath + "/sfv.sh " + '"' + releasePath + '" "' + releaseLower + '"'
  if (debug > 0) console.debug('DEBUG: sfvExecString=' + sfvExecString)
  sfvExec = exec(sfvExecString , function(err, stdout, stderr) {
    sMsg = "- Creating SFV"
    consoleMsg(sMsg)
    chanMsg(' ' + sMsg)
    if (!err) {
      consoleMsg("- SFV creation complete")
      callback()
    } else {
      sMsg = "! SFV creation failed, aborting"
      consoleMsg(sMsg)
      chanMsg(' ' + sMsg)
      return false
    }
  });
  return false
}
*/

// TODO: add native id3 tagging

// (!) mp3releaser has issues, always tagging mp3 with rel.sh for now

// create nfo and sfv
function makeRelease (releaseLower, releasePath, releaseFile, tags, callback) {
  if (cfg.setOpts.enableTag == 1) {
    let tMsg = `- Using ID3tags + NFO: [ ${tags.artist} | ${tags.title} | ${tags.year} | ${tags.date} | ${tags.genre} ]`
    consoleMsg(tMsg)
    chanMsg(' ' + tMsg)
    //let titletag = title + " " + date
    relSh('mp3', releaseLower, releasePath, tags, function() {
      try {
        if (enableMp3Rel == 1) {
          let mp3Release = new Mp3Releaser(releasePath, releaseFile, tags)
          mp3Release.createRelease()
          tMsg = "- Mp3Releaser: nfo,sfv finished"
          consoleMsg(tMsg)
          if (cfg.setOpts.verbose > 0) chanMsg(' ' + tMsg)
          callback()
        } else {
          tMsg = "- Mp3Releaser: disabled, skipping"
          consoleMsg(tMsg)
          if (cfg.setOpts.verbose > 0) chanMsg(' ' + tMsg)
          throw Error();
        }
      // on error call rel.sh as 'fallback' 
      } catch (e) {
        // console.error('ERROR: Mp3Releaser createRelease', e);
        if (enableMp3Rel == 1) {
          tMsg = '! Mp3Releaser: fallback to "rel.sh"'
          consoleMsg(tMsg)
          chanMsg(' ' + tMsg)
        }
        relSh('nfo,sfv', releaseLower, releasePath, tags, callback)
      }
    });
  } else{
    if (cfg.setOpts.verbose > 0) {
      let sMsg = "- Tagging is disabled, skipped makeRelease"
      consoleMsg (sMsg)
      chanMsg(' ' + sMsg)
    }
    callback()
  }
}

// handle cb site commands

// GET '/sites'
function trigCbSites(message) {
  if (debug > 1) console.debug(`DEBUG: trigCbSites message="${message}"`)
  let ms = message.split(' ')
  if (debug > 3) console.log('cbApi.cbOptions', cbApi.cbOptions)
  cbApi.cbGet(cbApi.cbOptions, 'GET', '/sites', function (res, data) {
    if (res.StatusCode == '200') {
      rMsg = '- Sites result status: "' + res.statusMessage + '" (' + res.statusCode + ')'
      consoleMsg(rMsg)
      chanMsg(` ${rMsg}`)
    }
    if (data) {
      if (debug > 1) console.debug('DEBUG: getsites', JSON.parse(data))
      //chanMsg(JSON.parse(data))
      chanMsg(JSON.stringify(JSON.parse(data)).replace(/[\]\[\]]/g, '').replace(/,/g, ', ').replace(/"/g, ''))
    } else {
      chanMsg(" ! \x02Error:\x02 cannot get sites (no data)")
    }
  });
}

// GET '/sites/SITE1'
function trigCbSite(message) {
  if (debug > 1) console.debug(`DEBUG: trigCbSite message="${message}"`)
  let ms = message.split(' ')
  cbApi.cbGet(cbApi.cbOptions, 'GET', '/sites/' + ms[1], function (res, data) {
    if (res.statusCode === 200) {
      rMsg = '- Site result status: "' + res.statusMessage + '" (' + res.statusCode + ')'
      consoleMsg(rMsg)
      chanMsg(` ${rMsg}`)
    }
    if (data) {
      let tmp = JSON.parse(data)
      if (!tmp.failures && !tmp.successes && tmp.user !== undefined) {
        if (tmp.addresses) {
          tmp.addresses.forEach((addr, idx) => {
            tmp.addresses[idx] = `u001f${addr}u001f`
          });
        }
        if (tmp.disabled === true) {
          tmp.disabled = `u0002${tmp.disabled}u0002`
        }
        tmp.user = `u0002${tmp.user}u0002`
        tmp.password = '***'
        consoleMsg('trigCbSite sites tmp = ', tmp)
        //chanMsg(fmtJson(JSON.stringify(tmp)))
        jsonMsg(null, tmp, 6, getSiteRe)
        cbApi.cbGet(cbApi.cbOptions, 'GET', '/sites/' + ms[1] + '/sections', function (res, data) {
          if (data) {
            jsonMsg(null, JSON.parse(data), 3, null)
          }
        });
      } else {
        chanMsg(" ! \x02Error:\x02 cannot get site data, try again")  
      }
    } else {
      chanMsg(" ! \x02Error:\x02 cannot get site (no data)")
    }
  });
}

function trigCbAddSite(message, nick, dhSecret) {
  if (debug > 1) console.debug(`DEBUG: trigCbAddSite message="${message}" nick=${nick}`)
  let ms = message.split(' ')
  // POST '/sites/SITE1'
  if (ms[1] && ms[2] && ms[3]) {
    cbApi.cbObjSite.name = ms[1]
    cbApi.cbObjSite.addresses = ms[2]
    //cbApi.cbObjSite.sections[0].path = cfg.cbOpts.ftpDir

    /* 'alternative' use for cb sections: we store pre section here :)
        e.g. 'SITE PRE Some-Rel [SECTION]' */

    cbApi.cbObjSite.sections = [
      { "name": "PREDIR", "path": `${ ms[3] ? ms[3] : cfg.cbOpts.ftpDir }` },
      { "name": "PRECMD", "path": `${ ms[4] ? ms[4] : cfg.cbOpts.preCmd }` },
      { "name": "SPEEDTEST", "path": `${ ms[3] ? ms[3] : cfg.cbOpts.ftpDir }/speedtest` },
    ]
    cbApi.cbObjSite.user = cfg.cbOpts.ftpuser
    cbApi.cbObjSite.password = cfg.cbOpts.ftpPass
    cbApi.cbObjSite.base_path = `${ ms[3] ? ms[3] : cfg.cbOpts.ftpDir }`
    if (ms[4]) cbApi.cbObjSite.user = ms[5]
    if (ms[5]) cbApi.cbObjSite.password = ms[6]
    if (debug > 3) console.debug('DEBUG: addsite', cbApi.cbObjSite)
    if (debug > 0) console.debug('DEBUG: addsite', JSON.stringify(cbApi.cbObjSite))
    cbApi.cbPut(cbApi.cbOptions, 'POST','/sites', JSON.stringify(cbApi.cbObjSite), function (res, data) {
      if (res.statusCode) {
        rMsg = `- Add site result status: "${res.statusMessage}" (${res.statusCode})`
        consoleMsg(rMsg)
        nick ? nickMsg(nick, rMsg, dhSecret) : chanMsg(` ${rMsg}`)
      }
      if (debug > 3 && data) {
        console.debug('DEBUG: addsite > json data =', JSON.parse(data))
        console.log(data);
      }
      // GET added site
      cbApi.cbGet(cbApi.cbOptions, 'GET', '/sites/' + ms[1], function (res, data) {
        if (data) {
          let tmp = JSON.parse(data)
          tmp.password = '***'
          if (debug > 3) console.debug('DEBUG: addsite > get new site, data = ', data)
          //chanMsg(fmtJson(JSON.stringify(tmp)))
          nick ? jsonMsg(nick, tmp, 6) : jsonMsg(null, tmp, 6)
        } else {
          rMsg =  '! \x02Error\:\x02 no data, site not added"'
          nick ? nickMsg(nick, rMsg, dhSecret) : chanMsg(' ' + rMsg)
        }
        cbApi.cbGet(cbApi.cbOptions, 'GET', '/sites/' + ms[1] + '/sections', function (res, data) {
          if (data) {
            jsonMsg(null, JSON.parse(data), 3, null)
          }
        });
      });
    });
  } else {
    [ "> \x1FHelp\x1F: try !addsite SITE1 bnc-1:123,bnc-2:456 /groups/GRP mp3live myuser Passw0rd   (predir/section and user/pass are optional)",
      ">       Use !modsite and !modpre to change later. These cmds also work in pm, keyx with bot first" ] .
      forEach(line => { nick ? nickMsg(nick, line, dhSecret) : chanMsg(' ' + line) });
  }
}

// DELETE '/sites/SITE1'
function trigCbDelSite(message) {
  if (debug > 1) console.debug(`DEBUG: trigCbDelSite message="${message}"`)
  let ms = message.split(' ')
  if (ms[1]) {
    cbApi.cbPut(cbApi.cbOptions, 'DELETE', '/sites/' + ms[1], '', function (res, data) {
      if (res.statusCode) {
        let result = (res.statusCode === 204) ? " \x02OK\x02 " : " "
        rMsg = `- Delete site result status:${result}"${res.statusMessage}" (${res.statusCode})`
        consoleMsg(rMsg)
        chanMsg(` ${rMsg}`)
      }
    });
  }
}

// handle cb site modify commands

function trigCbModSite(message, nick, dhSecret) {
  if (debug > 1) console.debug(`DEBUG: trigCbModSite message="${message}" nick=${nick}`)
  let ms = message.split(' ')
  let trigger = ms[0]
  let cbObjModSite = { }  
  // collect options user wants to mod
  if (trigger.match(/^!(modsite|modslots|modpre)/i)) {
    if (trigger === "!modsite") {
      if (ms[1] && ms[2] === "disable") {
        cbObjModSite.name = ms[1]
        cbObjModSite.disabled = true
        cbObjModSite.allow_download = "NO"
        cbObjModSite.allow_upload = "NO"
      } else if (ms[1] && ms[2] === "enable" ) {
        cbObjModSite.name = ms[1]
        cbObjModSite.disabled = false
        cbObjModSite.allow_download = "YES"
        cbObjModSite.allow_upload = "YES"
      } else if ((ms[1] && ms[2]) && (!ms[2].match(/^!(disable|enable)/i) && (!ms[3].match('^/')))) {
        cbObjModSite.name = ms[1]
        cbObjModSite.addresses = ms[2]
        //cbObjModSite.sections[0].name = "PREDIR"
        //cbObjModSite.sections[0].path = `${ms[3] ? ms[3] : cfg.cbOpts.ftpDir}`
        //cbApi.cbObjSite.base_path = `${ ms[3] ? ms[3] : cfg.cbOpts.ftpDir }`
        if (ms[3]) cbObjModSite.user = ms[3]
        if (ms[4]) cbObjModSite.password = ms[4]
      } else {
        [ "> \x1FHelp\x1F: try !modsite SITE1 bnc-1:123,bnc-2:456 myuser Passw0rd   (user/pass are optional)",
          ">       This also works in pm, keyx with bot first. Use !modpre to change predir/section.",
          ">       To toggle site on/off use  !modsite SITE1 enable  or  !modsite SITE1 disable",
          ">       For changing other settings... just use Cbftp UI ;)" ] .
          forEach(line => { nick ? nickMsg(nick, line, dhSecret) : chanMsg(' ' + line) });
        return
      }
    } else if (trigger === "!modslots") {
      if (ms[1] && ms[2] && ms[3] && ms[4]) {
        cbObjModSite.name = ms[1]
        cbObjModSite.max_logins = parseInt(ms[2])
        cbObjModSite.max_sim_up = parseInt(ms[3])
        cbObjModSite.max_sim_down = parseInt(ms[4])
      } else {
        hMsg = "> \x1FHelp\x1F: try !modslots SITE1 <logins> <up> <down>"
        nick ? nickMsg(nick, hMsg, dhSecret) : chanMsg(' ' + hMsg)
        return
      }
    } else if (trigger === "!modpre") {

      // TODO: PATCH section instead, see cbModSiteSection()

      if (ms[1]) {
        cbObjModSite.name = ms[1]
        cbObjModSite.name.sections = []
        cbObjModSite.sections = [
          { "name": "PREDIR", "path": ms[2] ? ms[2] : cfg.cbOpts.ftpDir },
          { "name": "PRECMD", "path": ms[3] ? ms[3] : cfg.cbOpts.preCmd },
          { "name": "SPEEDTEST", "path": `${ ms[2] ? ms[2] : cfg.cbOpts.ftpDir }/speedtest` },
        ]
        cbApi.cbObjSite.base_path = `${ ms[2] ? ms[2] : cfg.cbOpts.ftpDir }`
      } else {
        [ "> \x1FHelp\x1F: try !modpre SITE1 /groups/GRP mp3-live   to set predir and section",
          "        section is used by 'SITE PRE <RELEASE> [SECTION]'" ] .
          forEach(line => { nick ? nickMsg(nick, line, dhSecret) : chanMsg(' ' + line) });
        return
      }
    } else {
      return
    }
    // GET site so we know it exists, PATCH '/sites/SITE1' and GET again to show changes
    cbApi.cbGet(cbApi.cbOptions, 'GET', '/sites/' + ms[1], function (res, data) {
      if (res.statusCode === 200) {
        if (debug > 3) console.debug('DEBUG: modsite', JSON.stringify(cbObjModSite))
        consoleMsg('cbObjModSite:', cbObjModSite)
        cbApi.cbPut(cbApi.cbOptions, 'PATCH', '/sites/' + ms[1], JSON.stringify(cbObjModSite), function (res, data) {
          if ((res.statusCode === 200) || (res.statusCode === 204)) {
            cbApi.cbGet(cbApi.cbOptions, 'GET', '/sites/' + ms[1], function (res, data) {
              if (data) {
                let tmp = JSON.parse(data)
                tmp.password = '***'
                if (tmp.disabled === true) {
                  tmp.disabled = `u0002${tmp.disabled}u0002`
                }
                consoleMsg('- trigCbSite getsites tmp = ')
                console.log(tmp)
                cbApi.cbGet(cbApi.cbOptions, 'GET', '/sites/' + ms[1] + '/sections', function (res, data) {
                  if (data) {
                    nick ? jsonMsg(nick, tmp, 10, getSiteRe) : jsonMsg(null, tmp, 10, getSiteRe)
                  }
                });        
              } else {
                let mMsg = " ! \x02Error:\x02 no data, site not modified"
                consoleMsg(mMsg)
                nick ? nickMsg(nick, mMsg, dhSecret) : chanMsg(' ' + mMsg)
              }
            });
          } else {
            let mMsg = `! Error, Mod site result status: "${res.statusMessage}" (${res.statusCode})`
            consoleMsg(mMsg)
            nick ? nickMsg(nick, mMsg, dhSecret) : chanMsg(' ' + mMsg)
          }
       });
      } else {
        mMsg = `! Error, Mod site result status: "${res.statusMessage}" (${res.statusCode})`
        consoleMsg(mMsg)
        nick ? nickMsg(nick, mMsg, dhSecret) : chanMsg(' ' + mMsg)
      }
    });
  } else {
    sMsg = `! \x02Error:\x02 site command failed or incorrect ${!ms[1] ? `(got no args)` : '' } try !help`
    nick ? nickMsg(nick, sMsg, dhSecret) : chanMsg(sMsg)
  }
}

// GET 'filelist'
function trigCbFileList(message) {
  if (debug > 1) console.debug(`DEBUG: trigCbFileList message="${message}"`)
  let ms = message.split(' ')
  if (ms[1]) {
    // variables for filelist
    let site = ms[1]
    let path = ms[2] ? 'PREDIR' + ms[2] : 'PREDIR'
    let timeout = '3'
    let url = '/filelist?site=' + site + '&path=' + path + '&timeout=' + timeout
    if (debug > 0) console.debug('DEBUG: filelist url=' + url)
    cbApi.cbGet(cbApi.cbOptions, 'GET', url, function (res, data) {
      if (res.statusCode !== 200) {
        rMsg = `- Filelist result status: "${res.statusMessage}" (${res.statusCode})`
        consoleMsg(rMsg)
        chanMsg(` ${rMsg}`)
      } else if (!data.error) {
        if (debug > 0) console.debug('DEBUG: filelist > json data =', JSON.parse(data))
        let tmp = JSON.parse(data)
        let tmplen = tmp.length
        tmp.forEach((obj, idx) => {
          tmp[idx].name = `u0002${obj.name}u0002`
        });
        let tmp_sort = tmp.sort((a, b) => new Date(b.last_modified) - new Date(a.last_modified)).reverse()
        tmp = JSON.stringify(tmp_sort, ["user", "group", "name", "last_modified", "type", "size"]).replace(/},/g, '}\n').split('\n').slice(-10)
        if (tmplen > 0) {
          if (tmplen <= 10) {
              chanMsg(` - Showing ${tmplen} result(s) in ${path}:`)
          } else {
              chanMsg(` - Too many results, showing last 10 entries in ${path}:`)
          }
          for (i=0; i < tmp.length; i++) {
            if (tmp[i]) {
              chanMsg(tmp[i].replace(/[\]\[\]]/g, '').replace(/[{}"]/g, '').replace(/([:,])/g, '$1 ').replace(/(\d\d:) (\d\d)/g, '$1$2'))
            }
          }
        }
      }
    });
  }
}

// POST '/raw' command
function trigCbRaw(message) {
  if (debug > 1) console.debug(`DEBUG: trigCbRaw message="${message}"`)
  let ms = message.split(' ')
  if (ms[1]) {
    // values for 'command'
    ms.shift()
    cbApi.cbObjCommand.command =  ms.join(' ')
    cbApi.cbObjCommand.sites_all = true
    if (debug > 0) console.debug('DEBUG: command', JSON.stringify(cbApi.cbObjCommand))
    cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCommand), function (res, data) {
      if (res.statusCode !== 200) {
        rMsg = `- Raw command result status: "${res.statusMessage}" (${res.statusCode})`
        consoleMsg(rMsg)
        chanMsg(` ${rMsg}`)
      }
      if (data) {
        if (debug > 0) console.debug('DEBUG: rawcommand > json data.successes =', JSON.parse(data).successes)
        let tmp = JSON.parse(data)
        tmp.successes.forEach(obj => {
          chanMsg(fmtJson(JSON.stringify(obj)).replace(/\r\n/g, '').replace(/"name"="(.*)",/g, 'u001f$1u001f'))
        });
      } else {
        chanMsg(" ! \x02Error:\x02 no data, could not run command")
      }
    });
  }
}

// handle cb spread jobs

function trigCbSpread(message) {
  if (debug > 1) console.debug(`DEBUG: trigCbSpread message="${message}"`)
  let ms = message.split(' ')
  let trigger = ms[0]
  // GET '/spreadjobs'
  if (trigger.match(/^!(getjob|getjobs|spreadjob|spreadjobs)/i)) {
    urn = ms[1] ? '/spreadjobs/' + ms[1] : '/spreadjobs'
    if (debug > 2) console.debug('DEBUG: getjob', urn)
    cbApi.cbGet(cbApi.cbOptions, 'GET', urn, function (res, data) {
      if (res.statusCode !== 200) {
        rMsg = `- Spreadjobs result status: "${res.statusMessage}" (${res.statusCode}). Try !getjobs to list jobs, for details: !getjob Release_Name-Grp`
        consoleMsg(rMsg)
        chanMsg(` ${rMsg}`)
      }
      if (data) {
        if (debug > 0) console.debug('DEBUG: data', data)
        tmp = JSON.parse(data)
        if (!isEmptyOrSpaces(tmp)) {
          if ((!ms[1]) || (Object.keys(tmp).length === 1)) {
            chanMsg(' - Listing spreadjobs, for details: !getjob Release_Name-Grp')
            chanMsg(JSON.stringify(tmp))
          } else {
            if (tmp.status === 'DONE') {
              tmp.status=`u0002${tmp.status}u0002`
            }
            jsonMsg(null, tmp, 3)
          }
        }
      }
    });
  // POST '/spreadjobs'
  } else if (trigger === '!spread' && ms[1]) {
    cbApi.cbObjSpreadJob.name = ms[1]
    if (cfg.setOpts.localFtpSrc == 1) cbApi.cbObjSpreadJob.sites_dlonly = cfg.cbOpts.ftpLocal
    cbApi.cbPut(cbApi.cbOptions, 'POST', '/spreadjobs', JSON.stringify(cbApi.cbObjSpreadJob), function (res, data) {
      if (res.statusCode !== 200) {
        let result = (res.statusCode === 204) ? " \x02OK\x02 " : " "
        sMsg = `- Spreadjob result status: ${result} "${res.statusMessage}" (${res.statusCode})`
        consoleMsg(sMsg)
        chanMsg(' ' + sMsg)
      }
    });
  // POST '/spreadjobs/NAME/abort'
  } else if (trigger.match(/^!(abortjob|abortspreadjob|abortspread|spreadabort|spreadjobabort)/i) && ms[1]) {
    cbAbortJob(ms[1], (ms[2]) ? ms[2] : 'NONE', (ms[3]) ? ms[3] : '')
  } else if (trigger.match(/^!(resetjob|resetspreadjob|resetpread|spreadreset|spreadjobreset)/i) && ms[1]) {
    cbResetJob(ms[1], (ms[2] == 'hard') ? true : false)
  }
  else if (trigger === '!stop' && ms[1]) {
    cbApi.cbGet(cbApi.cbOptions, 'GET', '/sites', function (res, data) {
      cbAbortJob(ms[1], 'NONE', JSON.parse(data))
    });
    cbAbortJob(ms[1], 'NONE', '')
  }
}

// TODO: PATCH section, use for modpre

function cbModSiteSection(site, name, path) {
  cbApi.cbObjSiteSection.name = name
  cbApi.cbObjSiteSection.path = path
  if (site && name && path) {
    cbApi.cbPut(cbApi.cbOptions, 'PATCH', '/sites/' + site + '/sections/' + name, JSON.stringify(cbApi.cbObjSiteSection), function (res, data) {
      if (data) return data
    });
  }
}

// TODO: DELETE section

function cbDelSiteSection(site, section) {
  if (debug > 1) console.debug(`DEBUG: trigCbDelSiteSection message="${message}"`)
  let ms = message.split(' ')
  if (site && section) {
    cbApi.cbPut(cbApi.cbOptions, 'DELETE', '/sites/' + site + '/sections/' + section, '', function (res, data) {
      if (data) return data
    });
  }
}

function trigCbModSiteSection(message) {
  if (debug > 1) console.debug(`DEBUG: trigCbModSiteSection message="${message}"`)
  let ms = message.split(' ')
  if (ms[1] && ms[2] && (ms[3].match('^/'))) {
    result = cbModSiteSection(ms[1], ms[2], ms[3])
    if (result) {
      if (debug > 0) console.debug('DEBUG: trigCbModSiteSection result = ', result)
      jsonMsg(null, JSON.parse(result), 10, getSiteRe)
    }
  }
}

function trigCbDelSiteSection(message) {
  if (debug > 1) console.debug(`DEBUG: trigCbDelSiteSection message="${message}"`)
  let ms = message.split(' ')
  if (ms[1] && ms[2]) {
    result = cbDelSiteSection(ms[1], ms[2])
    if (result) {
      if (debug > 0) console.debug('DEBUG: trigCbDelSiteSection result = ', result)
      jsonMsg(null, JSON.parse(result), 10, getSiteRe)
    }
  }
}

function trigCbTransfer(message) {
  if (debug > 1) console.debug(`DEBUG: trigCbTransfer message="${message}"`)
  let ms = message.split(' ')
  let trigger = ms[0]
   // GET '/transferjobs'
  if ((trigger === '!transferjobs') || (trigger === '!transferjob')) {
    urn = ms[1] ? '/transferjobs/' + ms[1] : '/transferjobs'
    if (debug > 2) console.debug('DEBUG: transferjobs', urn)
    cbApi.cbGet(cbApi.cbOptions, 'GET', urn, function (res, data) {
      if (res.statusCode !== 200) {
        rMsg = `- Transferjobs result status: "${res.statusMessage}" (${res.statusCode}). Try !transferjobs to list jobs, for details: !transgerjobs Release_Name-Grp`
        consoleMsg(rMsg)
        chanMsg(` ${rMsg}`)
      }
      if (data) {
        if (debug > 0) console.debug('DEBUG: data', data)
        tmp = JSON.parse(data)
        if (!isEmptyOrSpaces(tmp)) {
          if ((!ms[1]) || (Object.keys(tmp).length === 1)) {
            chanMsg(' - Listing transferjobs, for details: !transferjob Release_Name-Grp. To abort: !transferabort <job>')
            chanMsg(JSON.stringify(tmp))
          } else {
            if (tmp.status === 'DONE') {
              tmp.status=`u0002${tmp.status}u0002`
            }
            jsonMsg(null, tmp, 3)
          }
        }
      }
    });
  // POST '/transferjobs/NAME/reset'
  } else if (trigger.match(/^!(transferreset|transferresetjob|transferreset|resettransferjob)/i) && ms[1]) {
  cbApi.cbPut(cbApi.cbOptions, 'POST', '/transferjobs/' + ms[1] + '/reset', '', function (res, data) {
    if (res.statusCode !== 200) {
      let result = (res.statusCode === 204) ? " \x02OK\x02 " : " "
      rMsg = '- Transferjob reset, result status:' + result + '"' + res.statusMessage + '" (' + res.statusCode + ')'
      consoleMsg(rMsg)
      chanMsg(` ${rMsg}`)
    }
  });    
  // POST '/transferjobs/NAME/abort'
  } else if (trigger.match(/^!(transferabort|transferabortjob|transferjobabort|aborttransferjob)/i) && ms[1]) {
  cbApi.cbPut(cbApi.cbOptions, 'POST', '/transferjobs/' + ms[1] + '/abort', '', function (res, data) {
    if (res.statusCode !== 200) {
      let result = (res.statusCode === 204) ? " \x02OK\x02 " : " "
      rMsg = '- Transferjob abort, result status:' + result + '"' + res.statusMessage + '" (' + res.statusCode + ')'
      consoleMsg(rMsg)
      chanMsg(` ${rMsg}`)
    }
  });

  /* UNUSED: upload / download
  } else if (trigger === '!upload' && ms[1]) {
    cbApi.cbObjUploadJob.name = ms[1]
    cbApi.cbObjUploadJob.src_path = `${cfg.groupPath}/dir`
    cbApi.cbObjUploadJob.dst_site = ms[2]
    cbApi.cbObjUploadJob.dst_section = "PREDIR"
    //cbApi.cbObjUploadJob.src.path
    cbApi.cbPut(cbApi.cbOptions, 'POST', '/transferjobs', JSON.stringify(cbApi.cbObjUploadJob), function (res, data) {  });
  } else if (trigger === '!download' && ms[1]) {
    cbApi.cbObjDownloadJob.src_name = ms[1]
    cbApi.cbObjDownloadJob.src_site = cfg.cbOpts.ftpLocal
    cbApi.cbObjDownloadJob.src_section = "PREDIR"
    cbApi.cbObjDownloadJob.dst_path = "/tmp"
    cbApi.cbPut(cbApi.cbOptions, 'POST', '/transferjobs', JSON.stringify(cbApi.cbObjUploadJob), function (res, data) {  });
  */

  } else {
    mMsg = `! Error, Site result status: "${res.statusMessage}" (${res.statusCode})`
    consoleMsg(mMsg)
    chanMsg(' ' + Msg)
  }
}

// call preRel on !pre trigger
function trigCbPre(message) {
  if (debug > 1) console.debug(`DEBUG: trigCbPre message="${message}"`)
  let ms = message.split(' ')
  if (ms[1]) {
    preRel(ms[1], cbPreResult)
  } else {
    chanMsg(` ! \x02Error:\x02 site command failed or incorrect ${!ms[1] ? `(got no args)` : '' } try !help`)
  }
}

// TODO: handle results from /raw

function fmtRawResult(data) {
  console.log('DEBUG: fmtRawResult data =', data)
  tmp = JSON.parse(data)
  if (tmp.failures || tmp.successes) {
    tmp.failures.forEach(obj => {
      chanMsg(` ! \x1F${obj.name}\x1F last cmd failed, reason: ${obj.reason}`)
    });
    tmp.successes.forEach(obj => {
      chanMsg(` + \x1F${obj.name}\x1F last cmd result: ${obj.result.replace(/200-/g, ' -').replace(/\r\n/g, ' ').replace(/original f00-pre/g, '').
      replace(/foo.*tanesha/g, '').replace(/\$Id: .* \$/g, ' ').replace(/[^ a-zA-Z0-9.':*!?]/g, ' ').replace(/\.\.*/g, ' ').replace(/\s\s*/g, ' ')}`)
    });
  }
}

function cbPreResult() {
  if (reqIds) {
    reqIds.forEach(request_id => {
      console.log('DEBUG: cbPreResult - request_id', request_id)
      setTimeout(() => {
        cbApi.cbGet(cbApi.cbOptions, 'GET', '/raw/' + request_id, function (res, data) {
          if (data) {
            fmtRawResult(data)
            reqIds.pop(request_id)
          } else {
            console.log('DEBUG: cbPreResult - no data')
          }
        });
      }, 7000);
    });
  } else {
    console.log('DEBUG: cbPreResult - no request_id')
  }
}

// TODO: cleanup polling, use reject/resolve return/callback

// handle spread command: POST '/spreadjobs' to cbapi
function spreadRel (release, callback) {
  // values for 'spreadjob'
  cbApi.cbObjSpreadJob.name = release
  if (cfg.setOpts.localFtpSrc == 1) cbApi.cbObjSpreadJob.sites_dlonly = cfg.cbOpts.ftpLocal
  if (debug > 0) console.debug('DEBUG: spreadjob', JSON.stringify(cbApi.cbObjSpreadJob))
  cbApi.cbPut(cbApi.cbOptions, 'POST','/spreadjobs', JSON.stringify(cbApi.cbObjSpreadJob), function (res, data) {
    //if (debug > 3) console.debug('DEBUG: spreadjobs > json data =', JSON.parse(data))
    if ((res.statusCode === 200) || (res.statusCode === 201)) {

      // poll: GET spreadjobs that are 'RUNNING', in a loop
      // removed 'fn': const poll = async ({ fn, validate, interval, maxattempts }) => {
      // example: https://levelup.gitconnected.com/polling-in-javascript-ab2d6378705a

      const poll = async ({ interval, maxattempts }) => {
        var attempts = 0;
        if (debug > 3) console.debug(`DEBUG: interval=${interval} maxattempts=${maxattempts}`)
        sMsg = `+ Spreading: polling job status until done (max ${maxattempts} checks with ${(interval/1000)}s interval)`
        consoleMsg(sMsg)
        chanMsg(' ' + sMsg)
        if (debug > 3) console.debug('DEBUG: Start poll ... ');
        const executePoll = async (resolve, reject) => {
        if (debug > 3) console.debug('DEBUG: -- executePoll --');
        function doCall(release, interval, maxattempts, callback) {
          setTimeout(() => {
            cbApi.cbGet(cbApi.cbOptions, 'GET', '/spreadjobs/' + release, function (res, data) {
            return callback(data)
          });
          }, interval);
        }

        doCall(release, interval, maxattempts, function(data) {
          if (debug > 2)  {
            console.debug('DEBUG: doCall > json status =', JSON.parse(data).status);
            console.debug(`DEBUG: doCall > interval=${interval}, attempts=${attempts}, maxattempts=${maxattempts}`);
          }
          attempts++;
          if (JSON.parse(data).status === "DONE") {
            if (debug > 2) console.debug('DEBUG: status is DONE')
            // GET spreadjob when DONE
            // TODO: (?) change to
            //       return resolve(JSON.parse(data).status);
            cbApi.cbGet(cbApi.cbOptions, 'GET', '/spreadjobs/' + release, function (res, data) {
              var sMsg = ""
              if (data) {
                if (debug > 0) console.debug('DEBUG: spreadjobs > json data =', data)
                let tmp = JSON.parse(data)
                if (JSON.parse(data).status == "DONE") {
                  sMsg = "- Job DONE: " + fmtJson(JSON.stringify(tmp))
                } else {
                  sMsg = "! \x02Error:\x02 job not done, check status: " + fmtJson(JSON.stringify(tmp))
                }
              } else {
                sMsg = "! \x02Error:\x02 no data, spread job failed"
              }
              sMsg = sMsg.replace(/average/g, 'avg').replace(/percentage/g, 'pct').replace(/estimated/g, 'est').
                          replace(/incomplete/g, 'inc').replace(/seconds/g, 'sec')
                          //.match(/.{1,125}(,\s\s|$)/g)
              consoleMsg(sMsg)
              chanMsg(' ' + sMsg)
            });
            callback()
          } else if (JSON.parse(data).status == "TIMEOUT") {
            sMsg = "! Error: job timed out"
            consoleMsg(sMsg)
            chanMsg(' ' + sMsg)
            return
          } else if (JSON.parse(data).status == "ABORTED") {
            sMsg = "! Job was aborted"
            consoleMsg(sMsg)
            chanMsg(' ' + sMsg)
            return
          } else if (maxattempts && attempts === maxattempts) {
            sMsg = "! Error: job not done and max attempts exceeded"
            consoleMsg(sMsg)
            chanMsg(' ' + sMsg)
            //return reject(new Error('Exceeded max attempts'));
            return
          } else {
            if (debug > 2) console.debug('DEBUG: setTimeout executePoll')
            setTimeout(executePoll, interval, resolve, reject);
          }
        })
      };
      return new Promise(executePoll);
      // TODO: (?) use resolve() instead
      }
      poll({interval: pollInterval, maxattempts: pollMaxAttempts});
    } else {
      rMsg = `- Spreadjob result status: "${res.statusMessage}" (${res.statusCode})`
      consoleMsg(rMsg)
      chanMsg(` ${rMsg}`)
    }
  });
}

// TODO: remove kludge

// handle pre command: POST '/raw' to cbapi
// callback is optional since we also want !pre trigger

function preRel (release, callback) {
  cbApi.cbGet(cbApi.cbOptions, 'GET', '/sites?section=PRECMD', function (res, data) {
    // TODO remove kludge: check 'buffer' first
    if (JSON.parse(data).failures || JSON.parse(data).successes) {
      console.log('DEBUG: preRel kludge data =', data)
      chanMsg(" ! \x02Error:\x02 could not run pre command, last command did not finish... try again")
      fmtRawResult(data)
      return
    }
    console.log('DEBUG: preRel get sites data =', data)
    // small timeout needed here are we'll miss a site
    setTimeout(() => {
      JSON.parse(data).forEach(site => {
      console.log('DEBUG: preRel foreach site =', site)
      cbApi.cbGet(cbApi.cbOptions, 'GET', '/sites/' + site + '/sections/PRECMD', function (res, data) {
        var preCmd = cfg.cbOpts.preCmd
        //JSON.parse(data).sections.forEach(section => {
        //  if (section.name === 'PRECMD') preCmd = section.path
        //});
        if (data && JSON.parse(data).name === 'PRECMD') { 
          if (debug > 0) console.debug('DEBUG: preRel precmd data =', data)
          preCmd = JSON.parse(data).path
          cbApi.cbObjRaw.sites = site
          cbApi.cbObjRaw.command = `SITE PRE ${release} ${preCmd ? preCmd : cfg.cbOpts.preCmd }`
          //cbApi.cbObjRaw.sites_with_sections = [ "PREDIR" ]
          cbApi.cbObjRaw.path_section = "PREDIR" 
          cbApi.cbObjRaw.sites_all = false
          cbApi.cbObjRaw.timeout = 5
          cbApi.cbObjRaw.async = true
          delete cbApi.cbObjRaw.path
          delete cbApi.cbObjRaw.sites_with_sections
          if (debug > 0) console.debug('DEBUG: preRel cbObjRaw = ', JSON.stringify(cbApi.cbObjRaw))
          cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjRaw), function (res, data) {
            // 202 is 'Accepted'
            if (res.statusCode === 202) {
              chanMsg(` - \x1F${site}\x1F Pre command sent, result status: ${res.statusMessage} (${res.statusCode})`)
            } else {
              chanMsg(` ! \x1F${site}\x1F Pre command not sent, result status: ${res.statusMessage} (${res.statusCode})`)
              //return false
            }
            if (data) {
              if (debug > 0) console.debug('DEBUG: preRel POST raw data =', data)
              if (JSON.parse(data).request_id) reqIds.push(JSON.parse(data).request_id)
              callback();
            } else {
              chanMsg(` ! \x02Error:\x02 ${site} returned no data, could not run pre command`)
              //return false
            }
            /* only works for synchronous calls
            if (data) {
              if (debug > 0) console.debug('DEBUG: precmd > json data.successes =', JSON.parse(data).successes)
              if (JSON.parse(data)) {
                JSON.parse(data).forEach(obj => {
                  chanMsg(fmtJson(JSON.stringify(obj)).replace(/"name"="(.*)",/g, 'u001f$1u001f'))
                });
              }
            } else {
              chanMsg(" ! \x02Error:\x02 no data, could not run pre command")
              return false
            }
            */
          });
        };
      });
    });
  }, 1000);
});
}

function cbAbortJob (name, rm, sites) {
  cbApi.cbObjAbortSpreadJob.delete = 'NONE'
  if (rm) cbApi.cbObjAbortSpreadJob.delete = rm // (optional, NONE/INCOMPLETE/OWN/ALL)
  if (sites) {
    cbApi.cbObjAbortSpreadJob.sites = sites
  } else {
    delete cbApi.cbObjAbortSpreadJob.sites
  }
  if (debug > 1) console.debug('DEBUG: spreadjobs abort', JSON.stringify(cbApi.cbObjAbortSpreadJob))
  cbApi.cbPut(cbApi.cbOptions, 'POST', '/spreadjobs/' + name + '/abort', JSON.stringify(cbApi.cbObjAbortSpreadJob), function (res, data) {
    if (res.statusCode !== 200) {
      let result = (res.statusCode === 204) ? " \x02OK\x02 " : " "
      rMsg = '- Spreadjob abort, result status:' + result + '"' + res.statusMessage + '" (' + res.statusCode + ')'
      consoleMsg(rMsg)
      chanMsg(` ${rMsg}`)
    }
  });
}

function cbResetJob (name, hVal) {
  if (hVal) cbObjResetSpreadJob.hard = hVal
  if (debug > 1) console.debug('DEBUG: spreadjobs reset', JSON.stringify(cbApi.cbObjResetSpreadJob))
  cbApi.cbPut(cbApi.cbOptions, 'POST', '/spreadjobs/' + name + '/reset', JSON.stringify(cbApi.cbObjResetSpreadJob), function (res, data) {    
    if (res.statusCode !== 200) {
      let result = (res.statusCode === 204) ? " \x02OK\x02 " : " "
      rMsg = '- Spreadjob reset, result status:' + result + '"' + res.statusMessage + '" (' + res.statusCode + ')'
      consoleMsg(rMsg)
      chanMsg(` ${rMsg}`)
    }
  });
}
   
// handle speedtest
function trigCbSpeed(message, mode=1) {
  if (debug > 1) console.debug(`DEBUG: trigCbSpeed message="${message}" mode=${mode}`)
  let ms = message.split(' ')
  let trigger = ms[0]
  if ((trigger.match(/^!(speed|speedtest|speedcopy)/i)) && ms[1] && ms[2]) {
    var curStName
    var newStName = "test_" + Math.floor(Math.random() * (9999 - 1000) + 1000);
    // make sure we have a speedtest dir name
    try {
      if(isEmptyOrSpaces(newStName)) return
    } catch (e) {
      chanMsg(` ! ERROR: could not set speedtest dir`)
      return
    }
    let url = '/filelist?site=' + ms[1] + '&path=' + 'SPEEDTEST' + '&timeout=' + '3'
    cbApi.cbGet(cbApi.cbOptions, 'GET', url, function (res, data) {
      if (data) {
        files = JSON.parse(data)
        files.forEach((obj, idx) => {
          // find current speedtest name on src
          if (obj.name.match('^test_[0-9]+') && !curStName) {
            chanMsg(` - Speedtest starting: "${newStName}/${cfg.cbOpts.speedFile}"`)
            curStName = obj.name.toString()
            if (debug > 2) console.debug(`DEBUG: trigCbSpeed match curStName=${curStName}`)
            // rename current to new random dir name
            cbApi.cbObjCommand.sites = ms[1]
            cbApi.cbObjCommand.command = `RNFR $path(PREDIR)/speedtest/${curStName}`
            cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCommand), function (res, data) {
              if ((debug > 1) && (data)) console.debug(data)
              cbApi.cbObjCommand.command = `RNTO $path(PREDIR)/speedtest/${newStName}`
              cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCommand), function (res, data) { 
                if ((debug > 1) && (data)) console.debug(data)
                cbApi.cbObjCommand.sites = ms[2]
                cbApi.cbObjCommand.command = `MKD $path(PREDIR)/speedtest`
                cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCommand), function (res, data) {
                  if ((debug > 1) && (data)) console.debug(data)
                  // fxp speedtest dir
                  cbApi.cbObjFxpJob.name = `${newStName}`
                  cbApi.cbObjFxpJob.src_site = ms[1]
                  cbApi.cbObjFxpJob.dst_site = ms[2]
                  cbApi.cbObjFxpJob.src_section = 'SPEEDTEST'
                  cbApi.cbObjFxpJob.dst_section = 'SPEEDTEST'
                  console.debug(cbApi.cbObjFxpJob)
                  cbApi.cbPut(cbApi.cbOptions, 'POST', '/transferjobs', JSON.stringify(cbApi.cbObjFxpJob), function (res, data) {
                    if ((debug > 1) && (data)) console.debug(data)
                  })

                  // TODO: (?) poll instead of 10sec timeout 
                  
                  setTimeout(() => {  // wait 10 seconds and get results 
                    cbApi.cbGet(cbApi.cbOptions, 'GET', `/transferjobs/${newStName}`, function (res, data) {
                      if (data) {
                        let tmp = JSON.parse(data)
                        tmp.time_spent_seconds = `u0002${tmp.time_spent_seconds}u0002`
                        tmp.status = `u0002${tmp.status}u0002`
                        jsonMsg(null, tmp, 5)
                        if (debug > 1) console.debug(data)
                        result = JSON.parse(data)
                          //if (result.status === "DONE") {
                          if ((result.status) && (result.size_progress_bytes > 0) && (result.time_spent_seconds > 0)) {  
                            let mibs = Math.floor(result.size_progress_bytes / result.time_spent_seconds / 1024 / 1024)
                            let mbit = Math.floor(mibs * 8).toLocaleString('en-US')
                            chanMsg(` + Speedtest result: \x1F${ms[1]}\x1F -> \x1F${ms[2]}\x1F at \x02${mibs}\x02MiB/s (${mbit}Mbit)`)
                          } else {
                            chanMsg(` ! No results, try again?`)
                          }
                          // mode=1 delete speedtest on target, mode=2 copy, keep speedtest on target
                          if (mode === 1) {
                            cbApi.cbObjCommand.sites = ms[2]
                            cbApi.cbObjCommand.command = `DELE $path(PREDIR)/speedtest/${newStName}/${cfg.cbOpts.speedFile}`
                            cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCommand), function (res, data) { 
                              if ((debug > 1) && (data)) console.debug(data)
                              cbApi.cbObjCommand.command = `RMD $path(PREDIR)/speedtest/${newStName}`
                              cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCommand), function (res, data) { 
                                if ((debug > 1) && (data)) console.debug(data)
                                  if ((debug > 1) && (data)) console.debug(data)
                                  cbApi.cbObjCommand.command = `DELE $path(PREDIR)/speedtest/(no-sfv)-${newStName}`
                                  cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCommand), function (res, data) { 
                                    if ((debug > 1) && (data)) console.debug(data)
                                    cbApi.cbObjCommand.command = `RMD $path(PREDIR)/speedtest`
                                    cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCommand), function (res, data) {
                                      if ((debug > 1) && (data)) console.debug(data)
                                      return
                                    });
                                  });
                                });
                              });
                          } else {
                            chanMsg(` - Copy mode, not deleting "speedtest/${newStName}" on dest site ${ms[2]}`)
                          }
                        }
                     });
                    }, 10000);
                  });
                });
               });
            return
          } else {
            if ((idx >= files.length-1) && (!curStName)) {
              chanMsg(` ! ERROR: missing "/PREDIR/speedtest/speedtest_123/${cfg.cbOpts.speedFile}" on source site ${ms[1]}`)
              return
            }
          }
        });
     }
   });
  // cleanup speedtests on target by deleting file, dir (and symlink)
  } else if (trigger === "!speedclean" && ms[1]) {
    if (ms[1]) {
      let url = '/filelist?site=' + ms[1] + '&path=' + 'SPEEDTEST' + '&timeout=' + '3'
      cbApi.cbGet(cbApi.cbOptions, 'GET', url, function (res, data) {
        if (data) {
          JSON.parse(data).forEach((obj) => {
            // find current speedtest name
            var objMatch = obj.name.match(/^(\((incomplete|no-nfo|no-sfv)\)-)?test_[0-9]+/)
            if (objMatch) {
              cbApi.cbObjCommand.sites = ms[1]
              var stName = obj.name.toString()
              var tmpDebugFunc = (data) => {
                console.debug(cbApi.cbObjCommand.command)
                console.debug(data)
              }
              // delete (no-sfv)- symlink
               if(objMatch[1]) {
                cbApi.cbObjCommand.command = `DELE $path(SPEEDTEST)/${stName}`
                cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCommand), function (res, data) {
                  if (debug && data) tmpDebugFunc(data)
                  return
                });
              // delete test dir, file.bin and parent speedtest dir
              } else {
                cbApi.cbObjCommand.command = `DELE $path(SPEEDTEST)/${stName}/${cfg.cbOpts.speedFile}`
                if (debug && data) tmpDebugFunc(data)
                cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCommand), function (res, data) { 
                  if (debug && data) tmpDebugFunc(data)
                  cbApi.cbObjCommand.command = `RMD $path(SPEEDTEST)/${stName}`
                  cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCommand), function (res, data) {
                    if (debug && data) tmpDebugFunc(data)
                    cbApi.cbObjCommand.command = `RMD $path(PREDIR)/speedtest`
                    cbApi.cbPut(cbApi.cbOptions, 'POST', '/raw', JSON.stringify(cbApi.cbObjCommand), function (res, data) { 
                      if (debug && data) tmpDebugFunc(data)
                      return
                    });
                  });
                });
              }
            }
          });
        }
      });
    } else {
      chanMsg(` > \x1FHelp\x1F: !speedclean <site>    !speedclean <site>delete all 'test_123' dirs`)
    }
  } else {
    [ " > \x1FHelp\x1F: !speedtest <src_site> <dst_site>    fxp '/PREDIR/speedtest_123', dir must exist on src   (Alias: !speed)",
      " >       !speedcopy <src_site> <dst_site>    fxp and keep the speedtest dir on dest",
      " >       !speedclean <site>                  deletes all speedtest dirs, cleans up symlinks", ] .
      forEach(line => { chanMsg(' ' + line) });
  }
}

// handle addip (keyx first)
function trigIpChange(message, nick, dhSecret) {
  if (debug > 0) console.debug('DEBUG: trigIpChange text=' + message)
  let ms = message.split(' ')
  if (ms[0] && ms[1] && ms[2]) {
    let changeIpExecString = scriptPath + '/xl-ipchanger.sh'
    if (ms[0] === "!addip" && ms[1] && ms[2] && ms[3])  {
      changeIpExecString += ' ADDIP '  + ms[1] + ' ' + ms[2] + ' ' + ms[3]
    } else if (ms[0] === "!delip" && ms[1] && ms[2] && ms[3]) {
      changeIpExecString += ' DELIP '  + ms[1] + ' ' + ms[2] + ' ' + ms[3]
    } else if (ms[0] === "!listip" && ms[1] && ms[2]) {
      changeIpExecString += ' LISTIP ' + ms[1] + ' ' + ms[2] 
    } else if (ms[0] === "!ipadds" && ms[1] && ms[2]) {
      changeIpExecString += ' IPADDS ' + ms[1] + ' ' + ms[2]
    } else {
      return
    }
    if (debug > 0) console.debug('DEBUG: changeIpExecString=', changeIpExecString)
    let changeIpExec = exec(changeIpExecString, function(err, stdout, stderr) {
      if (err)    console.log(err)
      if (stdout) console.log(stdout)
      if (stderr) console.log(stderr)
      if (ircConnected) {
        // tail stdout lines: x = stdout.split('\n'); x[x.length-1]
        //                    stdout.split('\n').pop()
        //                    stdout.split('\n').slice(-2)[0]
        if (ms[0] === "!ipadds") {
            let tmp = stdout.split('\n').slice(-4)
            for (i=0; i < tmp.length; i++) { 
              if (tmp[i]) {
                nickMsg(nick, tmp[i], dhSecret)
              }
            }
        } else {
          nickMsg(nick, stdout, dhSecret)
        }
      }
    });
    if (debug > 4) console.debug('DEBUG: changeIpExec =', changeIpExec)
  } else {
    hMsg= [ " > \x1FHelp\x1F: To change ip on (local) group dump:",
            " > \x1FHelp\x1F: /msg " + cfg.ircOpts.nick + " !addip <username> <password> <ip>  (or !delip)",
            " > \x1FHelp\x1F: /msg " + cfg.ircOpts.nick + " !listip <username> <password>  (or !ipadds for log)" ]
    for (i = 0; i < hMsg.length; i++) { 
      nickMsg(nick, hMsg[i], dhSecret)
    }
  }
}

// show help
function trigHelp(message) {
  let ms = message.split(' ')
  let trigger = ms[0]
  if (trigger === "!help") {
    chanMsg(`\x1FUsage:\x1F \x02!go\x02 <Release-Dir-GRP>|artist:<artist>|title:<title>|genre:<genre>|date:<date> \x1FAutotag:\x1F skip artist|title|date to use reldir (or if date not found: 'today')`)
    chanMsg(`\x1FExample:\x1F Some_Artist_-_Radio_Station-SAT-${relDateFmt()}-GRP|artist:Some Artist|title:Radio Station-SAT-${dayMonthFmt()}|genre:House|date:${relDateFmt()}`)
    chanMsg(`\x1FSites:\x1F !sites, !site <SITE>, !addsite <SITE> <bnc> [user pass], !delsite <SITE> \x1FChange:\x1F !modsite !modslots !modpre (!<cmd> shows more help)`)
    chanMsg(`\x1FJobs:\x1F !getjob !abortjob <job> !resetjob <job>, !transferjobs <job>, transferabort <job> \x1FOther:\x1F !speed <SITE1> <SITE2>, !filelist <SITE>, !raw <cmd>`)
    chanMsg(`\x1FRelease:\x1F !spread <Rel>, !pre <Rel>, !stop <Rel> \x1FView:\x1F !check <Release>, !dir (list local) \x1FBot:\x1F !restart, !kill, !cfg`)
    chanMsg(`\x1FPrivate Cmds:\x1F !addip <user> <passwd> <ip> and !delip, !listip or !ipadds for logs cmds change ip on local glftpd, !addsite !modsite also work  (keyx with bot first)`)
  }
}

/* download album id crap (unused)
function download(id, done) {
  consoleMsg("Downloading: " + id)
  chanMsg('Downloading: ' + id)
  // dl command here
  dlExec = exec("/home/p/new/getalbum " + id + " dl:1 quick:1 webskip:1", function(err, stdout, stderr) {
    if (err) {
      console.log(err)
      if (stdout) console.log(stdout)
      if (stderr) console.log(stderr)
      done()
    }
    consoleMsg("- DL complete: " + id)
    console.log(" ")
  });
} */

// console logging
function consoleMsg(msg) {
  //var time = new Date().getTime()
  console.log(getDateTime() + " " + msg)
}

function isEmptyOrSpaces(str){
  return str == undefined || str === null || (/^ *$/).test(str);
}

// irc chan message, use fish if main chan has blowkey set
function chanMsg(msg) {
  if (!isEmptyOrSpaces(msg)) {
    if (cfg.ircOpts.chan.main.blow) {
      String(msg).match(fishSplitRe).forEach(line =>
        client.say(cfg.ircOpts.chan.main.name, fishWrap('encrypt', cfg.ircOpts.chan.main.blow, line))
      )
    } else {
      if (ircConnected) client.say(cfg.ircOpts.chan.main.name, msg)
    }
  }
}

// irc private message, always use fish
function nickMsg(nick, msg, dhSecret) {
  console.debug(`DEBUG: nick=${nick} dhSecret=`,dhSecret)
  if ((!isEmptyOrSpaces(nick)) && (!isEmptyOrSpaces(msg))) {
    try {
      if (dhSecret[nick]) {
          msg = fishWrap('encrypt', dhSecret[nick], msg)
      }
      if (ircConnected) client.say(nick, msg)
    } catch (e) {
      return
    }
  }
}

// watch for incoming dirs
function ftpWatchDir() {
  if (watcher) {
    watcher.close()
  }
  watcher = chokidar.watch(cfg.grpOpts.watchDir, {
    ignored: /[\/\\]\./, persistent: true, ignoreInitial: true, depth: 0, cwd: cfg.grpOpts.watchDir, interval: 50
  });
  watcher
    .on('addDir', function(wpath) {
      chanMsg(" + \x02NEWDIR\x02 " + wpath)
  });
  console.log(getDateTime() + " + Watching: " + cfg.grpOpts.watchDir)
}

// date and time used for logging: dd mmm hh:mm:ss
function getDateTime() {
    let date = new Date();
    let hour = date.getHours();
    hour = (hour < 10 ? "0" : "") + hour;
    let min  = date.getMinutes();
    min = (min < 10 ? "0" : "") + min;
    let sec  = date.getSeconds();
    sec = (sec < 10 ? "0" : "") + sec;
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    // month = (month < 10 ? "0" : "") + month;
    let m = [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ]
    let mname = m[date.getMonth()];
    let day  = date.getDate();
    // day = (day < 10 ? "0" : "") + day;
    // return year + "-" + month + "-" + day + " " + hour + ":" + min + ":" + sec;
    return day + " " + mname + " " + hour + ":" + min + ":" + sec;
}

// date format used for release date: mm-dd-yyyy
function relDateFmt() {
    let date = new Date();
    let year = date.getFullYear();
    let month = date.getMonth() + 1;
    month = (month < 10 ? "0" : "") + month;
    let day = date.getDate();
    day = (day < 10 ? "0" : "") + day;
    return month + "-" + day + "-" + year;
}

// day and month in release: mm-dd
function dayMonthFmt() {
  let date = new Date();
  let month = date.getMonth() + 1;
  month = (month < 10 ? "0" : "") + month;
  let day = date.getDate();
  day = (day < 10 ? "0" : "") + day;
  return month + "-" + day;
}

// mp3 duration hh:mm
function getDuration(file) {
  let fileStat = fs.statSync(file);
  let fileDuration = []
  let intSize = fileStat.size;
  const pz = function (n) { return ('00'+n).slice(-2) }
  if ( fileDuration[file]) {
    intSize = fileDuration[file] * 1000;
  } else {
    let fileBuffer = fs.readFileSync(file);
    intSize = mp3duration(fileBuffer);
  }
  return `${pz(Math.floor(intSize / 1000 / 60))}:${pz(Math.floor((intSize / 1000) % 60))}`;
}

// (OLD) external perl script: blowcli.pl, replaced by fishwrap below
//       call for fishy stuff coz no 'native' nodejs crap available it seems
//       sub=perl subroutine from blowcli.pl, args=key, plaintext or header, nick etc
function blowCli(sub, args) {
  if (debug > 3) (`DEBUG: blowCli args = ${args}`)
  let blowcliExecString = `${scriptPath}/blowcli.sh ${sub} ${args}`
  if (debug > 0) console.debug(`DEBUG: blowcliExecString=${blowcliExecString}`)
  let childProcess = require('child_process');
  var blowcliExec = childProcess.execSync(blowcliExecString, function(err, stdout, stderr) {
    if (err)    consoleMsg(`! blowcliExec err: ${err}`)
    if (stdout) consoleMsg(`- blowcliExec stdout: ${stdout}`)
    if (stderr) consoleMsg(`! blowcliExec stderr: ${stderr}`)
  });
  return String(blowcliExec)
}

// external python script: weechats fish.py + fishwrap2.py
// act=action (argv) fishwrap.py, args=key, text(plain/cipher)
function fishWrap(act, ...args) {
    args.forEach(arg => {
        arg = JSON.stringify(arg)
    });
    // make sure shell args are escaped
    args = controlCodes(String(JSON.stringify(args)).replace(/[\[\]]/g, '').replace(/","/g, '" "'))
    if (debug > 3) console.debug(`DEBUG: fishWrap args=${args}`)
    let fishwrapExecString = `${scriptPath}/fishwrap2.py ${act} ${args}`
    if (debug > 4) console.debug('DEBUG: fishWrapExecString=' + fishwrapExecString)
    let childProcess = require('child_process');
    var fishwrapExec = childProcess.execSync(fishwrapExecString, function(err, stdout, stderr) {
      if (err)    consoleMsg(`! fishwrapExec err: ${err}`)
      if (stdout) consoleMsg(`- fishwrapExec stdout: ${stdout}`)
      if (stderr) consoleMsg(`! fishwrapExec stderr: ${stderr}`)
    });
    return String(fishwrapExec)
}

function getTags(releaseFile) {
  try {
    var gMsg
    let buf = Buffer.alloc(1024)
    let fd = fs.openSync(releaseFile, 'r');
    fs.readSync(fd, buf, 0, 1024, 0);
    fs.closeSync(fd);
    let abuf = new Uint8Array(buf).buffer
    if (abuf) {
      let dview = new DataView(abuf)
      let tags = Mp3Parser.readTags(dview)
      if (debug > 3) console.debug('DEBUG: called Mp3Parser.readTags')
      var tagObject = {}
      for (let i in tags) {
        if (debug > 0) console.debug('DEBUG: Mp3Parser tags[i]', tags[i])
        let item = tags[i];
        for (let key in item) {
          let value = item[key];
          for (let i = 0; i < value.length; i++) {
            if (value[i].header) {
              if (debug > 1) console.debug('DEBUG: Mp3Parser JSON v[i]', JSON.stringify(val[i]))                    
              tagObject[value[i].header.id] = value[i].content.value
            }
          }
        }
      }
      if (debug > 0) console.debug('DEBUG: tagObject = ', tagObject)
      return tagObject
    } else {
      gMsg = "! Error: could not read buffer"
      consoleMsg(gMsg)
      chanMsg(' ' + gMsg)
    }
  } catch (e) {
    console.error('ERROR: getTags', e);
    return
  }
}

function trigDupeAdd (message) {
  let ms = message.split(' ')
  let trigger = ms[0]
  if (trigger === "!dupeadd") {
    consoleMsg('DUPE ADD:', ms[1])
    dupe.push(ms[1])
  }
}

function trigUptime (message) {
  let trigger
  if (message !== true) {
    let ms = message.split(' ')
    trigger = ms[0]
  }
  if (trigger === "!uptime" || message === true) {
    let uptime = process.uptime()
    let days = parseInt( uptime / 86400 )
    let hours = parseInt (( uptime - ( days * 86400 )) / 3600  )
    let minutes = parseInt ((uptime - ((hours * 3600)+( days * 86400 ))) / 60 )
    let seconds = parseInt( uptime - ((hours * 3600) + (minutes * 60)+( days * 86400 )))
    let upFmt =   days + "d " 
                + (hours < 10 ? "0" + hours : hours) + ":"
                + (minutes < 10 ? "0" + minutes : minutes) + ":"
                + (seconds  < 10 ? "0" + seconds : seconds)
                var startTime  = process.hrtime()
    var startUsage = process.cpuUsage()
    var now = Date.now()
    while (Date.now() - now < 500)
    var elapTime = process.hrtime(startTime)
    var elapUsage = process.cpuUsage(startUsage)
    var secNSec2ms = (secNSec) => {
      if (Array.isArray(secNSec))
        return secNSec[0] * 1000 + secNSec[1] / 1000000
      return secNSec / 1000
    }
    var elapTimeMS = secNSec2ms(elapTime)
    var elapUserMS = secNSec2ms(elapUsage.user)
    var elapSystMS = secNSec2ms(elapUsage.system)
    var cpuPercent = Math.round(100 * (elapUserMS + elapSystMS) / elapTimeMS)
    if (debug > 4) {
      console.debug(`DEBUG: elapsed time ms = ${elapTimeMS}`)
      console.debug(`DEBUG: elapsed user ms = ${elapUserMS}`)
      console.debug(`DEBUG: elapsed system ms = ${elapSystMS}`)
      console.debug(`DEBUG: cpu percent = ${cpuPercent}`)
    }
    let memory = process.memoryUsage()
    let memFmt = ""
    for (let k in memory) {
      memFmt += `${k} ${Math.round(memory[k] / 1024 / 1024 * 100) / 100}MB `
    }
    //let loc = fs.readFileSync(__filename).toString().split("\n").length-1;
    uMsg = `- Uptime: ${upFmt} PID: ${process.pid} CPU: ${cpuPercent}% Memory: ${memFmt}`
    consoleMsg(uMsg)
    chanMsg(' ' + uMsg)
  }
}

function trigConf(message) {
  let trigger
  if (message !== true) {
    let ms = message.split(' ')
    trigger = ms[0]
  }
  if ((trigger === "!cfg" || trigger === "!conf") || message === true) {
    chanMsg(` > Config: see output on console log for all options, use 'File Manager' via \x02web\x02 to edit 'Bot Config'`)
    chanMsg(` filename=${__filename} group=${cfg.group} cfg.groupPath=${cfg.groupPath}`)
    chanMsg(` \x1Fcfg.ircOpts:\x1F nick=${cfg.ircOpts.nick} chain.main.name=${cfg.ircOpts.chan.main.name} owner=${cfg.ircOpts.owner}`)
    chanMsg(` \x1Fcfg.setOpts:\x1F enableFixMp3=${cfg.setOpts.enableFixMp3} enableLameCheck=${cfg.setOpts.enableLameCheck} enableSpread=${cfg.setOpts.enableSpread} enablePre=${cfg.setOpts.enablePre} localFtpSrc=${cfg.setOpts.localFtpSrc}`)
    chanMsg(` \x1Fcfg.cbOpts:\x1F enable=${cfg.cbOpts.enable} ftpLocal=${cfg.cbOpts.ftpLocal} ftpUser=${cfg.cbOpts.ftpUser} ftpDir=${cfg.cbOpts.ftpDir} \x1FcbApi.cbOptions:\x1F hostname=${cbApi.cbOptions.hostname} port=${cbApi.cbOptions.port}`)
    console.log(cfg.group, cfg.groupPath)
    console.log(cfg.grpOpts)
    console.log(cfg.ircOpts)
    console.log(cfg.setOpts)
    console.log(Mp3Releaser)
    console.log(cbApi)
    console.log(cfg.cbOpts.enable, cfg.cbOpts.ftpUser, cfg.cbOpts.ftpPass, cfg.cbOpts.ftpDir)
  }
}

function trigShit() {
  [ "                          Stupid Horrible Idiotic Tool",
    "                                            _",
    "                        ____ _  ___    __ (___)______ __",
    "-----------------------/       |   \\  |   |   |         \\\\----------------------",
    "          _/\\          \\    __ |    |_|   |   |_     ___//",
    "         (._.)     _____\\    \\ |          |   | |    ||",
    "        (_____)   ( _____\\    \\|    | |   |   | |    ||",
    "       (_______)   (           \\    | |   |   | |    ||",
    "--------------------\\_____ _ ___)___) |_ _)___) |__ _))-------------------------",
    " ",
  ] .
  forEach(line => { chanMsg(line) });
  chanMsg('')
  chanMsg("                                              (c)ashittylogo")
}

function jsonMsg(nick, msg, printKeys, keyRe=null) {
  if (keyRe === null) keyRe = new RegExp('.*')
  var fmtMsg = []
  for (let key in msg) {
    if ((msg.hasOwnProperty(key)) && ((!isEmptyOrSpaces(msg[key]))) && (key.match(keyRe))) {
      fmtMsg.push(`${key}=${JSON.stringify(msg[key])}`)
    }
  }
  fmtMsg.sort()
  console.log(fmtMsg)
  let i = 0 
  let delCnt = 0
  do {
    if (i > 99) break
    (fmtMsg.length > delCnt) ? delCnt = printKeys : delCnt = fmtMsg.length
    tmp = fmtMsg.splice(0, delCnt).join(',').replace(/([^}]),/g, '$1, ')
    console.log(tmp)
    if (nick) {
      nickMsg(nick, tmp, dhSecret)
      nickMsg(nick, '', dhSecret)
    } else {
      chanMsg(tmp)
      chanMsg('')
    }
    i++
  } while (fmtMsg.length > 0)
}

function fmtJson(msg) {
  let tmp = msg
  tmp = tmp.replace(/[\]\[\]]/g, '')
  tmp = tmp.replace(/[{}]/g, '')
  tmp = tmp.replace(/,([^ ])/g, ',  $1')
  tmp = tmp.replace(/\":/g, '"=')
  return tmp
}

// fix bold/underline/color codes
function controlCodes(msg) {
  let tmp = msg
  tmp = tmp.replace(/\\u0002/g, '\x02')
  tmp = tmp.replace(/\\u0003/g, '\x03')
  tmp = tmp.replace(/\\u000f/g, '\x0F')
  tmp = tmp.replace(/\\u001f/g, '\x1F')
  tmp = tmp.replace(/u0002/g, '\x02')
  tmp = tmp.replace(/u001f/g, '\x1F')
  return tmp
}

// call irc connect and increase ircserver num
ircConnect(iNum, cfg.ircOpts)
if (iNum+1 < Object.keys(cfg.ircOpts.servers).length) {
  iNum++
} else {
  iNum = 0
}

// call watch ftp dir
ftpWatchDir()

// seed dupe db with 1 fake for testing
dupe.push("FAKEASSHIT")

/* test
dupe.push("Testing-1234-GRP")
setTimeout(function() {
  trigGo("Testing-15656")
}, 1000);
*/

// open unix socket, used for channel invite
const SOCKETFILE = '/tmp/shitbot.sock';
if (debug) console.debug('DEBUG: Checking for leftover socket file');
fs.stat(SOCKETFILE, function (err, stats) {
    if (err) {
        if (debug)  console.debug('DEBUG: No leftover socket file found');
        server.listen((SOCKETFILE), () => { 
          if (debug) console.debug(`DEBUG: listen server._pipeName=${server._pipeName}`);
        });
    } else {
      if (debug) console.debug(`DEBUG: Removing leftover socket file: ${SOCKETFILE}`)
      fs.unlink((SOCKETFILE), (err) => {
          if(err) console.error(err)
          server.listen((SOCKETFILE), () => { 
            if (debug) console.debug(`DEBUG: listen server._pipeName=${server._pipeName}`);
          });
      });
    }
    fs.existsSync((SOCKETFILE), (err) => {
      if(err) {
        console.error(err)
      } else {
        fs.chmodSync(SOCKETFILE, '777');
      }
    });
});
const server = net.createServer((socket) => {
  socket.on(('data'), (data) => {
    if (debug) console.debug("DEBUG: data = ", data.toString())
    if (data.toString().match(/^INVITE /)) {
      let nick
      let matchNick = data.toString().replace('\n', '').match(/^INVITE ([^0-9][0-9a-zA-Z_\[\}{}\\`|-]+)$/)
      if (debug) console.log('DEBUG: matchNick = ', matchNick)
      if (matchNick) nick = matchNick[1]
        if (nick) {
          if (debug) console.log(`DEBUG: INVITE nick = ${nick}`)
        client.send('INVITE', nick, cfg.ircOpts.chan.main.name)
      }
    }
  });
  socket.on(('close'), () => {
    if (debug) console.debug('DEBUG: socket server closes')
  });
  //socket.end('bye\n');
}).on('error', (err) => {
  // handle errors here.
  throw err;
});
process.on('exit', () => {
  server.close()
});
