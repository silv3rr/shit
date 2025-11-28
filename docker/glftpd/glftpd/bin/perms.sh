#!/bin/sh
#
# chmod u+s /glftpd/bin/chown
# chmod u+s /glftpd/bin/chmod
# touch + chmod 666 /glftpd/ftp-data/logs/perms.log
# glftpd.conf:
#   post_check      /bin/perms.sh /site/*
#   cscript         MKD post /bin/perms.sh
#
if echo "$@" | grep -Eiq "mkd"; then
  /bin/chown 1003:1003 "$( echo "$@" | awk '{ print $2 }' )"
  /bin/chmod 777 "$( echo "$@" | awk '{ print $2 }' )"
elif echo "$@" | grep -Eiq "site rescan"; then
  /bin/chown -R 1003:1003 "$PWD"
  /bin/chmod 644 "$PWD/*"
  /bin/chmod 777 "$PWD"
else
  /bin/chown -v 1003:1003 "$1"
  /bin/chown -v 1003:1003 "$2"
  /bin/chmod -v 644 "$1"
  /bin/chmod -v 777 "$2"
fi
echo "$( date +%F\ %T ) $@" >> /ftp-data/logs/perms.log
exit 0
