<?php
/*--------------------------------------------------------------------------*
 *   SHIT:WEB standard mode cmds
 *--------------------------------------------------------------------------*/
$cmds = array(
    'bot_status'      => 'grep . /proc/$(pgrep -u shit -f [nN]ode.*bot.js|tail -1)/status',
    'bot_start'       => '( cd /shit/bot && sudo -u shit /usr/bin/npm start )',
    'bot_stop'        => '( cd /shit/bot && sudo -u shit /usr/bin/npm stop )',
    'bot_restart'     => '( cd /shit/bot && sudo -u shit /usr/bin/npm restart )',
    'bot_pid'         => $pgrep_userid . '-f [nN]ode.*bot.js',
    'bot_kill'        => $pkill_userid . '-f node.*bot.js; ' . $pkill_userid . '-f [sS][cC][rR][eE][eE][nN].*bot.js',
    'bot_log'         => 'tail -n 5000' . " " . $cfg['bot_log'],
    'bot_tail'        => 'tail -n 15' . " " . $cfg['bot_log'],
    'cbftp_status'    => 'ls -la /tmp/cbftp.sock',    
    'cbftp_start'     => '/usr/bin/dtach -n /tmp/cbftp.sock /shit/cbftp/cbftp',
    'cbftp_pid'       => $pgrep_userid . '-f [cC]bftp',
    'cbftp_kill'      => $pkill_userid . 'cbftp.sh;' . $pkill_userid . $match_mp,
    'cbftp_view'      => $pkill_userid . 'gotty; TERM=xterm /usr/bin/sudo -u' . " " . $cfg['user'] . " " . $gotty_mp,
    'gotty_pid'       => $pgrep_userid . 'gotty',
    'gotty_kill'      => $pkill_userid . 'gotty',
    'glftpd_status'   => '/bin/systemctl status glftpd.socket',
    'glftpd_start'    => 'sudo /bin/systemctl start glftpd.socket',
    'glftpd_stop'     => 'sudo /bin/systemctl stop glftpd.socket',
    'glftpd_restart'  => 'sudo /bin/systemctl restart glftpd.socket',
    'glftpd_pid'      => $pgrep_userid . '-f glftpd',
    'glftpd_kill'     => $pkill_userid . '-f glftpd',
    'ip_add'          => $cfg['xl_ip'] . " " . 'ADDIP',
    'ip_del'          => $cfg['xl_ip'] . " " . 'DELIP',
    'ip_list'         => $cfg['xl_ip'] . " " . 'LISTIP',
    'ip_adds'         => $cfg['xl_ip'] . " " . 'IPADDS',
);

/*--------------------------------------------------------------------------*
 * SYSTEMD:
 *   'bot_status'      => $sudo_systemd . 'status bot',
 *   'bot_start'       => $sudo_systemd . 'start bot',
 *   'bot_stop'        => $sudo_systemd . 'stop bot',
 *   'bot_restart'     => $sudo_systemd . 'restart bot',
 *   'cbftp_status'    => $sudo_systemd . 'status cbftp',    
 *   'cbftp_start'     => $sudo_systemd . 'start cbftp',
 *   'cbftp_stop'      => $sudo_systemd . 'stop cbftp',
 *   'cbftp_restart'   => $sudo_systemd . 'restart cbftp',
 * OLD/UNUNUSED:
 *   'start_bot'     => '( cd $bot_dir/bot; /usr/bin/node bot.js >/dev/null 2>&1 )'
 *   'start_bot'     => '( cd $bot_dir/bot; sudo -u shit /usr/bin/npm start )',
 *   'bot_start'     => 'sudo /usr/bin/systemd-run --uid=1003 --gid=1003 -p WorkingDirectory=$bot_dir/bot --collect /usr/bin/node bot.js',
 *   'bot_stop'      => '( cd $bot_dir/bot; sudo -u shit /usr/bin/npm stop )',
 *   'bot_log'       => '/usr/bin/sudo /bin/journalctl _UID=1003 --no-pager',
 *   'cbftp_start'   => 'TERM=xterm sudo -u shit $bot_dir/go/bin/gotty /usr/bin/screen -S cbftp $bot_dir/cbftp.sh >/dev/null 2>&1 &',
 *   'cbftp_start'   => 'TERM=xterm sudo -u shit /usr/bin/screen -dmS cbftp $bot_dir/cbftp.sh >/dev/null 2>&1 &',
 *   'cbftp_start'   => 'sudo /usr/bin/systemd-run --uid=1003 --gid=1003 --collect /usr/bin/screen -dmS cbftp $bot_dir/cbftp.sh &',
 *   $cmds['bot_restart'] = $cmds['bot_stop'] . '; ' . $`cmds`['bot_start'];
 *   $cmds['bot_tail'] = $cmds['bot_log'] . ' -n 15';
 *-------------------------------------------------------------------------*/
?>
