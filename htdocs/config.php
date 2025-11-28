<?php
  /*--------------------------------------------------------------------------*
   *   SHIT:BOT - CONFIGURATION (WEB)                                         *
   *--------------------------------------------------------------------------*/

  // choose 'standard' or 'docker' mode
  return $cfg = array(
    //'mode'           => 'docker', 
    'user'           => 'shit',
    'term_mp'        => 'dtach',
    'bot_log'        => '/shit/bot/bot.log',
    'xl_ip'          => '/shit/bot/xl-ipchanger.sh',
    'docker_api'     => "http://localhost/v1.39",
    'ftpd_host'      => "1.2.3.4",
    'ftpd_port'      => "9988",
    'irc_host'       => "localhost",
    'irc_port'       => "6697",
    'debug'          => 0
  );

  /*--------------------------------------------------------------------------*
   *  END OF CONFIG                                                           *
   *--------------------------------------------------------------------------*/
?>
