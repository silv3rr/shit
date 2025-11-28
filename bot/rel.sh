#!/bin/sh

# SHIT:RLS rlspack helper

# To test: run script with this oneliner:
# export r=/glftpd/site/grp/Test-GRP; ~/rel.sh "mp3,nfo,sfv" "$r" "$(basename $r|tr '[:upper:]' '[:lower:]')" "Foo" "Bar" "2018" "Pop" "01-13-2018" "Some note"

tagmp3=0
createnfo=0
createsfv=0
createm3u=0

#############
# arguments #
#############

relpath="${2}"
rellower="${3}"
artist="${4}"
title="${5}"
year="${6}"
genre="${7}"
date="${8}"
notes="${9}"

checklame="LAME3.100"
rnotes="none"

# paths
scriptdir="$( dirname "$0")"
eyed3="/usr/bin/eyeD3"
cksfv="/usr/bin/cksfv"
#rescan="/glftpd/bin/rescan"

if echo "${1}" | grep -q "mp3"; then tagmp3=1; fi
if echo "${1}" | grep -q "nfo"; then createnfo=1; fi
if echo "${1}" | grep -q "m3u"; then createm3u=1; fi
if echo "${1}" | grep -q "sfv"; then createsfv=1; fi

if [ "$notes" != "" ]; then
  notes="$rnotes"
fi

if [ -z "${7}" ]; then
  echo "Syntax: ${0} <filetypes> <releasepath> <releaselowercase> <artist> <title> <year> <genre> <date> [notes]"
  exit
fi

##################
# id3tag release #
##################

if [ "$tagmp3" -eq 1 ]; then
  # removed: > /dev/null 2>&1
  # replaced: --year, by: --release-year
  # replaced: --no-tagging-time-frame (nonexistent), by fake: --tagging-date
  # need: --to-v2.3 for mp3parser
  # added: --v1

  #old: $eyed3 --no-color --remove-all --to-v2.3 "${relpath}"/01*mp3
  #old: $eyed3 --no-color --tagging-date "$(date +%Y)-01-01 00:00:00" --to-v2.3 --track "1" --track-total "1" \
  #old:   --release-year "${year}" --artist "${artist}" --album "${title}" --title "${title}" --genre "${genre}" --text-frame TENC:"LAME3.100" \
  #old:   "${relpath}"/01*mp3

  $eyed3 -Q --no-color --remove-all --to-v2.3 "${relpath}"/01*mp3
  $eyed3 -Q --no-color --tagging-date "$(date +%Y)-01-01 00:00:00" --track "1" --track-total "1" \
    --recording-date "${year}" --text-frame TENC:"LAME3.100" \
    --artist "${artist}" --album "${title}" --title "${title}" --genre "${genre}" \
    "${relpath}"/01*mp3
  $eyed3 -Q --no-color --v1 --track "1" --release-year "${year}" \
    --artist "${artist}" --album "${title}" --title "${title}" --genre "${genre}" \
    "${relpath}"/01*mp3
fi

size="$( du -h -d0 "${relpath}" | tail -1 | awk '{ print $1 }' )"

###############
# create .nfo #
###############

if [ "$createnfo" -eq 1 ]; then
  # get extra info
  airdate="$date"
  if ! echo "$date" | grep -Eq '[A-Z][a-z][a-z]-[0-9][0-9]-[0-9]{4}'; then
    airdate="$(date -d"$(echo "$date" | awk -F\- '{ print $3"-"$1"-"$2 }')" +%b-%d-%Y)"
  fi
  if [ -z "$airdate" ]; then
    airdate="$(date +%b-%d-%Y)"
  fi
  reldate="$( date "+%b-%d-%Y" )"
  mediainfo="$(mediainfo "${relpath}"/01*mp3)"
  time="$(echo "$mediainfo" | awk -F ": " /Duration/'{ print $2; exit }' | sed -e 's/ min /:/' -e 's/ s$//')"
  lameinfo="$(echo "$mediainfo" | awk -F ": " /Writing/'{ print $2; exit }')"

  # exit with failure if lame 3.100 not detected
  # to debug: set lameinfo="LAME3.100"
  # alternative: eyeD3 -P lameinfo file.mp3 | tail -1 | grep "No LAME Tag"
  if [ "${lameinfo}" = "${checklame}" ]; then
    echo "LAME3.100 detected"
  else
    echo "ERR:NO_LAME"
    exit 1
  fi
  if [ -z "$time" ]; then
    echo "ERR:NO_TIME"
    time="00:00"
  fi

  # fill nfo
  nfopath="${relpath}/00-${rellower}.nfo"
  cp "${scriptdir}/generic.skl" "${nfopath}"
  if [ -s "${nfopath}" ]; then
    trk="$(printf "%.50s\\n" "$(printf "%-50s" "${title}-${year}")")"
    sed -i -e "s/#Artist */${artist}/" \
           -e "s/#Album */${title}/" \
           -e "s/#Genre */${genre}/" \
           -e "s/#Source */Radio/" \
           -e "s/#Rdate */${reldate}/" \
           -e "s/#Sdate */${airdate}/" \
           -e "s/#Brkbps */VBR kbps/" \
    \
           -e "s/#Tn */01/" \
           -e "s/#Cpti */${time}/" \
           -e "s/#Size */${size}/" \
    \
           -e "s/#N */01/g" \
           -e "s/#Trk.*#Ptit/${trk}${time}/" \
           -e "s/#Tptit */${time}/" \
    \
           -e "s/#Rnotes */${rnotes}/" \
     "${nfopath}"
  else
    echo "Could not create nfo, aborting"
    echo 1
  fi
fi

###############
# create .m3u #
###############

if [ "$createm3u" -eq 1 ]; then
  basename "${relpath}"/01*.mp3 > "${relpath}/00-${rellower}.m3u" || \
    { echo "Could not create m3u, aborting"; exit 1; }
fi

###############
# create .sfv #
###############

if [ "$createsfv" -eq 1 ]; then
  ( cd "$relpath" && $cksfv -C "${relpath}" -- *.mp3 | grep -v ";" > "${relpath}/00-${rellower}.sfv" ) || \
    { echo "Could not create sfv, aborting"; exit 1; }
fi

# unused

##############
# status bar #
##############
#if [ "$createbar" -eq 1 ]; then
#  #( cd "$relpath" && $rescan --normal )
#  local cdir="[xX] - ( $size 1F - COMPLETE - $genre $year ) - [xX]"
#  if [ ! -d "$relpath/$cdir" ]; then
#    mkdir "$relpath/$cdir" || \
#      { echo "Could not create complete dir, aborting"; exit 1; }
#  fi
#fi

exit 0
