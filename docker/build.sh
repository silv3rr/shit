#!/bin/sh

# build docker images
######################

# no args   --> build all images
# $1 = img  --> (re)build <image>
# $1 = pack --> use buildpack for bot (see below)
# arg -rm   --> remove <image> first
# use ENV   --> ARGS="--build-arg ENV=dev"

images="bot cbftp glftpd web"

# (OPTIONAL) 'teleport', alternative for gotty:
#   - https://goteleport.com/teleport/docs/quickstart-docker

[ -n "$1" ] && img="$1" || img="all"
rem="0"
if printf -- "%s" "$@" | grep -Eq -- '\-rm'; then
  rem="1"
fi

if [ "$img" != "pack" ]; then
  if [ "$img" = "all" ]; then
    for i in $images; do
      docker build $i $i:latest
    done
  elif [ "$img" ]; then
    docker stop $img
    docker rm $img
    if [ "$img" ] && [ "$rem" -eq 1 ]; then
      docker image rm $img
    fi
    docker build $ARGS $img -t $img:latest
  fi
else
  # (OPTIONAL) alternative for bot, buildpacks.io docker image:
  #   - info: https://paketo.io/docs/buildpacks/language-family-buildpacks/nodejs
  #   - info: https://github.com/buildpacks/samples
  #   - info: https://github.com/paketo-buildpacks/node-{engine,start}
  docker pull buildpacksio/pack
  docker stop bot
  docker rm bot
  if [ "$rem" -eq 1 ]; then
    docker image rm bot
  fi
  docker run -v /var/run/docker.sock:/var/run/docker.sock -v $PWD:/workspace \
    -w /workspace buildpacksio/pack build bot \
    --path bot/files  \
    --buildpack gcr.io/paketo-buildpacks/nodejs \
    --builder paketobuildpacks/builder:full
fi

