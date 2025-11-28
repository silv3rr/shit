# -*- coding: utf-8 -*-
#
# Copyright (C) 2017 Marcin Kurczewski <rr-@sakuya.pl>
# Copyright (C) 2017 Ricardo Ferreira <ricardo.sff@goatse.cx>
# Copyright (C) 2014 Charles Franklin <jakhead@gmail.com>
# Copyright (C) 2012 Markus Näsman <markus@botten.org>
# Copyright (C) 2011 David Flatz <david@upcs.at>
# Copyright (C) 2009 Bjorn Edstrom <be@bjrn.se>
#
# This program is free software; you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation; either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.
#

#
# NOTE: Blowfish and DH1080 implementation is licenced under a different
# license:
#
# Copyright (c) 2009, Bjorn Edstrom <be@bjrn.se>
#
# Permission to use, copy, modify, and distribute this software for any
# purpose with or without fee is hereby granted, provided that the above
# copyright notice and this permission notice appear in all copies.
#

#
# Suggestions, Bugs, ...?
# https://github.com/freshprince/weechat-fish

#
# NOTE ABOUT DH1080:
# =================
#
# Diffie-Hellman key exchange assumes that you already have
# authenticated channels between Alice and Bob.  Which means that Alice
# has to be sure that she is really talking to Bob and not to any man in
# the middle.  But since the whole idea of FiSH is that you want to
# encrypt your communication on the IRC server whose operators you do
# not trust, there is no reliable way for Alice to tell if she really is
# talking to Bob.  It could also be some rogue IRC admin impersonating
# Bob with a fake hostname and ident or even doing a MITM attack on
# DH1080.  This means you can consider using DH1080 key exchange over
# IRC utterly broken in terms of security.
#

#
# This script has been adapted to use the original FiSH cipher
# that supports 72byte keys, instead of the incompatible pycrypto
# implementation.
#

from __future__ import print_function

SCRIPT_NAME = "fish"
SCRIPT_AUTHOR = "David Flatz <david@upcs.at>"
SCRIPT_VERSION = "0.11.1"
SCRIPT_LICENSE = "GPL3"
SCRIPT_DESC = "FiSH for weechat"
CONFIG_FILE_NAME = SCRIPT_NAME

import_ok = True

import base64
import re
import struct
import hashlib
from os import urandom, path
from ctypes import c_char_p, create_string_buffer, cdll, string_at

try:
    import weechat
except ImportError:
    print("This script must be run under WeeChat.")
    print("Get WeeChat now at: https://weechat.org/")
    import_ok = False

try:
    import Crypto.Cipher.Blowfish
except:
    print("PyCryptodome or PyCrypto must be installed to use fish")
    import_ok = False

try:
    bfLib = cdll.LoadLibrary(path.join(path.dirname(__file__),
                          "blowfish.so"))
except OSError:
    print("blowfish.so is missing.")
    print("Compile it and place it in the same directory as this script.")
    import_ok = False

#
# GLOBALS
#

fish_config_file = None
fish_config_section = {}
fish_config_option = {}
fish_keys = {}
fish_cyphers = {}
fish_DH1080ctx = {}
fish_encryption_announced = {}

fish_secure_key = ""
fish_secure_cipher = None

#
# CONFIG
#

def fish_config_reload_cb(data, config_file):
    return weechat.config_reload(config_file)


def fish_config_keys_read_cb(data, config_file, section_name, option_name,
        value):
    global fish_keys

    option = weechat.config_new_option(config_file, section_name, option_name,
            "string", "key", "", 0, 0, "", value, 0, "", "", "", "", "", "")
    if not option:
        return weechat.WEECHAT_CONFIG_OPTION_SET_ERROR

    fish_keys[option_name] = value

    return weechat.WEECHAT_CONFIG_OPTION_SET_OK_CHANGED


def fish_config_keys_write_cb(data, config_file, section_name):
    global fish_keys, fish_secure_cipher

    weechat.config_write_line(config_file, section_name, "")
    for target, key in sorted(fish_keys.items()):

        if fish_secure_cipher != None:
            ### ENCRYPT Targets/Keys ###
            weechat.config_write_line(config_file,
                                      blowcrypt_pack(target, fish_secure_cipher),
                                      blowcrypt_pack(key, fish_secure_cipher))

        else:
            weechat.config_write_line(config_file, target, key)

    return weechat.WEECHAT_RC_OK


def fish_config_init():
    global fish_config_file, fish_config_section, fish_config_option
    global fish_secure_cipher

    fish_config_file = weechat.config_new(CONFIG_FILE_NAME,
            "fish_config_reload_cb", "")
    if not fish_config_file:
        return

    # look
    fish_config_section["look"] = weechat.config_new_section(fish_config_file,
        "look", 0, 0, "", "", "", "", "", "", "", "", "", "")
    if not fish_config_section["look"]:
        weechat.config_free(fish_config_file)
        return

    fish_config_option["announce"] = weechat.config_new_option(
        fish_config_file, fish_config_section["look"], "announce",
        "boolean", "announce if messages are being encrypted or not", "", 0,
        0, "on", "on", 0, "", "", "", "", "", "")

    fish_config_option["marker"] = weechat.config_new_option(
        fish_config_file, fish_config_section["look"], "marker",
        "string", "marker for important FiSH messages", "", 0, 0,
        "O<", "O<", 0, "", "", "", "", "", "")

    fish_config_option["mark_position"] = weechat.config_new_option(
        fish_config_file, fish_config_section["look"], "mark_position",
        "integer", "put marker for encrypted messages at start or end",
        "off|begin|end",
        0,2, "off", "off", 0, "", "", "", "", "", "")

    fish_config_option["mark_encrypted"] = weechat.config_new_option(
        fish_config_file, fish_config_section["look"], "mark_encrypted",
        "string", "marker for encrypted messages", "", 0, 0,
        "*", "*", 0, "", "", "", "", "", "")

    # color
    fish_config_section["color"] = weechat.config_new_section(fish_config_file,
            "color", 0, 0, "", "", "", "", "", "", "", "", "", "")
    if not fish_config_section["color"]:
        weechat.config_free(fish_config_file)
        return

    fish_config_option["alert"] = weechat.config_new_option(
        fish_config_file, fish_config_section["color"], "alert",
        "color", "color for important FiSH message markers", "", 0, 0,
        "lightblue", "lightblue", 0, "", "", "", "", "", "")

    # secure
    fish_config_section["secure"] = weechat.config_new_section(fish_config_file,
            "secure", 0, 0, "", "", "", "", "", "", "", "", "", "")
    if not fish_config_section["secure"]:
        weechat.config_free(fish_config_file)
        return

    fish_config_option["key"] = weechat.config_new_option(
        fish_config_file, fish_config_section["secure"], "key",
        "string", "key for securing blowfish keys", "", 0, 0, "", "",
        0, "", "", "", "", "", "")

    # keys
    fish_config_section["keys"] = weechat.config_new_section(fish_config_file,
        "keys", 0, 0,
        "fish_config_keys_read_cb", "",
        "fish_config_keys_write_cb", "", "",
        "", "", "", "", "")
    if not fish_config_section["keys"]:
        weechat.config_free(fish_config_file)
        return


def fish_config_read():
    global fish_config_file

    return weechat.config_read(fish_config_file)


def fish_config_write():
    global fish_config_file

    return weechat.config_write(fish_config_file)


##
## Blowfish and DH1080 Code:
##
#
# BLOWFISH
#

class Blowfish:
    MODE_ECB = 1
    MODE_CBC = 2

    def __init__(self, key):
        if not key:
            raise ValueError("No key for encryption supplied.")

        if key[0:4] == "cbc:":
            self.mode = Blowfish.MODE_CBC
            key = key[4:]
            keylimit = 56
        else:
            self.mode = Blowfish.MODE_ECB
            keylimit = 72

        if len(key) > keylimit:
            key = key[:keylimit]

        self.key = key.encode("utf-8")

    def decrypt(self, data):
        """
        Returns ECB/CBC decrypted string, depending on the key type

        Expects utf-8 encoded or raw byte encrypted string
        Returns
            utf-8 encoded decrypted string
            boolean flag indicating whether the original ciphertext was broken or not
        """
        broken = False

        if type(data) == str:
            data = data.encode("utf-8")

        if self.mode == Blowfish.MODE_ECB:
            size = len(data) * 2 + 1
            cplaintext = create_string_buffer(size)
            bfLib.decrypt_string(c_char_p(self.key), c_char_p(data),
                                 cplaintext, len(data))
            cplaintext[size - 1] = b'\0'
            plaintext = string_at(cplaintext)
        elif self.mode == Blowfish.MODE_CBC:
            blowfish = Crypto.Cipher.Blowfish.new(
                self.key, Crypto.Cipher.Blowfish.MODE_ECB
            )
            plaintext, broken = cbc_decrypt(blowfish.decrypt, blowcrypt_b64decode(data), 8)

        if type(plaintext) == bytes:
            try:
                plaintext = plaintext.decode("utf-8")
            except UnicodeDecodeError:
                try:
                    plaintext = plaintext.decode("ascii")
                except UnicodeDecodeError:
                    plaintext = plaintext.decode("utf-8", "ignore")
        return plaintext, broken

    def encrypt(self, data):
        """
        Returns ECB/CBC encrypted string, depending on the key type

        Expects utf-8 encoded or raw byte plaintext string
        Returns utf-8 encoded encrypted string
        """
        if type(data) == str:
            data = data.encode("utf-8")

        if self.mode == Blowfish.MODE_ECB:
            size = len(data) * 2 + 1
            cciphertext = create_string_buffer(size)
            bfLib.encrypt_string(c_char_p(self.key), c_char_p(data),
                               cciphertext, len(data))
            cciphertext[size - 1] = b'\0'
            return string_at(cciphertext).decode("utf-8")
        elif self.mode == Blowfish.MODE_CBC:
            blowfish = Crypto.Cipher.Blowfish.new(
                self.key, Crypto.Cipher.Blowfish.MODE_ECB
            )
            ciphertext = cbc_encrypt(blowfish.encrypt, data, 8)
            return "*{ciphertext}".format(
                ciphertext=base64.b64encode(ciphertext).decode("utf-8")
            )


# XXX: Unstable.
def blowcrypt_b64encode(s):
    """A non-standard base64-encode."""
    B64 = "./0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
    res = ''
    while s:
        left, right = struct.unpack('>LL', s[:8])
        for i in range(6):
            res += B64[right & 0x3f]
            right >>= 6
        for i in range(6):
            res += B64[left & 0x3f]
            left >>= 6
        s = s[8:]
    return res

def blowcrypt_b64decode(s):
    """
        A padding-fixing base64-decode

        If incoming message was cut off, e.g. due to ircd message length limits
        this function will ensure it's padded to a valid length before performing
        the base64 decode that yields the raw ciphertext
    """
    missing_padding = len(s) % 4
    if missing_padding:
        s += b"="* (4 - missing_padding)
    return base64.b64decode(s)

def padto(msg, length):
    """Pads 'msg' with zeroes until it's length is divisible by 'length'.
    If the length of msg is already a multiple of 'length', does nothing."""
    L = len(msg)
    if L % length:
        msg += b'\x00' * (length - L % length)
    assert len(msg) % length == 0
    return msg


def xorstring(a, b, blocksize): # Slow.
    """xor string a and b, both of length blocksize."""
    xored = b''
    for i in range(blocksize):
        xored += bytearray((a[i] ^ b[i],))
    return xored


def cbc_encrypt(func, data, blocksize):
    """The CBC mode. The randomly generated IV is prefixed to the ciphertext.
    'func' is a function that encrypts data in ECB mode. 'data' is the
    plaintext. 'blocksize' is the block size of the cipher."""
    assert len(data) % blocksize == 0

    IV = urandom(blocksize)
    assert len(IV) == blocksize

    ciphertext = IV
    for block_index in range(int(len(data) / blocksize)):
        xored = xorstring(data, IV, blocksize)
        enc = func(xored)

        ciphertext += enc
        IV = enc
        data = data[blocksize:]

    assert len(ciphertext) % blocksize == 0
    return ciphertext


def cbc_decrypt(func, data, blocksize):
    """See cbc_encrypt."""
    broken = False
    if len(data) % blocksize != 0:
        broken = True

    IV = data[0:blocksize]
    data = data[blocksize:]

    plaintext = b''
    for block_index in range(int(len(data) / blocksize)):
        temp = func(data[0:blocksize])
        temp2 = xorstring(temp, IV, blocksize)
        plaintext += temp2
        IV = data[0:blocksize]
        data = data[blocksize:]

    assert len(plaintext) % blocksize == 0
    return plaintext, broken


def blowcrypt_pack(msg, cipher):
    """."""
    if type(msg) == str:
        msg = msg.encode("utf-8")
    return '+OK ' + cipher.encrypt(padto(msg, 8))


def blowcrypt_unpack(msg, cipher):
    """."""
    if not (msg.startswith('+OK ') or msg.startswith('mcps ')):
        raise ValueError
    _, rest = msg.split(' ', 1)

    if rest[0] == "*":
        if cipher.mode != Blowfish.MODE_CBC:
            raise ValueError
        raw = rest[1:]
    else:
        if cipher.mode != Blowfish.MODE_ECB:
            raise ValueError
        if len(rest) < 12:
            raise MalformedError

        if not (len(rest) % 12) == 0:
            rest = rest[:-(len(rest) % 12)]

        try:
            raw = padto(rest, 12)
        except TypeError:
            raise MalformedError
        if not raw:
            raise MalformedError

    try:
        plain, broken = cipher.decrypt(raw)
    except ValueError:
        raise MalformedError

    return plain.strip('\x00').replace('\n',''), broken


#
# DH1080
#

g_dh1080 = 2
p_dh1080 = int('FBE1022E23D213E8ACFA9AE8B9DFAD'
               'A3EA6B7AC7A7B7E95AB5EB2DF85892'
               '1FEADE95E6AC7BE7DE6ADBAB8A783E'
               '7AF7A7FA6A2B7BEB1E72EAE2B72F9F'
               'A2BFB2A2EFBEFAC868BADB3E828FA8'
               'BADFADA3E4CC1BE7E8AFE85E9698A7'
               '83EB68FA07A77AB6AD7BEB618ACF9C'
               'A2897EB28A6189EFA07AB99A8A7FA9'
               'AE299EFA7BA66DEAFEFBEFBF0B7D8B', 16)
q_dh1080 = (p_dh1080 - 1) // 2


def dh1080_b64encode(s):
    """
    A non-standard base64-encode.

    Expects a bytestring as input
    Returns a utf-8 string as output
    """
    b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    d = [0] * len(s) * 2

    L = len(s) * 8
    m = 0x80
    i, j, k, t = 0, 0, 0, 0
    while i < L:
        if s[i >> 3] & m:
            t |= 1
        j += 1
        m >>= 1
        if not m:
            m = 0x80
        if not j % 6:
            d[k] = b64[t]
            t &= 0
            k += 1
        t <<= 1
        t %= 0x100
        #
        i += 1
    m = 5 - j % 6
    t <<= m
    t %= 0x100
    if m:
        d[k] = b64[t]
        k += 1
    d[k] = 0
    res = ''
    for q in d:
        if q == 0:
            break
        res += q
    return res


def dh1080_b64decode(s):
    """
    A non-standard base64-encode.

    Expects a utf-8 string as input
    Returns a bytestring as output
    """
    b64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
    buf = [0] * 256
    for i in range(64):
        buf[ord(b64[i])] = i

    L = len(s)
    if L < 2:
        raise ValueError
    for i in reversed(range(L - 1)):
        if buf[ord(s[i])] == 0:
            L -= 1
        else:
            break
    if L < 2:
        raise ValueError

    d = [0] * L
    i, k = 0, 0
    while True:
        i += 1
        if k + 1 < L:
            d[i - 1] = buf[ord(s[k])] << 2
            d[i - 1] %= 0x100
        else:
            break
        k += 1
        if k < L:
            d[i - 1] |= buf[ord(s[k])] >> 4
        else:
            break
        i += 1
        if k + 1 < L:
            d[i - 1] = buf[ord(s[k])] << 4
            d[i - 1] %= 0x100
        else:
            break
        k += 1
        if k < L:
            d[i - 1] |= buf[ord(s[k])] >> 2
        else:
            break
        i += 1
        if k + 1 < L:
            d[i - 1] = buf[ord(s[k])] << 6
            d[i - 1] %= 0x100
        else:
            break
        k += 1
        if k < L:
            d[i - 1] |= buf[ord(s[k])] % 0x100
        else:
            break
        k += 1
    return b''.join(map(bytearray, (d[0:i - 1],)))


def dh_validate_public(public, q, p):
    """See RFC 2631 section 2.1.5."""
    return 1 == pow(public, q, p)


class DH1080Ctx:
    """DH1080 context."""
    def __init__(self, cbc=False):
        self.public = 0
        self.private = 0
        self.secret = 0
        self.state = 0
        self.cbc = cbc

        bits = 1080
        while True:
            self.private = bytes2int(urandom(bits // 8))
            self.public = pow(g_dh1080, self.private, p_dh1080)
            if 2 <= self.public <= p_dh1080 - 1 and \
               dh_validate_public(self.public, q_dh1080, p_dh1080) == 1:
                break


def dh1080_pack(ctx):
    """."""
    cmd = None
    if ctx.state == 0:
        ctx.state = 1
        cmd = "DH1080_INIT "
    else:
        cmd = "DH1080_FINISH "
    reply = cmd + dh1080_b64encode(int2bytes(ctx.public))
    if ctx.cbc:
        reply += " CBC"
    return reply


def dh1080_parse(msg):
    cbc = False
    cmd, public_raw = msg.split(' ', 1)
    if ' ' in public_raw:
        raw_list = public_raw.split(' ')
        public_raw = raw_list[0]
        if raw_list[1] == "CBC":
            cbc = True
    return cmd, public_raw, cbc


def dh1080_unpack(msg, ctx):
    """."""
    if not msg.startswith("DH1080_"):
        raise ValueError

    invalidmsg = "Key does not validate per RFC 2631. This check is not " \
                 "performed by any DH1080 implementation, so we use the key " \
                 "anyway. See RFC 2785 for more details."

    if ctx.state == 0:
        if not msg.startswith("DH1080_INIT"):
            raise MalformedError
        ctx.state = 1
        try:
            cmd, public_raw, cbc = dh1080_parse(msg)
            if cbc or cmd == "DH1080_INIT_CBC":
                ctx.cbc = True

            public = bytes2int(dh1080_b64decode(public_raw))

            if not 1 < public < p_dh1080:
                raise MalformedError

            if not dh_validate_public(public, q_dh1080, p_dh1080):
                #print(invalidmsg)
                pass

            ctx.secret = pow(public, ctx.private, p_dh1080)
        except:
            raise MalformedError

    elif ctx.state == 1:
        if not msg.startswith("DH1080_FINISH "):
            raise MalformedError
        ctx.state = 1
        try:
            cmd, public_raw, cbc = dh1080_parse(msg)
            ctx.cbc = cbc

            public = bytes2int(dh1080_b64decode(public_raw))

            if not 1 < public < p_dh1080:
                raise MalformedError

            if not dh_validate_public(public, q_dh1080, p_dh1080):
                #print(invalidmsg)
                pass

            ctx.secret = pow(public, ctx.private, p_dh1080)
        except:
            raise MalformedError

    return True


def dh1080_secret(ctx):
    """."""
    if ctx.secret == 0:
        raise ValueError
    key = dh1080_b64encode(sha256(int2bytes(ctx.secret)))
    if ctx.cbc:
        key = "cbc:" + key
    return key


def bytes2int(b):
    """Variable length big endian to integer."""
    n = 0
    for p in b:
        n *= 256
        n += p
    return n


def int2bytes(n):
    """Integer to variable length big endian."""
    if n == 0:
        return '\x00'
    b = b''
    while n:
        b = bytearray((n % 256,)) + b
        n //= 256
    return b


def sha256(s):
    """sha256"""
    return hashlib.sha256(s).digest()


##
##  END Blowfish and DH1080 Code
##
#
# HOOKS
#

def fish_secure_key_cb(data, option, value):
    global fish_secure_key, fish_secure_cipher

    fish_secure_key = weechat.config_string(
        weechat.config_get("fish.secure.key")
    )

    if fish_secure_key == "":
        fish_secure_cipher = None
        return weechat.WEECHAT_RC_OK

    if fish_secure_key[:6] == "${sec.":
        decrypted = weechat.string_eval_expression(
            fish_secure_key, {}, {}, {}
        )
        if decrypted:
            fish_secure_cipher = Blowfish(decrypted)
            return weechat.WEECHAT_RC_OK
        else:
            weechat.config_option_set(fish_config_option["key"], "", 0)
            weechat.prnt("", "Decrypt sec.conf first\n")
            return weechat.WEECHAT_RC_OK

    if fish_secure_key != "":
        fish_secure_cipher = Blowfish(fish_secure_key)

    return weechat.WEECHAT_RC_OK


def fish_modifier_in_notice_cb(data, modifier, server_name, string):
    global fish_DH1080ctx, fish_keys, fish_cyphers

    match = re.match(
        r"^(?:@time=[\d:TZ.-]+\s)?(:(.*?)!.*? NOTICE (.*?) :)((DH1080_INIT |DH1080_INIT_CBC |DH1080_FINISH |\+OK |mcps )?.*)$",
        string)
    #match.group(0): message
    #match.group(1): msg without payload
    #match.group(2): source
    #match.group(3): target
    #match.group(4): msg
    #match.group(5): DH1080_INIT |DH1080_INIT_CBC |DH1080_FINISH
    if not match or not match.group(5):
        return string

    if match.group(3) != weechat.info_get("irc_nick", server_name):
        return string

    target = "%s/%s" % (server_name, match.group(2))
    targetl = target.lower()
    buffer = weechat.info_get("irc_buffer", "%s,%s" % (
            server_name, match.group(2)))

    if match.group(5) == "DH1080_FINISH " and targetl in fish_DH1080ctx:
        if not dh1080_unpack(match.group(4), fish_DH1080ctx[targetl]):
            fish_announce_unencrypted(buffer, target)
            return string

        msg = "Key exchange for %s successful" % target
        if fish_DH1080ctx[targetl].cbc:
            msg += " (CBC mode)"
        fish_alert(buffer, msg)

        fish_keys[targetl] = dh1080_secret(fish_DH1080ctx[targetl])
        if targetl in fish_cyphers:
            del fish_cyphers[targetl]
        del fish_DH1080ctx[targetl]

        return ""

    if match.group(5).startswith("DH1080_INIT"):
        fish_DH1080ctx[targetl] = DH1080Ctx()

        msg = ' '.join(match.group(4).split()[0:3])

        if not dh1080_unpack(msg, fish_DH1080ctx[targetl]):
            fish_announce_unencrypted(buffer, target)
            return string

        reply = dh1080_pack(fish_DH1080ctx[targetl])

        msg = "Key exchange initiated by %s. Key set." % target
        if fish_DH1080ctx[targetl].cbc:
            msg += " (CBC mode)"
        fish_alert(buffer, msg)

        weechat.command(buffer, "/mute -all notice %s %s" % (
                match.group(2), reply))

        fish_keys[targetl] = dh1080_secret(fish_DH1080ctx[targetl])
        if targetl in fish_cyphers:
            del fish_cyphers[targetl]
        del fish_DH1080ctx[targetl]

        return ""

    if match.group(5) in ["+OK ", "mcps "]:
        if targetl not in fish_keys:
            fish_announce_unencrypted(buffer, target)
            return string

        if targetl not in fish_cyphers:
            b = Blowfish(fish_keys[targetl])
            fish_cyphers[targetl] = b
        else:
            b = fish_cyphers[targetl]

        clean, broken = blowcrypt_unpack(match.group(4), b)

        fish_announce_encrypted(buffer, target)
        if broken:
            fish_announce_broken(buffer, target)

        return "%s%s" % (match.group(1), fish_msg_w_marker(clean))

    fish_announce_unencrypted(buffer, target)

    return string


def fish_modifier_in_privmsg_cb(data, modifier, server_name, string):
    global fish_keys, fish_cyphers

    match = re.match(
        r"^(?:@time=[\d:TZ.-]+\s)?(:(.*?)!.*? PRIVMSG (.*?) :)(\x01ACTION )?((\+OK |mcps )?.*?)(\x01)?$",
        string)
    #match.group(0): message
    #match.group(1): msg without payload
    #match.group(2): source
    #match.group(3): target
    #match.group(4): action
    #match.group(5): msg
    #match.group(6): +OK |mcps
    if not match:
        return string

    if match.group(3) == weechat.info_get("irc_nick", server_name):
        dest = match.group(2)
    else:
        dest = match.group(3)
    target = "%s/%s" % (server_name, dest)
    targetl = target.lower()
    buffer = weechat.info_get("irc_buffer", "%s,%s" % (server_name, dest))

    if not match.group(6):
        fish_announce_unencrypted(buffer, target)
        return string

    if targetl not in fish_keys:
        fish_announce_unencrypted(buffer, target)
        return string

    if targetl not in fish_cyphers:
        b = Blowfish(fish_keys[targetl])
        fish_cyphers[targetl] = b
    else:
        b = fish_cyphers[targetl]
    clean, broken = blowcrypt_unpack(match.group(5), b)

    fish_announce_encrypted(buffer, target)
    if broken:
        fish_announce_broken(buffer, target)

    if not match.group(4):
        return "%s%s" % (match.group(1), fish_msg_w_marker(clean))

    return "%s%s%s\x01" % (match.group(1), match.group(4), fish_msg_w_marker(clean))


def fish_modifier_in_topic_cb(data, modifier, server_name, string):
    global fish_keys, fish_cyphers

    match = re.match(r"^(?:@time=[\d:TZ.-]+\s)?(:.*?!.*? TOPIC (.*?) :)((\+OK |mcps )?.*)$", string)
    #match.group(0): message
    #match.group(1): msg without payload
    #match.group(2): channel
    #match.group(3): topic
    #match.group(4): +OK |mcps
    if not match:
        return string

    target = "%s/%s" % (server_name, match.group(2))
    targetl = target.lower()
    buffer = weechat.info_get("irc_buffer", "%s,%s" % (server_name,
            match.group(2)))

    if targetl not in fish_keys or not match.group(4):
        fish_announce_unencrypted(buffer, target)
        return string

    if targetl not in fish_cyphers:
        b = Blowfish(fish_keys[targetl])
        fish_cyphers[targetl] = b
    else:
        b = fish_cyphers[targetl]
    clean, broken = blowcrypt_unpack(match.group(3), b)

    fish_announce_encrypted(buffer, target)
    if broken:
        fish_announce_broken(buffer, target)

    return "%s%s" % (match.group(1), fish_msg_w_marker(clean))


def fish_modifier_in_332_cb(data, modifier, server_name, string):
    global fish_keys, fish_cyphers

    match = re.match(r"^(?:@time=[\d:TZ.-]+\s)?(:.*? 332 .*? (.*?) :)((\+OK |mcps )?.*)$", string)
    if not match:
        return string

    target = "%s/%s" % (server_name, match.group(2))
    targetl = target.lower()
    buffer = weechat.info_get("irc_buffer", "%s,%s" % (server_name,
            match.group(2)))

    if targetl not in fish_keys or not match.group(4):
        fish_announce_unencrypted(buffer, target)
        return string

    if targetl not in fish_cyphers:
        b = Blowfish(fish_keys[targetl])
        fish_cyphers[targetl] = b
    else:
        b = fish_cyphers[targetl]

    clean, broken = blowcrypt_unpack(match.group(3), b)

    fish_announce_encrypted(buffer, target)
    if broken:
        fish_announce_broken(buffer, target)

    return "%s%s" % (match.group(1), fish_msg_w_marker(clean))


def fish_modifier_out_privmsg_cb(data, modifier, server_name, string):
    global fish_keys, fish_cyphers

    match = re.match(r"^(PRIVMSG (.*?) :)(.*)$", string)
    if not match:
        return string

    target = "%s/%s" % (server_name, match.group(2))
    targetl = target.lower()
    buffer = weechat.info_get("irc_buffer", "%s,%s" % (server_name,
            match.group(2)))

    if targetl not in fish_keys:
        fish_announce_unencrypted(buffer, target)
        return string

    if targetl not in fish_cyphers:
        b = Blowfish(fish_keys[targetl])
        fish_cyphers[targetl] = b
    else:
        b = fish_cyphers[targetl]
    cypher = blowcrypt_pack(fish_msg_wo_marker(match.group(3)), b)

    fish_announce_encrypted(buffer, target)

    return "%s%s" % (match.group(1), cypher)


def fish_modifier_out_topic_cb(data, modifier, server_name, string):
    global fish_keys, fish_cyphers

    match = re.match(r"^(TOPIC (.*?) :)(.*)$", string)
    if not match:
        return string
    if not match.group(3):
        return string

    target = "%s/%s" % (server_name, match.group(2))
    targetl = target.lower()
    buffer = weechat.info_get("irc_buffer", "%s,%s" % (server_name,
            match.group(2)))

    if targetl not in fish_keys:
        fish_announce_unencrypted(buffer, target)
        return string

    if targetl not in fish_cyphers:
        b = Blowfish(fish_keys[targetl])
        fish_cyphers[targetl] = b
    else:
        b = fish_cyphers[targetl]
    cypher = blowcrypt_pack(match.group(3), b)

    fish_announce_encrypted(buffer, target)

    return "%s%s" % (match.group(1), cypher)


def fish_modifier_input_text(data, modifier, buffer, string):
    if weechat.string_is_command_char(string):
        return string
    target = "%s/%s" % (
            weechat.buffer_get_string(buffer, "localvar_server"),
            weechat.buffer_get_string(buffer, "localvar_channel")
        )
    targetl = target.lower()
    if targetl not in fish_keys:
        return string
    return fish_msg_w_marker(string)


def fish_unload_cb():
    fish_config_write()

    return weechat.WEECHAT_RC_OK


#
# COMMANDS
#

def fish_cmd_blowkey(data, buffer, args):
    global fish_keys, fish_cyphers, fish_DH1080ctx
    global fish_config_option, fish_secure_cipher

    if args == "":
        fish_list_keys(buffer)
        return weechat.WEECHAT_RC_OK

    elif args == "genkey":
        fish_secure_genkey(buffer)
        return weechat.WEECHAT_RC_OK

    argv = args.split(" ")

    if argv[0] == "list":
        if len(argv) == 3 and argv[1] == "-server":
            filterOnServer = argv[2]
            fish_list_keys(buffer, filterOnServer)
            return weechat.WEECHAT_RC_OK

        fish_list_keys(buffer)

        return weechat.WEECHAT_RC_OK

    if (len(argv) > 2 and argv[1] == "-server"):
        server_name = argv[2]
        del argv[2]
        del argv[1]
        pos = args.find(" ")
        pos = args.find(" ", pos + 1)
        args = args[pos+1:]
    else:
        server_name = weechat.buffer_get_string(buffer, "localvar_server")

    if argv[0] == "exchange":
        cbc_mode = True
        if len(argv) >= 2 and argv[1] == "-ecb":
            cbc_mode = False
            del argv[1]

    buffer_type = weechat.buffer_get_string(buffer, "localvar_type")
    # if no target user has been specified grab the one from the buffer if it is private
    if argv[0] == "exchange" and len(argv) == 1 and buffer_type == "private":
        target_user = weechat.buffer_get_string(buffer, "localvar_channel")
    elif argv[0] == "set" and buffer_type in ["channel", "private"] and len(argv) == 2:
        target_user = weechat.buffer_get_string(buffer, "localvar_channel")
    elif argv[0] == "show" and buffer_type in ["channel", "private"] and len(argv) == 1:
        target_user = weechat.buffer_get_string(buffer, "localvar_channel")
    elif len(argv) < 2:
        return weechat.WEECHAT_RC_ERROR
    else:
        target_user = argv[1]

    argv2eol = ""
    pos = args.find(" ")
    if pos:
        pos = args.find(" ", pos + 1)
        if pos > 0:
            argv2eol = args[pos + 1:]
        else:
            argv2eol = args[args.find(" ") +1:]

    target = "%s/%s" % (server_name, target_user)
    targetl = target.lower()

    if argv[0] == "set":
        fish_keys[targetl] = argv2eol

        if targetl in fish_cyphers:
            del fish_cyphers[targetl]

        weechat.prnt(buffer, "set key for %s to %s" % (target, argv2eol))

        return weechat.WEECHAT_RC_OK

    if argv[0] == "show":
        if targetl not in fish_keys:
            weechat.prnt(buffer, "could not find key for %s" % (targetl))
            return weechat.WEECHAT_RC_ERROR

        weechat.prnt(buffer, "key for %s is %s" % (target, fish_keys[targetl]))

        return weechat.WEECHAT_RC_OK

    if argv[0] == "remove":
        if not len(argv) == 2:
            return weechat.WEECHAT_RC_ERROR

        if targetl not in fish_keys:
            return weechat.WEECHAT_RC_ERROR

        del fish_keys[targetl]

        if targetl in fish_cyphers:
            del fish_cyphers[targetl]

        weechat.prnt(buffer, "removed key for %s" % target)

        return weechat.WEECHAT_RC_OK

    if argv[0] == "exchange":
        if server_name == "":
            return weechat.WEECHAT_RC_ERROR

        cbc_msg = "CBC" if cbc_mode else "ECB"
        weechat.prnt(buffer, "Initiating %s DH1080 Exchange with %s" % (cbc_msg, target))
        fish_DH1080ctx[targetl] = DH1080Ctx(cbc=cbc_mode)
        msg = dh1080_pack(fish_DH1080ctx[targetl])
        weechat.command(buffer, "/mute -all notice -server %s %s %s" % (server_name, target_user, msg))

        return weechat.WEECHAT_RC_OK



    return weechat.WEECHAT_RC_ERROR


#
# HELPERS
#


def fish_secure():
    global fish_secure_key, fish_secure_cipher

    fish_secure_key = weechat.config_string(fish_config_option["key"])

    # if blank, do nothing
    if fish_secure_key == "":
        fish_success()
        return

    # if ${sec.data.fish}, check if sec.conf is decrypted
    # and decrypt
    elif fish_secure_key[:6] == "${sec.":
        decrypted = weechat.string_eval_expression(
            fish_secure_key, {}, {}, {}
        )

        if decrypted:
            fish_secure_cipher = Blowfish(decrypted)
            fish_decrypt_keys()
            fish_success()
            return

        else:
            global SCRIPT_NAME
            fish_secure_error()
            weechat.command(weechat.current_buffer(),
                            "/wait 1ms /python unload %s" % SCRIPT_NAME)
            return

    # if key is neither ${sec.data.fish} or ""
    # encrypt/decrypt with user supplied, plain text key
    if fish_secure_key != "":
        fish_secure_cipher = Blowfish(fish_secure_key)
        fish_decrypt_keys()
        fish_success()
        return


def fish_decrypt_keys():
    global fish_keys, fish_secure_cipher
    global fish_cyphers

    fish_keys_tmp = {}
    for target, key in fish_keys.items():
        ### DECRYPT Targets/Keys ###
        target, _ = blowcrypt_unpack(target, fish_secure_cipher)
        key, _ = blowcrypt_unpack(key, fish_secure_cipher)
        fish_keys_tmp[target] = key

    fish_keys = fish_keys_tmp


def fish_success():
    weechat.prnt("",
                 "%s%sblowkey: successfully loaded\n" % (
                     weechat.prefix("join"),
                     weechat.color("_green"))
    )


def fish_secure_error():
    """print error message if secdata not decrypted"""

    message = ("\n%s%sblowkey:%s unable to recover key from sec.conf\n"
               "%s%sblowkey:%s fish.py %sNOT LOADED\n"
               "%s%sblowkey:%s decrypt secured data first\n"
               "%s%sblowkey:%s then reload fish.py\n\n") % (
                   weechat.prefix("error"),
                   weechat.color("underline"),
                   weechat.color("reset"),
                   weechat.prefix("error"),
                   weechat.color("underline"),
                   weechat.color("reset"),
                   weechat.color("*red"),
                   weechat.prefix("error"),
                   weechat.color("underline"),
                   weechat.color("reset"),
                   weechat.prefix("error"),
                   weechat.color("underline"),
                   weechat.color("reset")
               )

    weechat.prnt("", "%s" % message)


def fish_secure_genkey(buffer):
    global fish_secure_cipher, fish_config_option

    newKey = blowcrypt_b64encode(urandom(32))

    # test to see if sec.conf decrypted
    weechat.command(buffer, "/secure set fish test")
    decrypted = weechat.string_eval_expression(
        "${sec.data.fish}", {}, {}, {}
    )

    if decrypted == "test":
        weechat.config_option_set(fish_config_option["key"],
                                  "${sec.data.fish}", 0)
        fish_secure_cipher = Blowfish(newKey)
        weechat.command(buffer, "/secure set fish %s" % newKey)


def fish_get_target_buffer(buffer, server, nick):
    """
        Return current buffer or newly created one

        If we get a private message and there is no buffer yet, create one and
        jump back to the previous buffer
    """
    if (
        weechat.info_get("irc_is_nick", nick) and
        weechat.buffer_get_string(buffer, "localvar_type") != "private"
    ):
        weechat.command(buffer, "/mute -all query %s" % nick)
        buffer = weechat.info_get("irc_buffer", "%s,%s" % (server, nick))
        weechat.command(buffer, "/input jump_previously_visited_buffer")
    return buffer


def fish_announce_encrypted(buffer, target):
    global fish_encryption_announced, fish_config_option

    if (not weechat.config_boolean(fish_config_option['announce']) or
        fish_encryption_announced.get(target)):
        return

    (server, nick) = target.split("/")
    buffer = fish_get_target_buffer(buffer, server, nick)

    fish_alert(buffer, "Messages to/from %s are encrypted." % target)

    fish_encryption_announced[target] = True


def fish_announce_unencrypted(buffer, target):
    global fish_encryption_announced, fish_config_option

    if (not weechat.config_boolean(fish_config_option['announce']) or
            not fish_encryption_announced.get(target)):
        return

    fish_alert(buffer, "Messages to/from %s are %s*not*%s encrypted." % (
            target,
            weechat.color(weechat.config_color(fish_config_option["alert"])),
            weechat.color("chat")))

    del fish_encryption_announced[target]


def fish_announce_broken(buffer, target):
    global fish_encryption_announced, fish_config_option

    if not weechat.config_boolean(fish_config_option['announce']):
        return

    (server, nick) = target.split("/")
    buffer = fish_get_target_buffer(buffer, server, nick)

    fish_alert(buffer, "Message from %s was not fully decrypted because it cut off" % target)


def fish_alert(buffer, message):
    mark = "%s%s%s\t" % (
            weechat.color(weechat.config_color(fish_config_option["alert"])),
            weechat.config_string(fish_config_option["marker"]),
            weechat.color("chat"))

    weechat.prnt(buffer, "%s%s" % (mark, message))


def fish_list_keys(buffer, filterOnServer=None):
    global fish_keys

    weechat.prnt(buffer, "\tFiSH Keys: form target(server): key")

    if len(fish_keys) == 0:
        weechat.prnt(buffer, "NO KEYS!\n")
        return

    for (target, key) in sorted(fish_keys.items()):
        (server, nick) = target.split("/")
        if filterOnServer and server != filterOnServer:
            continue
        weechat.prnt(buffer, "\t%s(%s): %s" % (nick, server, key))


def fish_msg_w_marker(msg):
    marker = weechat.config_string(fish_config_option["mark_encrypted"])
    if weechat.config_string(fish_config_option["mark_position"]) == "end":
        return "%s%s" % (msg, marker)
    elif weechat.config_string(fish_config_option["mark_position"]) == "begin":
        return "%s%s" % (marker, msg)
    else:
        return msg


def fish_msg_wo_marker(msg):
    marker = weechat.config_string(fish_config_option["mark_encrypted"])
    if weechat.config_string(fish_config_option["mark_position"]) == "end":
        return msg[0:-len(marker)]
    elif weechat.config_string(fish_config_option["mark_position"]) == "begin":
        return msg[len(marker):]
    else:
        return msg
#
# MAIN
#

if (__name__ == "__main__" and import_ok and
        weechat.register(SCRIPT_NAME, SCRIPT_AUTHOR, SCRIPT_VERSION,
            SCRIPT_LICENSE, SCRIPT_DESC, "fish_unload_cb", "")):

    weechat.hook_command("blowkey", "Manage FiSH keys",
            "[list] | list [-server <server>] | [genkey] | set [-server <server>] [<target>] <key> "
            "| remove [-server <server>] <target> "
            "| exchange [-server <server>] [-ecb] [<nick>] "
            "| show [-server <server>] <nick>",
            "Add, change or remove key for target or perform DH1080\n"
            "keyexchange with <nick>.\n"
            "Target can be a channel or a nick.\n"
            "\n"
            "Without arguments this command lists all keys.\n"
            "\n"
            "Examples:\n"
            "Set the key for a channel:   /blowkey set -server freenet #blowfish key\n"
            "Remove the key:              /blowkey remove #blowfish\n"
            "Set the key for a query:     /blowkey set nick secret+key\n"
            "Show a specific key:         /blowkey show -server freenet nick \n"
            "List keys, filter on server: /blowkey list -server freenet\n"
            "List all keys:               /blowkey\n"
            "\n** stores keys in plaintext by default **\n\n"
            "DH1080:                      /blowkey exchange nick\n"
            "DH1080 (no CBC):             /blowkey exchange -ecb nick\n"
            "\nPlease read the source for a note about DH1080 key exchange\n",
            "list"
            "|| genkey"
            "|| list %(irc_channel)|%(nicks)|-server %(irc_servers) %- "
            "|| set %(irc_channel)|%(nicks)|-server %(irc_servers) %- "
            "|| remove %(irc_channel)|%(nicks)|-server %(irc_servers) %- "
            "|| show %(irc_channel)|%(nicks)|-server %(irc_servers) %- "
            "|| exchange %(nick)|-server %(irc_servers) %-|-ecb",
            "fish_cmd_blowkey", "")

    fish_config_init()
    fish_config_read()
    fish_secure()

    weechat.hook_modifier("irc_in_notice", "fish_modifier_in_notice_cb", "")
    weechat.hook_modifier("irc_in_privmsg", "fish_modifier_in_privmsg_cb", "")
    weechat.hook_modifier("irc_in_topic", "fish_modifier_in_topic_cb", "")
    weechat.hook_modifier("irc_in_332", "fish_modifier_in_332_cb", "")
    weechat.hook_modifier("irc_out_privmsg", "fish_modifier_out_privmsg_cb", "")
    weechat.hook_modifier("irc_out_topic", "fish_modifier_out_topic_cb", "")
    weechat.hook_modifier("input_text_for_buffer", "fish_modifier_input_text", "")
    weechat.hook_config("fish.secure.key", "fish_secure_key_cb", "")
