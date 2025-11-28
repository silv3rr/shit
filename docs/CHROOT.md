# SSH CHROOT 'shit' user

allows only "bash" and "ls"
make sure it looks like this:

* /etc/passwd:
`shit:x:1000:1000::/bot:/bin/bash`

* /etc/group:
`shit:x:1000:shit,www-data`

* /etc/ssh/sshd_config:

```
## (optional) dont chroot source ip range 1.2.*
#Match User shit Address 1.2.*
#        ChrootDirectory none

Match User shit
        ChrootDirectory /home/shit/jail

AllowUsers shit@localhost shit@12.30.40.50
```

* homedir:

```
drwxr-xr-x 8 root root 4096 Aug  3 00:00 /home/shit/
drwxr-x--- 11 root shit 4096 Sep 20 00:00 /home/shit/jail

drwxr-xr-x 2 root root 4096 Jan 01 00:00 /home/shit/jail/etc
drwxr-xr-x 2 root root 4096 Jan 01 00:00 /home/shit/jail/bin
drwxr-xr-x 2 root root 4096 Jan 01 00:00 /home/shit/jail/dev
drwxr-xr-x 4 root root 4096 Jan 01 00:00 /home/shit/jail/lib
drwxr-xr-x 2 root root 4096 Jan 01 00:00 /home/shit/jail/lib64
drwxr-xr-x 3 root root 4096 Jan 01 00:00 /home/shit/jail/usr
```

symlink (`ln -s`)

`lrwxrwxrwx 1 root root 19 Jan 01 00:00 /shit -> /home/shit/jail`

* dev (mknod):

```
  4459369      0 crw-r--r--   1 root     root       5,   0 Jan 01 00:00 /home/shit/jail/dev/tty
  4459368      0 crw-r--r--   1 root     root       1,   8 Jan 01 00:00 /home/shit/jail/dev/random
  4459367      0 crw-r--r--   1 root     root       1,   5 Jan 01 00:00 /home/shit/jail/dev/zero
  4459366      0 crw-r--r--   1 root     root       1,   3 Jan 01 00:00 /home/shit/jail/dev/null
```

* etc files:

```
  4459364      4 -rw-r--r--   1 root     root          939 Jan 01 00:00 /home/shit/jail/etc/group  (copy /etc)
  4462089      4 -rw-r--r--   1 root     root         1774 Jan 01 00:00 /home/shit/jail/etc/passwd (copy /etc)
```

passwd: `shit:x:1000:1000::/:/bin/bash`

* bin files:

```
  4459359      4 drwxr-xr-x   2 root     root         4096 Jan 01 00:00 /home/shit/jail/bin
  4459360   1144 -rwxr-xr-x   1 root     root      1168776 Jan 01 00:00 /home/shit/jail/bin/bash
  4459361    136 -rwxr-xr-x   1 root     root       138856 Jan 01 00:00 /home/shit/jail/bin/ls
```

* lib files:

```
  4459358    144 -rwxr-xr-x   1 root     root       146968 Jan 01 00:00 /home/shit/jail/lib/x86_64-linux-gnu/libpthread.so.0
  4459353    180 -rw-r--r--   1 root     root       183528 Jan 01 00:00 /home/shit/jail/lib/x86_64-linux-gnu/libtinfo.so.6
  4459355     16 -rw-r--r--   1 root     root        14592 Jan 01 00:00 /home/shit/jail/lib/x86_64-linux-gnu/libdl.so.2
  4459356    460 -rw-r--r--   1 root     root       468944 Jan 01 00:00 /home/shit/jail/lib/x86_64-linux-gnu/libpcre.so.3
  4459354   1784 -rwxr-xr-x   1 root     root      1824496 Jan 01 00:00 /home/shit/jail/lib/x86_64-linux-gnu/libc.so.6
  4459357    152 -rw-r--r--   1 root     root       155296 Jan 01 00:00 /home/shit/jail/lib/x86_64-linux-gnu/libselinux.so.1
  4459274     56 -rw-r--r--   1 root     root        55792 Jan 01 00:00 /home/shit/jail/lib/x86_64-linux-gnu/libnss_files.so.2
  4459307      4 drwxr-xr-x  15 root     root         4096 Jan 01 00:00 /home/shit/jail/lib/terminfo
```

* lib64 files:

```
  4721900    164 -rwxr-xr-x   1 root     root       165632 Jan 01 00:00 /home/shit/jail/lib64/ld-linux-x86-64.so.2
```

* usr(/bin) files:

```
  4462086      4 drwxr-xr-x   2 root     root         4096 Jan 01 00:00 /home/shit/jail/usr/bin
  4462087     48 -rwxr-xr-x   1 root     root        47784 Jan 01 00:00 /home/shit/jail/usr/bin/dircolors
```

