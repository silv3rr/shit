#!/bin/sh

# cron runs as 'user'

( cd /home && \
  tar Jcvf user/backups/shit/$(date +%F)-shit.tar.xz \
    --exclude '*.mp3' \
    --exclude '.git' \
    --exclude 'vbrfix.*' \
    --exclude 'docker/bot/files/node_modules/*' \
    user/docker/ \
    shit/jail/shit/*.md \
    shit/jail/shit/bot/ \
    shit/jail/shit/docs/ \
    shit/jail/shit/web/ \
    shit/jail/shit/test/ \
    shit/jail/shit/systemd/ \
    shit/jail/glftpd/glftpd.conf \
    /etc/cron.d/bkp \
    /etc/sudoers.d/shit \
    /etc/nginx/sites-available/* \
    user/bin/bkp-shit.sh \
    2>&1 >/dev/null )
