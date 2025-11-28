# Security QA

Q: why is there nodejs and php and python and shellscript..

A: i dunno.

Q: can you even write proper code?

A: no.

Q: do you care about security at all? this shit looks stupid..

A: some effort was made but the name says it all doesnt it? :) probably best no not just run this on your public facing unfirewalled unhardened and unpatched rented linux server running since 2001

## Docker

Q: is bind mounting docker.sock in containers the best idea to get api access?

A: probably not :)

Q: what about using LSM, Podman, gVisor ..

A: try iiit

## cbftp (web shell)

is using GoTTY secure? no, not rly ;) well.. 

1) it runs in chroot ^^
2) it's behind reverse proxy with tls and ip/pass restriction
3) only used to run cbftp in terminal multiplexer and exits shell after
4) certain keybindings are disabled

possibly you could use the following (untested) web shell alternatives instead:

- https://github.com/maxmcd/webtty
- https://github.com/tsl0922/ttyd
- https://goteleport.com/teleport/download/

using teleport is the most secure options i guess.. you could use it to direct link to console like this:

 `<a href="https://<host>:3080/web/cluster/<name>/console/node/<uuid>/shit">teleport</a>`

or you could use [DOCKER mode](docs/DOCKER.md)
