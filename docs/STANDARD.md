
# Setup standard mode

manual steps to install under user account 'shit' in a recent (linux) os. tested under debian 10 buster.

make sure userid '1000' used below is available or use a uid that matches your system instead.

older nodejs/php versions etc untested but might work.

## Software

### packages

use apt/yum/whatever to install:

- nginx php7 php7-fpm php7-curl php7-json
- python3 pycryptodome (or pip)
- nodejs 15.x

### source

- install gotty: https://github.com/yudai/gotty#installation
- install glftpd: https://glftpd.io (installgl.sh)

## chroot

create chroot/jail: [CHROOT.md](CHROOT.md)

## sudoers

* create /etc/sudoers.d/shit containing:

`shit   ALL=NOPASSWD: /bin/chown -R shit\:shit /home/shit/jail/glftpd/site/*/*`

## Start

```
cd /shit/bot && npm start
/usr/bin/dtach -n /tmp/cbftp.sock /shit/cbftp/cbftp.sh
```

## Systemd

Optionally you can create systemd services to run Bot and Cbftp.

### unit files

```
cp systemd/cbftp-dtach.service ~/.local/share/systemd/user 
cp systemd/bot.service ~/.local/share/systemd/user
systemctl daemon-reload
```

copy 'cbftp-screen.service' to use gnu screen instead of dtach

### test commands

logs:

```
sudo -u root /bin/journalctl _UID=1000
XDG_RUNTIME_DIR=/run/user/1000 /bin/journalctl --user
XDG_RUNTIME_DIR=/run/user/1000 /bin/journalctl --user -u bot
```

actions:

```
XDG_RUNTIME_DIR=/run/user/1000 /bin/systemctl --user status
XDG_RUNTIME_DIR=/run/user/1000 /bin/systemctl --user status bot
XDG_RUNTIME_DIR=/run/user/1000 /usr/bin/sudo -u shit /bin/systemctl --user cat bot
```

### optional alias

in .bash_aliases add: `alias log='sudo /bin/journalctl _UID=1000'`

### dtach

```
/usr/bin/dtach -n /tmp/cbftp.sock /shit/cbftp/cbftp
/usr/bin/dtach -a /tmp/cbftp.sock
```

**or use an alternative terminal multiplexer:**

if you dont want to use dtach, try gnu screen

~/.screenrc: `maxwin 1`

```
/usr/bin/screen -dmS cbftp /shit/cbftp/cbftp.sh
/usr/bin/screen -RR -S cbftp
```

_.. i dunno what a tmuxxx is_

