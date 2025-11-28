FROM alpine:3.12
ARG ENV
ARG VER
WORKDIR /cbftp

# compile cbftp using alpine linux:
#   - apk add g++ gcc make ncurses-dev openssl-dev
#   - change cbftp/src/ui/ncurseswrap.h: include <ncurses.h>

RUN test "$ENV" = "dev" && { \
      apk add --no-cache g++ gcc make ncurses-dev openssl-dev && \
      wget https://cbftp.eu/cbftp-${VER}.tar.gz && \
      tar xvf cbftp-${VER}.tar.gz && \
      cd cbftp-${VER} && \
      sed -i -r -n -e '/#ifndef/,/#endif/p' \
                   -e '/#include <ncurses.h>/p' \
        src/ui/ncurseswrap.h && \
      make -j4; \
    } || { \
      apk add --no-cache libgcc libstdc++ ncurses screen bash dtach && \
      addgroup -g 61000 -S cbftp && \
      adduser -S -D -H -u 61000 -h /cbftp -G cbftp -g cbftp cbftp && \
      install -d -m 0755 -o cbftp -g cbftp /dtach; \
      #chown 61000:61000 /dtach; \
    }

#  gnu screen: (!) these tricks dont work, need to start screen on docker run..
#  https://github.com/moby/moby/issues/728
#  https://unix.stackexchange.com/a/530392
#    ARG TERM=xterm
#    ENV TERM=xterm
#    # '/bin/sh -c "exec >/dev/tty 2>/dev/tty </dev/tty && /usr/bin/screen -s /bin/bash"' 
#    # 'exec >/dev/tty 2>/dev/tty </dev/tty && /usr/bin/screen -s /bin/bash'
#    # 'script -c /usr/bin/screen -s bash' 
#    # "script -c '/usr/bin/screen -s /cbftp/cbftp.sh -S cbftp'"
#    RUN echo '#!/bin/sh' > /docker-cmd.sh && \
#        echo ">/dev/tty 2>/dev/tty </dev/tty && /usr/bin/screen -s /cbftp/cbftp.sh -S cbftp" >> /docker-cmd.sh
#    # CMD ["/usr/bin/screen", "-mS", "cbftp", "/cbftp.sh"]
#    # CMD ["screen", "-dmS", "cbftp", "-s", "sh", "/cbftp/cbftp"]
#    # CMD "/bin/sh -c 'exec >/dev/tty 2>/dev/tty </dev/tty && /usr/bin/screen -s /bin/bash'"
#    CMD ["sh", "/docker-cmd.sh"]

COPY --chown=61000:61000 . .
USER cbftp
VOLUME /dtach
ENV DTACH_FILE /dtach/cbftp.sock
CMD ["bash", "-c", "rm -f $DTACH_FILE; dtach -c $DTACH_FILE /dtach/cbftp.sock"]
#CMD ["bash", "-c", "rm -f /dtach/cbftp.sock; dtach -c /dtach/cbftp.sock /cbftp/cbftp"]
