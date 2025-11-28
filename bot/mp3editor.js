"use strict";

const fs = require("fs");
const util = require("util");
const mp3Parser = require("./mp3parser");
const crc = require('crc');
const easing = require('eases/circ-out');
const timeline = require('timeline');

class Mp3Editor {
	constructor(file) {
		this.file = file;
		this.lowestVolume = -50;
		this.fadeSeconds = 5;
	}

	framesToFade() {
		// Average frames per second...
		return Math.round( 1 / 0.026 * this.fadeSeconds );
	}

	toArrayBuffer( buffer ) {
		const bufferLength = buffer.length;
		const uint8Array = new Uint8Array(new ArrayBuffer(bufferLength));

		for (let i = 0; i < bufferLength; ++i) { uint8Array[i] = buffer[i]; }
		return uint8Array.buffer;
	}

	getBufferPartial( buffer, from, length ) {
		const newBuffer = new Uint8Array(new ArrayBuffer(length));

		for (let i = 0; i < length; ++i) {
			let fromIndex = i + from;
			newBuffer[i] = buffer[fromIndex];
		}

		return newBuffer;
	}

	handleGain( data, shift, delta ) {

		let olddata = data;
		let raw = (data[0] << 8) | data[1];
		let val = (raw >> shift) & 0xFF;

		if (!val) // if val was 0 it is a good idea to leave val=0
			return val;

		if (delta) {
			val += delta;
		}

		val &= 255;

		raw &= ~(0xFF << shift);
		raw |= val << shift;

		data[0] = (raw >> 8);
		data[1] = (raw);

		return data;
	}

	doFrame( sibuf, gainchange ) {

		// const unsigned int CRClen[4] = { 72, 136, 136, 256 }; // number of protected bits
		// read sideinfo
		let maxgain;

		// maxgain = Math.max(
		// 	Math.max(
		// 		handlel3gain(getBufferPartial(sibuf, 9, 2), 7, gainchange[0]),  // 5
		// 		handlel3gain(getBufferPartial(sibuf, 16, 2), 4, gainchange[1])  // 12
		// 	),
		// 	Math.max(
		// 		handlel3gain(getBufferPartial(sibuf, 23, 2), 1, gainchange[0]), // 19
		// 		handlel3gain(getBufferPartial(sibuf, 31, 2), 6, gainchange[1])  // 27
		// 	)
		// );

		// updateCRC(CRClen[sitype]);

		let tmpBuf = new Uint8Array(2);

		tmpBuf = this.handleGain( this.getBufferPartial(sibuf, 9, 2), 7, gainchange[0] );
		sibuf[9] = tmpBuf[0];
		sibuf[10] = tmpBuf[1];

		tmpBuf = this.handleGain( this.getBufferPartial(sibuf, 16, 2), 4, gainchange[1] );
		sibuf[16] = tmpBuf[0];
		sibuf[17] = tmpBuf[1];

		tmpBuf = this.handleGain( this.getBufferPartial(sibuf, 23, 2), 1, gainchange[0] );
		sibuf[23] = tmpBuf[0];
		sibuf[24] = tmpBuf[1];

		tmpBuf = this.handleGain( this.getBufferPartial(sibuf, 31, 2), 6, gainchange[1] );
		sibuf[31] = tmpBuf[0];
		sibuf[32] = tmpBuf[1];

		return sibuf;
	}

	getFrameOffsetsBackwards() {
		let self = this;
		let framesToFade = this.framesToFade();
		let BreakException = {};

		let fileStat = fs.statSync( self.file );
		let fileSize = fileStat.size;
		let fileOffset = Math.max( fileSize - ( framesToFade * 768 ), 0 );

		// console.log(fileSize - ( framesToFade * 2048 ));

		return new Promise(function(resolve, reject) {
			self.readFile( true ).then( buffer => {
				let offsets = [];
				let frame = null;
				let readingFrames = true;
				let readingFramesIndex = 0;
				let readingFramesOffset = buffer.byteLength - 2;

				frame = mp3Parser.readFrameNear( buffer, fileOffset );
                                // console.log("DEBUG: frame = " + frame);
				readingFramesOffset = frame._section.nextFrameIndex;

				while( readingFramesOffset < fileSize ) {

					frame = mp3Parser.readFrame(buffer, readingFramesOffset);

					readingFramesOffset++;

					if ( frame ) {
						readingFramesOffset = frame._section.nextFrameIndex;

						// console.log("FRAME: " + frame);
						offsets.push( frame._section.offset );
						readingFramesIndex++;
					}
				}

				frame = mp3Parser.readFrame(buffer, offsets[ offsets.length -1 ]);

				// console.log(frame);
				// throw err;
				// console.log( offsets );
				// throw err;

				setTimeout( () => {
					resolve( offsets.slice( framesToFade * -1 ) );
				}, 1 );

				return;

				// while ( readingFrames ) {

				// 	frame = mp3Parser.readFrame(buffer, readingFramesOffset, true);
				// 	//console.log(readingFramesOffset);

				// 	if ( frame ) {

				// 		// console.log(frame);

				// 		offsets.push( fileOffset + frame._section.offset );
				// 		readingFramesOffset = fileOffset + frame._section.nextFrameIndex;
				// 		readingFramesIndex++;

				// 		if ( frame._section.nextFrameIndex === false ) {
				// 			// readingFrames = false;
				// 		}

				// 	} else {
				// 		readingFramesOffset++;
				// 		if ( readingFramesIndex > framesToFade || readingFramesOffset > fileSize ) {
				// 			readingFrames = false;
				// 		}
				// 	}
				// }

				// setTimeout( () => {
				// 	resolve( offsets.slice( framesToFade * -1 ) );
				// }, 1 );

			});
		});
	}

	fadeInOut() {
		let result = true;
		const self = this;

		return new Promise(function(resolve, reject) {
			self.readFile( true ).then( buffer => {

				// const buffer = new DataView(self.toArrayBuffer(data));
				const tags = mp3Parser.readTags(buffer);
				let readingFrames = true;
				let readingFramesIndex = 0;
				let readingFramesOffset;
				let gainchange = [ 0, 0 ];
				let lastFrame = mp3Parser.readLastFrame(buffer);

				let BreakException = {};

				// Find first real frame (that is not a Xing, ID3v2 etc)

				try {
					tags.forEach(frame => {
						if ( frame._section.type == 'frame' ) {
							readingFramesOffset = frame._section.offset;
							throw BreakException;
						}
					});
				} catch(e) {
					// throw e;
				}

				timeline('Fade in ...');


				// Fade in...

				while ( readingFrames ) {

					let frame = mp3Parser.readFrame( buffer, readingFramesOffset );

					if ( frame && frame._section.type == 'frame' ) {

						readingFramesIndex++;
						readingFramesOffset = frame._section.nextFrameIndex;

						let gainchangeVal = Math.round( readingFramesIndex > self.framesToFade() ? 0 : self.lowestVolume - ( easing(readingFramesIndex / self.framesToFade()) * self.lowestVolume) );
						let gainchange = [ gainchangeVal, gainchangeVal ];

						let frameData = new Uint8Array( buffer.buffer.slice( frame._section.offset, frame._section.offset + frame._section.byteLength ) );
						frameData = self.doFrame( frameData, gainchange );

						// console.log( 'Writing fade in data, offset ' + frame._section.offset );

						let fsWriteStream = fs.createWriteStream(self.file, {start: frame._section.offset, flags: 'r+'});
						fsWriteStream.write( frameData );
						fsWriteStream.end();

						// timeline('Fade in ... readingFramesIndex: ' + readingFramesIndex);

					}

					if ( ! frame || frame._section.offset == lastFrame._section.offset || readingFramesIndex > self.framesToFade() ) {
						readingFrames = false;
					}
				}


				// console.debug('fade out ...');
				timeline('Fade out ...');


				// Fade out...

				// readingFramesIndex = 0;
				// readingFramesOffset = 0;
				// readingFrames = true;

				let framesToFade = self.framesToFade();

				self.getFrameOffsetsBackwards( framesToFade ).then( offsets => {

					for( let i = 0; i< offsets.length; i++ ) {

						let frame = mp3Parser.readFrame( buffer, offsets[ i ], true );

						if ( frame ) {

							let gainchangeVal = Math.round( i > self.framesToFade() ? self.lowestVolume : self.lowestVolume - ( easing( ( self.framesToFade() - i + 1 ) / self.framesToFade() ) * self.lowestVolume) );
							let gainchange = [ gainchangeVal, gainchangeVal ];

							// console.log( 'Fading out frame at offset: ' + frame._section.offset + '' );

							let frameData = new Uint8Array( buffer.buffer.slice( frame._section.offset, frame._section.offset + frame._section.byteLength ) );
							frameData = self.doFrame( frameData, gainchange );

							let fsWriteStream = fs.createWriteStream(self.file, {start: frame._section.offset, flags: 'r+'});
							fsWriteStream.write( frameData );
							fsWriteStream.end();

							// timeline('Fade out ... readingFramesIndex: ' + i);

						}
					}

					// console.log( 'Fade out completed...' );
					timeline('Fade in/out done!');
					resolve( true );

				}).catch( () => {
					timeline( 'getFrameOffsets() failed!' );
				});

			});

			/*.catch( () => {
				console.log( 'readFile() failed!' );
			}); */
		});

		return result;
	}

	readFile( allowFromCache ) {
		// console.log('DEBUG: mp3editor readFile function');
		let self = this;

		return new Promise(function(resolve, reject) {

			fs.readFile(self.file, (error, data) => {
				if (error) {
					// console.log("readFile ERROR: " + error);
					reject( error );
				}

				const buffer = new DataView(self.toArrayBuffer(data));

				resolve( buffer ); // buffer
			})
		});
	}

	readFilePartial( start, end ) {
		// console.log('DEBUG: mp3editor readFilePartial function');
		let self = this;

		return new Promise(function(resolve, reject) {

			let chunks = [];
			const stream = fs.createReadStream( self.file, { start: start, end: end } );

			stream.on('data', (data) => {
				chunks.push( data );
				stream.destroy();
			});

			stream.on('close', () => {
				const buffer = new DataView( self.toArrayBuffer( Buffer.concat( chunks ) ) );
				resolve( buffer );
			});

		});
	}

	fixCRC_OLD() {
		// console.log('DEBUG: mp3editor fixCRC_OLD function');

		const self = this;

		// console.log("fix crcs ...");

		return new Promise(function(resolve, reject) {

			// Music CRC

			let musicCrcResolved = new Promise(function(musicCrcResolve, musicCrcReject) {
				self.readFile().then( buffer => {

					const BreakException = {};
					const tags = mp3Parser.readTags(buffer);
					const lastFrame = mp3Parser.readLastFrame(buffer);
					let xingFrame;

					// console.log(lastFrame);

					try {
						tags.forEach(frame => {
							if ( frame.identifier && frame.identifier == 'Xing' ) {
								xingFrame = frame;
								throw BreakException;
							}
						});
					} catch(e) {}

					const musicOffset = xingFrame._section.nextFrameIndex;
					const musicLength = lastFrame._section.offset + lastFrame._section.byteLength - xingFrame._section.offset - xingFrame._section.byteLength;

					console.log( util.format( "Music length: %i", musicLength ) );
					console.log( util.format( "Music offset: %i", musicOffset ) );

					let musicCrc = crc.crc16( buffer.buffer.slice( musicOffset, musicLength + musicOffset ) );
					let musicCrcData = new Uint8Array(2);
					musicCrcData[0] = musicCrc >> 8;
					musicCrcData[1] = musicCrc;

					let fsWriteStream = fs.createWriteStream(self.file, {start: xingFrame._section.offset + 188, flags: 'r+'});
					fsWriteStream.write( musicCrcData );
					fsWriteStream.end();

					// console.log( "Music CRC: " + musicCrc.toString(16) );

					musicCrcResolve( musicCrc.toString(16) );

				});
			});


			// Info tag CRC

			musicCrcResolved.then(function() {

				self.readFile().then( buffer => {

					const BreakException = {};
					const tags = mp3Parser.readTags(buffer);
					const lastFrame = mp3Parser.readLastFrame(buffer);
					let xingFrame;
					let fsWriteStream;

					try {
						tags.forEach(frame => {
							if ( frame.identifier && frame.identifier == 'Xing' ) {
								xingFrame = frame;
								throw BreakException;
							}
						});
					} catch(e) {}

					let infoCrc = crc.crc16( buffer.buffer.slice( xingFrame._section.offset, xingFrame._section.offset + 190 ) );
					let infoCrcData = new Uint8Array(2);
					infoCrcData[0] = infoCrc >> 8;
					infoCrcData[1] = infoCrc;

					// console.log( "Info CRC: " + infoCrc.toString(16) );

					fsWriteStream = fs.createWriteStream(self.file, {start: xingFrame._section.offset + 190, flags: 'r+'});
					fsWriteStream.write( infoCrcData );
					fsWriteStream.end();

					resolve( infoCrc.toString(16) );

					console.log('infoCrcResolved');

				});

			});

		});

	}


	fixCRC() {
		// console.log('DEBUG: mp3editor fixCRC function');

		const self = this;

		return new Promise(function(resolve, reject) {

			let musicCrc = self._fixMusicCRC();

			musicCrc.then((musicCrc) => {
				let infoCrc = self._fixInfoCRC();

				infoCrc.then((infoCrc) => {
					resolve({
						musicCrc: musicCrc,
						infoCrc: infoCrc
					});
				});
			});

		});

	}

	_getMusicCRC() {

		const self = this;

		return new Promise(function(resolve, reject) {

			// Music CRC

			// timeline('Reading file ...');
			// console.log('DEBUG: mp3editor reading file ...');
		
			self.readFile( false ).then( buffer => {

				// timeline('File read done ...');

				if ( ! buffer ) {
					reject( buffer );
				}

				const BreakException = {};
				const tags = mp3Parser.readTags(buffer);
				let lastFrame = mp3Parser.readLastFrame(buffer);
				let xingFrame;

				console.log(lastFrame);

				try {
					tags.forEach(frame => {
						if ( frame.identifier && frame.identifier == 'Xing' ) {
							xingFrame = frame;
							throw BreakException;
						}
					});
				} catch(e) {}

				let musicOffset = xingFrame._section.nextFrameIndex;
				let musicLength = lastFrame._section.offset + lastFrame._section.byteLength - xingFrame._section.offset - xingFrame._section.byteLength;

				// musicOffset = 576;
				// musicLength = lastFrame._section.offset + lastFrame._section.byteLength - musicOffset;

				//				timeline( util.format( "File size: %i", buffer.byteLength ) );
				//				timeline( util.format( "Music length: %i", musicLength ) );
				//				timeline( util.format( "Music offset: %i", musicOffset ) );

				/*
				console.log( util.format( "File size: %i", buffer.byteLength ) );
				console.log( util.format( "Music length: %i", musicLength ) );
				console.log( util.format( "Music offset: %i", musicOffset ) );
				*/

				// console.log( buffer.buffer.slice( musicOffset, musicLength + musicOffset ).byteLength );

				let musicCrc = crc.crc16( buffer.buffer.slice( musicOffset, musicLength + musicOffset ) );
				let musicCrcData = new Uint8Array(2);
				musicCrcData[0] = musicCrc >> 8;
				musicCrcData[1] = musicCrc;

				//				timeline( util.format( "Music CRC: %s", musicCrc.toString(16) ) );
                // console.log( util.format( "Music CRC: %s", musicCrc.toString(16) ) );

				resolve( musicCrc.toString(16) );

				// console.log( "Music CRC: " + musicCrc.toString(16) );

			});

		});
	}

	_getInfoCRC() {
		// console.log('DEBUG: mp3editor _getInfoCRC function');

		const self = this;

		// Info tag CRC

		return new Promise(function(resolve, reject) {

			self.readFilePartial(0, 4096).then( buffer => {

				if ( ! buffer ) {
					reject( buffer );
				}

				const BreakException = {};
				const tags = mp3Parser.readTags(buffer);
				// const lastFrame = mp3Parser.readLastFrame(buffer);
				let xingFrame;

				try {
					tags.forEach(frame => {
						if ( frame.identifier && frame.identifier == 'Xing' ) {
							xingFrame = frame;
							throw BreakException;
						}
					});
				} catch(e) {}

				let infoCrc = crc.crc16( buffer.buffer.slice( xingFrame._section.offset, xingFrame._section.offset + 190 ) );
				let infoCrcData = new Uint8Array(2);
				infoCrcData[0] = infoCrc >> 8;
				infoCrcData[1] = infoCrc;

				//				timeline( util.format( "Info CRC: %s", infoCrc.toString(16) ) );
				// console.log( util.format( "Info CRC: %s", infoCrc.toString(16) ) );

				resolve( infoCrc.toString(16) );

			});

		});

	}

	_fixMusicCRC() {
		// console.log('DEBUG: mp3editor _fixMusicCRC function');

		const self = this;

		return new Promise(function(resolve, reject) {

			// Music CRC
		
			self.readFile( false ).then( buffer => {

				if ( ! buffer ) {
					reject( buffer );
				}
				// console.log("DEBUG: mp3editor buffer = ")
				// console.log(buffer)

				const BreakException = {};
				const tags = mp3Parser.readTags(buffer);
				// console.log("DEBUG: mp3editor tags = ")
				// console.log(tags)
				const lastFrame = mp3Parser.readLastFrame(buffer);
				// console.log("DEBUG: mp3editor lastFrame= ")
				// console.log(lastFrame)
				let xingFrame;

				// console.log(lastFrame);

				try {
					tags.forEach(frame => {
						if ( frame.identifier && frame.identifier == 'Xing' ) {
							xingFrame = frame;
							throw BreakException;
						}
					});
				} catch(e) {}

				// console.log("DEBUG: mp3editor xingFrame = ")
				// console.log(xingFrame)
				//if (!xingFrame) { 
				//   console.error("DEBUG: mp3editor ERROR - No xingFrame?")
				//   return
				//}
				const musicOffset = xingFrame._section.nextFrameIndex;
				const musicLength = lastFrame._section.offset + lastFrame._section.byteLength - xingFrame._section.offset - xingFrame._section.byteLength;

				//				timeline( util.format( "Music length: %i", musicLength ) );
				//				timeline( util.format( "Music offset: %i", musicOffset ) );
				// console.log ( "Music length: %i", musicLength )
				// console.log ( "Music offset: %i", musicOffset )

				let musicCrc = crc.crc16( buffer.buffer.slice( musicOffset, musicLength + musicOffset ) );
				let musicCrcData = new Uint8Array(2);
				musicCrcData[0] = musicCrc >> 8;
				musicCrcData[1] = musicCrc;

				let fsWriteStream = fs.createWriteStream(self.file, {start: xingFrame._section.offset + 188, flags: 'r+'});
				fsWriteStream.write( musicCrcData );
				fsWriteStream.end();

				fsWriteStream.on('finish', () => {
					resolve( musicCrc.toString(16) );					
				})

				// console.log( "Music CRC: " + musicCrc.toString(16) );

			});

		});
	}

	_fixInfoCRC() {
		//console.log('DEBUG: mp3editor _fixInfoCRC function');

		const self = this;

		// Info tag CRC

		return new Promise(function(resolve, reject) {

			self.readFilePartial(0, 4096).then( buffer => {

				if ( ! buffer ) {
					reject( buffer );
				}

				const BreakException = {};
				const tags = mp3Parser.readTags(buffer);
				// const lastFrame = mp3Parser.readLastFrame(buffer);
				let xingFrame;

				try {
					tags.forEach(frame => {
						if ( frame.identifier && frame.identifier == 'Xing' ) {
							xingFrame = frame;
							throw BreakException;
						}
					});
				} catch(e) {}

				// console.debug("DEBUG: mp3editor _fixInfoCRC xingFrame = ")
				// console.debug(xingFrame)
				//if (!xingFrame) { 
				//   console.error("DEBUG: mp3editor ERROR - No xingFrame?")
				//   return
				//}
				let infoCrc = crc.crc16( buffer.buffer.slice( xingFrame._section.offset, xingFrame._section.offset + 190 ) );
				let infoCrcData = new Uint8Array(2);
				infoCrcData[0] = infoCrc >> 8;
				infoCrcData[1] = infoCrc;

				let fsWriteStream = fs.createWriteStream(self.file, {start: xingFrame._section.offset + 190, flags: 'r+'});
				fsWriteStream.write( infoCrcData );
				fsWriteStream.end();

				fsWriteStream.on('finish', () => {
					resolve( infoCrc.toString(16) );
				});

			});

			// self.readFile( true ).then( buffer => {

			// 	if ( ! buffer ) {
			// 		reject( buffer );
			// 	}

			// 	const BreakException = {};
			// 	const tags = mp3Parser.readTags(buffer);
			// 	const lastFrame = mp3Parser.readLastFrame(buffer);
			// 	let xingFrame;

			// 	try {
			// 		tags.forEach(frame => {
			// 			if ( frame.identifier && frame.identifier == 'Xing' ) {
			// 				xingFrame = frame;
			// 				throw BreakException;
			// 			}
			// 		});
			// 	} catch(e) {}

			// 	let infoCrc = crc.crc16( buffer.buffer.slice( xingFrame._section.offset, xingFrame._section.offset + 190 ) );
			// 	let infoCrcData = new Uint8Array(2);
			// 	infoCrcData[0] = infoCrc >> 8;
			// 	infoCrcData[1] = infoCrc;

			// 	let fsWriteStream = fs.createWriteStream(self.file, {start: xingFrame._section.offset + 190, flags: 'r+'});
			// 	fsWriteStream.write( infoCrcData );
			// 	fsWriteStream.end();

			// 	fsWriteStream.on('finish', () => {
			// 		resolve( infoCrc.toString(16) );
			// 	});

			// 	// console.log( "Info CRC: " + infoCrc.toString(16) );

			// });

		});

	}
}

module.exports = Mp3Editor;
