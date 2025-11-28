<?php
/*--------------------------------------------------------------------------*
 *   SHIT:WEB docker mode cmds
 *--------------------------------------------------------------------------*/
$cmds = array(
    'bot_status'      => array("docker_api", "GET", "/containers/json?filters=" . urlencode("{\"name\": [\"bot\"]}")),
    'bot_start'       => array("docker_api", "POST", "/containers/bot/start", null),
    'bot_stop'        => array("docker_api", "POST", "/containers/bot/stop", null),
    'bot_restart'     => array("docker_api", "POST", "/containers/bot/restart", null),
    'bot_kill'        => array("docker_api", "POST", "/containers/bot/kill", null),
    'bot_pid'         => array("docker_api", "GET", "/containers/bot/top", null),
    'bot_log'         => array("docker_api", "GET", "/containers/bot/logs?stdout=true&stderr=true", null),
    'bot_tail'        => array("docker_api", "GET", "/containers/bot/logs?stdout=true&stderr=true&tail=10", null),
    //'bot_tail'     => docker_exec("bot", '["tail", "/workspace/bot.log"]'),
    'cbftp_status'    => array("docker_api", "GET", "/containers/json?filters=" . urlencode("{\"name\": [\"cbftp\"]}")),
    'cbftp_start'     => array("docker_api", "POST", "/containers/cbftp/start", null),
    'cbftp_stop'      => array("docker_api", "POST", "/containers/cbftp/stop", null),
    'cbftp_restart'   => array("docker_api", "POST", "/containers/cbftp/restart", null),
    'cbftp_kill'      => array("docker_api", "POST", "/containers/cbfp/kill", null),
    'cbftp_pid'       => array("docker_api", "GET", "/containers/cbftp/top", null),
    //'cbftp_view'      => array("docker_exec", "cbftp", '["sh", "-c", "pkill -9 gotty; TERM=xterm /cbftp/gotty /usr/bin/screen -A -x >/dev/null 2>&1 &"]'),
    'cbftp_view'      => array("docker_exec", "web", '["sh", "-c", "pkill -9 gotty; TERM=xterm /cbftp/gotty dtach -a /dtach/cbftp.sock 2>&1 &"]'),
    'gotty_pid'       => array("docker_exec", "cbftp", '["pgrep", "gotty"]'),
    'gotty_kill'      => array("docker_exec", "cbftp", '["pkill", "-9", "gotty"]'),
    'glftpd_status'   => array("docker_api", "GET", "/containers/json?filters=" . urlencode("{\"name\": [\"glftpd\"]}")),
    'glftpd_start'    => array("docker_api", "POST", "/containers/glftpd/start", null),
    'glftpd_stop'     => array("docker_api", "POST", "/containers/glftpd/stop", null),
    'glftpd_restart'  => array("docker_api", "POST", "/containers/glftpd/restart", null),
    'glftpd_kill'     => array("docker_api", "POST", "/containers/glftpd/kill", null),
    'glftpd_pid'      => array("docker_api", "GET", "/containers/glftpd/top", null),
    'ip_add'          => "/glftpd/bin/xl-ipchanger.sh ADDIP",
    'ip_del'          => "/glftpd/bin/xl-ipchanger.sh DELIP",
    'ip_list'         => "/glftpd/bin/xl-ipchanger.sh LISTIP",
    'ip_adds'         => "/glftpd/bin/xl-ipchanger.sh IPADDS",
    //'ftpd'            => array("test_ftp", $cfg['ftpd_host'], $cfg['ftpd_port']),
    //'irc'             => array("test_irc", $cfg['irc_host'], $cfg['irc_port']),
);
?>