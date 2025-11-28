#!/bin/sh

echo "$1" | htpasswd -n -i shit
php -r "print(password_hash("$1", PASSWORD_DEFAULT));"
./passchk glftpd $1
