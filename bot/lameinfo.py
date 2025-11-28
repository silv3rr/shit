#!/usr/bin/env python3

# WP: lameheader helper

import struct
import sys
import os
# import binascii

# https://stackoverflow.com/a/45691079

# HEADER (LAME)
# -------------
# ADDR: 9C - AF
# LAME3.100 = 4C 41 4D 45 33 2E 31 30 30

# END OF FILE (ID3V1 TAG)
# -----------------------
# UULAME3.100UUUUTAG
# 55 55 4C 41 4D 45 33 2E 31 30 30 55 55 55 55 54
# 41 47 00 00 00 00 00 00 00 00 00 00 00 00 00 00
# 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
# 02 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
# 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
# 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
# 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
# 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 
# 00 00 00 00 00 00 00 00 00 00 00 00 00 01 03    

# EXAMPLES:
# b = bytearray(b'This is a sample')
# convert string to hex:
# print(' '.join(c.encode('hex') for c in "LAME3.100"))
#                                 00 01 02 03 04 05 06 07 08 09 10 11
# lameinfo = str(bytearray.fromhex("64 4C 41 4D 45 33 2E 31 30 30 04 F0" + "00"*8 ))
# or whithout str() (?)
# zeros = "\0"*20

# set lame string *only*
lameinfo = bytearray.fromhex("4C 41 4D 45 33 2E 31 30 30")
zeros = b'\0'*9

id3v1 = "UULAME3.100UULAME3.100UUUUTAG" + "\0"*95

getheader = 1
getendtag = 0
checkonly = 0
#maxsize = 20971520
maxsize = 0
force = 0
debug = 0

# to debug: set mp3file = '/test/test2.mp3'
mp3file = ""

# handle arguments
if (len(sys.argv) > 1):
  if not (sys.argv[1].startswith('-')):
    mp3file = sys.argv[1]
if ("-c" in sys.argv):
    #print ('INFO: checkonly mode enabled...')
    checkonly = 1
if ("-f" in sys.argv):
    print ('INFO: force mode enabled...')
    force = 1
if (len(sys.argv) > 2):
  if ("-c" in sys.argv[1]):
    checkonly = 1
  if ("-f" in sys.argv[1]):
    force = 1
  mp3file = sys.argv[2]

if not (os.path.isfile(mp3file)):
  print ('ERROR: file does not exist')
  exit(1)
else:
  mp3bytes = os.path.getsize(mp3file)
  print ('INFO: file %s is %d bytes' % (os.path.basename(os.path.normpath(mp3file)), mp3bytes))
  if (mp3bytes == 0):
    print ('ERROR: file empty, aborting...')
    exit(1)
  if ((maxsize > 0) and (mp3bytes > maxsize)):
    print ('ERROR: file too big, aborting...')
    exit(1)

if (getheader):
  with open(mp3file, 'rb') as f_mp3:
    mp3 = f_mp3.read()
  try:
    # incorrect entries: 0x78:0xAF+1 0xA7:0xAC+1 0x9C:0xAF+1 0x77
    # index = int(mp3.index('Xing'))
    index = mp3.index(b'Xing')
    start = int(index) + int(0x78)
    end = start + len(lameinfo)
    entry = mp3[start:end]
    print('INFO: xingframe starts at index {0} ({1}), entry: {2} - {3}'.format(index, hex(index), start, end))
    print('INFO: entry string is {} ({})'.format(entry.decode(), ' '.join(hex(i) for i in struct.unpack("{}B".format(len(entry)), entry))))
    # binascii: print('INFO: entry string is "{}" (\'{}\')'.format(entry,format(' '.join(binascii.hexlify(entry)[i:i+2] for i in range(0, len(binascii.hexlify(entry)), 2)))))
    if not (checkonly):
      if (entry == zeros) or (force):
        if (force):
          print ('WARNING: force writing over non-zero or non-empty lameinfo...')
        else:
          print ('INFO: OK - entry is zero or empty, writing lameinfo...')
        with open(mp3file, 'r+b') as f_mp3:
          # alternatively use format: mp3[format(10):format(99)]
          #   mp3.write(mp3[:int(start)] + lameinfo + mp3[int(end):])
          # to rewrite complete file (needs enough mem):
          #   for i in xrange(mp3[:int(start)] + lameinfo + mp3[int(end):]):
          #     f_mp3.write(i)
          f_mp3.seek(start, 0)
          print('DEBUG: f_mp3.tell={}'.format(f_mp3.tell()))
          f_mp3.write(lameinfo)
      else:
        print ('INFO: skipped - entry is non-zero or non-empty...')
  except Exception as e:
    print ('ERROR: cannot read xingframe - "%s"' % e)
    f_mp3.close

if (getendtag):
    with open(mp3file, 'r+b') as f_mp3:
      if not (checkonly):
        try:
          f_mp3.seek(-128, 2)
          if ('TAG' in f_mp3.read(128)):
            print ('INFO: skipped id3v1 TAG, already exists...')
          else:
            with open(mp3file, 'ab') as f_mp3:
              f_mp3.write(id3v1)
        except Exception as e:
          print ('ERROR: cannot read TAG - "%s"' % e)
      else:
        try:
          f_mp3.seek(-128, 2)
          print ('INFO: id3v1 tag is "%s"' % f_mp3.read(128))
        except Exception as e:
          print ('ERROR: cannot read TAG - "%s"' % e)
    f_mp3.close
