#!/bin/sh
#
# chmod u+s /glftpd/bin/chmod
# touch + chmod 666 /glftpd/ftp-data/logs/chmod.log
# glftpd.conf:
#   post_check      /bin/chmod.sh /site/*
#   cscript         MKD post /bin/chmod.sh
#
if echo "$@" | grep -Eiq "mkd"; then
  /bin/chmod 777 "$( echo "$@" | awk '{ print $2 }' )"
elif echo "$@" | grep -Eiq "site rescan"; then
  /bin/chmod -R 777 $PWD
else
  /bin/chmod -v 777 "$1"
  /bin/chmod -v 777 "$2"
fi
echo "$( date +%F\ %T ) $@" >> /ftp-data/logs/chmod.log
exit 0
