#!/bin/sh
#
# chmod u+s /glftpd/bin/chown
# touch + chmod 666 /glftpd/ftp-data/logs/chown.log
# glftpd.conf:
#   post_check      /bin/chown.sh /site/*
#   cscript         MKD post /bin/chown.sh
#
if echo "$@" | grep -Eiq "mkd"; then
  /bin/chown 1003:1003 "$( echo "$@" | awk '{ print $2 }' )"
elif echo "$@" | grep -Eiq "site rescan"; then
  /bin/chown -R 1003:1003 $PWD
else
  /bin/chown -v 1003:1003 "$1"
  /bin/chown -v 1003:1003 "$2"
fi
echo "$( date +%F\ %T ) $@" >> /ftp-data/logs/chown.log
exit 0
