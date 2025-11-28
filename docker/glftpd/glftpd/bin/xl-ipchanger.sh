#!/bin/bash

#xL-ipchanger v1.3

#(C) 2003 xoLax 

#put this file in /glftpd/bin/ and chmod a+x

gldir="/glftpd"

log="$gldir/ftp-data/logs/xl-ipchanger.log"
#You need to create this file and chmod it 777 or something :)

tmp="$gldir/tmp/xl-ipchanger.tmp"
#This file will be created and deleted everytime the script runs
#Make sure the bot has correct permissions in this dir

#Force user to add ident? (YES/NO)
forceident="YES"

#Allowed numbers of IP's before user has to start deleting?
#maxip="3"
maxip="99"

#Minimum specified numbers (1-4)
#i.e minnum="3" will only allow IP's where the first three parts are specified
minnum="2"

passchk="$gldir/bin/passchk"

###END OF CONFIG###

if [ -z "$1" ]; then
  echo "ERROR: missing option"; exit 1
fi
if [ -z "$2" ]; then
  echo "ERROR: missing username"; exit 1
fi

user="$gldir/ftp-data/users/$2"
#The path were you have the user files
if [ ! -s "$user" ]; then
  echo "ERROR: user does not exist"; exit 1
fi

if [ -z "$3" ]; then
  echo "ERROR: missing password"; exit 1
fi

cpw="$( $passchk $2 $3 "$gldir/etc/passwd" )"
#if echo "$cpw" | grep -q '^[0-1]$'; then
if echo "$cpw" | grep -Eq '^(MATCH|NOMATCH)$'; then
  #if [ "$cpw" -eq  0 ]; then
  if [ "$cpw" = "NOMATCH" ]; then
    echo "ERROR: incorrect password for user $2"; exit 1
  fi
else
  echo "ERROR: could not check password"; exit 1
fi

if [ "$1" == "ADDIP" -o "$1" == "DELIP" ]; then
  if [ -z "$4" ]; then
    echo "ERROR: missing ip"; exit 1
  fi
fi

#export group="$( grep -w -m 1 GROUP $user | cut -d ' ' -f2 )"
group=""

#List IP's belonging to user
if [ "$1" = "LISTIP" ]; then
  #echo "IP's belonging to "$2"/"$group""
  echo "IP's belonging to "$2" "
  echo "$( grep IP $user | sed s/"IP "// | tr '\n' ' ' )"
  exit
fi

#Output the 10 last ipadds
if [ "$1" = "IPADDS" ]; then
  tail -n 10 $log
  exit
fi

export numip="$( grep IP $user | grep -n IP | grep "$maxip": )"

username="$2"
password="$3"
ip="$4"
nick="$5"
host="$6"

[ -z "$5" ] && nick="$2"
[ -z "$6" ] && host="localhost"

export foundip="$( grep IP $user | grep -F -w -m 1 "$4" | cut -d ' ' -f2 )"

#Add ip and log the action
if [ "$1" = "ADDIP" ]; then
  touch "$tmp" || { echo "ERROR: cannot create tmp file"; exit 1; }
  echo "$4" | sed s/@/" @ "/ | sed sZ\\.Z\ Zg >> "$tmp"
  export v1="$( grep "" "$tmp" | cut -d ' ' -f1 )"
  export v2="$( grep "" "$tmp" | cut -d ' ' -f2 )"
  export v3="$( grep "" "$tmp" | cut -d ' ' -f3 )"
  export v4="$( grep "" "$tmp" | cut -d ' ' -f4 )"
  export v5="$( grep "" "$tmp" | cut -d ' ' -f5 )"
  export v6="$( grep "" "$tmp" | cut -d ' ' -f6 )"
  rm "$tmp"
  
  if [ "$minnum" == "1" ]; then
    if [ "$v3"  == "*" ];then
      echo "You must specify at least the first number of the IP"
      exit
    fi
  fi
  if [ "$minnum" == "2" ]; then
    if [ "$v3"  == "*" -o "$v4" == "*" ];then
      echo "You must specify at least the two first numbers of the IP"
      exit
    fi
  fi
  if [ "$minnum" == "3" ]; then
    if [ "$v3"  == "*" -o "$v4" == "*" -o "$v5" == "*" ];then
      echo "You must specify at least the three first numbers of the IP"
    exit
    fi
  fi
  if [ "$minnum" == "4" ]; then
    if [ "$v3"  == "*" -o "$v4" == "*" -o "$v5" == "*" -o "$v6" == "*" ];then
      echo "You must specify all numbers of the IP"
    exit
    fi
  fi
  if [ "$v1" == "" -o "$v2" != "@" -o "$v3" == "" -o "$v4" == "" -o "$v5" == "" -o "$v6" == "" ]; then
    echo "$4 is not a valid IP"
    exit
  fi
  export ident="$( echo $4 | sed s/@/"@ "/ | cut -d ' ' -f1 )"
  if [ "$ident" = "*@" -a "$forceident" = "YES" ]; then
    echo "IP must contain an ident!"
    exit
  fi
  if [ "$numip" != "" ]; then
    echo "Maximum number of IP's is $maxip. Use !delip to delete and !listip to list your IP's"
    exit
  fi
  if [ "$foundip" == "$4" ]; then
     #echo "ERROR - "$4" is already added to "$2"/"$group""
     echo "ERROR - "$4" is already added to "$2""
     exit
  fi
 
  echo ADDIP: "$( /bin/date '+%a %b %d %X %Y' )" -"$nick""($host)" added "$4" to user "$2" >> "$log"
  echo IP "$4" >> "$user"  || { echo "ERROR: could not add ip"; exit 1; }
  #echo ""$4" added to "$2"/"$group"" 
  echo "OK: "$4" added to "$2"" 
fi

#Delete ip and log the action
if [ "$1" = "DELIP" ]; then
  if [ "$foundip" == "" ]; then
    #echo "ERROR - Can't delete "$4" from "$2"/"$group" - IP not found"
    echo "ERROR - Can't delete "$4" from "$2" - IP not found"
    exit
  fi
  grep -F -v "$4" "$user" > "$user.tmp" || { echo "ERROR: could not delete ip"; exit 1; }
  mv "${user}.tmp" "$user"
  echo DELIP: "$( /bin/date '+%a %b %d %X %Y' )" -"$Nick""($host)" deleted "$4" from user "$2" >> "$log"
  #echo "Deleted "$4" from "$2"/"$group""
  echo "Deleted "$4" from "$2""
fi
