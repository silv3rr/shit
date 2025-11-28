const fs = require('fs');
const path = require('path');
const util = require("util");
const Iconv = require('iconv').Iconv;
// const polycrc = require('polycrc');
const crc32 = require('js-crc').crc32;
//const CRC32 = require('crc32');
const mp3duration = require('get-mp3-duration');
//const { time } = require('console');
//const timeline = require('timeline');
//Timeline = require('timeline')

class Mp3Releaser {
	constructor(folder, file, tags) {
		this.folder = folder; // release folder
		this.file = file; // mp3 file
		this.fileDuration = []; // mp3 file's play length (seconds), where key = file Path
		this.artist = tags.artist; // ID3 tag value(s):
		this.title = tags.title;
		//this.album = tags.album;
		this.album = tags.title;
		this.year = tags.year || new Date().getFullYear();
		this.genre = tags.genre;
		this.separator = ' - ';
		//this.append = '-MyGROUP';
		//this.source = 'Radio';
		//this.comment = 'A Comment!';
		//this.notes = tags.notes || 'Notes!';

		// console.log(arguments);

		this._createIfNotExists( folder );
	}

	static formatFolder( artist, title ) {
		return new String( artist + '_-_' + title + this.append ).normalize('NFD').replace(/[\u0300-\u036f]/g, "").split(' ').join('_');
	}

	static formatFilename( artist, title, track ) {
		let number = new String(track || 1).padStart(2, 0);

		//return new String( number + '-' + artist + ' - ' + title + this.append + '.mp3' ).normalize('NFD').replace(/[\u0300-\u036f]/g, "").split(' ').join('_').toLowerCase();
		return new String( number + '-' + this.getFolderName() ).toLowerCase()
	}

	createRelease() {

		return Promise.all([
			this._createSfv(),
			this._createNfo(),
			//this._createM3u()
		]).then(() => {
			return this;
		});
	}

	getFolderName() {
		return path.basename( this.folder );
	}

	setFileDuration( file, duration ) {
		this.fileDuration[ file ] = duration;
	}

	getFiles() {
		// Return all files inside a release
		let files = fs.readdirSync( this.folder );

		let regex = new RegExp([ '^(desktop\\.ini|\\.DS_Store)$' ].join('|'));
		files = files.filter(function(filename) {
			return !regex.test(filename);
		});

		for( let i = 0; i< files.length; i++ ) {
			files[i] = util.format( '%s/%s', this.folder, files[i] );
		}

		return files;
	}

	getAudioFiles() {
		// Just the one for now, okay?
		return [ this.file ];
	}

	_createIfNotExists( dir ) {
		if ( ! fs.existsSync( dir ) ) {
			fs.mkdirSync( dir );
		}
	}

	_formatFileName( ext, num ) {
		if ( ! ext ) {
			return null;
		}

		let number = new String(num || 0).padStart(2, 0);
		//return new String( this._removeSpecialChars( number + '-' + this.artist + this.separator + this.album + '-' + this.year + this.append + '.' + ext ) ).toLowerCase();
		//return new String( this._removeSpecialChars( number + '-' + this.artist + this.separator + this.album + this.append + '.' + ext ) ).toLowerCase();
		return new String( this._removeSpecialChars( number + '-' + this.getFolderName() + '.' + ext ) ).toLowerCase();
	}

	_removeSpecialChars( string ) {
		return string.normalize('NFD').replace(/[\u0300-\u036f]/g, "").split(' ').join('_');
	}

	_createNfo() {
		const self = this;

		return new Promise(function(resolve, reject) {

			let data = fs.readFileSync( 'generic.skl' );

			if ( ! data ) {
				timeline( 'ERROR: Could not read generic.skl skeleton file!' );
				console.log( 'ERROR: Could not read generic.skl skeleton file!' );
				return false;
			}

			let iconv = new Iconv( 'CP437', 'UTF-8' ); // CP-437
			data = iconv.convert( data );
			let strNfo = data.toString('UTF-8');
			let strTrkPad = strNfo.match( /#Trk\s+/ ).toString();
			let strSize;
			let strPtit;
			let intSize = 0;

			// The date of today for now, ok?
			let strRdate = `${new Date().toLocaleString('en-us', { month: 'short' })}-${new Date().toLocaleString('en-us', { day: '2-digit' })}-${new Date().getFullYear()}`; // 'Mar-04-2019';
			let strSdate = `${new Date().toLocaleString('en-us', { month: 'short' })}-${new Date().toLocaleString('en-us', { day: '2-digit' })}-${new Date().getFullYear()}`; // 'Mar-04-2019';


			// Supports one mp3 file only, for now... time is crucial, you know!

			self.getAudioFiles().forEach( file => {

				let fileStat = fs.statSync( file );
				intSize = fileStat.size;
				strSize = (intSize / 1024 / 1024).toFixed(1).toString() + ' MB';

				if ( self.fileDuration[ file ] ) {
					intSize = self.fileDuration[ file ] * 1000;
				} else {
					let fileBuffer = fs.readFileSync( file );
					intSize = mp3duration( fileBuffer );
				}

			});

			//let strCpti = strPtit = `${Math.floor(intSize / 1000 / 60)}:${Math.floor((intSize / 1000) % 60)}`;
			const pz = function (n) { return ('00'+n).slice(-2) }
			let strCpti = strPtit = `${pz(Math.floor(intSize / 1000 / 60))}:${pz(Math.floor((intSize / 1000) % 60))}`;
			// Replace common data
			strNfo = strNfo.replace( '#Artist', self.artist );
			strNfo = strNfo.replace( '#Album', self.album );
			strNfo = strNfo.replace( '#Title', self.title );
			strNfo = strNfo.replace( '#Genre', self.genre );
			strNfo = strNfo.replace( '#Source', self.source );
			strNfo = strNfo.replace( '#Rdate', strRdate );
			strNfo = strNfo.replace( '#Sdate', strSdate );
			strNfo = strNfo.replace( '#Tn', new String( self.getAudioFiles().length ).padStart(2, '0') );
			strNfo = strNfo.replace( '#Cpti', strCpti );
			strNfo = strNfo.replace( '#Br', 'VBR' ); // All we use anyways..
			strNfo = strNfo.replace( '#Size', strSize );
			strNfo = strNfo.replace( '#Rnotes', self.notes );

			// Track (in our case, there is only one..)
			strNfo = strNfo.replace( '#N', new String( '1' ).padStart(2, '0') );
			strNfo = strNfo.replace( /#Trk\s+/, new String( self.title ).padEnd( strTrkPad.length, ' ' ).substring(0, strTrkPad.length-1) + ' ' );
			strNfo = strNfo.replace( '#Ptit', strPtit );
			strNfo = strNfo.replace( '#Tptit', ' ' + strPtit );


			// Remove trailing spaces on each line
			strNfo = strNfo.split('\r');

			for( let i=0; i< strNfo.length; i++ ) {
				strNfo[ i ] = strNfo[ i ].replace( /\s+$/, '' );
			}

			strNfo = strNfo.join('\r');

			let iconvEnc = new Iconv( 'utf-8', 'CP437' );
			let buffNfo = iconvEnc.convert( strNfo );

			fs.writeFileSync( self.folder + '/' + self._formatFileName( 'nfo' ), buffNfo );

			//timeline( 'nfo file DONE...' );
			console.log( getDateTime(), 'DEBUG: Mp3Releaser - nfo file DONE...' );

			resolve();
		});
	}

	_createSfv() {
		const self = this;

		return new Promise(function(resolve, reject) {
			let lines = [];

			self.getAudioFiles().forEach( file => {
				 // console.log(file);

				// 'node-crc/crc/crc32'
				//let crc = new CRC32( file );
				//lines.push( `${path.basename( file )} ${crc.code}` );
				//timeline( `CRC32: ${crc.code}` );
				//console.log( `CRC32: ${crc.code}` );

				// 'node-crc/crc/crc32'
				// const buffer = fs.readFileSync( file );
				// let crc = crc32( buffer ).toString(16);
				// lines.push( `${path.basename( file )} ${crc}` );
				// console.log( `CRC32: ${crc}` );

				// 'js-crc'
				// setTimeout( function() {
				// 	const buffer = fs.readFileSync( file );
				// 	let crc = crc32( buffer ).toString(16);
				// 	console.log( `CRC32 delayed: ${crc}` );
				// }, 2000);

				// 'js-crc'
				let crc = crc32(fs.readFileSync(file)).toString(16)
				lines.push( `${path.basename(file)} ${crc}` );
				//timeline( `CRC32: ${crc}` );
				console.log( `${getDateTime()} Mp3Releaser: CRC32: ${crc}` );
			});

			fs.writeFileSync( self.folder + '/' + self._formatFileName( 'sfv' ), lines.join("\r\n") );

			//timeline( 'sfv file DONE...' );
			console.log( getDateTime(), 'DEBUG: Mp3Releaser - sfv file DONE...' );
			resolve();
		});
	}

	_createM3u() {
		const self = this;

		return new Promise(function(resolve, reject) {
			self.getAudioFiles().forEach( file => {
				let strM3u = `${path.basename(file)}`;
				fs.writeFileSync( self.folder + '/' + self._formatFileName( 'm3u' ), strM3u );
			});

			//timeline( 'm3u file DONE...' );
			console.log( getDateTime(), 'DEBUG: Mp3Releaser - m3u file DONE...' );
			resolve();
		});
	}
}

// date and time used for logging: dd mmm hh:mm:ss
function getDateTime() {
	let date = new Date();
	let hour = date.getHours();
	hour = (hour < 10 ? "0" : "") + hour;
	let min  = date.getMinutes();
	min = (min < 10 ? "0" : "") + min;
	let sec  = date.getSeconds();
	sec = (sec < 10 ? "0" : "") + sec;
	let m = [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ]
	let mname = m[date.getMonth()];
	let day  = date.getDate();
	return day + " " + mname + " " + hour + ":" + min + ":" + sec;
}

//Mp3Releaser.append = '-GRP';

module.exports = Mp3Releaser;
