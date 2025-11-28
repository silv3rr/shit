const mp3Parser = require("mp3-parser");
const lib = require("mp3-parser/lib/lib");

mp3Parser.readFrameHeader = function (view, offset) {
	return lib.readFrameHeader(view, offset);
};

mp3Parser.readLastFrame = function (view, offset, requireNextFrame) {
    offset || (offset = view.byteLength - 2);

    var lastFrame = null;

    for (; offset >= 0; --offset) {
        if ( view.getUint8(offset) === 255 && view.getUint8(offset + 1) >= 224 && view.getUint8(offset + 1) < 254 ) {
            // Located a candidate frame as 255 is a possible frame-sync byte
            lastFrame = mp3Parser.readFrame(view, offset, requireNextFrame);

            if (lastFrame) {
                if ( lastFrame.header.bitrate <= 320 && lastFrame.header.samplingRate == 48000 && lastFrame.header.frameIsPadded == false ) {
                    return lastFrame;
                }
            }
        }
    }

    return null;
};

mp3Parser.readFrameNear = function (view, offset, requireNextFrame) {
    offset || (offset = view.byteLength - 2);

    var frame = null;

    for (; offset >= 0; ++offset) {

        if ( offset >= view.byteLength ) {
            return null;
        }

        if ( view.getUint8(offset) === 255 && view.getUint8(offset + 1) >= 224 && view.getUint8(offset + 1) < 255 ) {
            // Located a candidate frame as 255 is a possible frame-sync byte
            frame = mp3Parser.readFrame(view, offset, requireNextFrame);

            if (frame && frame.header.bitrate <= 320 ) {
                return frame;
            }
        }
    }

    return null;
};

var octetToBinRep = (function () {
    var b = []; // The binary representation
    return function (octet) {
        b[0] = ((octet & 128) === 128 ? "1" : "0");
        b[1] = ((octet & 64)  === 64  ? "1" : "0");
        b[2] = ((octet & 32)  === 32  ? "1" : "0");
        b[3] = ((octet & 16)  === 16  ? "1" : "0");
        b[4] = ((octet & 8)   === 8   ? "1" : "0");
        b[5] = ((octet & 4)   === 4   ? "1" : "0");
        b[6] = ((octet & 2)   === 2   ? "1" : "0");
        b[7] = ((octet & 1)   === 1   ? "1" : "0");
        return b.join("");
    };
}());


// ### Read a Frame Header
//
// Read header of frame located at `offset` of DataView `view`. Returns null in the event
//  that no frame header is found at `offset`
lib.readFrameHeader = function (view, offset) {
    offset || (offset = 0);

    // There should be more than 4 octets ahead
    if (view.byteLength - offset <= 4) { return null; }

    // Header's first (out of four) octet: `11111111`: Frame sync (all bits must be set)
    var b1 = view.getUint8(offset);
    if (b1 !== 255) { return null; }

    // Header's second (out of four) octet: `111xxxxx`
    //
    // * `111.....`: Rest of frame sync (all bits must be set)
    // * `...BB...`: MPEG Audio version ID (11 -> MPEG Version 1 (ISO/IEC 11172-3))
    // * `.....CC.`: Layer description (01 -> Layer III)
    // * `.......1`: Protection bit (1 = Not protected)

    // Require the three most significant bits to be `111` (>= 224)
    var b2 = view.getUint8(offset + 1);
    if (b2 < 224) { return null; }

    var mpegVersion = octetToBinRep(b2).substr(3, 2);
    var layerVersion = octetToBinRep(b2).substr(5, 2);

    //
    var header = {
        _section: { type: "frameHeader", byteLength: 4, offset: offset },
        mpegAudioVersionBits: mpegVersion,
        mpegAudioVersion: lib.mpegVersionDescription[mpegVersion],
        layerDescriptionBits: layerVersion,
        layerDescription: lib.layerDescription[layerVersion],
        isProtected: b2 & 1, // Just check if last bit is set
    };
    header.protectionBit = header.isProtected ? "1" : "0";

    if (header.mpegAudioVersion === "reserved" || header.mpegAudioVersionBits === "00") { return null; }
    if (header.layerDescription === "reserved") { return null; }

    // Header's third (out of four) octet: `EEEEFFGH`
    //
    // * `EEEE....`: Bitrate index. 1111 is invalid, everything else is accepted
    // * `....FF..`: Sampling rate, 00=44100, 01=48000, 10=32000, 11=reserved
    // * `......G.`: Padding bit, 0=frame not padded, 1=frame padded
    // * `.......H`: Private bit. This is informative
    var b3 = view.getUint8(offset + 2);
    b3 = octetToBinRep(b3);
    header.bitrateBits = b3.substr(0, 4);
    // console.debug('offset: ' + offset);
    // console.debug(mpegVersion);
    // console.debug(layerVersion);
    // console.debug(header.bitrateBits);
    header.bitrate = lib.bitrateMap[mpegVersion][layerVersion][header.bitrateBits];
    if (header.bitrate === "bad") { return null; }

    header.samplingRateBits = b3.substr(4, 2);
    header.samplingRate = lib.samplingRateMap[mpegVersion][header.samplingRateBits];
    if (header.samplingRate === "reserved") { return null; }

    header.frameIsPaddedBit = b3.substr(6, 1);
    header.frameIsPadded = header.frameIsPaddedBit === "1";
    header.framePadding = header.frameIsPadded ? 1 : 0;

    header.privateBit = b3.substr(7, 1);

    // Header's fourth (out of four) octet: `IIJJKLMM`
    //
    // * `II......`: Channel mode
    // * `..JJ....`: Mode extension (only if joint stereo)
    // * `....K...`: Copyright
    // * `.....L..`: Original
    // * `......MM`: Emphasis
    var b4 = view.getUint8(offset + 3);
    header.channelModeBits = octetToBinRep(b4).substr(0, 2);
    header.channelMode = lib.channelModes[header.channelModeBits];

    return header;
};

module.exports = mp3Parser;