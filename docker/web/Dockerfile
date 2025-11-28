
# https://wiki.alpinelinux.org/wiki/Nginx_with_PHP
# https://github.com/nginxinc/docker-nginx/blob/master/mainline/alpine/Dockerfile
# https://github.com/jabardigitalservice/docker-phpfpm-nginx/blob/master/7.4/Dockerfile

# alternative: supervisor
#   RUN apt install curl ca-certificates supervisor
#   COPY --chown=0:0 supervisord.conf /etc/supervisor/conf.d/supervisord.conf
#   CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]

FROM alpine:3.12
ARG pw
WORKDIR /web
COPY --chown=0:0 docker-entrypoint.sh /
COPY --chown=0:0 nginx /etc/nginx
COPY --chown=100:101 . .
RUN apk add --no-cache nginx php7 php7-fpm php7-session php7-ftp php7-curl \
                       php7-json php7-ctype apache2-utils dtach && \
  rm -rf /var/cache/apk/* && \
  # addgroup -g 60101 -S nginx && \
  # adduser -S -D -H -u 60101 -h /web -G nginx -g nginx nginx && \
  install -d -m 0755 -o nginx -g nginx /run/nginx && \
  install -d -m 0755 -o nginx -g nginx /run/php && \
  rm /etc/nginx/conf.d/default.conf && \
  ln -sf /dev/stdout /var/log/nginx/access.log && \
  ln -sf /dev/stderr /var/log/nginx/error.log && \
  sed -i 's|listen = 127.0.0.1:9000|listen = /run/php/php7.2-fpm.sock|' /etc/php7/php-fpm.d/www.conf && \
  sed -i 's|;listen.owner = nobody|listen.owner = nginx|' /etc/php7/php-fpm.d/www.conf && \
  sed -i 's|;listen.group = nobody|listen.owner = nginx|' /etc/php7/php-fpm.d/www.conf && \
  _htpw='shit:$apr1$0XAKibHj$QVGmr/tTr8v/AurAP1z.0/'; \
  test -n "$pw" && { \
    _htpw="$( echo $pw | htpasswd -n -i shit )"; \
    _h="$( php -r 'print(password_hash($argv[1], PASSWORD_DEFAULT));' $pw )" && \
    sed -i -r "s|(^ *'admin' => ).*|\1"$_h"'|" tinyfilemanager/config.php; \
  }; \
  echo "$_htpw" > /etc/nginx/.htpasswd && \ 
  addgroup nobody ping && \
  mkdir /docker-entrypoint.d && \
  echo 'php-fpm7 -F &' > /docker-cmd.sh && \
  echo 'nginx -g "daemon off;"' >> /docker-cmd.sh
# ENTRYPOINT ["/docker-entrypoint.sh"]
# CMD ["nginx", "-g", "daemon off;"]
CMD ["sh", "/docker-cmd.sh"]
