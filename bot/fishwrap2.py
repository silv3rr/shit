#!/usr/bin/env python3

#################################################################################
# 20210220: wrapper for weechat fish.py
#################################################################################
#
# DH1080 keyx and Blowfish encryption using CLI args, for use in other scripts
#
# DH1080 KX does not call pack/unpack defs but re-uses relevant code directly
# fishwrap v2 adds Blowfish encrypt/decrypting
#   - vars:  p_dh1080, q_dh1080
#   - class: DH1080Ctx, Blowfish
#   - defs:  bytes2int, int2bytes dh_validate_public, dh1080_b64encode
#            blowcrypt_pack, blowcrypt_unpack
#
# See original fish.py for Copyrights, license and info:
#   https://github.com/weechat/scripts/blob/master/python/fish.py
#
#################################################################################

import sys
#import re

# dont load weechat module
sys.modules["weechat"] = ""
import fish as blow

#sys.modules["hexfish.crypto"] = ""
#import blowcrypt as blow
#import irccrypt as blow

# Handle Errors
class MalformedError(Exception):
    pass
blow.MalformedError = MalformedError(Exception)

debug = False
#debug = True

# Handle DH1080

if len(sys.argv) > 1 and sys.argv[1] == "DH1080gen":
  """
  DH1080 generate keys
  input  : arg1=DH1080gen
  output : my_pubkey, my_privkey
  """
  fish_DH1080ctx = {}
  targetl = 'irc_nick'
  fish_DH1080ctx[targetl] = blow.DH1080Ctx()
  try:
    if not 1 < fish_DH1080ctx[targetl].public < blow.p_dh1080:
      sys.exit(1)
    if not blow.dh_validate_public(fish_DH1080ctx[targetl].public, blow.q_dh1080, blow.p_dh1080):
      pass
    b64_private=blow.dh1080_b64encode(blow.int2bytes(fish_DH1080ctx[targetl].private))
    b64_public=blow.dh1080_b64encode(blow.int2bytes(fish_DH1080ctx[targetl].public))
    print(b64_private, b64_public, end="")
    del fish_DH1080ctx[targetl]
    del b64_private
  except:
    sys.exit(1)


if len(sys.argv) > 3 and sys.argv[1] == "DH1080comp":
  """
  DH1080 complete
  input  : arg1='DH1080comp', arg2=my_privkey, arg3=someones_pubkey
  output : shared secret
  """
  try:
    private = blow.bytes2int(blow.dh1080_b64decode(sys.argv[2]))
    public = blow.bytes2int(blow.dh1080_b64decode(sys.argv[3]))
    if not 1 < public < blow.p_dh1080:
      sys.exit(1)
    if not blow.dh_validate_public(public, blow.q_dh1080, blow.p_dh1080):
      pass
    secret = pow(public, private, blow.p_dh1080)
    print(blow.dh1080_b64encode(blow.sha256(blow.int2bytes(secret))), end="")
    del private
    del secret
  except:
   sys.exit(1)

################################################################################

# Handle blowfish encrypt/decrypt

# DEBUG: check for string or bytes
# if type(message) == str:
#    message = message.encode("utf-8")
# if type(message) is bytes:
#    return message

if len(sys.argv) > 1 and sys.argv[1] == 'encrypt':
  """
  Encrypt text (pack)
  input  : arg1='encrypt', arg2=key, arg3=plain text
  output : cipher text
  """
  try:
    fish_key = sys.argv[2]
    message = sys.argv[3]
    if debug: print('DEBUG: encrypt key={} message={}'.format(fish_key, message))
    b = blow.Blowfish(fish_key)
    print(blow.blowcrypt_pack(message, b), end="")
    del message
    del fish_key
    del b
  except:
    sys.exit(1)


elif len(sys.argv) > 1 and sys.argv[1] == 'decrypt':
  """
  Decrypt text (unpack
  input  : arg1='decrypt', arg2=key, arg3=cipher text (+OK)
  output : plain text
  """
  try:
    fish_key = sys.argv[2]
    message = sys.argv[3]
    if debug: print('DEBUG: decrypt key={} message={}'.format(fish_key, message))
    # not needed: if (re.search('^(\+OK|mcps) .{8,}', message)):
    b = blow.Blowfish(fish_key)
    print(blow.blowcrypt_unpack(message, b)[0], end="")
    del message
    del fish_key
    del b
  except:
    sys.exit(1)

################################################################################

# TODO: Full DH1080 INIT/FINISH per nick

"""
  1) Receive  : Nickname NOTICE :DH1080_INIT Abc/Other.PubKey/123 [CBC]
  2) Generate :   A) My PubKey, B) My PrivKey
  3) Send     : Nickname NOTICE :DH1080_FINISH DEF/My.Pubkey/321
  4) Generate :   My PrivKey + Other Pubkey = Shared Secret
  5) Receive  : Nickname PRIVMSG :+OK cIPHER/tEXT123/
  6) Decrypt  :   <Key:Shared_Secret> "+OK cIPHER/tEXT123/"
"""

if len(sys.argv) > 1 and sys.argv[1] == "DH1080_INIT":
  #
  # DH1080 init
  # input  : argv2=nick argv3=someones_pubkey
  # output : my_pubkey
  #
  targetl = sys.argv[2].lower()
  fish_DH1080ctx[targetl] = blow.DH1080Ctx()
  reply = blow.dh1080_pack(fish_DH1080ctx[targetl])
  del fish_DH1080ctx[targetl]
  del reply
  
if len(sys.argv) > 2 and sys.argv[1] == "DH1080_FINISH":
  #
  # DH1080 finish
  # input  : arg2=nick, arg3=other_pubkey
  # output : shared_secret
  #
  print('DEBUG: argv1={} argv2={} argv3={}'.format(sys.argv[1], sys.argv[2], sys.argv[3]))

  fish_DH1080ctx = {}
  fish_keys = {}
  targetl = sys.argv[2]
  fish_DH1080ctx[targetl] = blow.DH1080Ctx()
 
  reply = blow.dh1080_unpack('{} {} {}'.format(sys.argv[1], sys.argv[3], fish_DH1080ctx[targetl]))
  #key = blow.dh1080_b64encode(blow.sha256(blow.int2bytes(fish_DH1080ctx[targetl].secret)))
  fish_keys[targetl] = blow.dh1080_secret(fish_DH1080ctx[targetl])

  # if targetl in fish_cyphers:
  #   del fish_cyphers[targetl]
  del fish_DH1080ctx[targetl]
  del fish_keys[targetl]
  del reply

if (debug): print()

#if (debug): print('\n\nDEBUG: globals =  {}\n'.format((globals())))

""" 
# cleanup
vars = [ "private", "secret", "b64secret" ]
for k in vars:
  if k:
    del k
"""
