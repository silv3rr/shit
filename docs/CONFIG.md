
# Standard configuration 

use `systemctl --user edit bot` (or web) to change unit files if needed

## bot

- to recompile node_modules run `npm rebuild` from bot dir
- edit file bot/config.js

## web interface

- edit /etc/nginx/sites-enabled/shit
- edit fille web/config.php

## screen

if you use gnu screen, add to .screenrc: `maxwin 1`

---

# Docker configuration

## bot 

- edit included file 'bot/config.js'
- `build.sh bot --rm`

### recompile node_modules

`ARGS="--build-arg ENV=dev" ./build.sh bot`

## web interface

- edit included file web/config.php
- `build.sh web --rm`

## cbftp

### recompile src

to update from cbftp.eu change VER to newer version:

`ARGS="--build-arg ENV=dev --build-arg VER=r1163" ./build.sh cbftp`

## changing passwords

change 'glftpd' ftp user or web interface password like this:

```
ARGS="--build-arg pw=Sh1ty_pw" ./build.sh glftpd
ARGS="--build-arg pw=Anothersht1tyPass" ./build.sh web
```
