const cbApi = require('./cbapi.js')
const Mp3Releaser = require('./mp3releaser.js');

/*----------------------------------------------------------------------------*
 *   CONFIGURATION                                                            *
 *----------------------------------------------------------------------------*/

const group = "MyGROUP"                         // used below + 1st bot msg :)
const groupPath = "/glftpd/site"                // or use e.g. "/glftpd/site/ + group
const ver = "1.666 (v2021-02-13)"               // 'semver is stupid' :)
const watchDir = groupPath                      // used for watch dir (chokidar)
const source = 'CABLE|DAB|SAT'                  // used in artist-title regex (seperator: '|')
const catchGrps = `${group}|1GRP|GRP2`          // groups to catch

/* mp3releaser settings */
Mp3Releaser.append = '-MyGROUP'                 // rlsdir: -group
Mp3Releaser.source = 'Radio';                   // nfo: source
Mp3Releaser.comment = 'No Comment';             // nfo: comment
Mp3Releaser.notes = 'NONE'                      // nfo: rls notes

var ircAnnouncePre = 1                          // announce pre's in main chan
var ircAnnounceNew = 1                          // announce newdirs in main chan
var enableFixMp3 = 1                            // fix lameinfo and music crc
var enableLameCheck = 1                         // always check lame/vbr header
var enableSpread = 1                            // auto spread release
var enablePre = 1                               // auto pre release

/* irc options */
const ircOpts = {
  servers: {
    /* example, linknet
    0: { host: "irc.de.link-net.org", port: 6697, pass: "" },
    1: { host: "irc.de2.link-net.org", port: 6697, pass: "" },
    2: { host: "irc.link-net.nl", port: 6697, pass: "" },
    3: { host: "irc.link-net.be", port: 6697, pass: "" },
    4: { host: "irc.link-net.fi", port: 6697, pass: "" },
    5: { host: "irc.link-net.no", port: 6697, pass: "" },
    6: { host: "linknet.sh.cvut.sz",  port: 6697, pass: "" },   */
    // bouncer (znc)
    0: { host: "1.2.3.4", port: 6697, pass: 'Sc4T_MaN' }
  },
  nick: "sh1t", user: "p00p", name: "crap",
  // channels main, pre and catch (comment to disable)
  chan: {
    // main - uses fishi (cbc)
    main: {
      "name": "#grpchan",
      "key": "somek3y",
      "blow": "cbc:s0me-blowk3y"
    }
    // example - pre chan
    // pre: {
    //   "name": "#preeechan"
    //   "blow": "otherk3y",
    // }
    // example - catch chan
    // catch: {
    //   "name": "#catchme"
    // }
  }  
}
const ircOwner = "^(owner1|nick2)$"             // allow bot restart in pm

/* cbftp settings */
var cbEnable = 1
cbApi.cbOptions.hostname = 'cbftp'              // rest api
cbApi.cbOptions.port = 55443                    // port
cbApi.cbOptions.password = 'N0dejs=Peop'        // password
var cbFtpUser = "testuser"                      // ftp login
var cbFtpPass = "Test_123"                      // ftp password
var cbFtpDir = "/groups/" + group               // predir

/*----------------------------------------------------------------------------*
 *  END OF CONFIG                                                             *
 *----------------------------------------------------------------------------*/

module.exports = {
  group, groupPath, ver, watchDir, source, catchGrps,
  ircAnnouncePre, ircAnnounceNew,
  enableFixMp3, enableLameCheck, enableSpread, enablePre,
  ircOpts, ircOwner, cbEnable, cbFtpUser, cbFtpPass, cbFtpDir
}
module.exports.cbApi
