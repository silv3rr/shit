const cbApi = require('./cbapi.js')
const Mp3Releaser = require('./mp3releaser.js');

/*----------------------------------------------------------------------------*
 *   SHIT:BOT - CONFIGURATION                                                 *
 *----------------------------------------------------------------------------*/

//const group = "MyGROUP"                 // set group, used in options below
const group = "GRP"
const groupPath = `/home/shit/jail/glftpd/site/${group}`

/* group options */
const grpOpts = {
   // group/predir path: use e.g. `$/glftpd/site/${group}` or "/home/dir/pre"
   watchDir:    `${groupPath}`,             // used for watch dir (chokidar)
   source:      'CABLE|DAB|SAT',            // used in artist-title regex (seperator: '|')
   catchGroups: `${group}|1KING|OMA|PTC|HSALiVE|HB|TWCLiVE|1REAL`,   // groups to catch
   botUser:     'shit',                     // os user running the bot
   botGroup:    'shit',                     // os group running the bot
}

/* irc options */
const ircOpts = {
  servers: {
    // bouncer (znc)
    0: { host: "1.2.3.4", port: 6697, pass: 'Sc4T_MaN' }
  },
  nick: "sh1t", user: "p00p", name: "crap",
  // main channel, uses fish (cbc)
  chan: {
    main: { "name": "#grpsexxx", "key": "somek3y", "blow": "cbc:s0me-blowk3y" }
  },
  fishMsgLen: 270,                            // max irc message length (default: 305)
  //const ircOwner = "^(owner1|nick2)$"       // allowed to restart bot in pm
  owner:   "^(urmon|urdad)$"
}

/* EXAMPLE: linknet servers (uncomment to enable)
 * ircOpts.servers = {
 *  0: { host: "irc.de.link-net.org", port: 6697, pass: "" },
 *  1: { host: "irc.de2.link-net.org", port: 6697, pass: "" },
 *  2: { host: "irc.link-net.nl", port: 6697, pass: "" },
 *  3: { host: "irc.link-net.be", port: 6697, pass: "" },
 *  4: { host: "irc.link-net.fi", port: 6697, pass: "" },
 *  5: { host: "irc.link-net.no", port: 6697, pass: "" },
 *  6: { host: "linknet.sh.cvut.sz",  port: 6697, pass: "" },
 * }
 */

/* EXAMPLE: optional pre/catch chans  (uncomment to enable)
 * ircOpts.chan.pre = { "name": "#preeechan", "blow": "otherk3y" }
 * ircOpts.chan.catch = { "name": "#catchme" }
 */

var setOpts = {
  ircAnnouncePre: 1,                          // announce pre's in main chan
  ircAnnounceNew: 1,                          // announce newdirs in main chan
  enableTag: 0,                               // set id3 tags and create nfo
  enableDupe: 1,                              // check internal dupe on artist*title
  enableFixMp3: 0,                            // fix lameinfo and music crc
  enableLameCheck: 0,                         // always check lame/vbr header
  enableSpread: 1,                            // auto spread release
  enablePre: 1,                               // auto pre release
  verbose: 1,                                 // show more info in main irc chan msgs
  localFtpSrc: 0,                             // use local ftp as release source
}

/* mp3releaser settings */
Mp3Releaser.append = `-${group}`;               // rlsdir: append '-group'
Mp3Releaser.source = 'Radio';                   // nfo: set source
Mp3Releaser.comment = 'No Comment';             // nfo: set comment
Mp3Releaser.notes = 'NONE'                      // nfo: rls notes

/* cbApi settings  */
//cbApi.cbOptions.hostname = 'cbftp'             // rest api endpoint
cbApi.cbOptions.hostname = 'localhost'          // rest api endpoint
cbApi.cbOptions.port = 55443                    // rest api port
cbApi.cbOptions.password = 'N0dejs=Poop'        // rest api password

/* Cbftp settings */
var cbOpts = {
  enable: 1,
  ftpLocal: "LOCAL",                          // local group ftp 'dump' site name
  ftpUser: "poop",                            // default ftp login
  ftpPass: "eat_P00p",                        // default ftp password
  ftpDir: `/groups/${group}`,                 // default predir
  preCmd: 'mp3',                              // default pre cmd section
  speedFile: "512MB.bin",                     // speedtest file
  pollInt: 1000,                              // job poll interval (milisec)
  pollMax: 30                                 // job poll max checks
}

/*----------------------------------------------------------------------------*
 *  END OF CONFIG                                                             *
 *----------------------------------------------------------------------------*/

module.exports.group = group;
module.exports.groupPath = groupPath;
module.exports.grpOpts = grpOpts;
module.exports.ircOpts = ircOpts;
module.exports.setOpts = setOpts;
module.exports.cbOpts = cbOpts;
module.exports.cbApi

//fuqscenelol/wutabunchofphags;x

