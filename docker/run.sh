#!/bin/bash

# run docker containers
########################

# no args  --> run all images
# $1 = img --> run <image>
# arg: -rm --> stop/remove container(s)

# get external/public ip
IP_ADDR="$( ip route get $(ip route show 0.0.0.0/0 | grep -oP 'via \K\S+') | grep -oP 'src \K\S+' )"

IMAGES="bot cbftp glftpd web"

DOCKER_VOL="-v /var/run/docker.sock:/var/run/docker.sock"
GL_VOL_SITE="-v site:/glftpd/site"
CB_VOL_DTACH="-v dtach:/dtach"

BOT_CONF="--mount type=bind,src=${PWD}/config.js,dst=/bot/config.js"
BOT_CONF_WEB="--mount type=bind,src=${PWD}/config.js,dst=/web/config.js"

CB_PORT="-p 127.0.0.1:8080:8080 -p 55443:55443"
# GL_PORT="-p ${IP_ADDR}:9989:9989 -p ${IP_ADDR}:12000-12010:12000-12010"
GL_PORT="-p 9989:9989 -p 12000-12010:12000-12010"
WEB_PORT="-p ${IP_ADDR}:4444:443"

# CB_SCREEN="exec >/dev/tty 2>/dev/tty </dev/tty && /usr/bin/screen"
CB_DTACH="dtach -n /dtach/cbftp.sock /cbftp/cbftp"

if printf -- "%s" "$1" | grep -Eq -- '^all$'; then
  img="$IMAGES"
elif printf -- "%s" "$1" | grep -Eq -- '^[^-]'; then
  img="$1"
else
  img="$IMAGES"
fi

rem="0"
if printf -- "%s" "$@" | grep -Eq -- '\-rm'; then
  rem="1"
  if printf -- "%s" "$@" | grep -Eq -- '\-force'; then
    rem="2"
  fi
fi

check_ps() {
  docker ps --format='{{.Names}}' --filter="name=$1" | grep -Eq "^$1$"
}

remove() {
  if [ "$1" ] && [ "$rem" -gt 0 ]; then
    docker stop $1
    docker rm $1
  fi
}

volume() {
  if ! docker volume list --format='{{.Name}}' --filter="name=${1}" | grep -Eq "^${1}$"; then
    docker volume create --name "${1}"
  fi
}

case $img in
  bot)    ARGS="$BOT_CONF $GL_VOL_SITE"; volume site ;;
  cbftp)  ARGS="$CB_PORT $CB_VOL_DTACH"; volume dtach ;;
  glftpd) ARGS="$GL_PORT $GL_VOL_SITE"; volume site ;;
  web)    ARGS="$DOCKER_VOL $CB_VOL_DTACH $BOT_CONF_WEB $WEB_PORT"; volume dtach ;;

  *)      ARGS=""; ;;
esac

for i in $img; do
  if [ "$rem" -eq 2 ]; then
    remove "$i"
  fi
  if [ "$i" != "cbftp" ]; then
    if check_ps "$i"; then
      echo "docker: start \"$i\"..."
      docker start "$i"
    else
      rem=1
      remove "$i"
      echo "docker: run \"$i\"..."
      docker run -d --network shit -h $i $ARGS --name=$i ${i}:latest
    fi
  else
    if check_ps "$i"; then
      echo "docker: container \"$i\" already running..."
    else
      # docker run --rm -d --network shit -h $i $ARGS -it --name=$i ${i}:latest /bin/sh -c "$CB_SCREEN -s /cbftp/cbftp.sh -S cbftp"
      # docker run --rm -t -i -d --network shit -h $i $ARGS --name=$i ${i}:latest $DTACH
      echo "docker: run \"$i\"..."
      docker run --rm -t -i -d --network shit -h $i $ARGS --name=$i ${i}:latest
    fi
  fi
done

