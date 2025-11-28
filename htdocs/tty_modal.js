function ttyModal() {
    setTimeout(function(){
      $('#bsModalLabel').text('GoTTY Terminal');
      $('#bsModalFrame').attr("src", '/tty/');
    }, 2500);
    $('iframe').hide();
    $('#bsModalLabel').text('Loading...')
    //$('#bsModalFrame').css({'background-color':'lightgray', "background-image":"linear-gradient(to right, lightgray , gray"})
    $('.modal-body p').html('<div class="spinner-border text-secondary" role="status">');
    $('.modal-body p').append('&nbsp;&nbsp;Terminal is being started, please wait...<br/><br/>');
    $('.modal-body p').append('If loading fails wait 10 seconds, then click the "View TTY" button again.<br/>');
    $('.modal-body p').append('Still nothing? Try "Stop Viewing" first.<br/><br/><br/>');
    //$('.modal-body p').append('Remember this works <b>ONLY</b> in Chrome browsers<br/><br/>');
    $('#bsModal').modal('show');
    setTimeout(function(){
      document.getElementById('bsModalFrame').contentWindow.location.reload();
      //console.log('DEBUG: iframe =', $('iframe').attr('src'))
      $('#wait').hide();
      $('.modal-body p').hide();
      $('iframe').attr('src', '/tty/');
      $('iframe').show();
    }, 2500);
}