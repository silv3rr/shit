
# docker and nodejs:
#   https://nodejs.org/en/docs/guides/nodejs-docker-webapp

# alpine3.11 has old pycryto, use pip: 
#   apt add py3-pip
#   pip3 install pycryptodome

# FROM node:10.22-alpine3.11
FROM node:15-alpine3.13
ARG ENV
WORKDIR /bot
COPY --chown=61000:61000 . .
RUN test "$ENV" = "dev" && { \
      apk add --no-cache gcc musl-dev make g++ && \
      npm rebuild; \
    } || { \
      apk add --no-cache sudo unzip gcc musl-dev python3 \
        py3-pycryptodome py3-eyed3 mediainfo cksfv && \
      addgroup -g 61000 -S bot && \
      adduser -S -D -H -u 61000 -h /bot -G bot -g bot bot && \
      npm install && \
      echo "Set disable_coredump false" >> /etc/sudo.conf && \
      echo "bot   ALL=NOPASSWD: /bin/chown -R bot\\:bot /glftpd/site/*/*" > /etc/sudoers.d/bot && \  
      gcc -c -fPIC blowfish.c -o blowfish.o && \
      gcc -shared -Wl,-soname,blowfish.so -o blowfish.so blowfish.o && \
      chown bot:bot blowfish.so && \
      apk del --no-cache gcc musl-dev && \
      rm blowfish.c blowfish.o; \
    }
USER bot
CMD ["node", "bot.js"]
