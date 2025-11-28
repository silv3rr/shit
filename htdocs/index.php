<?php
/*--------------------------------------------------------------------------*
 *   SHIT:WEB webinterface -- "Don't worry, be crappy"                      *
 *--------------------------------------------------------------------------*/

ini_set('display_startup_errors', 1);
ini_set('display_errors', 1);
error_reporting(-1);
if (!file_exists("config.php")) {
  header("Location: " . "error.html");
}
require('config.php');
if (!isset($cfg['mode'])) {
  $cfg['mode'] = "standard";
}

if ($cfg['debug'] > 1) {
  print("DEBUG: \$_POST = ");
  print_r($_POST);
}

if (!isset($_SESSION)) {
  session_start();
}

// include array with cmds for mode
if ($cfg['mode'] == "docker") {
  include 'docker.php';
} else {
  // concat strings for common cmds
  $sudo_systemd = 'XDG_RUNTIME_DIR=/run/user/' . '$(id -u ' . $cfg['user'] . ')' . "/usr/bin/sudo -u" . " " . $cfg['user'] . " " . '/bin/systemctl --user' . " ";
  $pgrep_userid = '/usr/bin/pgrep -a -u' . " " . $cfg['user'] . " ";
  $pkill_userid = '/usr/bin/sudo -u' . " " . $cfg['user'] . " " . '/usr/bin/pkill -9' . " ";
  // terminal multiplexer
  if ($cfg['term_mp'] == 'screen') {
      $gotty_mp = '/shit/cbftp/gotty /usr/bin/screen -RR -S cbftp >/dev/null 2>&1 &';
      $match_mp = '-f [sS][cC][rR][eE][eE][nN].*cbftp';
  } elseif ($cfg['term_mp'] == 'dtach') {
      $gotty_mp  = '/shit/cbftp/gotty --config /shit/cbftp/.gotty /usr/bin/dtach -a /tmp/cbftp.sock >/dev/null 2>&1 &';
      $match_mp = '-f dtach.*cbftp';
  }
  include 'standard.php';
}
if ($cfg['debug']) {
  print('<span style="color:blue"><small>DEBUG: <b>' . $cfg['mode'] . '</b> mode (' . __FILE__ . ')</small></span><br>' . PHP_EOL);
}

if ($_SERVER['REQUEST_METHOD'] == 'POST') {
  $_SESSION['postData'] = array_map('htmlspecialchars', $_POST);
  $_SESSION['postData'] = array_map('trim', $_POST);
  if (array_sum(array_map('is_string', $_SESSION['postData'])) == count($_SESSION['postData'])) {
    unset($_POST);
    header("Location: " . $_SERVER['PHP_SELF']);
    exit();
  } else {
    unset($_SESSION['postData']);
  }
}

if (($cfg['debug'] > 1) && (isset($_SESSION['postData']))) {
    print("<br>DEBUG: postData = " . PHP_EOL);
    print_r($_SESSION['postData']);
    print("<br>" . PHP_EOL);
}

function test_ftp($host, $port) {
  if (@ftp_connect($host, $port, 3)) return 0;
  return 1;
}
function test_irc($host, $port) {
  if ($fp = @fsockopen($host, $port, $errno, $errstr, 3)) return 0;
  return 1;
}

// call docker_api with curl
function docker_api ($method, $endpoint, $postfields=null) {
  global $cfg;
  $url = $cfg['docker_api'] . $endpoint;
  //$method = "GET";
  //$url = "http://localhost/v1.39/containers/json";
  if ($cfg['debug'] > 2) print( "DEBUG: docker_api url=" . $url  . " postfields=" . $postfields . PHP_EOL);
  $ch = curl_init();
  curl_setopt($ch, CURLOPT_URL, $url);
  curl_setopt($ch, CURLOPT_UNIX_SOCKET_PATH, "/var/run/docker.sock");
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
  curl_setopt($ch, CURLOPT_VERBOSE, true);
  if ($method == "POST") {
    curl_setopt($ch, CURLOPT_HTTPHEADER, array('Content-Type:application/json'));
    curl_setopt($ch, CURLOPT_POST, 1);   
    if (!is_null($postfields)) {
        if ($cfg['debug'] > 2) print("DEBUG: postfields=" . $postfields . PHP_EOL);
      curl_setopt($ch, CURLOPT_POSTFIELDS, $postfields);
    }
  }
  $data = curl_exec($ch);
  curl_close ($ch);
  return $data;
}

/* get container id (unused: just use 'name')
function docker_id($name) {
  $params = "?all=true&filters=" . urlencode("{\"name\": [\"$name\"]}");
  $json = (docker_api("GET", "/containers/json" . "$params"));
  return $json[0]->Id;
} 
*/

// DOCKER EXAMPLES/TESTS: TOP|EXEC|ATTACH|INSPECT_ALL

$DOCKER_TEST = "";
if (!empty($DOCKER_TEST)) {
  if ($DOCKER_TEST == 'TOP') {
    $top = docker_api("GET", "/containers/bot/top", null);
    foreach ($top as $key => $value) {
      print($key . " " . $value . PHP_EOL);
    }
    foreach ($top->Processes as $em) {
      print("TEST: " . implode($em, ' ') . PHP_EOL);
    }
  }
  if ($DOCKER_TEST == 'EXEC') {
    // "AttachStderr": true,  "Privileged": true
    $exec = docker_api("POST", "/containers/bot/exec", '{"AttachStdout": true,"Tty": false, "Cmd": ["tail", "/workspace/bot.log"]}');
    docker_api("POST", "/exec/" . $exec->Id . "/start", '{ "Detach": false, "Tty": false },');
    $json = (docker_api("GET", "/exec/" . $exec->Id . "/json", null));
  }
  if ($DOCKER_TEST == 'ATTACH') {
    var_dump(docker_api("POST", "/containers/cbftp/start", null));
    // websocket:
    $exec = docker_api("POST", "/containers/cbftp/attachws?stream=1&stdout=1&stderr=1", null);
    // or, without websockets: "/containers/cbftp/attach?stream=1&stdout=1&stderr=1"
  }
  if ($DOCKER_TEST == 'INSPECT_ALL') {
    global $cfg;
    $json = (docker_api("GET", "/containers/json", null));
    print_r('<pre class="out">TEST: \$json = ' . PHP_EOL);
    print_r($json);
    print("<br>" . PHP_EOL);
    $json = json_decode($json. true);
    if (json_last_error() === 0) {
      foreach ($json as $em) {
        print("TEST: name=" .  $em->Names[0] . " id=" . $em->Id . PHP_EOL);
        print("TEST: top" . PHP_EOL);
        //foreach ($top->Processes as $line) {
        //  print("INFO: " . implode($line, ' ') . PHP_EOL);
        //}
        $top = docker_api("GET", "/containers/" . $em->Id . "/top", null);
        print_r($top);
        print("TEST: logs" . PHP_EOL);
        $logs = docker_api("GET", "/containers/" .  $em->Id .   "/logs" . "?stdout=true&stderr=true", null);
        print_r($logs);
        print(PHP_EOL);  
      }
    }
    exit();
  }
}

// create docker exec instance and start it (same as cli 'docker exec')
function docker_exec($id, $cmd) {
  global $cfg;
  if ($cfg['debug'] > 2) print("DEBUG: id=" . $id . " cmd=" . $cmd . PHP_EOL);
  $exec = docker_api("POST", "/containers/$id/exec", '{"AttachStdout": true, "AttachStdout": true, "Tty": false, "Cmd": ' . $cmd . '}');
  if (preg_match('/No such container/', $exec)) {
    return 1;
  }
  $json = json_decode($exec);
  if (json_last_error() === 0) {
    $start = docker_api("POST", "/exec/" . $json->Id . "/start", '{ "Detach": false, "Tty": false }');
    $json = json_decode($start);
    if (json_last_error() === 0) {
      return $json;
    } else {
      return $start;
    }
  }
}

// main func to run cmds using docker api
function docker_run($verbose, $cmds, $act) {
  global $cfg;
  // glftpd xl-ipchanger
  if ((preg_match('/ip_(list|adds|add|del)/', $act))) {
    $verbose = 2;
    $tmp = explode(" ", $cmds[$act]);
    $cmds[$act] = '["' . implode('","', $tmp) . '"]';
    $cmds[$act] = explode(" ", "docker_exec glftpd $cmds[$act]");
  }
  if (preg_grep('/(\["pgrep", "gotty"\])/', $cmds[$act])) {
    $verbose = 0;
  }
  if ($cfg['debug'] > 2) { 
    print("DEBUG: run \$verbose=" . $verbose . " \$cmds[\$act] = " . PHP_EOL);
    print_r($cmds[$act]);
    print("<br>" . PHP_EOL);
  }
  if ((isset($cmds[$act])) && (!empty($cmds[$act]))) {
    // old: $result = call_user_func_array($cmds[$act][0], array_slice($cmds["$act"], 1, count($cmds["$act"])));
    $result = call_user_func_array(array_shift($cmds[$act]), $cmds["$act"]);
    // hide gl passwd
    if ((isset($_SESSION['postData']['ip_pass'])) && (!empty($_SESSION['postData']['ip_pass']))) {
      $cmds[$act] = preg_replace('/' . $_SESSION['postData']['ip_pass'] . '/', "*****", $cmds[$act]);
    }
    // status
    if ($verbose === 0) {
        //if ((preg_match('/^(bot_pid|ftpd|irc|gotty_pid)$/', $act))) {
        if ((preg_match('/^(bot_pid|gotty_pid)$/', $act))) {
        if (!is_null($result) && (!preg_match('/is not running/', $result))) { 
          return 0;
        } else {
          return 1;
        }
      }
    } elseif ($verbose > 0) {
      $json = json_decode($result, true);
      if (json_last_error() !== 0) {
        print_r($result);
      } else {
        // TODO: format list container, procs etc:
        foreach ($json as $em) {
          if (isset($em['State'])) $_state = $em['State'];
          if (isset($em['Status'])) $_status = $em['Status'];
        }
        /*
        if (array_keys((array)$json)[0] === 'Processes') {
          foreach ($json as $em) {
            //if (isset($em['Processes'])) $_procs= $em['Processes'][0];
            //$_procs = implode($em[0], ' ');
            print(gettype($em));
            print(implode($em[0], ' '));
          }
        }
        */
        if (isset($json['Processes'])) $_procs = json_encode($json['Processes']);
        if ((isset($_state)) && (isset($_status))) {
          //print("<br>State: " . $json[0]->State . ", Status: " . $json[0]->Status . "<br>" . PHP_EOL);
          print("<br>State: " . $_state . ", Status: " . $_status . "<br>" . PHP_EOL);
        } elseif (isset($_procs)) {
          print("<br>Processes: " . $_procs . "<br>" . PHP_EOL);
        } else {
          print json_encode($json, JSON_PRETTY_PRINT);
        }
      }      
      /* TODO: print k-v
        $key = array_keys((array)$result)[0];
        // /print("DEBUG: result=" . $result . " key=" . $key. PHP_EOL);
        if ($key) {
          foreach ($result->$key as $em) {
            print("INFO: " . implode($em, ' ') . PHP_EOL);
          }
        } else {
          print $result;
        }
      }
      */
    }
  }
}

// RUN TEST:
// run(0, $cmds, "bot_status");
// run(false, $cmds, "test");
// run(true, $cmds, "bot_tail");
// print('</pre>' . PHP_EOL);

// main func to run local cmds 
function local_run($verbose, $cmds, $act) {
  global $cfg;
  if ((isset($cmds[$act])) && (!empty($cmds[$act]))) {
    exec($cmds[$act], $output, $ret);
    //debug: $output = shell_exec($cmds[$act]); $ret = 0;
    if ((isset($_SESSION['postData']['ip_pass'])) && (!empty($_SESSION['postData']['ip_pass']))) {
      $cmds[$act] = preg_replace('/' . $_SESSION['postData']['ip_pass'] . '/', "*****", $cmds[$act]);
    }
    if ($verbose >= 2) {
      print('INFO: running "' . $cmds[$act] . '"' . PHP_EOL);
      if (!$ret) {
        print('INFO: cmd executed successfully' . PHP_EOL);
      } else {
        print('WARN: empty output or error' . PHP_EOL);
      }
    }
    if (($verbose >= 1) && ($output)) {
      if ($cfg['debug'] > 2) var_dump($output);
      $prefix = 1;
      if ((preg_match('/_(log|status|tail)/', $act)) || (preg_grep('/(Warning:|ERROR:)/i', $output))) {
        $prefix = 0;
      }
      foreach($output as $line) {
        print ((($prefix == 1) ? "$line" : $line ) . PHP_EOL);
      }
    }
    return $ret;
  } else {
    if ($verbose) {
      print('ERROR: invalid command' . PHP_EOL);
    }
    return 1;
  }
}

// run 'wrapper'
function run() {
  global $cfg;
  $args = func_get_args();
  if($args[2] === 'irc') {
    return test_irc($cfg['irc_host'], $cfg['irc_port']);
  }
  if($args[2] === 'ftpd') {
    return test_ftp($cfg['ftpd_host'], $cfg['ftpd_port']);
  }
  if ($cfg['mode'] == "docker") {
    $ret = call_user_func_array('docker_run', $args);
  } else {
    $ret = call_user_func_array('local_run', $args);
  }
  return $ret;
}

// show status bar
function status($cmds){
  print('<div id="ts">' . @date('Y-m-d H:i:s') . '</div><hr class="vsep">' . PHP_EOL); 
  foreach (['bot_pid', 'irc', 'ftpd', 'cbftp_pid'] as $act) {
    if (run(0, $cmds, $act) === 0) {
      print('  <div id="up">' . str_replace('_pid', '', $act) . ':<b>UP</b></div>' . PHP_EOL);
    } else {
      print('  <div id="down">' . str_replace('_pid', '', $act) . ':<b>DOWN</b></div>' . PHP_EOL);
    }
  }
  if (run(0, $cmds, 'gotty_pid') === 1) {
    print('  <div id="running">gotty:<b>RUNNING</b></div>' . PHP_EOL);
  }
  print ('  <hr class="vsep"><div id="refresh"><a href="' . $_SERVER['PHP_SELF'] . '"><i class="fas fa-sync"></i>REFRESH</a></div>' . PHP_EOL);
  return false;
}

/* func tty: show gotty link (unused)
function tty($cmds) {
  if ((isset($_SESSION['postData']['cbCmd'])) && (!empty($_SESSION['postData']['cbCmd']))) {
    if ($_SESSION['postData']['cbCmd'] == 'cbftp_view') {
      run(0, $cmds, 'cbftp_view');
      unset($_SESSION['postData']['cbCmd']);
      // OLD: print('<div class="cbview">Open Cbftp window in Chrome: <a href="/tty"><button>GoTTY Terminal</a></button></div>' . PHP_EOL);
      //      or iframe: <a href="/tty" _target="iFrame"><button>GoTTY Terminal</a></button>
      //header("Location: " . $_SERVER['PHP_SELF']);
      print('<div class="cbview">Open Cbftp window in Chrome: ' . PHP_EOL);
      print('<button name="botCmd" type="button" data-toggle="modal" data-target="#bsModal" data-frame="@gotty">' . PHP_EOL);
      print('GoTTY Terminal</button></div>' . PHP_EOL);
    }
  }
} */

function bot_invite($nick) {
  $sockfile = '/tmp/shitbot.sock' ;
  @$sock = stream_socket_client('unix://' . $sockfile, $errno, $errstr);
  if ($sock) {
    fwrite($sock, 'INVITE ' . $nick);
    //echo fread($sock, 4096)."\n";
    fclose($sock);
  }
}

// view bot logs in new window
if ((isset($_SESSION['postData']['botCmd'])) && (!empty($_SESSION['postData']['botCmd']))) {
  if ($_SESSION['postData']['botCmd'] == 'bot_log') {
    unset($_SESSION['postData']['botCmd']);
    //header("Content-Type: text/plain");
    $self = $_SERVER['PHP_SELF'];
    include 'tmpl_log.html';
    run(1, $cmds, 'bot_log');
    print('</pre></body></html>' . PHP_EOL);
    exit();
  }
}

// display index html template
include 'tmpl_idx.html';

if ((isset($_SESSION['postData'])) && ((!empty(preg_grep('/.*Cmd$/', array_keys($_SESSION['postData'])))))) {
  print('<h6 class="out">Output:</h6>' . PHP_EOL);
}
print('<pre class="out">');
// check for cbftp, bot, gl and ip form button posts
if ((isset($_SESSION['postData']['cbCmd'])) && (!empty($_SESSION['postData']['cbCmd']))) {
  if ($_SESSION['postData']['cbCmd'] == 'cbftp_view') {
    run(2, $cmds, 'cbftp_view');
    print('<pre class="out" id="wait" style="color: red;">LOADING, PLEASE WAIT...</pre>' . PHP_EOL);
    print('<script>ttyModal();</script>' . PHP_EOL);
  } else if (($_SESSION['postData']['cbCmd'] == 'cbftp_kill') || ($_SESSION['postData']['cbCmd'] == 'gotty_kill')) {
    run(0, $cmds, $_SESSION['postData']['cbCmd']);
    unset($_SESSION['postData']['cbCmd']);
    //header("Location: " . $_SERVER['PHP_SELF']);
    exit();
    //status($cmds);
  } else {
    run(2, $cmds, $_SESSION['postData']['cbCmd']);
  }
  unset($_SESSION['postData']['cbCmd']);
}
if ((isset($_SESSION['postData']['botCmd'])) && (!empty($_SESSION['postData']['botCmd']))) {
  //if ($_SESSION['postData']['botCmd'] == 'bot_pid') {
  if (!empty($_SESSION['postData']['irc_nick'])) {
    echo("INVITE ". $_SESSION['postData']['irc_nick']);
    bot_invite($_SESSION['postData']['irc_nick']);
    unset($_SESSION['postData']['irc_nick']);
    exit();
  }
  //  run(2, $cmds, ($_SESSION['postData']['botCmd']));
  //} else {
  //  run(1, $cmds, ($_SESSION['postData']['botCmd']));
  //}
  run(2, $cmds, ($_SESSION['postData']['botCmd']));
  unset($_SESSION['postData']['botCmd']);
}
if ((isset($_SESSION['postData']['glCmd'])) && (!empty($_SESSION['postData']['glCmd']))) {
  run(2, $cmds, ($_SESSION['postData']['glCmd']));
  unset($_SESSION['postData']['glCmd']);
}
if ((isset($_SESSION['postData']['ipCmd'])) && (!empty($_SESSION['postData']['ipCmd']))) {
  foreach (['ip_user', 'ip_pass', 'ip_addr'] as $_input) {
    $_act = $_SESSION['postData']['ipCmd'];
    if (!empty($_SESSION['postData'][$_input])) {
      $cmds[$_act] .= ' ' . $_SESSION['postData'][$_input];
    }
  }
  run(2, $cmds, $_act);
  foreach (['ip_user', 'ip_pass', 'ip_addr'] as $_input) {
    unset($_SESSION['postData'][$_input]);
  }
  unset($_SESSION['postData']['ipCmd']);
}

// load javascript: jquery, bootstrap, custom modal, collapse buttons
$botpath = "bot";
$webpath = "web";
if ($cfg['mode'] == "docker") {
  $botpath = "/";
  $webpath = "/";
}
echo <<<_EOF_
</pre>
<!--
<script src="jquery-3.5.1.slim.min.js"></script>
<script src="bootstrap-4.5.3-dist/js/bootstrap.bundle.min.js"></script>
-->
<script>
  $('#bsModal').on('show.bs.modal', function (event) {
    //console.log('DEBUG: show.bs.modal (before)');
    var button = $(event.relatedTarget);
    var showframe = button.data('showframe');
    //console.log('DEBUG: showframe =', showframe);
    var modal = $(this);
    modal.find('.modal-body .p').hide();
    if (showframe === '@botconfig') {
      modal.find('.modal-title').text('Bot configuration:');
      modal.find('iframe').attr("src", "/tinyfilemanager/tinyfilemanager.php?p=${botpath}&view=config.js");
    }
    else if (showframe === '@webconfig') {
      modal.find('.modal-title').text('Web configuration:');
      modal.find('iframe').attr("src", "/tinyfilemanager/tinyfilemanager.php?p=${webpath}&view=config.php");
    }
    else if (showframe === '@filemanager') {
      modal.find('.modal-title').hide();
      modal.find('iframe').attr("src", "/tinyfilemanager/tinyfilemanager.php");
    } else {
      modal.find('iframe').attr("src", "");
      modal.find('iframe').attr("style", "display:none");
      modal.find('.modal-title').text('ERROR');
      modal.find('.modal-body').text('Hmm.. frame not found?!');
    }
  });
  $('#bsModal').on('shown.bs.modal', function (event) {
    //console.log('DEBUG: shown.bs.modal (after)');
    var modal = $(this);
    if (modal.find('.modal-title').text() === 'ERROR') {
      $('#bsModal').modal('hide');
      $('.modal-backdrop').hide();
    }
  });
  $('.multi-collapse').on('shown.bs.collapse', function (event) {
    //console.log('DEBUG: shown.bs.collapse');
    var id = String("#" + event.target.id);
    $(id + "Right").attr("style", "display:none");
    $(id + "Up").attr("style", "display:inline-block");
  });
  $('.multi-collapse').on('hidden.bs.collapse', function (event) {
    var id = String("#" + event.target.id);
    $(id + "Up").attr("style", "display:none");
    $(id + "Right").attr("style", "display:inline-block");
  });
  $('#colShow').on('click', function() {
    $('.multi-collapse').collapse('show');
  });
  $('#colHide').on('click', function () {
    $('.multi-collapse').collapse('hide');
  });
</script>

</body>
</html>
_EOF_;

/*** BS EXAMPLE **************************************************************
$('#exampleModal').on('show.bs.modal', function (event) {
  var button = $(event.relatedTarget) // Button that triggered the modal
  var recipient = button.data('whatever') // Extract info from data-* attributes
  // If necessary, you could initiate an AJAX request here (and then do the updating in a callback).
  // Update the modal's content. We'll use jQuery here, but you could use a data binding library of other methods instead.
  var modal = $(this)
  modal.find('.modal-title').text('New message to ' + recipient)
  modal.find('.modal-body input').val(recipient)
})
******************************************************************************/

/*** JQUERY EXAMPLES **********************************************************
$('#bsModal').hide();
$('.modal-backdrop').hide();
$('#cbftp_view').click(function(){ }
$(document).ready(function(){ }
******************************************************************************/

/*** OLD: html tmpl dropdown menu for bot *************************************
    <select id="botCmd" name="botCmd">
      <option value="bot_pid">Show PID</option>
      <option value="bot_tail">Tail log</option>
      <option value="bot_start " disabled>Start Service</option>
      <option value="bot_stop" disabled>Stop Service</option>
      <option value="bot_restart" disabled>Restart Service</option>
      <option value="bot_kill">Kill/Restart</option>
    </select>
    <input class="botSub" type="submit" value="Go">
******************************************************************************/

?>
