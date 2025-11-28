FiSH for weechat
================

This is a python plugin for weechat.  It implements blowfish encryption and
DH1080 key exchange and should be compatible with FiSH from
http://fish.secure.la/

This version uses a separate blowfish library to allow usage of keys with a length of up to 72 bytes.

Secured data
------------
Can use [weechat secured data][weechat-secure] to store keys. To encrypt keys:
```
/secure set fish *********
/set fish.secure.key "${sec.data.fish}"
```

Or you can set a randomly generated key with:
```
/blowkey genkey
```

To return to storing in plain text:
```
/set fish.secure.key ""
```

CBC
---
This supports ECB and CBC modes for encryption. To indicate CBC mode you need to prefix a key with `cbc:`

The default for DH1080 key exchange is to indicate that CBC is supported. If you deal with people that have incompatible installations of DH1080 you can force the *old* style of DH1080 key exchange messages by prodiving the argument `-ecb` to the blowkey exchange command.

Normal key exchange the same way [flakes/mirc_fish_10][flakes-fish10] does it, indicating CBC support with a suffixed `CBC` tag:
```
/blowkey exchange
```

Old-style blowkey exchange with no indication of CBC support:
```
/blowkey exchange -ecb
```

Install
------
Run `make` to compile the custom blowfish library. If you store your weechat scripts in the standard location `~/.weechat/python`, just run `make install`.

Otherwise copy the resulting `fish.py` and `weechat.so` to your weechat installations `python` directory.

For `fish.py` to load [pycryptodome][pycryptodome] or the old `pycrypto` lib are required for CBC de-/encryption.

[weechat-secure]: http://dev.weechat.org/post/2013/08/04/Secured-data
[flakes-fish10]: https://github.com/flakes/mirc_fish_10
[pycryptodome]: https://pycryptodome.readthedocs.io/en/latest/src/installation.html
