FROM debian:buster-slim
ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update && \
  apt-get install xinetd openssl libssl1.1 -y && \
  apt-get purge exim4-base mysql-common rsyslog -y && \
  apt-get autoremove -y && \
  rm -rf /var/lib/apt/lists/*
WORKDIR /glftpd
COPY --chown=0:0 glftpd /glftpd
COPY --chown=0:0 etc/xinetd.d/glftpd /etc/xinetd.d/glftpd
# use openssl bin from gl:
#   COPY --chown=0:0 etc/openssl.cnf /home/hoe/glftpd/openssl/openssl_bins-static/ssl/openssl.cnf
#   RUN PATH=bin:$PATH /glftpd/create_server_key.sh glftpd
RUN echo "glftpd   9989/tcp" >> /etc/services && \
  /glftpd/create_server_key.sh glftpd && \
  chmod 600 /glftpd/ftpd-ecdsa.pem && \
  mv -f /glftpd/ftpd-ecdsa.pem /glftpd/etc && \
  chmod 777 /glftpd/site && \
  test -n "$pw" && ./passchk glftpd "$pw" >> ftp-data/users/glftpd
CMD ["xinetd", "-dontfork"]
