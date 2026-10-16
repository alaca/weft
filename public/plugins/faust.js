//#region node_modules/@grame/faustwasm/dist/src/FaustSensors.js
/** Enum describing the axis of the accelerometer or gyroscope */
var Axis;
(function(Axis) {
	Axis[Axis["x"] = 0] = "x";
	Axis[Axis["y"] = 1] = "y";
	Axis[Axis["z"] = 2] = "z";
})(Axis || (Axis = {}));
/** Enum describing the curve of the accelerometer */
var Curve;
(function(Curve) {
	Curve[Curve["Up"] = 0] = "Up";
	Curve[Curve["Down"] = 1] = "Down";
	Curve[Curve["UpDown"] = 2] = "UpDown";
	Curve[Curve["DownUp"] = 3] = "DownUp";
})(Curve || (Curve = {}));
var FaustSensors = class FaustSensors {
	/**
	* Function to convert a number to an axis type
	*
	* @param value number
	* @returns axis type
	*/
	static convertToAxis(value) {
		switch (value) {
			case 0: return Axis.x;
			case 1: return Axis.y;
			case 2: return Axis.z;
			default:
				console.error("Error: Axis not found value: " + value);
				return Axis.x;
		}
	}
	/**
	* Function to convert a number to a curve type
	*
	* @param value number
	* @returns curve type
	*/
	static convertToCurve(value) {
		switch (value) {
			case 0: return Curve.Up;
			case 1: return Curve.Down;
			case 2: return Curve.UpDown;
			case 3: return Curve.DownUp;
			default:
				console.error("Error: Curve not found value: " + value);
				return Curve.Up;
		}
	}
	static get Range() {
		if (!this._Range) this._Range = class {
			constructor(x, y) {
				this.fLo = Math.min(x, y);
				this.fHi = Math.max(x, y);
			}
			clip(x) {
				if (x < this.fLo) return this.fLo;
				if (x > this.fHi) return this.fHi;
				return x;
			}
		};
		return this._Range;
	}
	/**
	* Interpolator class
	*/
	static get Interpolator() {
		if (!this._Interpolator) this._Interpolator = class {
			constructor(lo, hi, v1, v2) {
				this.fRange = new FaustSensors.Range(lo, hi);
				if (hi !== lo) {
					this.fCoef = (v2 - v1) / (hi - lo);
					this.fOffset = v1 - lo * this.fCoef;
				} else {
					this.fCoef = 0;
					this.fOffset = (v1 + v2) / 2;
				}
			}
			returnMappedValue(v) {
				const x = this.fRange.clip(v);
				return this.fOffset + x * this.fCoef;
			}
			getLowHigh(amin, amax) {
				return {
					amin: this.fRange.fLo,
					amax: this.fRange.fHi
				};
			}
		};
		return this._Interpolator;
	}
	/**
	* Interpolator3pt class, combine two interpolators
	*/
	static get Interpolator3pt() {
		if (!this._Interpolator3pt) this._Interpolator3pt = class {
			constructor(lo, mid, hi, v1, vMid, v2) {
				this.fSegment1 = new FaustSensors.Interpolator(lo, mid, v1, vMid);
				this.fSegment2 = new FaustSensors.Interpolator(mid, hi, vMid, v2);
				this.fMid = mid;
			}
			returnMappedValue(x) {
				return x < this.fMid ? this.fSegment1.returnMappedValue(x) : this.fSegment2.returnMappedValue(x);
			}
			getMappingValues(amin, amid, amax) {
				const lowHighSegment1 = this.fSegment1.getLowHigh(amin, amid);
				const lowHighSegment2 = this.fSegment2.getLowHigh(amid, amax);
				return {
					amin: lowHighSegment1.amin,
					amid: lowHighSegment2.amin,
					amax: lowHighSegment2.amax
				};
			}
		};
		return this._Interpolator3pt;
	}
	/**
	* UpConverter class, convert accelerometer value to Faust value
	*/
	static get UpConverter() {
		if (!this._UpConverter) this._UpConverter = class {
			constructor(amin, amid, amax, fmin, fmid, fmax) {
				this.fActive = true;
				this.fA2F = new FaustSensors.Interpolator3pt(amin, amid, amax, fmin, fmid, fmax);
				this.fF2A = new FaustSensors.Interpolator3pt(fmin, fmid, fmax, amin, amid, amax);
			}
			uiToFaust(x) {
				return this.fA2F.returnMappedValue(x);
			}
			faustToUi(x) {
				return this.fF2A.returnMappedValue(x);
			}
			setMappingValues(amin, amid, amax, min, init, max) {
				this.fA2F = new FaustSensors.Interpolator3pt(amin, amid, amax, min, init, max);
				this.fF2A = new FaustSensors.Interpolator3pt(min, init, max, amin, amid, amax);
			}
			getMappingValues(amin, amid, amax) {
				return this.fA2F.getMappingValues(amin, amid, amax);
			}
			setActive(onOff) {
				this.fActive = onOff;
			}
			getActive() {
				return this.fActive;
			}
		};
		return this._UpConverter;
	}
	/**
	* DownConverter class, convert accelerometer value to Faust value
	*/
	static get DownConverter() {
		if (!this._DownConverter) this._DownConverter = class {
			constructor(amin, amid, amax, fmin, fmid, fmax) {
				this.fActive = true;
				this.fA2F = new FaustSensors.Interpolator3pt(amin, amid, amax, fmax, fmid, fmin);
				this.fF2A = new FaustSensors.Interpolator3pt(fmin, fmid, fmax, amax, amid, amin);
			}
			uiToFaust(x) {
				return this.fA2F.returnMappedValue(x);
			}
			faustToUi(x) {
				return this.fF2A.returnMappedValue(x);
			}
			setMappingValues(amin, amid, amax, min, init, max) {
				this.fA2F = new FaustSensors.Interpolator3pt(amin, amid, amax, max, init, min);
				this.fF2A = new FaustSensors.Interpolator3pt(min, init, max, amax, amid, amin);
			}
			getMappingValues(amin, amid, amax) {
				return this.fA2F.getMappingValues(amin, amid, amax);
			}
			setActive(onOff) {
				this.fActive = onOff;
			}
			getActive() {
				return this.fActive;
			}
		};
		return this._DownConverter;
	}
	/**
	* UpDownConverter class, convert accelerometer value to Faust value
	*/
	static get UpDownConverter() {
		if (!this._UpDownConverter) this._UpDownConverter = class {
			constructor(amin, amid, amax, fmin, fmid, fmax) {
				this.fActive = true;
				this.fA2F = new FaustSensors.Interpolator3pt(amin, amid, amax, fmin, fmax, fmin);
				this.fF2A = new FaustSensors.Interpolator(fmin, fmax, amin, amax);
			}
			uiToFaust(x) {
				return this.fA2F.returnMappedValue(x);
			}
			faustToUi(x) {
				return this.fF2A.returnMappedValue(x);
			}
			setMappingValues(amin, amid, amax, min, init, max) {
				this.fA2F = new FaustSensors.Interpolator3pt(amin, amid, amax, min, max, min);
				this.fF2A = new FaustSensors.Interpolator(min, max, amin, amax);
			}
			getMappingValues(amin, amid, amax) {
				return this.fA2F.getMappingValues(amin, amid, amax);
			}
			setActive(onOff) {
				this.fActive = onOff;
			}
			getActive() {
				return this.fActive;
			}
		};
		return this._UpDownConverter;
	}
	static get DownUpConverter() {
		if (!this._DownUpConverter) this._DownUpConverter = class {
			constructor(amin, amid, amax, fmin, fmid, fmax) {
				this.fActive = true;
				this.fA2F = new FaustSensors.Interpolator3pt(amin, amid, amax, fmax, fmin, fmax);
				this.fF2A = new FaustSensors.Interpolator(fmin, fmax, amin, amax);
			}
			uiToFaust(x) {
				return this.fA2F.returnMappedValue(x);
			}
			faustToUi(x) {
				return this.fF2A.returnMappedValue(x);
			}
			setMappingValues(amin, amid, amax, min, init, max) {
				this.fA2F = new FaustSensors.Interpolator3pt(amin, amid, amax, max, min, max);
				this.fF2A = new FaustSensors.Interpolator(min, max, amin, amax);
			}
			getMappingValues(amin, amid, amax) {
				return this.fA2F.getMappingValues(amin, amid, amax);
			}
			setActive(onOff) {
				this.fActive = onOff;
			}
			getActive() {
				return this.fActive;
			}
		};
		return this._DownUpConverter;
	}
	/**
	* Public function to build the accelerometer handler
	*
	* @returns `UpdatableValueConverter` built for the given curve
	*/
	static buildHandler(curve, amin, amid, amax, min, init, max) {
		switch (curve) {
			case Curve.Up: return new FaustSensors.UpConverter(amin, amid, amax, min, init, max);
			case Curve.Down: return new FaustSensors.DownConverter(amin, amid, amax, min, init, max);
			case Curve.UpDown: return new FaustSensors.UpDownConverter(amin, amid, amax, min, init, max);
			case Curve.DownUp: return new FaustSensors.DownUpConverter(amin, amid, amax, min, init, max);
			default: return new FaustSensors.UpConverter(amin, amid, amax, min, init, max);
		}
	}
};
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/FaustWebAudioDsp.js
/**
* WasmAllocator is a basic memory management class designed to allocate
* blocks of memory within a WebAssembly.Memory object. It provides a simple
* alloc method to allocate a contiguous block of memory of a specified size.
*
* The allocator operates by keeping a linear progression through the memory,
* always allocating the next block at the end of the last. This approach does not
* handle freeing of memory or reuse of memory spaces.
*/
var WasmAllocator = class {
	constructor(memory, offset) {
		this.memory = memory;
		this.allocatedBytes = offset;
	}
	/**
	* Allocates a block of memory of the specified size, returning the pointer to the
	* beginning of the block. The block is allocated at the current offset and the
	* offset is incremented by the size of the block.
	*
	* @param sizeInBytes The size of the block to allocate in bytes.
	* @returns The offset (pointer) to the beginning of the allocated block.
	*/
	alloc(sizeInBytes) {
		const currentOffset = this.allocatedBytes;
		const newOffset = currentOffset + sizeInBytes;
		const totalMemoryBytes = this.memory.buffer.byteLength;
		if (newOffset > totalMemoryBytes) {
			const neededPages = Math.ceil((newOffset - totalMemoryBytes) / 65536);
			console.log(`GROW: ${neededPages} pages`);
			this.memory.grow(neededPages);
		}
		this.allocatedBytes = newOffset;
		return currentOffset;
	}
	/**
	* Returns the underlying buffer object.
	*
	* @returns The buffer object.
	*/
	getBuffer() {
		return this.memory.buffer;
	}
	/**
	* Returns the Int32 view of the underlying buffer object.
	*
	* @returns The view of the memory buffer as Int32Array.
	*/
	getInt32Array() {
		return new Int32Array(this.memory.buffer);
	}
	/**
	* Returns the Int64 view of the underlying buffer object.
	*
	* @returns The view of the memory buffer as BigInt64Array.
	*/
	getInt64Array() {
		return new BigInt64Array(this.memory.buffer);
	}
	/**
	* Returns the Float32 view of the underlying buffer object.
	*
	* @returns The view of the memory buffer as Float32Array.
	*/
	getFloat32Array() {
		return new Float32Array(this.memory.buffer);
	}
	/**
	* Returns the Float64 view of the underlying buffer object..
	*
	* @returns The view of the memory buffer as Float64Array.
	*/
	getFloat64Array() {
		return new Float64Array(this.memory.buffer);
	}
};
/**
* Soundfile class to handle soundfile data in wasm memory.
*/
var Soundfile = class Soundfile {
	/** Maximum number of soundfile parts. */
	static get MAX_SOUNDFILE_PARTS() {
		return 256;
	}
	/** Maximum number of channels. */
	static get MAX_CHAN() {
		return 64;
	}
	/** Maximum buffer size in frames. */
	static get BUFFER_SIZE() {
		return 1024;
	}
	/** Default sample rate. */
	static get SAMPLE_RATE() {
		return 44100;
	}
	constructor(allocator, sampleSize, curChan, length, maxChan, totalParts) {
		this.fSampleSize = sampleSize;
		this.fIntSize = this.fSampleSize;
		this.fPtrSize = 4;
		this.fAllocator = allocator;
		console.log(`Soundfile constructor: curChan: ${curChan}, length: ${length}, maxChan: ${maxChan}, totalParts: ${totalParts}`);
		this.fPtr = allocator.alloc(4 * this.fPtrSize);
		this.fLength = allocator.alloc(Soundfile.MAX_SOUNDFILE_PARTS * this.fIntSize);
		this.fSR = allocator.alloc(Soundfile.MAX_SOUNDFILE_PARTS * this.fIntSize);
		this.fOffset = allocator.alloc(Soundfile.MAX_SOUNDFILE_PARTS * this.fIntSize);
		this.fBuffers = this.allocBuffers(curChan, length, maxChan);
		const HEAP32 = this.fAllocator.getInt32Array();
		HEAP32[this.fPtr >> 2] = this.fBuffers;
		HEAP32[this.fPtr + this.fPtrSize >> 2] = this.fLength;
		HEAP32[this.fPtr + 2 * this.fPtrSize >> 2] = this.fSR;
		HEAP32[this.fPtr + 3 * this.fPtrSize >> 2] = this.fOffset;
		for (let chan = 0; chan < curChan; chan++) {
			const buffer = HEAP32[(this.fBuffers >> 2) + chan];
			console.log(`allocBuffers AFTER: ${chan} - ${buffer}`);
		}
	}
	allocBuffers(curChan, length, maxChan) {
		const buffers = this.fAllocator.alloc(maxChan * this.fPtrSize);
		console.log(`allocBuffers buffers: ${buffers}`);
		for (let chan = 0; chan < curChan; chan++) {
			const buffer = this.fAllocator.alloc(length * this.fSampleSize);
			const HEAP32 = this.fAllocator.getInt32Array();
			HEAP32[(buffers >> 2) + chan] = buffer;
		}
		return buffers;
	}
	shareBuffers(curChan, maxChan) {
		const HEAP32 = this.fAllocator.getInt32Array();
		for (let chan = curChan; chan < maxChan; chan++) HEAP32[(this.fBuffers >> 2) + chan] = HEAP32[(this.fBuffers >> 2) + chan % curChan];
	}
	copyToOut(part, maxChannels, offset, audioData) {
		if (this.fIntSize === 4) {
			const HEAP32 = this.fAllocator.getInt32Array();
			HEAP32[(this.fLength >> Math.log2(this.fIntSize)) + part] = audioData.audioBuffer[0].length;
			HEAP32[(this.fSR >> Math.log2(this.fIntSize)) + part] = audioData.sampleRate;
			HEAP32[(this.fOffset >> Math.log2(this.fIntSize)) + part] = offset;
		} else {
			const HEAP64 = this.fAllocator.getInt64Array();
			HEAP64[(this.fLength >> Math.log2(this.fIntSize)) + part] = BigInt(audioData.audioBuffer[0].length);
			HEAP64[(this.fSR >> Math.log2(this.fIntSize)) + part] = BigInt(audioData.sampleRate);
			HEAP64[(this.fOffset >> Math.log2(this.fIntSize)) + part] = BigInt(offset);
		}
		console.log(`copyToOut: part: ${part}, maxChannels: ${maxChannels}, offset: ${offset}, buffer: ${audioData}`);
		if (this.fSampleSize === 8) this.copyToOutReal64(maxChannels, offset, audioData);
		else this.copyToOutReal32(maxChannels, offset, audioData);
	}
	copyToOutReal32(maxChannels, offset, audioData) {
		const HEAP32 = this.fAllocator.getInt32Array();
		const HEAPF = this.fAllocator.getFloat32Array();
		for (let chan = 0; chan < audioData.audioBuffer.length; chan++) {
			const input = audioData.audioBuffer[chan];
			const output = HEAP32[(this.fBuffers >> 2) + chan];
			const begin = output + offset * this.fSampleSize >> Math.log2(this.fSampleSize);
			const end = output + (offset + input.length) * this.fSampleSize >> Math.log2(this.fSampleSize);
			console.log(`copyToOutReal32 begin: ${begin}, end: ${end}, delta: ${end - begin}`);
			const outputReal = HEAPF.subarray(output + offset * this.fSampleSize >> Math.log2(this.fSampleSize), output + (offset + input.length) * this.fSampleSize >> Math.log2(this.fSampleSize));
			for (let sample = 0; sample < input.length; sample++) outputReal[sample] = input[sample];
		}
	}
	copyToOutReal64(maxChannels, offset, audioData) {
		const HEAP32 = this.fAllocator.getInt32Array();
		const HEAPF = this.fAllocator.getFloat64Array();
		for (let chan = 0; chan < audioData.audioBuffer.length; chan++) {
			const input = audioData.audioBuffer[chan];
			const output = HEAP32[(this.fBuffers >> 2) + chan];
			const begin = output + offset * this.fSampleSize >> Math.log2(this.fSampleSize);
			const end = output + (offset + input.length) * this.fSampleSize >> Math.log2(this.fSampleSize);
			console.log(`copyToOutReal64 begin: ${begin}, end: ${end}, delta: ${end - begin}`);
			const outputReal = HEAPF.subarray(output + offset * this.fSampleSize >> Math.log2(this.fSampleSize), output + (offset + input.length) * this.fSampleSize >> Math.log2(this.fSampleSize));
			for (let sample = 0; sample < input.length; sample++) outputReal[sample] = input[sample];
		}
	}
	emptyFile(part, offset) {
		if (this.fIntSize === 4) {
			const HEAP32 = this.fAllocator.getInt32Array();
			HEAP32[(this.fLength >> Math.log2(this.fIntSize)) + part] = Soundfile.BUFFER_SIZE;
			HEAP32[(this.fSR >> Math.log2(this.fIntSize)) + part] = Soundfile.SAMPLE_RATE;
			HEAP32[(this.fOffset >> Math.log2(this.fIntSize)) + part] = offset;
		} else {
			const HEAP64 = this.fAllocator.getInt64Array();
			HEAP64[(this.fLength >> Math.log2(this.fIntSize)) + part] = BigInt(Soundfile.BUFFER_SIZE);
			HEAP64[(this.fSR >> Math.log2(this.fIntSize)) + part] = BigInt(Soundfile.SAMPLE_RATE);
			HEAP64[(this.fOffset >> Math.log2(this.fIntSize)) + part] = BigInt(offset);
		}
		return offset + Soundfile.BUFFER_SIZE;
	}
	displayMemory(where = "", mem = false) {
		console.log("Soundfile memory: " + where);
		console.log(`fPtr: ${this.fPtr}`);
		console.log(`fBuffers: ${this.fBuffers}`);
		console.log(`fLength: ${this.fLength}`);
		console.log(`fSR: ${this.fSR}`);
		console.log(`fOffset: ${this.fOffset}`);
		const HEAP32 = this.fAllocator.getInt32Array();
		if (mem) console.log(`HEAP32: ${HEAP32}`);
		console.log(`HEAP32[this.fPtr >> 2]: ${HEAP32[this.fPtr >> 2]}`);
		console.log(`HEAP32[(this.fPtr + ptrSize) >> 2]: ${HEAP32[this.fPtr + this.fPtrSize >> 2]}`);
		console.log(`HEAP32[(this.fPtr + 2 * ptrSize) >> 2]: ${HEAP32[this.fPtr + 2 * this.fPtrSize >> 2]}`);
		console.log(`HEAP32[(this.fPtr + 3 * ptrSize) >> 2]: ${HEAP32[this.fPtr + 3 * this.fPtrSize >> 2]}`);
	}
	getPtr() {
		return this.fPtr;
	}
	getHEAP32() {
		return this.fAllocator.getInt32Array();
	}
	getHEAPFloat32() {
		return this.fAllocator.getFloat32Array();
	}
	getHEAPFloat64() {
		return this.fAllocator.getFloat64Array();
	}
};
var FaustBaseWebAudioDsp = class FaustBaseWebAudioDsp {
	/**
	* Report a parameter path that is in no control's alias list.
	*
	* Silence here is expensive: the path is a typo, or one kept from an
	* older version of the DSP, and without a word the control simply does
	* nothing while the caller believes it worked. But this can be reached
	* from the audio thread, at the rate a host moves a slider, so each path
	* is reported once and then let through quietly.
	*
	* @param path - the path that was not found
	* @param action - what was done instead
	*/
	warnUnknownPath(path, action) {
		if (this.fUnknownPaths.has(path)) return;
		this.fUnknownPaths.add(path);
		console.warn(`Faust: unknown parameter path "${path}", ${action}. Use getParams() for the list of valid paths.`);
	}
	constructor(sampleSize, bufferSize, soundfiles) {
		this.fOutputHandler = null;
		this.fInputHandler = null;
		this.fComputeHandler = null;
		this.fPlotHandler = null;
		this.fCachedEvents = [];
		this.fBufferNum = 0;
		this.fInChannels = [];
		this.fOutChannels = [];
		this.fOutputsTimer = 5;
		this.fInputsItems = [];
		this.fOutputsItems = [];
		this.fDescriptor = [];
		this.fSoundfiles = [];
		this.fSoundfileBuffers = {};
		/**
		* Block-start address of every wasm audio channel, plus the heap view
		* holding the pointer tables.
		*
		* Rendering a slice means giving wasm a channel pointer to the slice's
		* first frame, so `setBufferOffset` rewrites the tables and needs these
		* unmoved addresses to offset from. Only the tables move; the
		* `fInChannels` / `fOutChannels` views from `initMemory` still span the
		* whole block and stay valid.
		*/
		this.fInBase = [];
		this.fOutBase = [];
		this.fPitchwheelLabel = [];
		this.fCtrlLabel = new Array(128).fill(null).map(() => []);
		this.fMidiKeyLabel = new Array(128).fill(null).map(() => []);
		this.fMidiKeyOnLabel = new Array(128).fill(null).map(() => []);
		this.fMidiKeyOffLabel = new Array(128).fill(null).map(() => []);
		this.fPathTable = {};
		/** Paths already complained about, so the warning is not repeated. */
		this.fUnknownPaths = /* @__PURE__ */ new Set();
		this.fUICallback = (item) => {
			if (item.type === "hbargraph" || item.type === "vbargraph") {
				const registerPath = (alias) => {
					if (this.fPathTable[alias] === void 0) this.fPathTable[alias] = item.index;
				};
				this.fOutputsItems.push(item.address);
				registerPath(item.address);
				registerPath(item.shortname);
				registerPath(item.label);
			} else if (item.type === "vslider" || item.type === "hslider" || item.type === "button" || item.type === "checkbox" || item.type === "nentry") {
				const registerPath = (alias) => {
					if (this.fPathTable[alias] === void 0) this.fPathTable[alias] = item.index;
				};
				this.fInputsItems.push(item.address);
				registerPath(item.address);
				registerPath(item.shortname);
				registerPath(item.label);
				this.fDescriptor.push(item);
				if (!item.meta) return;
				item.meta.forEach((meta) => {
					var _a, _b, _c, _d, _e, _f;
					const { midi, acc, gyr } = meta;
					if (midi) {
						const strMidi = midi.trim();
						if (strMidi === "pitchwheel") {
							const matched = strMidi.match(/^pitchwheel\s(\d+)/);
							if (matched) this.fPitchwheelLabel.push({
								path: item.address,
								chan: parseInt(matched[1]),
								min: item.min,
								max: item.max
							});
							else this.fPitchwheelLabel.push({
								path: item.address,
								chan: 0,
								min: item.min,
								max: item.max
							});
						} else {
							const matched2 = strMidi.match(/^ctrl\s(\d+)\s(\d+)/);
							const matched1 = strMidi.match(/^ctrl\s(\d+)/);
							const matchedKey = strMidi.match(/^key\s+(\d+)(?:\s+(\d+))?$/);
							const matchedKeyOn = strMidi.match(/^keyon\s+(\d+)(?:\s+(\d+))?$/);
							const matchedKeyOff = strMidi.match(/^keyoff\s+(\d+)(?:\s+(\d+))?$/);
							if (matched2) this.fCtrlLabel[parseInt(matched2[1])].push({
								path: item.address,
								chan: parseInt(matched2[2]),
								min: item.min,
								max: item.max
							});
							else if (matched1) this.fCtrlLabel[parseInt(matched1[1])].push({
								path: item.address,
								chan: 0,
								min: item.min,
								max: item.max
							});
							else if (matchedKey) {
								const note = parseInt(matchedKey[1]);
								const channel = matchedKey[2] ? parseInt(matchedKey[2]) : 0;
								this.fMidiKeyLabel[note].push({
									path: item.address,
									chan: channel,
									min: (_a = item.min) !== null && _a !== void 0 ? _a : 0,
									max: (_b = item.max) !== null && _b !== void 0 ? _b : 1
								});
							} else if (matchedKeyOn) {
								const note = parseInt(matchedKeyOn[1]);
								const channel = matchedKeyOn[2] ? parseInt(matchedKeyOn[2]) : 0;
								this.fMidiKeyOnLabel[note].push({
									path: item.address,
									chan: channel,
									min: (_c = item.min) !== null && _c !== void 0 ? _c : 0,
									max: (_d = item.max) !== null && _d !== void 0 ? _d : 1
								});
							} else if (matchedKeyOff) {
								const note = parseInt(matchedKeyOff[1]);
								const channel = matchedKeyOff[2] ? parseInt(matchedKeyOff[2]) : 0;
								this.fMidiKeyOffLabel[note].push({
									path: item.address,
									chan: channel,
									min: (_e = item.min) !== null && _e !== void 0 ? _e : 0,
									max: (_f = item.max) !== null && _f !== void 0 ? _f : 1
								});
							}
						}
					}
					if (acc) {
						const numAcc = acc.trim().split(" ").map(Number);
						this.setupAccHandler(item.address, FaustSensors.convertToAxis(numAcc[0]), FaustSensors.convertToCurve(numAcc[1]), numAcc[2], numAcc[3], numAcc[4], item.min, item.init, item.max);
					}
					if (gyr) {
						const numAcc = gyr.trim().split(" ").map(Number);
						this.setupGyrHandler(item.address, FaustSensors.convertToAxis(numAcc[0]), FaustSensors.convertToCurve(numAcc[1]), numAcc[2], numAcc[3], numAcc[4], item.min, item.init, item.max);
					}
				});
			} else if (item.type === "soundfile") this.fSoundfiles.push({
				name: item.label,
				url: item.url,
				index: item.index,
				basePtr: -1
			});
		};
		this.fProcessing = false;
		this.fDestroyed = false;
		this.fFirstCall = true;
		this.fBufferSize = bufferSize;
		this.fPtrSize = sampleSize;
		this.fSampleSize = sampleSize;
		this.fSoundfileBuffers = soundfiles;
		this.fAcc = {
			x: [],
			y: [],
			z: []
		};
		this.fGyr = {
			x: [],
			y: [],
			z: []
		};
	}
	/**
	* Render a whole block through `render`, stopping at each event.
	*
	* Render up to the next event's frame, apply it, continue. Living in the
	* base class means mono and poly only have to supply what rendering a
	* slice means.
	*
	* With no events the block is one slice, which is what every caller that
	* passes no events gets.
	*/
	renderBlock(events, render) {
		if (!events || events.length === 0) {
			render(0, this.fBufferSize);
			return;
		}
		let frame = 0;
		for (let i = 0; i < events.length; i++) {
			const event = events[i];
			const at = Math.min(Math.max(event.frame, 0), this.fBufferSize);
			if (at > frame) {
				render(frame, at - frame);
				frame = at;
			}
			event.apply();
		}
		if (frame < this.fBufferSize) render(frame, this.fBufferSize - frame);
	}
	/**
	* Apply every event without rendering.
	*
	* For the blocks `compute` returns early from: stopped, or an input or
	* output not connected yet. The events have already left the processor's
	* queue, so dropping them here loses them permanently -- a `keyOn` that
	* never sounds, or a parameter the DSP and the host disagree about from
	* then on.
	*
	* A destroyed DSP is the exception, and does drop them.
	*/
	applyEvents(events) {
		if (!events) return;
		for (let i = 0; i < events.length; i++) events[i].apply();
	}
	/**
	* Point the wasm channel tables at frame `offset` of the block.
	*
	* Each slice sets this before rendering, so nothing outside `compute`
	* depends on where the previous slice left the tables.
	*/
	setBufferOffset(offset) {
		const bytes = offset * this.fSampleSize;
		for (let chan = 0; chan < this.fInBase.length; chan++) this.fHEAP32[(this.fAudioInputs >> 2) + chan] = this.fInBase[chan] + bytes;
		for (let chan = 0; chan < this.fOutBase.length; chan++) this.fHEAP32[(this.fAudioOutputs >> 2) + chan] = this.fOutBase[chan] + bytes;
	}
	static remap(v, mn0, mx0, mn1, mx1) {
		return (v - mn0) / (mx0 - mn0) * (mx1 - mn1) + mn1;
	}
	static parseUI(ui, callback) {
		ui.forEach((group) => this.parseGroup(group, callback));
	}
	static parseGroup(group, callback) {
		if (group.items) this.parseItems(group.items, callback);
	}
	static parseItems(items, callback) {
		items.forEach((item) => this.parseItem(item, callback));
	}
	static parseItem(item, callback) {
		if (item.type === "vgroup" || item.type === "hgroup" || item.type === "tgroup") this.parseItems(item.items, callback);
		else callback(item);
	}
	/** Split the soundfile names and return an array of names */
	static splitSoundfileNames(input) {
		return input.replace(/^\{|\}$/g, "").split(";").map((str) => str.length <= 2 ? "" : str.substring(1, str.length - 1)).map((str) => str.trim()).filter((str) => str.length > 0);
	}
	get hasAccInput() {
		return this.fAcc.x.length + this.fAcc.y.length + this.fAcc.z.length > 0;
	}
	propagateAcc(accelerationIncludingGravity, invert = false) {
		const { x, y, z } = accelerationIncludingGravity;
		if (invert) {
			if (x !== null) this.fAcc.x.forEach((handler) => handler(-x));
			if (y !== null) this.fAcc.y.forEach((handler) => handler(-y));
			if (z !== null) this.fAcc.z.forEach((handler) => handler(-z));
		} else {
			if (x !== null) this.fAcc.x.forEach((handler) => handler(x));
			if (y !== null) this.fAcc.y.forEach((handler) => handler(y));
			if (z !== null) this.fAcc.z.forEach((handler) => handler(z));
		}
	}
	get hasGyrInput() {
		return this.fGyr.x.length + this.fGyr.y.length + this.fGyr.z.length > 0;
	}
	propagateGyr(event) {
		const { alpha, beta, gamma } = event;
		if (alpha !== null) this.fGyr.x.forEach((handler) => handler(alpha));
		if (beta !== null) this.fGyr.y.forEach((handler) => handler(beta));
		if (gamma !== null) this.fGyr.z.forEach((handler) => handler(gamma));
	}
	/** Build the accelerometer handler */
	setupAccHandler(path, axis, curve, amin, amid, amax, min, init, max) {
		const handler = FaustSensors.buildHandler(curve, amin, amid, amax, min, init, max);
		switch (axis) {
			case Axis.x:
				this.fAcc.x.push((val) => this.setParamValue(path, handler.uiToFaust(val)));
				break;
			case Axis.y:
				this.fAcc.y.push((val) => this.setParamValue(path, handler.uiToFaust(val)));
				break;
			case Axis.z: this.fAcc.z.push((val) => this.setParamValue(path, handler.uiToFaust(val)));
		}
	}
	/** Build the gyroscope handler */
	setupGyrHandler(path, axis, curve, amin, amid, amax, min, init, max) {
		const handler = FaustSensors.buildHandler(curve, amin, amid, amax, min, init, max);
		switch (axis) {
			case Axis.x:
				this.fGyr.x.push((val) => this.setParamValue(path, handler.uiToFaust(val)));
				break;
			case Axis.y:
				this.fGyr.y.push((val) => this.setParamValue(path, handler.uiToFaust(val)));
				break;
			case Axis.z: this.fGyr.z.push((val) => this.setParamValue(path, handler.uiToFaust(val)));
		}
	}
	static extractUrlsFromMeta(dspMeta) {
		const soundfilesEntry = dspMeta.meta.find((entry) => entry.soundfiles !== void 0);
		if (soundfilesEntry) return soundfilesEntry.soundfiles.split(";").filter((url) => url !== "");
		else return [];
	}
	/**
	* Load a soundfile possibly containing several parts in the DSP struct.
	* Soundfile pointers are located at 'index' offset, to be read in the JSON file.
	* The DSP struct is located at baseDSP in the wasm memory,
	* either a monophonic DSP, or a voice in a polyphonic context.
	*
	* @param allocator : the wasm memory allocator
	* @param baseDSP : the base DSP in the wasm memory
	* @param name : the name of the soundfile
	* @param url : the url of the soundfile
	*/
	loadSoundfile(allocator, baseDSP, name, url) {
		console.log(`Soundfile ${name} paths: ${url}`);
		const soundfileIds = FaustBaseWebAudioDsp.splitSoundfileNames(url);
		const item = this.fSoundfiles.find((item) => item.url === url);
		if (!item) throw new Error(`Soundfile with ${url} cannot be found !}`);
		if (item.basePtr !== -1) {
			const HEAP32 = allocator.getInt32Array();
			console.log(`Soundfile CACHE ${url}} : ${name} loaded at ${item.basePtr} in wasm memory with index ${item.index}`);
			HEAP32[baseDSP + item.index >> 2] = item.basePtr;
		} else {
			const soundfile = this.createSoundfile(allocator, soundfileIds, this.fSoundfileBuffers);
			if (soundfile) {
				const HEAP32 = soundfile.getHEAP32();
				item.basePtr = soundfile.getPtr();
				console.log(`Soundfile ${name} loaded at ${item.basePtr} in wasm memory with index ${item.index}`);
				HEAP32[baseDSP + item.index >> 2] = item.basePtr;
			} else console.log(`Soundfile ${name} for ${url} cannot be created !}`);
		}
	}
	createSoundfile(allocator, soundfileIdList, soundfiles, maxChan = Soundfile.MAX_CHAN) {
		let curChan = 1;
		let totalLength = 0;
		for (const soundfileId of soundfileIdList) {
			let chan = 0;
			let len = 0;
			const audioData = soundfiles === null || soundfiles === void 0 ? void 0 : soundfiles[soundfileId];
			if (audioData) {
				chan = audioData.audioBuffer.length;
				len = audioData.audioBuffer[0].length;
			} else {
				len = Soundfile.BUFFER_SIZE;
				chan = 1;
			}
			curChan = Math.max(curChan, chan);
			totalLength += len;
		}
		totalLength += (Soundfile.MAX_SOUNDFILE_PARTS - soundfileIdList.length) * Soundfile.BUFFER_SIZE;
		const soundfile = new Soundfile(allocator, this.fSampleSize, curChan, totalLength, maxChan, soundfileIdList.length);
		let offset = 0;
		for (let part = 0; part < soundfileIdList.length; part++) {
			const soundfileId = soundfileIdList[part];
			const audioData = soundfiles === null || soundfiles === void 0 ? void 0 : soundfiles[soundfileId];
			if (audioData) {
				soundfile.copyToOut(part, maxChan, offset, audioData);
				offset += audioData.audioBuffer[0].length;
			} else offset = soundfile.emptyFile(part, offset);
		}
		for (let part = soundfileIdList.length; part < Soundfile.MAX_SOUNDFILE_PARTS; part++) offset = soundfile.emptyFile(part, offset);
		soundfile.shareBuffers(curChan, maxChan);
		return soundfile;
	}
	/**
	* Init soundfiles memory.
	*
	* @param allocator : the wasm memory allocator
	* @param baseDSP : the DSP struct (either a monophonic DSP of polyphonic voice) base DSP in the wasm memory
	*/
	initSoundfileMemory(allocator, baseDSP) {
		for (const { name, url } of this.fSoundfiles) this.loadSoundfile(allocator, baseDSP, name, url);
	}
	updateOutputs() {
		if (this.fOutputsItems.length > 0 && this.fOutputHandler && this.fOutputsTimer-- === 0) {
			this.fOutputsTimer = 5;
			this.fOutputsItems.forEach((item) => {
				var _a;
				return (_a = this.fOutputHandler) === null || _a === void 0 ? void 0 : _a.call(this, item, this.getParamValue(item));
			});
		}
	}
	metadata(handler) {
		if (this.fJSONDsp.meta) this.fJSONDsp.meta.forEach((meta) => handler(Object.keys(meta)[0], meta[Object.keys(meta)[0]]));
	}
	compute(input, output) {
		return false;
	}
	setOutputParamHandler(handler) {
		this.fOutputHandler = handler;
	}
	getOutputParamHandler() {
		return this.fOutputHandler;
	}
	callOutputParamHandler(path, value) {
		if (this.fOutputHandler) this.fOutputHandler(path, value);
	}
	setInputParamHandler(handler) {
		this.fInputHandler = handler;
	}
	getInputParamHandler() {
		return this.fInputHandler;
	}
	callInputParamHandler(path, value) {
		if (this.fInputHandler) this.fInputHandler(path, value);
	}
	setComputeHandler(handler) {
		this.fComputeHandler = handler;
	}
	getComputeHandler() {
		return this.fComputeHandler;
	}
	setPlotHandler(handler) {
		this.fPlotHandler = handler;
	}
	getPlotHandler() {
		return this.fPlotHandler;
	}
	getNumInputs() {
		return -1;
	}
	getNumOutputs() {
		return -1;
	}
	midiMessage(data) {
		if (this.fPlotHandler) this.fCachedEvents.push({
			data,
			type: "midi"
		});
		const cmd = data[0] >> 4;
		const channel = data[0] & 15;
		const data1 = data[1];
		const data2 = data[2];
		if (cmd === 11) return this.ctrlChange(channel, data1, data2);
		if (cmd === 14) return this.pitchWheel(channel, data2 * 128 + data1);
		if (cmd === 9) {
			if (data2 > 0) return this.keyOn(channel, data1, data2);
			else return this.keyOff(channel, data1, data2);
		}
		if (cmd === 8) return this.keyOff(channel, data1, data2);
	}
	ctrlChange(channel, ctrl, value) {
		if (this.fPlotHandler) this.fCachedEvents.push({
			type: "ctrlChange",
			data: [
				channel,
				ctrl,
				value
			]
		});
		if (this.fCtrlLabel[ctrl].length) this.fCtrlLabel[ctrl].forEach((ctrl) => {
			const { path, chan } = ctrl;
			if (chan === 0 || channel === chan - 1) {
				this.setParamValue(path, FaustBaseWebAudioDsp.remap(value, 0, 127, ctrl.min, ctrl.max));
				if (this.fOutputHandler) this.fOutputHandler(path, this.getParamValue(path));
			}
		});
	}
	keyOn(channel, pitch, velocity) {
		if (this.fPlotHandler) this.fCachedEvents.push({
			type: "keyOn",
			data: [
				channel,
				pitch,
				velocity
			]
		});
		this.fMidiKeyOnLabel[pitch].forEach((key) => {
			const { path, chan } = key;
			if (chan === 0 || channel === chan - 1) {
				this.setParamValue(path, FaustBaseWebAudioDsp.remap(velocity, 0, 127, key.min, key.max));
				if (this.fOutputHandler) this.fOutputHandler(path, this.getParamValue(path));
			}
		});
		this.fMidiKeyLabel[pitch].forEach((key) => {
			const { path, chan } = key;
			if (chan === 0 || channel === chan - 1) {
				this.setParamValue(path, FaustBaseWebAudioDsp.remap(velocity, 0, 127, key.min, key.max));
				if (this.fOutputHandler) this.fOutputHandler(path, this.getParamValue(path));
			}
		});
	}
	keyOff(channel, pitch, velocity) {
		if (this.fPlotHandler) this.fCachedEvents.push({
			type: "keyOff",
			data: [
				channel,
				pitch,
				velocity
			]
		});
		this.fMidiKeyOffLabel[pitch].forEach((key) => {
			const { path, chan } = key;
			if (chan === 0 || channel === chan - 1) {
				this.setParamValue(path, FaustBaseWebAudioDsp.remap(velocity, 0, 127, key.min, key.max));
				if (this.fOutputHandler) this.fOutputHandler(path, this.getParamValue(path));
			}
		});
		this.fMidiKeyLabel[pitch].forEach((key) => {
			const { path, chan } = key;
			if (chan === 0 || channel === chan - 1) {
				this.setParamValue(path, 0);
				if (this.fOutputHandler) this.fOutputHandler(path, this.getParamValue(path));
			}
		});
	}
	pitchWheel(channel, wheel) {
		if (this.fPlotHandler) this.fCachedEvents.push({
			type: "pitchWheel",
			data: [channel, wheel]
		});
		this.fPitchwheelLabel.forEach((pw) => {
			const { path, chan } = pw;
			if (chan === 0 || channel === chan - 1) {
				this.setParamValue(path, FaustBaseWebAudioDsp.remap(wheel, 0, 16383, pw.min, pw.max));
				if (this.fOutputHandler) this.fOutputHandler(path, this.getParamValue(path));
			}
		});
	}
	setParamValue(path, value) {}
	getParamValue(path) {
		return 0;
	}
	getParams() {
		return this.fInputsItems;
	}
	getMeta() {
		return this.fJSONDsp;
	}
	getJSON() {
		return JSON.stringify(this.getMeta());
	}
	getUI() {
		return this.fJSONDsp.ui;
	}
	getDescriptors() {
		return this.fDescriptor;
	}
	hasSoundfiles() {
		return this.fSoundfiles.length > 0;
	}
	startSensors() {
		this.startSensors();
	}
	stopSensors() {
		this.stopSensors();
	}
	init() {}
	instanceInit() {}
	instanceClear() {}
	instanceConstants() {}
	instanceResetUserInterface() {}
	start() {
		this.fProcessing = true;
	}
	stop() {
		this.fProcessing = false;
	}
	destroy() {
		this.fDestroyed = true;
		this.fOutputHandler = null;
		this.fInputHandler = null;
		this.fComputeHandler = null;
		this.fPlotHandler = null;
	}
};
var FaustMonoWebAudioDsp = class extends FaustBaseWebAudioDsp {
	constructor(instance, sampleRate, sampleSize, bufferSize, soundfiles) {
		super(sampleSize, bufferSize, soundfiles);
		/**
		* Render one slice, for `renderBlock`.
		*
		* A field rather than an inline closure so it is allocated once instead of
		* on every `compute` call.
		*/
		this.fRenderSlice = (offset, count) => {
			this.setBufferOffset(offset);
			this.fInstance.api.compute(this.fDSP, count, this.fAudioInputs, this.fAudioOutputs);
		};
		this.fInstance = instance;
		this.fSampleRate = sampleRate;
		console.log(`sampleSize: ${sampleSize} bufferSize: ${bufferSize}`);
		this.fJSONDsp = JSON.parse(this.fInstance.json);
		FaustBaseWebAudioDsp.parseUI(this.fJSONDsp.ui, this.fUICallback);
		this.fEndMemory = this.initMemory();
		this.fInstance.api.init(this.fDSP, sampleRate);
		if (this.fSoundfiles.length > 0) {
			const allocator = new WasmAllocator(this.fInstance.memory, this.fEndMemory);
			this.initSoundfileMemory(allocator, this.fDSP);
		}
	}
	init() {
		this.fInstance.api.init(this.fDSP, this.fSampleRate);
	}
	instanceInit() {
		this.fInstance.api.instanceInit(this.fDSP, this.fSampleRate);
	}
	instanceClear() {
		this.fInstance.api.instanceClear(this.fDSP);
	}
	instanceConstants() {
		this.fInstance.api.instanceConstants(this.fDSP, this.fSampleRate);
	}
	instanceResetUserInterface() {
		this.fInstance.api.instanceResetUserInterface(this.fDSP);
	}
	initMemory() {
		this.fDSP = 0;
		const $audio = this.fJSONDsp.size;
		this.fAudioInputs = $audio;
		this.fAudioOutputs = this.fAudioInputs + this.getNumInputs() * this.fPtrSize;
		const $audioInputs = this.fAudioOutputs + this.getNumOutputs() * this.fPtrSize;
		const $audioOutputs = $audioInputs + this.getNumInputs() * this.fBufferSize * this.fSampleSize;
		const endMemory = $audioOutputs + this.getNumOutputs() * this.fBufferSize * this.fSampleSize;
		const HEAP = this.fInstance.memory.buffer;
		const HEAP32 = new Int32Array(HEAP);
		const HEAPF = this.fSampleSize === 4 ? new Float32Array(HEAP) : new Float64Array(HEAP);
		if (this.getNumInputs() > 0) {
			for (let chan = 0; chan < this.getNumInputs(); chan++) HEAP32[(this.fAudioInputs >> 2) + chan] = $audioInputs + this.fBufferSize * this.fSampleSize * chan;
			const dspInChans = HEAP32.subarray(this.fAudioInputs >> 2, this.fAudioInputs + this.getNumInputs() * this.fPtrSize >> 2);
			for (let chan = 0; chan < this.getNumInputs(); chan++) this.fInChannels[chan] = HEAPF.subarray(dspInChans[chan] >> Math.log2(this.fSampleSize), dspInChans[chan] + this.fBufferSize * this.fSampleSize >> Math.log2(this.fSampleSize));
		}
		if (this.getNumOutputs() > 0) {
			for (let chan = 0; chan < this.getNumOutputs(); chan++) HEAP32[(this.fAudioOutputs >> 2) + chan] = $audioOutputs + this.fBufferSize * this.fSampleSize * chan;
			const dspOutChans = HEAP32.subarray(this.fAudioOutputs >> 2, this.fAudioOutputs + this.getNumOutputs() * this.fPtrSize >> 2);
			for (let chan = 0; chan < this.getNumOutputs(); chan++) this.fOutChannels[chan] = HEAPF.subarray(dspOutChans[chan] >> Math.log2(this.fSampleSize), dspOutChans[chan] + this.fBufferSize * this.fSampleSize >> Math.log2(this.fSampleSize));
		}
		this.fHEAP32 = HEAP32;
		this.fInBase = [];
		for (let chan = 0; chan < this.getNumInputs(); chan++) this.fInBase[chan] = HEAP32[(this.fAudioInputs >> 2) + chan];
		this.fOutBase = [];
		for (let chan = 0; chan < this.getNumOutputs(); chan++) this.fOutBase[chan] = HEAP32[(this.fAudioOutputs >> 2) + chan];
		return endMemory;
	}
	toString() {
		return `============== Mono Memory layout ==============
        this.fBufferSize: ${this.fBufferSize}
        this.fJSONDsp.size: ${this.fJSONDsp.size}
        this.fAudioInputs: ${this.fAudioInputs}
        this.fAudioOutputs: ${this.fAudioOutputs}
        this.fDSP: ${this.fDSP}`;
	}
	compute(input, output, events) {
		if (this.fDestroyed) return false;
		if (!this.fProcessing) {
			this.applyEvents(events);
			return true;
		}
		if (this.fFirstCall) {
			this.initMemory();
			this.fFirstCall = false;
		}
		if (typeof input === "function") input(this.fInChannels);
		else {
			if (this.getNumInputs() > 0 && (!input || !input[0] || input[0].length === 0)) {
				this.applyEvents(events);
				return true;
			}
			if (this.getNumOutputs() > 0 && typeof output !== "function" && (!output || !output[0] || output[0].length === 0)) {
				this.applyEvents(events);
				return true;
			}
			if (input !== void 0) for (let chan = 0; chan < Math.min(this.getNumInputs(), input.length); chan++) this.fInChannels[chan].set(input[chan]);
		}
		if (this.fComputeHandler) this.fComputeHandler(this.fBufferSize);
		this.renderBlock(events, this.fRenderSlice);
		this.updateOutputs();
		let forPlot = this.fOutChannels;
		if (typeof output === "function") output(this.fOutChannels);
		else {
			for (let chan = 0; chan < Math.min(this.getNumOutputs(), output.length); chan++) {
				const dspOutput = this.fOutChannels[chan];
				output[chan].set(dspOutput);
			}
			forPlot = output;
		}
		if (this.fPlotHandler) {
			this.fPlotHandler(forPlot, this.fBufferNum++, this.fCachedEvents.length ? this.fCachedEvents : void 0);
			this.fCachedEvents = [];
		}
		return true;
	}
	metadata(handler) {
		super.metadata(handler);
	}
	getNumInputs() {
		return this.fInstance.api.getNumInputs(this.fDSP);
	}
	getNumOutputs() {
		return this.fInstance.api.getNumOutputs(this.fDSP);
	}
	setParamValue(path, value) {
		const index = this.fPathTable[path];
		if (index === void 0) return this.warnUnknownPath(path, "ignored");
		if (this.fPlotHandler) this.fCachedEvents.push({
			type: "param",
			data: {
				path,
				value
			}
		});
		this.fInstance.api.setParamValue(this.fDSP, index, value);
		this.callInputParamHandler(path, this.getParamValue(path));
	}
	getParamValue(path) {
		const index = this.fPathTable[path];
		if (index === void 0) {
			this.warnUnknownPath(path, "returning 0");
			return 0;
		}
		return this.fInstance.api.getParamValue(this.fDSP, index);
	}
	getMeta() {
		return this.fJSONDsp;
	}
	getJSON() {
		return this.fInstance.json;
	}
	getDescriptors() {
		return this.fDescriptor;
	}
	getUI() {
		return this.fJSONDsp.ui;
	}
};
var FaustWebAudioDspVoice = class FaustWebAudioDspVoice {
	static get kActiveVoice() {
		return 0;
	}
	static get kFreeVoice() {
		return -1;
	}
	static get kReleaseVoice() {
		return -2;
	}
	static get kLegatoVoice() {
		return -3;
	}
	static get kNoVoice() {
		return -4;
	}
	static get VOICE_STOP_LEVEL() {
		return 3162e-8;
	}
	constructor($dsp, api, inputItems, pathTable, sampleRate) {
		this.fFreqLabel = [];
		this.fGateLabel = [];
		this.fGainLabel = [];
		this.fKeyLabel = [];
		this.fVelLabel = [];
		this.fCurNote = FaustWebAudioDspVoice.kFreeVoice;
		this.fNextNote = -1;
		this.fNextVel = -1;
		this.fDate = 0;
		this.fLevel = 0;
		this.fDSP = $dsp;
		this.fAPI = api;
		this.fSampleRate = sampleRate;
		this.init(sampleRate);
		this.extractPaths(inputItems, pathTable);
	}
	static midiToFreq(note) {
		return 440 * 2 ** ((note - 69) / 12);
	}
	static normalizeVelocity(velocity) {
		return velocity / 127;
	}
	init(sampleRate) {
		this.fAPI.init(this.fDSP, sampleRate);
	}
	instanceInit() {
		this.fAPI.instanceInit(this.fDSP, this.fSampleRate);
	}
	instanceClear() {
		this.fAPI.instanceClear(this.fDSP);
	}
	instanceConstants() {
		this.fAPI.instanceConstants(this.fDSP, this.fSampleRate);
	}
	instanceResetUserInterface() {
		this.fAPI.instanceResetUserInterface(this.fDSP);
	}
	extractPaths(inputItems, pathTable) {
		inputItems.forEach((item) => {
			if (item.endsWith("/gate")) this.fGateLabel.push(pathTable[item]);
			else if (item.endsWith("/freq")) this.fFreqLabel.push(pathTable[item]);
			else if (item.endsWith("/key")) this.fKeyLabel.push(pathTable[item]);
			else if (item.endsWith("/gain")) this.fGainLabel.push(pathTable[item]);
			else if (item.endsWith("/vel") && item.endsWith("/velocity")) this.fVelLabel.push(pathTable[item]);
		});
	}
	keyOn(pitch, velocity, legato = false) {
		if (legato) {
			this.fNextNote = pitch;
			this.fNextVel = velocity;
		} else {
			this.fFreqLabel.forEach((index) => this.fAPI.setParamValue(this.fDSP, index, FaustWebAudioDspVoice.midiToFreq(pitch)));
			this.fGateLabel.forEach((index) => this.fAPI.setParamValue(this.fDSP, index, 1));
			this.fGainLabel.forEach((index) => this.fAPI.setParamValue(this.fDSP, index, FaustWebAudioDspVoice.normalizeVelocity(velocity)));
			this.fKeyLabel.forEach((index) => this.fAPI.setParamValue(this.fDSP, index, pitch));
			this.fVelLabel.forEach((index) => this.fAPI.setParamValue(this.fDSP, index, velocity));
			this.fCurNote = pitch;
		}
	}
	keyOff(hard = false) {
		this.fGateLabel.forEach((index) => this.fAPI.setParamValue(this.fDSP, index, 0));
		if (hard) this.fCurNote = FaustWebAudioDspVoice.kFreeVoice;
		else this.fCurNote = FaustWebAudioDspVoice.kReleaseVoice;
	}
	computeLegato(bufferSize, $inputs, $outputZero, $outputsHalf) {
		const size = bufferSize >> 1;
		this.fGateLabel.forEach((index) => this.fAPI.setParamValue(this.fDSP, index, 0));
		this.fAPI.compute(this.fDSP, size, $inputs, $outputZero);
		this.keyOn(this.fNextNote, this.fNextVel);
		this.fAPI.compute(this.fDSP, bufferSize - size, $inputs, $outputsHalf);
	}
	compute(bufferSize, $inputs, $outputs) {
		this.fAPI.compute(this.fDSP, bufferSize, $inputs, $outputs);
	}
	setParamValue(index, value) {
		this.fAPI.setParamValue(this.fDSP, index, value);
	}
	getParamValue(index) {
		return this.fAPI.getParamValue(this.fDSP, index);
	}
};
var FaustPolyWebAudioDsp = class FaustPolyWebAudioDsp extends FaustBaseWebAudioDsp {
	/**
	* Render the stolen voices, each across the whole block.
	*
	* A steal is a hand-over: the voice plays the note it is losing over the
	* first half of the buffer, that half fades out, and the new note plays
	* the second half, faded in. Both fades are needed. `fadeOut` scales the
	* buffer, not the voice: after `keyOn` the DSP carries on from its live
	* state -- an envelope that never reached silence is still up -- so
	* without the fade-in the second half started at full level, a step on
	* every stolen note. On a monophonic patch whose voice never falls
	* silent that is a click on every note after the first (measured on a
	* long-release bass: 0, 0, 0, 0.1485, 0.2618 across the split).
	*
	* The fades have to be half a block -- 64 frames -- rather than half a
	* slice, which late in the block would be a frame or two, or nothing at
	* all. So this runs before the slicing, and `fRenderSlice` skips these
	* voices.
	*/
	renderStolenVoices() {
		const stolen = this.fStolen;
		stolen.length = 0;
		this.fVoiceTable.forEach((voice) => {
			if (voice.fCurNote !== FaustWebAudioDspVoice.kLegatoVoice) return;
			stolen.push(voice);
			voice.computeLegato(this.fBufferSize, this.fAudioInputs, this.fAudioMixing, this.fAudioMixingHalf);
			this.fInstance.mixerAPI.fadeOut(this.fBufferSize >> 1, this.getNumOutputs(), this.fAudioMixing);
			this.fadeIn(this.fBufferSize - (this.fBufferSize >> 1), this.getNumOutputs(), this.fAudioMixingHalf);
			voice.fLevel = this.fInstance.mixerAPI.mixCheckVoice(this.fBufferSize, this.getNumOutputs(), this.fAudioMixing, this.fAudioOutputs);
		});
	}
	/**
	* Scale `count` frames of each channel at `$tables` from 1/count up to 1.
	*
	* The mixer has `fadeOut` in wasm; this is its counterpart on the JS
	* side, over the channel-pointer table the same way the mixer reads it.
	*/
	fadeIn(count, chans, $tables) {
		const shift = Math.log2(this.fSampleSize);
		const HEAPF = this.fHEAPF;
		for (let chan = 0; chan < chans; chan++) {
			const start = this.fHEAP32[($tables >> 2) + chan] >> shift;
			for (let i = 0; i < count; i++) HEAPF[start + i] *= (i + 1) / count;
		}
	}
	/**
	* Move the mixing tables along with the input and output ones.
	*
	* `fAudioMixing` is where a voice renders before being summed into the
	* output, so it follows the slice. `fAudioMixingHalf` is the crossfade
	* split point, `count >> 1` frames in, matching `computeLegato`. Only
	* `renderStolenVoices` uses it, and always with the whole block.
	*/
	setMixingOffset(offset, count) {
		const bytes = offset * this.fSampleSize;
		const half = (offset + (count >> 1)) * this.fSampleSize;
		for (let chan = 0; chan < this.fMixingBase.length; chan++) {
			this.fHEAP32[(this.fAudioMixing >> 2) + chan] = this.fMixingBase[chan] + bytes;
			this.fHEAP32[(this.fAudioMixingHalf >> 2) + chan] = this.fMixingBase[chan] + half;
		}
	}
	constructor(instance, sampleRate, sampleSize, bufferSize, soundfiles) {
		super(sampleSize, bufferSize, soundfiles);
		this.fMixingBase = [];
		/** Voices whose crossfade this block already rendered in full. */
		this.fStolen = [];
		/**
		* Render one slice: every live voice into the sum, then the effect.
		*
		* The mixer, the voices and the effect all take a frame count, so a slice
		* is the same work over fewer frames. A field rather than an inline
		* closure so it is allocated once instead of on every `compute` call.
		*
		* Two things `compute` does around this. The sum is cleared once for the
		* block, not per slice, because `renderStolenVoices` has already written
		* across the whole of it. And those stolen voices are skipped here.
		*
		* A voice that becomes `kLegatoVoice` partway through the block is not one
		* of them: it plays out the note it is losing and crossfades at the top of
		* the next block, as it did when a `keyOn` could only arrive between
		* blocks.
		*/
		this.fRenderSlice = (offset, count) => {
			this.setBufferOffset(offset);
			this.setMixingOffset(offset, count);
			this.fVoiceTable.forEach((voice) => {
				if (voice.fCurNote === FaustWebAudioDspVoice.kFreeVoice) return;
				if (this.fStolen.length && this.fStolen.indexOf(voice) !== -1) return;
				voice.compute(count, this.fAudioInputs, this.fAudioMixing);
				const level = this.fInstance.mixerAPI.mixCheckVoice(count, this.getNumOutputs(), this.fAudioMixing, this.fAudioOutputs);
				if (level > voice.fLevel) voice.fLevel = level;
			});
			if (this.fInstance.effectAPI) this.fInstance.effectAPI.compute(this.fEffect, count, this.fAudioOutputs, this.fAudioOutputs);
		};
		/**
		* When each voice was last allocated, as one global monotonic date.
		*
		* Incrementing the voice's own `fDate` instead, as this used to, made the
		* date a per-slot reuse counter: notes played and released before a chord
		* kept reusing slot 0 and inflating only its date, and when the chord
		* then overflowed the pool, the allocator considered a younger note
		* "oldest" and stole the wrong voice.
		*/
		this.fDate = 0;
		this.fInstance = instance;
		this.fSampleRate = sampleRate;
		console.log(`sampleSize: ${sampleSize} bufferSize: ${bufferSize}`);
		this.fJSONDsp = JSON.parse(this.fInstance.voiceJSON);
		this.fJSONEffect = this.fInstance.effectAPI && this.fInstance.effectJSON ? JSON.parse(this.fInstance.effectJSON) : null;
		FaustBaseWebAudioDsp.parseUI(this.fJSONDsp.ui, this.fUICallback);
		if (this.fJSONEffect) FaustBaseWebAudioDsp.parseUI(this.fJSONEffect.ui, this.fUICallback);
		this.fEndMemory = this.initMemory();
		this.fVoiceTable = [];
		for (let voice = 0; voice < this.fInstance.voices; voice++) this.fVoiceTable.push(new FaustWebAudioDspVoice(this.fJSONDsp.size * voice, this.fInstance.voiceAPI, this.fInputsItems, this.fPathTable, sampleRate));
		if (this.fInstance.effectAPI) this.fInstance.effectAPI.init(this.fEffect, sampleRate);
		if (this.fSoundfiles.length > 0) {
			const allocator = new WasmAllocator(this.fInstance.memory, this.fEndMemory);
			for (let voice = 0; voice < this.fInstance.voices; voice++) this.initSoundfileMemory(allocator, this.fJSONDsp.size * voice);
		}
	}
	init() {
		this.fVoiceTable.forEach((voice) => voice.init(this.fSampleRate));
		if (this.fInstance.effectAPI) this.fInstance.effectAPI.init(this.fEffect, this.fSampleRate);
	}
	instanceInit() {
		this.fVoiceTable.forEach((voice) => voice.instanceInit());
		if (this.fInstance.effectAPI) this.fInstance.effectAPI.instanceInit(this.fEffect, this.fSampleRate);
	}
	instanceClear() {
		this.fVoiceTable.forEach((voice) => voice.instanceClear());
		if (this.fInstance.effectAPI) this.fInstance.effectAPI.instanceClear(this.fEffect);
	}
	instanceConstants() {
		this.fVoiceTable.forEach((voice) => voice.instanceConstants());
		if (this.fInstance.effectAPI) this.fInstance.effectAPI.instanceConstants(this.fEffect, this.fSampleRate);
	}
	instanceResetUserInterface() {
		this.fVoiceTable.forEach((voice) => voice.instanceResetUserInterface());
		if (this.fInstance.effectAPI) this.fInstance.effectAPI.instanceResetUserInterface(this.fEffect);
	}
	initMemory() {
		this.fEffect = this.fJSONDsp.size * this.fInstance.voices;
		const $audio = this.fEffect + (this.fJSONEffect ? this.fJSONEffect.size : 0);
		this.fAudioInputs = $audio;
		this.fAudioOutputs = this.fAudioInputs + this.getNumInputs() * this.fPtrSize;
		this.fAudioMixing = this.fAudioOutputs + this.getNumOutputs() * this.fPtrSize;
		this.fAudioMixingHalf = this.fAudioMixing + this.getNumOutputs() * this.fPtrSize;
		const $audioInputs = this.fAudioMixingHalf + this.getNumOutputs() * this.fPtrSize;
		const $audioOutputs = $audioInputs + this.getNumInputs() * this.fBufferSize * this.fSampleSize;
		const $audioMixing = $audioOutputs + this.getNumOutputs() * this.fBufferSize * this.fSampleSize;
		const endMemory = $audioMixing + this.getNumOutputs() * this.fBufferSize * this.fSampleSize;
		const HEAP = this.fInstance.memory.buffer;
		const HEAP32 = new Int32Array(HEAP);
		const HEAPF = this.fSampleSize === 4 ? new Float32Array(HEAP) : new Float64Array(HEAP);
		if (this.getNumInputs() > 0) {
			for (let chan = 0; chan < this.getNumInputs(); chan++) HEAP32[(this.fAudioInputs >> 2) + chan] = $audioInputs + this.fBufferSize * this.fSampleSize * chan;
			const dspInChans = HEAP32.subarray(this.fAudioInputs >> 2, this.fAudioInputs + this.getNumInputs() * this.fPtrSize >> 2);
			for (let chan = 0; chan < this.getNumInputs(); chan++) this.fInChannels[chan] = HEAPF.subarray(dspInChans[chan] >> Math.log2(this.fSampleSize), dspInChans[chan] + this.fBufferSize * this.fSampleSize >> Math.log2(this.fSampleSize));
		}
		if (this.getNumOutputs() > 0) {
			for (let chan = 0; chan < this.getNumOutputs(); chan++) {
				HEAP32[(this.fAudioOutputs >> 2) + chan] = $audioOutputs + this.fBufferSize * this.fSampleSize * chan;
				HEAP32[(this.fAudioMixing >> 2) + chan] = $audioMixing + this.fBufferSize * this.fSampleSize * chan;
				HEAP32[(this.fAudioMixingHalf >> 2) + chan] = $audioMixing + this.fBufferSize * this.fSampleSize * chan + this.fBufferSize / 2 * this.fSampleSize;
			}
			const dspOutChans = HEAP32.subarray(this.fAudioOutputs >> 2, this.fAudioOutputs + this.getNumOutputs() * this.fPtrSize >> 2);
			for (let chan = 0; chan < this.getNumOutputs(); chan++) this.fOutChannels[chan] = HEAPF.subarray(dspOutChans[chan] >> Math.log2(this.fSampleSize), dspOutChans[chan] + this.fBufferSize * this.fSampleSize >> Math.log2(this.fSampleSize));
		}
		this.fHEAP32 = HEAP32;
		this.fInBase = [];
		for (let chan = 0; chan < this.getNumInputs(); chan++) this.fInBase[chan] = HEAP32[(this.fAudioInputs >> 2) + chan];
		this.fHEAPF = HEAPF;
		this.fOutBase = [];
		this.fMixingBase = [];
		for (let chan = 0; chan < this.getNumOutputs(); chan++) {
			this.fOutBase[chan] = HEAP32[(this.fAudioOutputs >> 2) + chan];
			this.fMixingBase[chan] = HEAP32[(this.fAudioMixing >> 2) + chan];
		}
		return endMemory;
	}
	toString() {
		return `============== Poly Memory layout ==============
        this.fBufferSize: ${this.fBufferSize}
        this.fJSONDsp.size: ${this.fJSONDsp.size}
        this.fAudioInputs: ${this.fAudioInputs}
        this.fAudioOutputs: ${this.fAudioOutputs}
        this.fAudioMixing: ${this.fAudioMixing}
        this.fAudioMixingHalf: ${this.fAudioMixingHalf}`;
	}
	allocVoice(voice, type) {
		this.fVoiceTable[voice].fDate = this.fDate++;
		this.fVoiceTable[voice].fCurNote = type;
		return voice;
	}
	getPlayingVoice(pitch) {
		let voicePlaying = FaustWebAudioDspVoice.kNoVoice;
		let oldestDatePlaying = Number.MAX_VALUE;
		for (let i = 0; i < this.fInstance.voices; i++) {
			const curNote = this.fVoiceTable[i].fCurNote;
			const nextNote = this.fVoiceTable[i].fNextNote;
			if (curNote === pitch || curNote === FaustWebAudioDspVoice.kLegatoVoice && nextNote === pitch) {
				if (this.fVoiceTable[i].fDate < oldestDatePlaying) {
					oldestDatePlaying = this.fVoiceTable[i].fDate;
					voicePlaying = i;
				}
			}
		}
		return voicePlaying;
	}
	getFreeVoice() {
		for (let voice = 0; voice < this.fInstance.voices; voice++) if (this.fVoiceTable[voice].fCurNote === FaustWebAudioDspVoice.kFreeVoice) return this.allocVoice(voice, FaustWebAudioDspVoice.kActiveVoice);
		let voiceRelease = FaustWebAudioDspVoice.kNoVoice;
		let voicePlaying = FaustWebAudioDspVoice.kNoVoice;
		let oldestDateRelease = Number.MAX_VALUE;
		let oldestDatePlaying = Number.MAX_VALUE;
		for (let voice = 0; voice < this.fInstance.voices; voice++) if (this.fVoiceTable[voice].fCurNote === FaustWebAudioDspVoice.kReleaseVoice) {
			if (this.fVoiceTable[voice].fDate < oldestDateRelease) {
				oldestDateRelease = this.fVoiceTable[voice].fDate;
				voiceRelease = voice;
			}
		} else if (this.fVoiceTable[voice].fDate < oldestDatePlaying) {
			oldestDatePlaying = this.fVoiceTable[voice].fDate;
			voicePlaying = voice;
		}
		if (oldestDateRelease !== Number.MAX_VALUE) {
			console.log(`Steal release voice : voice_date = ${this.fVoiceTable[voiceRelease].fDate} voice = ${voiceRelease}`);
			return this.allocVoice(voiceRelease, FaustWebAudioDspVoice.kLegatoVoice);
		}
		if (oldestDatePlaying !== Number.MAX_VALUE) {
			console.log(`Steal playing voice : voice_date = ${this.fVoiceTable[voicePlaying].fDate} voice = ${voicePlaying}`);
			return this.allocVoice(voicePlaying, FaustWebAudioDspVoice.kLegatoVoice);
		}
		return FaustWebAudioDspVoice.kNoVoice;
	}
	compute(input, output, events) {
		if (this.fDestroyed) return false;
		if (this.fFirstCall) {
			this.initMemory();
			this.fFirstCall = false;
		}
		if (!this.fProcessing) {
			this.applyEvents(events);
			return true;
		}
		if (this.getNumInputs() > 0 && (!input || !input[0] || input[0].length === 0)) {
			this.applyEvents(events);
			return true;
		}
		if (this.getNumOutputs() > 0 && (!output || !output[0] || output[0].length === 0)) {
			this.applyEvents(events);
			return true;
		}
		if (input !== void 0) for (let chan = 0; chan < Math.min(this.getNumInputs(), input.length); ++chan) this.fInChannels[chan].set(input[chan]);
		if (this.fComputeHandler) this.fComputeHandler(this.fBufferSize);
		this.setBufferOffset(0);
		this.setMixingOffset(0, this.fBufferSize);
		this.fInstance.mixerAPI.clearOutput(this.fBufferSize, this.getNumOutputs(), this.fAudioOutputs);
		this.fVoiceTable.forEach((voice) => voice.fLevel = 0);
		this.renderStolenVoices();
		this.renderBlock(events, this.fRenderSlice);
		this.fVoiceTable.forEach((voice) => {
			if (voice.fCurNote === FaustWebAudioDspVoice.kReleaseVoice && voice.fLevel < FaustWebAudioDspVoice.VOICE_STOP_LEVEL) voice.fCurNote = FaustWebAudioDspVoice.kFreeVoice;
		});
		this.updateOutputs();
		if (output !== void 0) {
			for (let chan = 0; chan < Math.min(this.getNumOutputs(), output.length); chan++) {
				const dspOutput = this.fOutChannels[chan];
				output[chan].set(dspOutput);
			}
			if (this.fPlotHandler) {
				this.fPlotHandler(output, this.fBufferNum++, this.fCachedEvents.length ? this.fCachedEvents : void 0);
				this.fCachedEvents = [];
			}
		}
		return true;
	}
	getNumInputs() {
		return this.fInstance.voiceAPI.getNumInputs(0);
	}
	getNumOutputs() {
		return this.fInstance.voiceAPI.getNumOutputs(0);
	}
	static findPath(o, p) {
		if (typeof o !== "object") return false;
		else if (o.address) return o.address === p;
		else {
			for (const k in o) if (FaustPolyWebAudioDsp.findPath(o[k], p)) return true;
			return false;
		}
	}
	setParamValue(path, value) {
		const index = this.fPathTable[path];
		if (index === void 0) return this.warnUnknownPath(path, "ignored");
		if (this.fPlotHandler) this.fCachedEvents.push({
			type: "param",
			data: {
				path,
				value
			}
		});
		if (this.fJSONEffect && FaustPolyWebAudioDsp.findPath(this.fJSONEffect.ui, path) && this.fInstance.effectAPI) this.fInstance.effectAPI.setParamValue(this.fEffect, index, value);
		else this.fVoiceTable.forEach((voice) => voice.setParamValue(index, value));
		this.callInputParamHandler(path, this.getParamValue(path));
	}
	getParamValue(path) {
		const index = this.fPathTable[path];
		if (index === void 0) {
			this.warnUnknownPath(path, "returning 0");
			return 0;
		}
		if (this.fJSONEffect && FaustPolyWebAudioDsp.findPath(this.fJSONEffect.ui, path) && this.fInstance.effectAPI) return this.fInstance.effectAPI.getParamValue(this.fEffect, index);
		else return this.fVoiceTable[0].getParamValue(index);
	}
	getMeta() {
		const o = this.fJSONDsp;
		const e = this.fJSONEffect;
		const r = { ...o };
		if (e) r.ui = [{
			type: "tgroup",
			label: "Sequencer",
			items: [{
				type: "vgroup",
				label: "Instrument",
				items: o.ui
			}, {
				type: "vgroup",
				label: "Effect",
				items: e.ui
			}]
		}];
		else r.ui = [{
			type: "tgroup",
			label: "Polyphonic",
			items: [{
				type: "vgroup",
				label: "Voices",
				items: o.ui
			}]
		}];
		return r;
	}
	getJSON() {
		return JSON.stringify(this.getMeta());
	}
	getUI() {
		return this.getMeta().ui;
	}
	getDescriptors() {
		return this.fDescriptor;
	}
	midiMessage(data) {
		const cmd = data[0] >> 4;
		const channel = data[0] & 15;
		const data1 = data[1];
		const data2 = data[2];
		if (cmd === 8 || cmd === 9 && data2 === 0) return this.keyOff(channel, data1, data2);
		else if (cmd === 9) return this.keyOn(channel, data1, data2);
		else super.midiMessage(data);
	}
	ctrlChange(channel, ctrl, value) {
		if (ctrl === 123 || ctrl === 120) this.allNotesOff(true);
		else super.ctrlChange(channel, ctrl, value);
	}
	keyOn(channel, pitch, velocity) {
		if (this.fPlotHandler) this.fCachedEvents.push({
			type: "keyOn",
			data: [
				channel,
				pitch,
				velocity
			]
		});
		const voice = this.getFreeVoice();
		this.fVoiceTable[voice].keyOn(pitch, velocity, this.fVoiceTable[voice].fCurNote == FaustWebAudioDspVoice.kLegatoVoice);
	}
	keyOff(channel, pitch, velocity) {
		if (this.fPlotHandler) this.fCachedEvents.push({
			type: "keyOff",
			data: [
				channel,
				pitch,
				velocity
			]
		});
		const voice = this.getPlayingVoice(pitch);
		if (voice !== FaustWebAudioDspVoice.kNoVoice) this.fVoiceTable[voice].keyOff();
		else console.log("Playing pitch = %d not found\n", pitch);
	}
	allNotesOff(hard = true) {
		this.fCachedEvents.push({
			type: "ctrlChange",
			data: [
				0,
				123,
				0
			]
		});
		this.fVoiceTable.forEach((voice) => voice.keyOff(hard));
	}
};
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/FaustAudioWorkletCommunicator.js
/**
* Layout:
*
*
* invert-isAndroid (uint8)
* new-acc-data-available (uint8)
* new-gyr-data-available (uint8)
* empty (uint8)
*
* acc.x, acc.y, acc.z (f32)
*
* gyr.alpha, gyr.beta, gyr.gamma (f32)
*/
var FaustAudioWorkletCommunicator = class {
	constructor(port) {
		this.port = port;
		this.supportSharedArrayBuffer = !!globalThis.SharedArrayBuffer;
		this.byteLength = 4 * Uint8Array.BYTES_PER_ELEMENT + 3 * Float32Array.BYTES_PER_ELEMENT + 3 * Float32Array.BYTES_PER_ELEMENT;
	}
	initializeBuffer(ab) {
		let ptr = 0;
		this.uin8Invert = new Uint8ClampedArray(ab, ptr, 1);
		ptr += Uint8ClampedArray.BYTES_PER_ELEMENT;
		this.uin8NewAccData = new Uint8ClampedArray(ab, ptr, 1);
		ptr += Uint8ClampedArray.BYTES_PER_ELEMENT;
		this.uin8NewGyrData = new Uint8ClampedArray(ab, ptr, 1);
		ptr += Uint8ClampedArray.BYTES_PER_ELEMENT;
		ptr += Uint8ClampedArray.BYTES_PER_ELEMENT;
		this.f32Acc = new Float32Array(ab, ptr, 3);
		ptr += 3 * Float32Array.BYTES_PER_ELEMENT;
		this.f32Gyr = new Float32Array(ab, ptr, 3);
		ptr += 3 * Float32Array.BYTES_PER_ELEMENT;
	}
	setNewAccDataAvailable(value) {
		if (!this.uin8NewAccData) return;
		this.uin8NewAccData[0] = +value;
	}
	getNewAccDataAvailable() {
		var _a;
		return !!((_a = this.uin8NewAccData) === null || _a === void 0 ? void 0 : _a[0]);
	}
	setNewGyrDataAvailable(value) {
		if (!this.uin8NewGyrData) return;
		this.uin8NewGyrData[0] = +value;
	}
	getNewGyrDataAvailable() {
		var _a;
		return !!((_a = this.uin8NewGyrData) === null || _a === void 0 ? void 0 : _a[0]);
	}
	setAcc({ x, y, z }, invert = false) {
		if (!this.supportSharedArrayBuffer) {
			const e = {
				type: "acc",
				data: {
					x,
					y,
					z
				},
				invert
			};
			this.port.postMessage(e);
		}
		if (!this.uin8NewAccData) return;
		this.uin8Invert[0] = +invert;
		this.f32Acc[0] = x;
		this.f32Acc[1] = y;
		this.f32Acc[2] = z;
		this.uin8NewAccData[0] = 1;
	}
	getAcc() {
		if (!this.uin8NewAccData) return;
		const invert = !!this.uin8Invert[0];
		const [x, y, z] = this.f32Acc;
		return {
			x,
			y,
			z,
			invert
		};
	}
	setGyr({ alpha, beta, gamma }) {
		if (!this.supportSharedArrayBuffer) {
			const e = {
				type: "gyr",
				data: {
					alpha,
					beta,
					gamma
				}
			};
			this.port.postMessage(e);
		}
		if (!this.uin8NewGyrData) return;
		this.f32Gyr[0] = alpha;
		this.f32Gyr[1] = beta;
		this.f32Gyr[2] = gamma;
		this.uin8NewGyrData[0] = 1;
	}
	getGyr() {
		if (!this.uin8NewGyrData) return;
		const [alpha, beta, gamma] = this.f32Gyr;
		return {
			alpha,
			beta,
			gamma
		};
	}
};
var FaustAudioWorkletNodeCommunicator = class extends FaustAudioWorkletCommunicator {
	constructor(port) {
		super(port);
		if (this.supportSharedArrayBuffer) {
			const sab = new SharedArrayBuffer(this.byteLength);
			this.initializeBuffer(sab);
			this.port.postMessage({
				type: "initSab",
				sab
			});
		} else {
			const ab = new ArrayBuffer(this.byteLength);
			this.initializeBuffer(ab);
		}
	}
};
var FaustAudioWorkletProcessorCommunicator = class extends FaustAudioWorkletCommunicator {
	constructor(port) {
		super(port);
		if (this.supportSharedArrayBuffer) this.port.addEventListener("message", (event) => {
			const { data } = event;
			if (data.type === "initSab") this.initializeBuffer(data.sab);
		});
		else {
			const ab = new ArrayBuffer(this.byteLength);
			this.initializeBuffer(ab);
			this.port.addEventListener("message", (event) => {
				const msg = event.data;
				switch (msg.type) {
					case "acc":
						this.setAcc(msg.data, msg.invert);
						break;
					case "gyr": this.setGyr(msg.data);
				}
			});
		}
	}
};
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/FaustAudioWorkletNode.js
var __classPrivateFieldSet = function(receiver, state, value, kind, f) {
	if (kind === "m") throw new TypeError("Private method is not writable");
	if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
	if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
	return kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value), value;
};
var __classPrivateFieldGet = function(receiver, state, kind, f) {
	if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
	if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
	return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var _FaustAudioWorkletNode_hasAccInput;
var _FaustAudioWorkletNode_hasGyrInput;
/**
* Base class for Monophonic and Polyphonic AudioWorkletNode
*/
var FaustAudioWorkletNode = class extends (globalThis.AudioWorkletNode || null) {
	constructor(context, name, factory, options = {}) {
		const JSONObj = JSON.parse(factory.json);
		super(context, name, {
			numberOfInputs: JSONObj.inputs > 0 ? 1 : 0,
			numberOfOutputs: JSONObj.outputs > 0 ? 1 : 0,
			channelCount: Math.max(1, JSONObj.inputs),
			outputChannelCount: [JSONObj.outputs],
			channelCountMode: "explicit",
			channelInterpretation: "speakers",
			processorOptions: options.processorOptions,
			...options
		});
		_FaustAudioWorkletNode_hasAccInput.set(this, false);
		_FaustAudioWorkletNode_hasGyrInput.set(this, false);
		this.handleMessageAux = (e) => {
			if (e.data.type === "out-param" && this.fOutputHandler) this.fOutputHandler(e.data.path, e.data.value);
			else if (e.data.type === "in-param" && this.fInputHandler) this.fInputHandler(e.data.path, e.data.value);
			else if (e.data.type === "plot" && this.fPlotHandler) this.fPlotHandler(e.data.value, e.data.index, e.data.events);
		};
		this.handleDeviceMotion = ({ accelerationIncludingGravity }) => {
			const isAndroid = /Android/i.test(navigator.userAgent);
			if (!accelerationIncludingGravity) return;
			const { x, y, z } = accelerationIncludingGravity;
			this.propagateAcc({
				x,
				y,
				z
			}, isAndroid);
		};
		this.handleDeviceOrientation = ({ alpha, beta, gamma }) => {
			this.propagateGyr({
				alpha,
				beta,
				gamma
			});
		};
		this.fJSONDsp = JSONObj;
		this.fJSON = factory.json;
		this.fOutputHandler = null;
		this.fInputHandler = null;
		this.fComputeHandler = null;
		this.fPlotHandler = null;
		this.fDescriptor = [];
		this.fParamAliases = {};
		this.fInputsItems = [];
		this.fUICallback = (item) => {
			if (item.type === "vslider" || item.type === "hslider" || item.type === "button" || item.type === "checkbox" || item.type === "nentry") {
				this.fInputsItems.push(item.address);
				this.fDescriptor.push(item);
				const registerAlias = (alias) => {
					if (!this.fParamAliases[alias]) this.fParamAliases[alias] = item.address;
				};
				registerAlias(item.shortname);
				registerAlias(item.label);
				if (!item.meta) return;
				item.meta.forEach((meta) => {
					const { acc, gyr } = meta;
					if (acc) __classPrivateFieldSet(this, _FaustAudioWorkletNode_hasAccInput, true, "f");
					if (gyr) __classPrivateFieldSet(this, _FaustAudioWorkletNode_hasGyrInput, true, "f");
				});
			}
		};
		FaustBaseWebAudioDsp.parseUI(this.fJSONDsp.ui, this.fUICallback);
		this.fCommunicator = new FaustAudioWorkletNodeCommunicator(this.port);
		this.port.addEventListener("message", this.handleMessageAux);
		this.port.start();
	}
	/** Setup accelerometer and gyroscope handlers */
	async startSensors() {
		if (this.hasAccInput) {
			if (window.DeviceMotionEvent) window.addEventListener("devicemotion", this.handleDeviceMotion, true);
			else console.log("Cannot set the accelerometer handler.");
		}
		if (this.hasGyrInput) {
			if (window.DeviceMotionEvent) window.addEventListener("deviceorientation", this.handleDeviceOrientation, true);
			else console.log("Cannot set the gyroscope handler.");
		}
	}
	stopSensors() {
		if (this.hasAccInput) window.removeEventListener("devicemotion", this.handleDeviceMotion, true);
		if (this.hasGyrInput) window.removeEventListener("deviceorientation", this.handleDeviceOrientation, true);
	}
	setOutputParamHandler(handler) {
		this.fOutputHandler = handler;
	}
	getOutputParamHandler() {
		return this.fOutputHandler;
	}
	callOutputParamHandler(path, value) {
		if (this.fOutputHandler) this.fOutputHandler(path, value);
	}
	setInputParamHandler(handler) {
		this.fInputHandler = handler;
	}
	getInputParamHandler() {
		return this.fInputHandler;
	}
	callInputParamHandler(path, value) {
		if (this.fInputHandler) this.fInputHandler(path, value);
	}
	setComputeHandler(handler) {
		this.fComputeHandler = handler;
	}
	getComputeHandler() {
		return this.fComputeHandler;
	}
	setPlotHandler(handler) {
		this.fPlotHandler = handler;
		if (this.fPlotHandler) this.port.postMessage({
			type: "setPlotHandler",
			data: true
		});
		else this.port.postMessage({
			type: "setPlotHandler",
			data: false
		});
	}
	getPlotHandler() {
		return this.fPlotHandler;
	}
	setupWamEventHandler() {
		this.port.postMessage({ type: "setupWamEventHandler" });
	}
	getNumInputs() {
		return this.fJSONDsp.inputs;
	}
	getNumOutputs() {
		return this.fJSONDsp.outputs;
	}
	compute(inputs, outputs) {
		return false;
	}
	metadata(handler) {
		if (this.fJSONDsp.meta) this.fJSONDsp.meta.forEach((meta) => handler(Object.keys(meta)[0], meta[Object.keys(meta)[0]]));
	}
	/**
	* `time` is in AudioContext seconds, the clock `AudioParam` methods take.
	*
	* With a time, the processor holds the message until the block containing
	* that instant and applies it on the exact sample. Without one, it is
	* applied on arrival.
	*
	* A time already in the past is late, not rejected: the message happens at
	* the top of the next block. `setParamValue` is the exception -- it also
	* writes an `AudioParam`, and `setValueAtTime` throws on a negative time.
	*/
	midiMessage(data, time) {
		const cmd = data[0] >> 4;
		const channel = data[0] & 15;
		const data1 = data[1];
		const data2 = data[2];
		if (cmd === 11) this.ctrlChange(channel, data1, data2, time);
		else if (cmd === 14) this.pitchWheel(channel, data2 * 128 + data1, time);
		if (cmd === 8 || cmd === 9 && data2 === 0) this.keyOff(channel, data1, data2, time);
		else if (cmd === 9) this.keyOn(channel, data1, data2, time);
		else this.port.postMessage({
			type: "midi",
			data,
			time
		});
	}
	ctrlChange(channel, ctrl, value, time) {
		const e = {
			type: "ctrlChange",
			data: [
				channel,
				ctrl,
				value
			],
			time
		};
		this.port.postMessage(e);
	}
	pitchWheel(channel, wheel, time) {
		const e = {
			type: "pitchWheel",
			data: [channel, wheel],
			time
		};
		this.port.postMessage(e);
	}
	keyOn(channel, pitch, velocity, time) {
		const e = {
			type: "keyOn",
			data: [
				channel,
				pitch,
				velocity
			],
			time
		};
		this.port.postMessage(e);
	}
	keyOff(channel, pitch, velocity, time) {
		const e = {
			type: "keyOff",
			data: [
				channel,
				pitch,
				velocity
			],
			time
		};
		this.port.postMessage(e);
	}
	get hasAccInput() {
		return __classPrivateFieldGet(this, _FaustAudioWorkletNode_hasAccInput, "f");
	}
	propagateAcc(accelerationIncludingGravity, invert = false) {
		if (!accelerationIncludingGravity) return;
		const { x, y, z } = accelerationIncludingGravity;
		this.fCommunicator.setAcc({
			x,
			y,
			z
		}, invert);
	}
	get hasGyrInput() {
		return __classPrivateFieldGet(this, _FaustAudioWorkletNode_hasGyrInput, "f");
	}
	propagateGyr(event) {
		if (!event) return;
		const { alpha, beta, gamma } = event;
		this.fCommunicator.setGyr({
			alpha,
			beta,
			gamma
		});
	}
	/**
	* `time` is in AudioContext seconds; see `midiMessage`.
	*
	* Unlike a note, a negative `time` throws instead of arriving late, and
	* nothing is sent. `AudioParam.setValueAtTime` is what rejects it, which
	* is why that call comes first.
	*/
	setParamValue(path, value, time) {
		const resolved = this.fParamAliases[path] || path;
		const param = this.parameters.get(resolved);
		if (param) param.setValueAtTime(value, time !== null && time !== void 0 ? time : this.context.currentTime);
		this.port.postMessage({
			type: "param",
			data: {
				path: resolved,
				value
			},
			time
		});
	}
	getParamValue(path) {
		const resolved = this.fParamAliases[path] || path;
		const param = this.parameters.get(resolved);
		return param ? param.value : 0;
	}
	getParams() {
		return this.fInputsItems;
	}
	getMeta() {
		return this.fJSONDsp;
	}
	getJSON() {
		return JSON.stringify(this.getMeta());
	}
	getUI() {
		return this.fJSONDsp.ui;
	}
	getDescriptors() {
		return this.fDescriptor;
	}
	init() {
		this.port.postMessage({ type: "init" });
	}
	instanceInit() {
		this.port.postMessage({ type: "instanceInit" });
	}
	instanceClear() {
		this.port.postMessage({ type: "instanceClear" });
	}
	instanceConstants() {
		this.port.postMessage({ type: "instanceConstants" });
	}
	instanceResetUserInterface() {
		this.port.postMessage({ type: "instanceResetUserInterface" });
	}
	start() {
		this.port.postMessage({ type: "start" });
	}
	stop() {
		this.port.postMessage({ type: "stop" });
	}
	destroy() {
		this.port.postMessage({ type: "destroy" });
		this.port.close();
	}
};
_FaustAudioWorkletNode_hasAccInput = /* @__PURE__ */ new WeakMap(), _FaustAudioWorkletNode_hasGyrInput = /* @__PURE__ */ new WeakMap();
/**
* Monophonic AudioWorkletNode
*/
var FaustMonoAudioWorkletNode = class extends FaustAudioWorkletNode {
	constructor(context, options) {
		super(context, options.processorOptions.name, options.processorOptions.factory, options);
		this.onprocessorerror = (e) => {
			throw e;
		};
	}
};
/**
* Polyphonic AudioWorkletNode
*/
var FaustPolyAudioWorkletNode = class extends FaustAudioWorkletNode {
	constructor(context, options) {
		super(context, options.processorOptions.name, options.processorOptions.voiceFactory, options);
		this.onprocessorerror = (e) => {
			throw e;
		};
		this.fJSONEffect = options.processorOptions.effectFactory ? JSON.parse(options.processorOptions.effectFactory.json) : null;
		if (this.fJSONEffect) FaustBaseWebAudioDsp.parseUI(this.fJSONEffect.ui, this.fUICallback);
	}
	allNotesOff(hard) {
		this.port.postMessage({
			type: "ctrlChange",
			data: [
				0,
				123,
				0
			]
		});
	}
	getMeta() {
		const o = this.fJSONDsp;
		const e = this.fJSONEffect;
		const r = { ...o };
		if (e) r.ui = [{
			type: "tgroup",
			label: "Sequencer",
			items: [{
				type: "vgroup",
				label: "Instrument",
				items: o.ui
			}, {
				type: "vgroup",
				label: "Effect",
				items: e.ui
			}]
		}];
		else r.ui = [{
			type: "tgroup",
			label: "Polyphonic",
			items: [{
				type: "vgroup",
				label: "Voices",
				items: o.ui
			}]
		}];
		return r;
	}
	getJSON() {
		return JSON.stringify(this.getMeta());
	}
	getUI() {
		return this.getMeta().ui;
	}
};
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/FaustAudioWorkletProcessor.js
var getFaustAudioWorkletProcessor = (dependencies, faustData, register = true) => {
	const { registerProcessor, AudioWorkletProcessor, sampleRate } = globalThis;
	const audioClock = globalThis;
	const kBlockSize = 128;
	const kFromAutomation = -2;
	const kFromSensors = -1;
	/** Stands in for the `apply` of a cancelled event. */
	const kCancelled = () => {};
	/**
	* Where a control stops looking like a series of edges and starts looking
	* like a ramp, and how coarsely a ramp is then followed.
	*
	* Every Faust slider is an a-rate AudioParam, so one
	* `linearRampToValueAtTime` gives `process` 128 distinct values for a
	* single control. Honouring each would mean 128 one-frame `compute` calls
	* per block, each re-running the DSP's control section, plus 128
	* `in-param` messages to the main thread.
	*
	* Sample accuracy is for edges -- gates, triggers, switches -- which move
	* once or twice a block. A control that changes more often than
	* `kRampChanges` is followed every `kRampStride` changes instead, plus the
	* value it ends the block on.
	*/
	const kRampChanges = 16;
	const kRampStride = 16;
	const { FaustBaseWebAudioDsp, FaustWasmInstantiator, FaustAudioWorkletProcessorCommunicator } = dependencies;
	const { processorName, dspName, dspMeta, effectMeta, poly } = faustData;
	const analysePolyParameters = (item) => {
		const isPolyReserved = "address" in item && !![
			"/gate",
			"/freq",
			"/gain",
			"/key",
			"/vel",
			"/velocity"
		].find((k) => item.address.endsWith(k));
		if (poly && isPolyReserved) return null;
		if (item.type === "vslider" || item.type === "hslider" || item.type === "nentry") return {
			name: item.address,
			defaultValue: item.init || 0,
			minValue: item.min || 0,
			maxValue: item.max || 0
		};
		else if (item.type === "button" || item.type === "checkbox") return {
			name: item.address,
			defaultValue: item.init || 0,
			minValue: 0,
			maxValue: 1
		};
		return null;
	};
	/**
	* Base class for Monophonic and Polyphonic AudioWorkletProcessor
	*/
	class FaustAudioWorkletProcessor extends AudioWorkletProcessor {
		constructor(options) {
			super(options);
			this.paramValuesCache = {};
			/**
			* Port messages waiting for the block they were timestamped for.
			*
			* Sorted by frame, then by arrival. `process` drains everything up to
			* the end of the block it is about to render; the rest waits.
			*/
			this.fEventQueue = [];
			this.fEventSeq = 0;
			/**
			* The events of the block about to be rendered.
			*
			* Refilled rather than reallocated, so a quiet block allocates
			* nothing.
			*/
			this.fBlockEvents = [];
			/**
			* Scratch space for the frames one control's automation changed on.
			* Reused for the same reason as `fBlockEvents`.
			*/
			this.fChangedFrames = [];
			this.fCommunicator = new FaustAudioWorkletProcessorCommunicator(this.port);
			const { parameterDescriptors } = this.constructor;
			parameterDescriptors.forEach((pd) => {
				this.paramValuesCache[pd.name] = pd.defaultValue || 0;
			});
			const { moduleId, instanceId } = options.processorOptions;
			if (!moduleId || !instanceId) return;
			this.wamInfo = {
				moduleId,
				instanceId
			};
		}
		static get parameterDescriptors() {
			const params = [];
			const origin = /* @__PURE__ */ new Map();
			const collect = (side) => (item) => {
				const param = analysePolyParameters(item);
				if (!param) return;
				const previous = origin.get(param.name);
				if (previous === side) throw new Error(`Faust: control "${param.name}" is declared twice in the ${side}. Two widgets resolved to the same path, so one of them would be unreachable. Give them distinct labels or groups.`);
				if (previous !== void 0) throw new Error(`Faust: control "${param.name}" is declared both in the ${previous} and in the ${side}. A polyphonic DSP cannot share a control path between \`process\` and \`effect\`: setParamValue routes a path to one side only, so the other would keep its default. Declare it under a distinct path on each side and have the host write both.`);
				origin.set(param.name, side);
				params.push(param);
			};
			FaustBaseWebAudioDsp.parseUI(dspMeta.ui, collect("voice"));
			if (effectMeta) FaustBaseWebAudioDsp.parseUI(effectMeta.ui, collect("effect"));
			return params;
		}
		setupWamEventHandler() {
			var _a;
			if (!this.wamInfo) return;
			const { moduleId, instanceId } = this.wamInfo;
			const { webAudioModules } = globalThis;
			const ModuleScope = webAudioModules.getModuleScope(moduleId);
			const paramMgrProcessor = (_a = ModuleScope === null || ModuleScope === void 0 ? void 0 : ModuleScope.paramMgrProcessors) === null || _a === void 0 ? void 0 : _a[instanceId];
			if (!paramMgrProcessor) return;
			if (paramMgrProcessor.handleEvent) return;
			paramMgrProcessor.handleEvent = (event) => {
				if (event.type === "wam-midi") this.atTime(event, () => this.midiMessage(event.data.bytes));
			};
		}
		/**
		* Read a message's timestamp as a whole frame on the audio clock.
		* Null if it carries none, meaning now.
		*
		* Both routes round, and both reject anything non-finite. A fraction
		* would become a fractional slice count and a channel pointer partway
		* through a sample. A NaN compares false against every frame, so a
		* queued one would stay at the head of the queue and block every event
		* behind it.
		*/
		messageFrame(msg) {
			const frame = Number.isFinite(msg.frame) ? msg.frame : Number.isFinite(msg.time) ? msg.time * sampleRate : null;
			return frame === null ? null : Math.round(frame);
		}
		/**
		* Apply `apply` now, or queue it for the frame the sender asked for.
		*
		* Untimed messages are applied on arrival, between two blocks, which
		* is equivalent to frame 0 of the next one. A throw from one of those
		* escapes the port handler and costs that message, as it always did.
		*
		* Timed ones have to catch. They run from inside `process`, and the
		* Web Audio spec's response to a `process` that throws is to fire
		* `processorerror` and stop calling the node -- so one bad message
		* would silence the device permanently.
		*/
		atTime(msg, apply) {
			const frame = this.messageFrame(msg);
			if (frame === null) {
				apply();
				return;
			}
			const event = {
				frame,
				seq: this.fEventSeq++,
				apply: () => {
					try {
						apply();
					} catch (error) {
						console.error(`Faust: a message timed for frame ${frame} threw and was dropped`, error);
					}
				}
			};
			let i = this.fEventQueue.length;
			while (i > 0 && this.fEventQueue[i - 1].frame > frame) i--;
			this.fEventQueue.splice(i, 0, event);
		}
		/**
		* Cancel everything scheduled and not yet performed.
		*
		* A panic, or the end of the DSP's life, has to reach the notes that
		* have not sounded yet as well as the ones that have -- otherwise they
		* play afterwards, over a device that was told to be quiet.
		*
		* That means the queue and the rest of the block being rendered, whose
		* events have already left the queue. Messages only: automation and
		* sensor writes are the state of the controls through the block, and
		* an all-notes-off should not stop a filter sweep.
		*/
		flushEvents() {
			this.fEventQueue.length = 0;
			for (const event of this.fBlockEvents) if (event.seq >= 0) event.apply = kCancelled;
		}
		/**
		* Whether a controller number silences the instrument.
		*
		* Exactly the two `FaustPolyWebAudioDsp.ctrlChange` treats as
		* all-notes-off. Not 121, which resets controllers without ending a
		* note, and not 122, which is a keyboard's local control.
		*/
		isPanic(ctrl) {
			return ctrl === 120 || ctrl === 123;
		}
		/**
		* One control's automation for the block, as events.
		*
		* A control that holds arrives as a single value, worth an event only
		* if it differs from what the DSP has. A control that moves arrives as
		* 128, and each change is an edge due on its own frame.
		*
		* Reading only `[0]`, as this used to, pushes every `setValueAtTime`
		* out to the next block boundary and misses a `1 -> 0 -> 1` inside one
		* block completely -- a gate that never retriggers.
		*
		* Above `kRampChanges` the control is ramping rather than stepping,
		* and is followed at `kRampStride`. See the constants.
		*/
		collectAutomation(path, automation, events) {
			const changes = this.fChangedFrames;
			changes.length = 0;
			let last = this.paramValuesCache[path];
			for (let i = 0; i < automation.length; i++) {
				if (automation[i] === last) continue;
				last = automation[i];
				changes.push(i);
			}
			if (changes.length === 0) return;
			const stride = changes.length > kRampChanges ? kRampStride : 1;
			for (let n = 0; n < changes.length; n += stride) {
				const frame = changes[n];
				events.push(this.paramEvent(path, automation[frame], frame));
			}
			const lastChange = changes.length - 1;
			if (lastChange % stride) {
				const frame = changes[lastChange];
				events.push(this.paramEvent(path, automation[frame], frame));
			}
		}
		paramEvent(path, value, frame) {
			return {
				frame,
				seq: kFromAutomation,
				apply: () => this.setParamValue(path, value)
			};
		}
		/**
		* Everything due inside the block starting at `start`.
		*
		* Three sources: the automation each `AudioParam` handed over, any new
		* sensor readings, and the port messages timestamped for a frame
		* inside the block.
		*
		* Sorted by frame, and on a tie by source -- see `FaustTimedEventSeq`.
		*/
		collectEvents(parameters, start) {
			const events = this.fBlockEvents;
			events.length = 0;
			for (const path in parameters) this.collectAutomation(path, parameters[path], events);
			if (this.fCommunicator.getNewAccDataAvailable()) {
				const acc = this.fCommunicator.getAcc();
				if (acc) {
					this.fCommunicator.setNewAccDataAvailable(false);
					const { invert, ...data } = acc;
					events.push({
						frame: 0,
						seq: kFromSensors,
						apply: () => this.propagateAcc(data, invert)
					});
				}
			}
			if (this.fCommunicator.getNewGyrDataAvailable()) {
				const gyr = this.fCommunicator.getGyr();
				if (gyr) {
					this.fCommunicator.setNewGyrDataAvailable(false);
					events.push({
						frame: 0,
						seq: kFromSensors,
						apply: () => this.propagateGyr(gyr)
					});
				}
			}
			const end = start + kBlockSize;
			let ordinal = 0;
			while (this.fEventQueue.length && this.fEventQueue[0].frame < end) {
				const event = this.fEventQueue.shift();
				event.frame = Math.max(0, event.frame - start);
				event.seq = ordinal++;
				events.push(event);
			}
			if (events.length > 1) events.sort((a, b) => a.frame - b.frame || a.seq - b.seq);
			return events;
		}
		process(inputs, outputs, parameters) {
			const events = this.collectEvents(parameters, audioClock.currentFrame);
			return this.fDSPCode.compute(inputs[0], outputs[0], events);
		}
		handleMessageAux(e) {
			const msg = e.data;
			switch (msg.type) {
				case "midi":
					this.atTime(msg, () => {
						if (msg.data[0] >> 4 === 11 && this.isPanic(msg.data[1])) this.flushEvents();
						this.midiMessage(msg.data);
					});
					break;
				case "ctrlChange":
					this.atTime(msg, () => {
						if (this.isPanic(msg.data[1])) this.flushEvents();
						this.ctrlChange(msg.data[0], msg.data[1], msg.data[2]);
					});
					break;
				case "pitchWheel":
					this.atTime(msg, () => this.pitchWheel(msg.data[0], msg.data[1]));
					break;
				case "keyOn":
					this.atTime(msg, () => this.keyOn(msg.data[0], msg.data[1], msg.data[2]));
					break;
				case "keyOff":
					this.atTime(msg, () => this.keyOff(msg.data[0], msg.data[1], msg.data[2]));
					break;
				case "param":
					this.atTime(msg, () => this.setParamValue(msg.data.path, msg.data.value));
					break;
				case "setPlotHandler":
					if (msg.data) this.fDSPCode.setPlotHandler((output, index, events) => this.port.postMessage({
						type: "plot",
						value: output,
						index,
						events
					}));
					else this.fDSPCode.setPlotHandler(null);
					break;
				case "setupWamEventHandler":
					this.setupWamEventHandler();
					break;
				case "init":
					this.fDSPCode.init();
					break;
				case "instanceInit":
					this.fDSPCode.instanceInit();
					break;
				case "instanceClear":
					this.flushEvents();
					this.fDSPCode.instanceClear();
					break;
				case "instanceConstants":
					this.fDSPCode.instanceConstants();
					break;
				case "instanceResetUserInterface":
					this.fDSPCode.instanceResetUserInterface();
					break;
				case "start":
					this.fDSPCode.start();
					break;
				case "stop":
					this.flushEvents();
					this.fDSPCode.stop();
					break;
				case "destroy":
					this.flushEvents();
					this.port.close();
					this.fDSPCode.destroy();
			}
		}
		setParamValue(path, value) {
			this.fDSPCode.setParamValue(path, value);
			this.paramValuesCache[path] = value;
		}
		midiMessage(data) {
			this.fDSPCode.midiMessage(data);
		}
		ctrlChange(channel, ctrl, value) {
			this.fDSPCode.ctrlChange(channel, ctrl, value);
		}
		pitchWheel(channel, wheel) {
			this.fDSPCode.pitchWheel(channel, wheel);
		}
		keyOn(channel, pitch, velocity) {
			this.fDSPCode.keyOn(channel, pitch, velocity);
		}
		keyOff(channel, pitch, velocity) {
			this.fDSPCode.keyOff(channel, pitch, velocity);
		}
		propagateAcc(accelerationIncludingGravity, invert = false) {
			this.fDSPCode.propagateAcc(accelerationIncludingGravity, invert);
		}
		propagateGyr(event) {
			this.fDSPCode.propagateGyr(event);
		}
	}
	/**
	* Monophonic AudioWorkletProcessor
	*/
	class FaustMonoAudioWorkletProcessor extends FaustAudioWorkletProcessor {
		constructor(options) {
			super(options);
			this.handleMessageAux = (e) => {
				super.handleMessageAux(e);
			};
			const { FaustMonoWebAudioDsp } = dependencies;
			const { factory, sampleSize } = options.processorOptions;
			const instance = FaustWasmInstantiator.createSyncMonoDSPInstance(factory);
			this.fDSPCode = new FaustMonoWebAudioDsp(instance, sampleRate, sampleSize, 128, factory.soundfiles);
			this.port.addEventListener("message", this.handleMessageAux);
			this.port.start();
			this.fDSPCode.setOutputParamHandler((path, value) => this.port.postMessage({
				path,
				value,
				type: "out-param"
			}));
			this.fDSPCode.setInputParamHandler((path, value) => this.port.postMessage({
				path,
				value,
				type: "in-param"
			}));
			this.fDSPCode.start();
		}
	}
	/**
	* Polyphonic AudioWorkletProcessor
	*/
	class FaustPolyAudioWorkletProcessor extends FaustAudioWorkletProcessor {
		constructor(options) {
			super(options);
			this.handleMessageAux = (e) => {
				super.handleMessageAux(e);
			};
			const { FaustPolyWebAudioDsp } = dependencies;
			const { voiceFactory, mixerModule, voices, effectFactory, sampleSize } = options.processorOptions;
			const instance = FaustWasmInstantiator.createSyncPolyDSPInstance(voiceFactory, mixerModule, voices, effectFactory);
			const soundfiles = {
				...effectFactory === null || effectFactory === void 0 ? void 0 : effectFactory.soundfiles,
				...voiceFactory.soundfiles
			};
			this.fDSPCode = new FaustPolyWebAudioDsp(instance, sampleRate, sampleSize, 128, soundfiles);
			this.port.addEventListener("message", this.handleMessageAux);
			this.port.start();
			this.fDSPCode.setOutputParamHandler((path, value) => this.port.postMessage({
				path,
				value,
				type: "out-param"
			}));
			this.fDSPCode.setInputParamHandler((path, value) => this.port.postMessage({
				path,
				value,
				type: "in-param"
			}));
			this.fDSPCode.start();
		}
		midiMessage(data) {
			const cmd = data[0] >> 4;
			const channel = data[0] & 15;
			const data1 = data[1];
			const data2 = data[2];
			if (cmd === 8 || cmd === 9 && data2 === 0) this.keyOff(channel, data1, data2);
			else if (cmd === 9) this.keyOn(channel, data1, data2);
			else super.midiMessage(data);
		}
		keyOn(channel, pitch, velocity) {
			this.fDSPCode.keyOn(channel, pitch, velocity);
		}
		keyOff(channel, pitch, velocity) {
			this.fDSPCode.keyOff(channel, pitch, velocity);
		}
		allNotesOff(hard) {
			this.fDSPCode.allNotesOff(hard);
		}
	}
	const Processor = poly ? FaustPolyAudioWorkletProcessor : FaustMonoAudioWorkletProcessor;
	if (register) {
		const name = processorName || dspName || (poly ? "mydsp_poly" : "mydsp");
		const scope = globalThis;
		if (!scope.__faustRegisteredProcessors) scope.__faustRegisteredProcessors = /* @__PURE__ */ new Set();
		if (!scope.__faustRegisteredProcessors.has(name)) {
			registerProcessor(name, Processor);
			scope.__faustRegisteredProcessors.add(name);
		}
	}
	return poly ? FaustPolyAudioWorkletProcessor : FaustMonoAudioWorkletProcessor;
};
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/FaustFFTAudioWorkletProcessor.js
var getFaustFFTAudioWorkletProcessor = (dependencies, faustData, register = true) => {
	const { registerProcessor, AudioWorkletProcessor, sampleRate } = globalThis;
	const audioClock = globalThis;
	/** The render quantum, fixed by the Web Audio API. */
	const kBlockSize = 128;
	const { FaustBaseWebAudioDsp, FaustWasmInstantiator, FaustMonoWebAudioDsp, FaustAudioWorkletProcessorCommunicator, FFTUtils } = dependencies;
	const { processorName, dspName, dspMeta, fftOptions } = faustData;
	const { windowFunctions, getFFT, fftToSignal, signalToFFT, signalToNoFFT } = FFTUtils;
	/**
	* Ceil a number to multiple of another
	*/
	const ceil = (x, to) => Math.abs(to) < 1 ? Math.ceil(x * (1 / to)) / (1 / to) : Math.ceil(x / to) * to;
	/**
	* Mod support wrapping with negative numbers
	*/
	const mod = (x, y) => (x % y + y) % y;
	const apply = (array, windowFunction) => {
		for (let i = 0; i < array.length; i++) array[i] *= windowFunction(i, array.length);
	};
	const fftParamKeywords = [
		"/fftSize",
		"/fftHopSize",
		"/fftOverlap",
		"/windowFunction",
		"/noIFFT"
	];
	/**
	* Copy buffer to another, support negative offset index
	*/
	const setTypedArray = (to, from, offsetTo = 0, offsetFrom = 0) => {
		const toLength = to.length;
		const fromLength = from.length;
		const spillLength = Math.min(toLength, fromLength);
		let spilled = 0;
		let $to = mod(offsetTo, toLength) || 0;
		let $from = mod(offsetFrom, fromLength) || 0;
		while (spilled < spillLength) {
			const $spillLength = Math.min(spillLength - spilled, toLength - $to, fromLength - $from);
			const $fromEnd = $from + $spillLength;
			if ($from === 0 && $fromEnd === fromLength) to.set(from, $to);
			else to.set(from.subarray($from, $fromEnd), $to);
			$to = ($to + $spillLength) % toLength;
			$from = $fromEnd % fromLength;
			spilled += $spillLength;
		}
		return $to;
	};
	const analyseParameters = (item) => {
		if ("address" in item && !!fftParamKeywords.find((k) => item.address.endsWith(k))) return null;
		if (item.type === "vslider" || item.type === "hslider" || item.type === "nentry") return {
			name: item.address,
			defaultValue: item.init || 0,
			minValue: item.min || 0,
			maxValue: item.max || 0
		};
		else if (item.type === "button" || item.type === "checkbox") return {
			name: item.address,
			defaultValue: item.init || 0,
			minValue: 0,
			maxValue: 1
		};
		return null;
	};
	/**
	* Class for Faust FFT AudioWorkletProcessor
	*/
	class FaustFFTAudioWorkletProcessor extends AudioWorkletProcessor {
		get fftProcessorBufferSize() {
			return this.fftSize / 2 + 1;
		}
		constructor(options) {
			super(options);
			this.paramValuesCache = {};
			/**
			* Port messages waiting for the block they were timestamped for.
			*
			* The node puts a `time` on every control it sends. This processor
			* used to ignore it, which mattered most for MIDI messages: nothing
			* mirrors those onto an `AudioParam`, so the timestamp did nothing and
			* the message landed whenever it was posted.
			*
			* They now wait here and are applied at the top of the block that
			* contains the instant. Two limits:
			*
			* Block, not sample. This processor buffers input into an FFT window
			* and hands the DSP whole frames of spectrum, so a control write
			* partway through what it computes has no meaning.
			*
			* A `param` still resolves one block later than that. The
			* `[0]`-against-cache sync below reads the AudioParam at the start of
			* the block and writes the pre-`time` value back over it; the intended
			* value arrives with the next block. Nothing is computed in between,
			* so there is no artefact.
			*/
			this.fEventQueue = [];
			this.destroyed = false;
			/** Pointer of next start sample to write of the FFT input window */
			this.$inputWrite = 0;
			/** Pointer of next start sample to read of the FFT input window */
			this.$inputRead = 0;
			/** Pointer of next start sample to write of the FFT output window */
			this.$outputWrite = 0;
			/** Pointer of next start sample to read of the FFT output window */
			this.$outputRead = 0;
			/** Not perform in IFFT when reconstruct the audio signal */
			this.noIFFT = false;
			/** audio data from input, array of channels */
			this.fftInput = [];
			/** audio data for output, array of channels */
			this.fftOutput = [];
			/** FFT Overlaps, 1 means no overlap */
			this.fftOverlap = 0;
			this.fftHopSize = 0;
			this.fftSize = 0;
			this.fftBufferSize = 0;
			this.fPlotHandler = null;
			this.fCachedEvents = [];
			this.fBufferNum = 0;
			this.soundfiles = {};
			this.windowFunction = null;
			this.handleMessageAux = (e) => {
				var _a, _b, _c;
				const msg = e.data;
				switch (msg.type) {
					case "midi":
						this.atTime(msg, () => this.midiMessage(msg.data));
						break;
					case "ctrlChange":
						this.atTime(msg, () => this.ctrlChange(msg.data[0], msg.data[1], msg.data[2]));
						break;
					case "pitchWheel":
						this.atTime(msg, () => this.pitchWheel(msg.data[0], msg.data[1]));
						break;
					case "param":
						this.atTime(msg, () => this.setParamValue(msg.data.path, msg.data.value));
						break;
					case "setPlotHandler":
						if (msg.data) this.fPlotHandler = (output, index, events) => {
							if (events) this.fCachedEvents.push(...events);
						};
						else this.fPlotHandler = null;
						(_a = this.fDSPCode) === null || _a === void 0 || _a.setPlotHandler(this.fPlotHandler);
						break;
					case "setupWamEventHandler":
						this.setupWamEventHandler();
						break;
					case "start":
						(_b = this.fDSPCode) === null || _b === void 0 || _b.start();
						break;
					case "stop":
						this.fEventQueue.length = 0;
						(_c = this.fDSPCode) === null || _c === void 0 || _c.stop();
						break;
					case "destroy":
						this.fEventQueue.length = 0;
						this.port.close();
						this.destroy();
				}
			};
			this.port.addEventListener("message", this.handleMessageAux);
			this.port.start();
			this.communicator = new FaustAudioWorkletProcessorCommunicator(this.port);
			const { parameterDescriptors } = this.constructor;
			parameterDescriptors.forEach((pd) => {
				this.paramValuesCache[pd.name] = pd.defaultValue || 0;
			});
			const { factory, sampleSize } = options.processorOptions;
			this.dspInstance = FaustWasmInstantiator.createSyncMonoDSPInstance(factory);
			this.sampleSize = sampleSize;
			this.soundfiles = factory.soundfiles;
			this.initFFT();
			const { moduleId, instanceId } = options.processorOptions;
			if (!moduleId || !instanceId) return;
			this.wamInfo = {
				moduleId,
				instanceId
			};
		}
		async initFFT() {
			this.FFT = await getFFT();
			await this.createFFTProcessor();
			return true;
		}
		static get parameterDescriptors() {
			const params = [];
			const callback = (item) => {
				const param = analyseParameters(item);
				if (param) params.push(param);
			};
			FaustBaseWebAudioDsp.parseUI(dspMeta.ui, callback);
			return [
				...params,
				{
					defaultValue: (fftOptions === null || fftOptions === void 0 ? void 0 : fftOptions.fftSize) || 1024,
					maxValue: 2 ** 32,
					minValue: 2,
					name: "fftSize"
				},
				{
					defaultValue: (fftOptions === null || fftOptions === void 0 ? void 0 : fftOptions.fftOverlap) || 2,
					maxValue: 32,
					minValue: 1,
					name: "fftOverlap"
				},
				{
					defaultValue: typeof (fftOptions === null || fftOptions === void 0 ? void 0 : fftOptions.defaultWindowFunction) === "number" ? fftOptions.defaultWindowFunction + 1 : 0,
					maxValue: (windowFunctions === null || windowFunctions === void 0 ? void 0 : windowFunctions.length) || 0,
					minValue: 0,
					name: "windowFunction"
				},
				{
					defaultValue: +!!(fftOptions === null || fftOptions === void 0 ? void 0 : fftOptions.noIFFT) || 0,
					maxValue: 1,
					minValue: 0,
					name: "noIFFT"
				}
			];
		}
		setupWamEventHandler() {
			var _a;
			if (!this.wamInfo) return;
			const { moduleId, instanceId } = this.wamInfo;
			const { webAudioModules } = globalThis;
			const ModuleScope = webAudioModules.getModuleScope(moduleId);
			const paramMgrProcessor = (_a = ModuleScope === null || ModuleScope === void 0 ? void 0 : ModuleScope.paramMgrProcessors) === null || _a === void 0 ? void 0 : _a[instanceId];
			if (!paramMgrProcessor) return;
			if (paramMgrProcessor.handleEvent) return;
			paramMgrProcessor.handleEvent = (event) => {
				if (event.type === "wam-midi") this.atTime(event, () => this.midiMessage(event.data.bytes));
			};
		}
		processFFT() {
			let samplesForFFT = mod(this.$inputWrite - this.$inputRead, this.fftBufferSize) || this.fftBufferSize;
			while (samplesForFFT >= this.fftSize) {
				let fftProcessorOutputs = [];
				this.fDSPCode.compute((inputs) => {
					for (let i = 0; i < Math.min(this.fftInput.length, Math.ceil(inputs.length / 3)); i++) {
						const ffted = this.rfft.forward((fftBuffer) => {
							setTypedArray(fftBuffer, this.fftInput[i], 0, this.$inputRead);
							for (let j = 0; j < fftBuffer.length; j++) fftBuffer[j] *= this.window[j];
						});
						fftToSignal(ffted, inputs[i * 3], inputs[i * 3 + 1], inputs[i * 3 + 2]);
					}
					for (let i = this.fftInput.length * 3; i < inputs.length; i++) if (i % 3 === 2) inputs[i].forEach((v, j) => inputs[i][j] = j);
					else inputs[i].fill(0);
				}, (outputs) => {
					fftProcessorOutputs = outputs;
				});
				this.$inputRead += this.fftHopSize;
				this.$inputRead %= this.fftBufferSize;
				samplesForFFT -= this.fftHopSize;
				for (let i = 0; i < this.fftOutput.length; i++) {
					let iffted;
					if (this.noIFFT) {
						iffted = this.noIFFTBuffer;
						signalToNoFFT(fftProcessorOutputs[i * 2] || this.fftProcessorZeros, fftProcessorOutputs[i * 2 + 1] || this.fftProcessorZeros, iffted);
					} else iffted = this.rfft.inverse((ifftBuffer) => {
						signalToFFT(fftProcessorOutputs[i * 2] || this.fftProcessorZeros, fftProcessorOutputs[i * 2 + 1] || this.fftProcessorZeros, ifftBuffer);
					});
					for (let j = 0; j < iffted.length; j++) iffted[j] *= this.window[j];
					let $;
					for (let j = 0; j < iffted.length - this.fftHopSize; j++) {
						$ = mod(this.$outputWrite + j, this.fftBufferSize);
						this.fftOutput[i][$] += iffted[j];
						if (i === 0) this.windowSumSquare[$] += this.noIFFT ? this.window[j] : this.window[j] ** 2;
					}
					for (let j = iffted.length - this.fftHopSize; j < iffted.length; j++) {
						$ = mod(this.$outputWrite + j, this.fftBufferSize);
						this.fftOutput[i][$] = iffted[j];
						if (i === 0) this.windowSumSquare[$] = this.noIFFT ? this.window[j] : this.window[j] ** 2;
					}
				}
				this.$outputWrite += this.fftHopSize;
				this.$outputWrite %= this.fftBufferSize;
			}
		}
		process(inputs, outputs, parameters) {
			if (this.destroyed) return false;
			if (!this.FFT) return true;
			const input = inputs[0];
			const output = outputs[0];
			const inputChannels = (input === null || input === void 0 ? void 0 : input.length) || 0;
			const outputChannels = (output === null || output === void 0 ? void 0 : output.length) || 0;
			const bufferSize = (input === null || input === void 0 ? void 0 : input.length) ? Math.max(...input.map((c) => c.length)) || 128 : 128;
			this.noIFFT = !!parameters.noIFFT[0];
			this.resetFFT(~~parameters.fftSize[0], ~~parameters.fftOverlap[0], ~~parameters.windowFunction[0], inputChannels, outputChannels, bufferSize);
			if (!this.fDSPCode) return true;
			this.applyDueEvents(audioClock.currentFrame);
			for (const path in parameters) {
				if (fftParamKeywords.find((k) => `/${path}`.endsWith(k))) continue;
				const [paramValue] = parameters[path];
				if (paramValue !== this.paramValuesCache[path]) this.setParamValue(path, paramValue);
			}
			if (this.communicator.getNewAccDataAvailable()) {
				const acc = this.communicator.getAcc();
				if (acc) {
					this.communicator.setNewAccDataAvailable(false);
					const { invert, ...data } = acc;
					this.propagateAcc(data, invert);
				}
			}
			if (this.communicator.getNewGyrDataAvailable()) {
				const gyr = this.communicator.getGyr();
				if (gyr) {
					this.communicator.setNewGyrDataAvailable(false);
					this.propagateGyr(gyr);
				}
			}
			if (input === null || input === void 0 ? void 0 : input.length) {
				let $inputWrite = 0;
				for (let i = 0; i < input.length; i++) {
					const inputWindow = this.fftInput[i];
					const channel = input[i].length ? input[i] : new Float32Array(bufferSize);
					$inputWrite = setTypedArray(inputWindow, channel, this.$inputWrite);
				}
				this.$inputWrite = $inputWrite;
			} else {
				this.$inputWrite += bufferSize;
				this.$inputWrite %= this.fftBufferSize;
			}
			this.processFFT();
			for (let i = 0; i < output.length; i++) {
				setTypedArray(output[i], this.fftOutput[i], 0, this.$outputRead);
				let div = 0;
				for (let j = 0; j < bufferSize; j++) {
					div = this.windowSumSquare[mod(this.$outputRead + j, this.fftBufferSize)];
					output[i][j] /= div < 1e-8 ? 1 : div;
				}
			}
			this.$outputRead += bufferSize;
			this.$outputRead %= this.fftBufferSize;
			if (this.fPlotHandler) {
				this.port.postMessage({
					type: "plot",
					value: output,
					index: this.fBufferNum++,
					events: this.fCachedEvents
				});
				this.fCachedEvents = [];
			}
			return true;
		}
		/**
		* Read a message's timestamp as a whole frame on the audio clock.
		* Null if it carries none, meaning now.
		*
		* Rounded, and non-finite values rejected: a NaN compares false
		* against every frame and would block the queue behind it.
		*/
		messageFrame(msg) {
			const frame = Number.isFinite(msg.frame) ? msg.frame : Number.isFinite(msg.time) ? msg.time * sampleRate : null;
			return frame === null ? null : Math.round(frame);
		}
		/**
		* Apply `apply` now, or at the top of the block containing the frame
		* the sender asked for.
		*
		* Queued ones catch: a throw would otherwise escape `process`, and the
		* spec's response is to stop calling the node permanently.
		*/
		atTime(msg, apply) {
			const frame = this.messageFrame(msg);
			if (frame === null) {
				apply();
				return;
			}
			const guarded = () => {
				try {
					apply();
				} catch (error) {
					console.error(`Faust: a message timed for frame ${frame} threw and was dropped`, error);
				}
			};
			let i = this.fEventQueue.length;
			while (i > 0 && this.fEventQueue[i - 1].frame > frame) i--;
			this.fEventQueue.splice(i, 0, {
				frame,
				apply: guarded
			});
		}
		/** Apply everything due by the end of the block starting at `start`. */
		applyDueEvents(start) {
			const end = start + kBlockSize;
			while (this.fEventQueue.length && this.fEventQueue[0].frame < end) this.fEventQueue.shift().apply();
		}
		setParamValue(path, value) {
			var _a;
			(_a = this.fDSPCode) === null || _a === void 0 || _a.setParamValue(path, value);
			this.paramValuesCache[path] = value;
		}
		midiMessage(data) {
			var _a;
			(_a = this.fDSPCode) === null || _a === void 0 || _a.midiMessage(data);
		}
		ctrlChange(channel, ctrl, value) {
			var _a;
			(_a = this.fDSPCode) === null || _a === void 0 || _a.ctrlChange(channel, ctrl, value);
		}
		pitchWheel(channel, wheel) {
			var _a;
			(_a = this.fDSPCode) === null || _a === void 0 || _a.pitchWheel(channel, wheel);
		}
		propagateAcc(accelerationIncludingGravity, invert = false) {
			this.fDSPCode.propagateAcc(accelerationIncludingGravity, invert);
		}
		propagateGyr(event) {
			this.fDSPCode.propagateGyr(event);
		}
		resetFFT(sizeIn, overlapIn, windowFunctionIn, inputChannels, outputChannels, bufferSize) {
			var _a, _b;
			const fftSize = ~~ceil(Math.max(2, sizeIn || 1024), 2);
			const fftOverlap = ~~Math.min(fftSize, Math.max(1, overlapIn));
			const fftHopSize = ~~Math.max(1, fftSize / fftOverlap);
			const latency = fftSize - Math.min(fftHopSize, bufferSize);
			let windowFunction = null;
			if (windowFunctionIn !== 0) windowFunction = typeof windowFunctions === "object" ? windowFunctions[~~windowFunctionIn - 1] || null : null;
			const fftSizeChanged = fftSize !== this.fftSize;
			const fftOverlapChanged = fftOverlap !== this.fftOverlap;
			if (fftSizeChanged || fftOverlapChanged) {
				this.fftSize = fftSize;
				this.fftOverlap = fftOverlap;
				this.fftHopSize = fftHopSize;
				this.$inputWrite = 0;
				this.$inputRead = 0;
				this.$outputWrite = 0;
				this.$outputRead = -latency;
				this.fftBufferSize = Math.max(fftSize * 2 - this.fftHopSize, bufferSize * 2);
				if (!fftSizeChanged && this.fftHopSizeParam) (_a = this.fDSPCode) === null || _a === void 0 || _a.setParamValue(this.fftHopSizeParam, this.fftHopSize);
			}
			if (fftSizeChanged) {
				(_b = this.rfft) === null || _b === void 0 || _b.dispose();
				this.rfft = new this.FFT(fftSize);
				this.noIFFTBuffer = new Float32Array(this.fftSize);
				this.createFFTProcessor();
			}
			if (fftSizeChanged || fftOverlapChanged || windowFunction !== this.windowFunction) {
				this.windowFunction = windowFunction;
				this.window = new Float32Array(fftSize);
				this.window.fill(1);
				if (windowFunction) apply(this.window, windowFunction);
				this.windowSumSquare = new Float32Array(this.fftBufferSize);
			}
			if (this.fftInput.length > inputChannels) this.fftInput.splice(inputChannels);
			if (this.fftOutput.length > outputChannels) this.fftOutput.splice(outputChannels);
			if (fftSizeChanged || fftOverlapChanged) {
				for (let i = 0; i < inputChannels; i++) this.fftInput[i] = new Float32Array(this.fftBufferSize);
				for (let i = 0; i < outputChannels; i++) this.fftOutput[i] = new Float32Array(this.fftBufferSize);
			} else {
				if (this.fftInput.length < inputChannels) for (let i = this.fftInput.length; i < inputChannels; i++) this.fftInput[i] = new Float32Array(this.fftBufferSize);
				if (this.fftOutput.length < outputChannels) for (let i = this.fftOutput.length; i < outputChannels; i++) this.fftOutput[i] = new Float32Array(this.fftBufferSize);
			}
		}
		async createFFTProcessor() {
			var _a, _b;
			(_a = this.fDSPCode) === null || _a === void 0 || _a.stop();
			(_b = this.fDSPCode) === null || _b === void 0 || _b.destroy();
			this.fDSPCode = new FaustMonoWebAudioDsp(this.dspInstance, sampleRate, this.sampleSize, this.fftProcessorBufferSize, this.soundfiles);
			this.fDSPCode.setOutputParamHandler((path, value) => this.port.postMessage({
				path,
				value,
				type: "out-param"
			}));
			this.fDSPCode.setInputParamHandler((path, value) => this.port.postMessage({
				path,
				value,
				type: "in-param"
			}));
			this.fDSPCode.setPlotHandler(this.fPlotHandler);
			const params = this.fDSPCode.getParams();
			this.fDSPCode.start();
			for (const path in this.paramValuesCache) {
				if (fftParamKeywords.find((k) => `/${path}`.endsWith(k))) continue;
				this.fDSPCode.setParamValue(path, this.paramValuesCache[path]);
			}
			const fftSizeParam = params.find((s) => s.endsWith("/fftSize"));
			if (fftSizeParam) this.fDSPCode.setParamValue(fftSizeParam, this.fftSize);
			this.fftHopSizeParam = params.find((s) => s.endsWith("/fftHopSize"));
			if (this.fftHopSizeParam) this.fDSPCode.setParamValue(this.fftHopSizeParam, this.fftHopSize);
			this.fftProcessorZeros = new Float32Array(this.fftProcessorBufferSize);
		}
		destroy() {
			var _a, _b, _c;
			(_a = this.fDSPCode) === null || _a === void 0 || _a.stop();
			(_b = this.fDSPCode) === null || _b === void 0 || _b.destroy();
			(_c = this.rfft) === null || _c === void 0 || _c.dispose();
			this.destroyed = true;
		}
	}
	const Processor = FaustFFTAudioWorkletProcessor;
	if (register) {
		const name = processorName || dspName || "myfftdsp";
		const scope = globalThis;
		if (!scope.__faustRegisteredProcessors) scope.__faustRegisteredProcessors = /* @__PURE__ */ new Set();
		if (!scope.__faustRegisteredProcessors.has(name)) {
			registerProcessor(name, Processor);
			scope.__faustRegisteredProcessors.add(name);
		}
	}
	return FaustFFTAudioWorkletProcessor;
};
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/FaustDspInstance.js
var FaustDspInstance = class {
	constructor(exports) {
		this.fExports = exports;
	}
	compute($dsp, count, $input, $output) {
		this.fExports.compute($dsp, count, $input, $output);
	}
	getNumInputs($dsp) {
		return this.fExports.getNumInputs($dsp);
	}
	getNumOutputs($dsp) {
		return this.fExports.getNumOutputs($dsp);
	}
	getParamValue($dsp, index) {
		return this.fExports.getParamValue($dsp, index);
	}
	getSampleRate($dsp) {
		return this.fExports.getSampleRate($dsp);
	}
	init($dsp, sampleRate) {
		this.fExports.init($dsp, sampleRate);
	}
	instanceClear($dsp) {
		this.fExports.instanceClear($dsp);
	}
	instanceConstants($dsp, sampleRate) {
		this.fExports.instanceConstants($dsp, sampleRate);
	}
	instanceInit($dsp, sampleRate) {
		this.fExports.instanceInit($dsp, sampleRate);
	}
	instanceResetUserInterface($dsp) {
		this.fExports.instanceResetUserInterface($dsp);
	}
	setParamValue($dsp, index, value) {
		this.fExports.setParamValue($dsp, index, value);
	}
};
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/FaustWasmInstantiator.js
var FaustWasmInstantiator = class {
	static createWasmImport(memory) {
		return { env: {
			memory: memory || new WebAssembly.Memory({ initial: 100 }),
			memoryBase: 0,
			tableBase: 0,
			_abs: Math.abs,
			_acosf: Math.acos,
			_asinf: Math.asin,
			_atanf: Math.atan,
			_atan2f: Math.atan2,
			_ceilf: Math.ceil,
			_cosf: Math.cos,
			_expf: Math.exp,
			_floorf: Math.floor,
			_fmodf: (x, y) => x % y,
			_logf: Math.log,
			_log10f: Math.log10,
			_max_f: Math.max,
			_min_f: Math.min,
			_remainderf: (x, y) => x - Math.round(x / y) * y,
			_powf: Math.pow,
			_roundf: Math.round,
			_sinf: Math.sin,
			_sqrtf: Math.sqrt,
			_tanf: Math.tan,
			_acoshf: Math.acosh,
			_asinhf: Math.asinh,
			_atanhf: Math.atanh,
			_coshf: Math.cosh,
			_sinhf: Math.sinh,
			_tanhf: Math.tanh,
			_isnanf: Number.isNaN,
			_isinff: (x) => !isFinite(x),
			_copysignf: (x, y) => Math.sign(x) === Math.sign(y) ? x : -x,
			_acos: Math.acos,
			_asin: Math.asin,
			_atan: Math.atan,
			_atan2: Math.atan2,
			_ceil: Math.ceil,
			_cos: Math.cos,
			_exp: Math.exp,
			_floor: Math.floor,
			_fmod: (x, y) => x % y,
			_log: Math.log,
			_log10: Math.log10,
			_max_: Math.max,
			_min_: Math.min,
			_remainder: (x, y) => x - Math.round(x / y) * y,
			_pow: Math.pow,
			_round: Math.round,
			_sin: Math.sin,
			_sqrt: Math.sqrt,
			_tan: Math.tan,
			_acosh: Math.acosh,
			_asinh: Math.asinh,
			_atanh: Math.atanh,
			_cosh: Math.cosh,
			_sinh: Math.sinh,
			_tanh: Math.tanh,
			_isnan: Number.isNaN,
			_isinf: (x) => !isFinite(x),
			_copysign: (x, y) => Math.sign(x) === Math.sign(y) ? x : -x,
			table: new WebAssembly.Table({
				initial: 0,
				element: "anyfunc"
			})
		} };
	}
	static createWasmMemoryPoly(voicesIn, sampleSize, dspMeta, effectMeta, bufferSize) {
		const voices = Math.max(4, voicesIn);
		const ptrSize = sampleSize;
		const pow2limit = (x) => {
			let n = 65536;
			while (n < x) n *= 2;
			return n;
		};
		let memorySize = pow2limit((effectMeta ? effectMeta.size : 0) + dspMeta.size * voices + (dspMeta.inputs + dspMeta.outputs * 2) * (ptrSize + bufferSize * sampleSize)) / 65536;
		memorySize = Math.max(2, memorySize);
		return new WebAssembly.Memory({ initial: memorySize });
	}
	static createWasmMemoryMono(sampleSize, dspMeta, bufferSize) {
		const ptrSize = sampleSize;
		const memorySize = (dspMeta.size + (dspMeta.inputs + dspMeta.outputs) * (ptrSize + bufferSize * sampleSize)) / 65536;
		return new WebAssembly.Memory({ initial: memorySize * 2 });
	}
	static createMonoDSPInstanceAux(instance, json, mem = null) {
		const functions = instance.exports;
		const api = new FaustDspInstance(functions);
		return {
			memory: mem ? mem : instance.exports.memory,
			api,
			json
		};
	}
	static createMemoryMono(monoFactory) {
		const monoMeta = JSON.parse(monoFactory.json);
		const sampleSize = monoMeta.compile_options.match("-double") ? 8 : 4;
		return this.createWasmMemoryMono(sampleSize, monoMeta, 8192);
	}
	static createMemoryPoly(voices, voiceFactory, effectFactory) {
		const voiceMeta = JSON.parse(voiceFactory.json);
		const effectMeta = effectFactory && effectFactory.json ? JSON.parse(effectFactory.json) : null;
		const sampleSize = voiceMeta.compile_options.match("-double") ? 8 : 4;
		return this.createWasmMemoryPoly(voices, sampleSize, voiceMeta, effectMeta, 8192);
	}
	static createMixerAux(mixerModule, memory) {
		const mixerImport = {
			imports: { print: console.log },
			memory: { memory }
		};
		return new WebAssembly.Instance(mixerModule, mixerImport).exports;
	}
	static async loadDSPFactory(wasmPath, jsonPath) {
		const wasmFile = await fetch(wasmPath);
		if (!wasmFile.ok) throw new Error(`=> exception raised while running loadDSPFactory, file not found: ${wasmPath}`);
		const wasmBuffer = await wasmFile.arrayBuffer();
		const module = await WebAssembly.compile(wasmBuffer);
		const json = await (await fetch(jsonPath)).text();
		const poly = JSON.parse(json).compile_options.indexOf("wasm-e") !== -1;
		return {
			cfactory: 0,
			code: new Uint8Array(wasmBuffer),
			module,
			json,
			poly
		};
	}
	static async loadDSPMixer(mixerPath, fs) {
		let mixerBuffer = null;
		if (fs) mixerBuffer = new Uint8Array(fs.readFile(mixerPath, { encoding: "binary" }));
		else mixerBuffer = await (await fetch(mixerPath)).arrayBuffer();
		return WebAssembly.compile(mixerBuffer);
	}
	static async createAsyncMonoDSPInstance(factory) {
		if (/"type":\s*"soundfile"/.test(factory.json)) {
			const memory = this.createMemoryMono(factory);
			const instance = await WebAssembly.instantiate(factory.module, this.createWasmImport(memory));
			return this.createMonoDSPInstanceAux(instance, factory.json, memory);
		} else {
			const instance = await WebAssembly.instantiate(factory.module, this.createWasmImport());
			return this.createMonoDSPInstanceAux(instance, factory.json);
		}
	}
	static createSyncMonoDSPInstance(factory) {
		if (/"type":\s*"soundfile"/.test(factory.json)) {
			const memory = this.createMemoryMono(factory);
			const instance = new WebAssembly.Instance(factory.module, this.createWasmImport(memory));
			return this.createMonoDSPInstanceAux(instance, factory.json, memory);
		} else {
			const instance = new WebAssembly.Instance(factory.module, this.createWasmImport());
			return this.createMonoDSPInstanceAux(instance, factory.json);
		}
	}
	static async createAsyncPolyDSPInstance(voiceFactory, mixerModule, voices, effectFactory) {
		const memory = this.createMemoryPoly(voices, voiceFactory, effectFactory);
		const voiceFunctions = (await WebAssembly.instantiate(voiceFactory.module, this.createWasmImport(memory))).exports;
		const voiceAPI = new FaustDspInstance(voiceFunctions);
		const mixerAPI = this.createMixerAux(mixerModule, memory);
		if (effectFactory) {
			const effectFunctions = (await WebAssembly.instantiate(effectFactory.module, this.createWasmImport(memory))).exports;
			return {
				memory,
				voices,
				voiceAPI,
				effectAPI: new FaustDspInstance(effectFunctions),
				mixerAPI,
				voiceJSON: voiceFactory.json,
				effectJSON: effectFactory.json
			};
		} else return {
			memory,
			voices,
			voiceAPI,
			mixerAPI,
			voiceJSON: voiceFactory.json
		};
	}
	static createSyncPolyDSPInstance(voiceFactory, mixerModule, voices, effectFactory) {
		const memory = this.createMemoryPoly(voices, voiceFactory, effectFactory);
		const voiceFunctions = new WebAssembly.Instance(voiceFactory.module, this.createWasmImport(memory)).exports;
		const voiceAPI = new FaustDspInstance(voiceFunctions);
		const mixerAPI = this.createMixerAux(mixerModule, memory);
		if (effectFactory) {
			const effectFunctions = new WebAssembly.Instance(effectFactory.module, this.createWasmImport(memory)).exports;
			return {
				memory,
				voices,
				voiceAPI,
				effectAPI: new FaustDspInstance(effectFunctions),
				mixerAPI,
				voiceJSON: voiceFactory.json,
				effectJSON: effectFactory.json
			};
		} else return {
			memory,
			voices,
			voiceAPI,
			mixerAPI,
			voiceJSON: voiceFactory.json
		};
	}
};
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/FaustOfflineProcessor.js
var FaustOfflineProcessor = class {
	constructor(instance, bufferSize) {
		this.fDSPCode = instance;
		this.fBufferSize = bufferSize;
		this.fInputs = new Array(this.fDSPCode.getNumInputs()).fill(null).map(() => new Float32Array(bufferSize));
		this.fOutputs = new Array(this.fDSPCode.getNumOutputs()).fill(null).map(() => new Float32Array(bufferSize));
	}
	getParameterDescriptors() {
		const params = [];
		const callback = (item) => {
			let param = null;
			const isPolyReserved = "address" in item && !![
				"/gate",
				"/freq",
				"/gain",
				"/key",
				"/vel",
				"/velocity"
			].find((k) => item.address.endsWith(k));
			if (this.fDSPCode instanceof FaustMonoWebAudioDsp || !isPolyReserved) {
				if (item.type === "vslider" || item.type === "hslider" || item.type === "nentry") param = {
					name: item.address,
					defaultValue: item.init || 0,
					minValue: item.min || 0,
					maxValue: item.max || 0
				};
				else if (item.type === "button" || item.type === "checkbox") param = {
					name: item.address,
					defaultValue: item.init || 0,
					minValue: 0,
					maxValue: 1
				};
			}
			if (param) params.push(param);
		};
		FaustBaseWebAudioDsp.parseUI(this.fDSPCode.getUI(), callback);
		return params;
	}
	compute(input, output) {
		return this.fDSPCode.compute(input, output);
	}
	setOutputParamHandler(handler) {
		this.fDSPCode.setOutputParamHandler(handler);
	}
	getOutputParamHandler() {
		return this.fDSPCode.getOutputParamHandler();
	}
	callOutputParamHandler(path, value) {
		this.fDSPCode.callOutputParamHandler(path, value);
	}
	setInputParamHandler(handler) {
		this.fDSPCode.setInputParamHandler(handler);
	}
	getInputParamHandler() {
		return this.fDSPCode.getInputParamHandler();
	}
	callInputParamHandler(path, value) {
		this.fDSPCode.callInputParamHandler(path, value);
	}
	setComputeHandler(handler) {
		this.fDSPCode.setComputeHandler(handler);
	}
	getComputeHandler() {
		return this.fDSPCode.getComputeHandler();
	}
	setPlotHandler(handler) {
		this.fDSPCode.setPlotHandler(handler);
	}
	getPlotHandler() {
		return this.fDSPCode.getPlotHandler();
	}
	getNumInputs() {
		return this.fDSPCode.getNumInputs();
	}
	getNumOutputs() {
		return this.fDSPCode.getNumOutputs();
	}
	metadata(handler) {}
	midiMessage(data) {
		this.fDSPCode.midiMessage(data);
	}
	ctrlChange(chan, ctrl, value) {
		this.fDSPCode.ctrlChange(chan, ctrl, value);
	}
	pitchWheel(chan, value) {
		this.fDSPCode.pitchWheel(chan, value);
	}
	keyOn(channel, pitch, velocity) {
		this.fDSPCode.keyOn(channel, pitch, velocity);
	}
	keyOff(channel, pitch, velocity) {
		this.fDSPCode.keyOff(channel, pitch, velocity);
	}
	setParamValue(path, value) {
		this.fDSPCode.setParamValue(path, value);
	}
	getParamValue(path) {
		return this.fDSPCode.getParamValue(path);
	}
	getParams() {
		return this.fDSPCode.getParams();
	}
	getMeta() {
		return this.fDSPCode.getMeta();
	}
	getJSON() {
		return this.fDSPCode.getJSON();
	}
	getDescriptors() {
		return this.fDSPCode.getDescriptors();
	}
	getUI() {
		return this.fDSPCode.getUI();
	}
	init() {
		this.fDSPCode.init();
	}
	instanceInit() {
		this.fDSPCode.instanceInit();
	}
	instanceClear() {
		this.fDSPCode.instanceClear();
	}
	instanceConstants() {
		this.fDSPCode.instanceConstants();
	}
	instanceResetUserInterface() {
		this.fDSPCode.instanceResetUserInterface();
	}
	start() {
		this.fDSPCode.start();
	}
	stop() {
		this.fDSPCode.stop();
	}
	destroy() {
		this.fDSPCode.destroy();
	}
	get hasAccInput() {
		return this.fDSPCode.hasAccInput;
	}
	propagateAcc(accelerationIncludingGravity, invert = false) {
		this.fDSPCode.propagateAcc(accelerationIncludingGravity, invert);
	}
	get hasGyrInput() {
		return this.fDSPCode.hasGyrInput;
	}
	propagateGyr(event) {
		this.fDSPCode.propagateGyr(event);
	}
	startSensors() {}
	stopSensors() {}
	/**
	* Render frames in an array.
	*
	* @param inputs - input signal
	* @param length - the number of frames to render (default: bufferSize)
	* @param onUpdate - a callback after each buffer calculated, with an argument "current sample"
	* @return an array of Float32Array with the rendered frames
	*/
	render(inputs = [], length = this.fBufferSize, onUpdate) {
		let l = 0;
		const outputs = new Array(this.fDSPCode.getNumOutputs()).fill(null).map(() => new Float32Array(length));
		this.fDSPCode.start();
		while (l < length) {
			const sliceLength = Math.min(length - l, this.fBufferSize);
			for (let i = 0; i < this.fDSPCode.getNumInputs(); i++) {
				let input;
				if (inputs[i]) {
					if (inputs[i].length <= l) input = new Float32Array(sliceLength);
					else if (inputs[i].length > l + sliceLength) input = inputs[i].subarray(l, l + sliceLength);
					else input = inputs[i].subarray(l, inputs[i].length);
				} else input = new Float32Array(sliceLength);
				this.fInputs[i] = input;
			}
			this.fDSPCode.compute(this.fInputs, this.fOutputs);
			for (let i = 0; i < this.fDSPCode.getNumOutputs(); i++) {
				const output = this.fOutputs[i];
				if (sliceLength < this.fBufferSize) outputs[i].set(output.subarray(0, sliceLength), l);
				else outputs[i].set(output, l);
			}
			l += sliceLength;
			onUpdate === null || onUpdate === void 0 || onUpdate(l);
		}
		this.fDSPCode.stop();
		return outputs;
	}
};
var FaustMonoOfflineProcessor = class extends FaustOfflineProcessor {};
var FaustPolyOfflineProcessor = class extends FaustOfflineProcessor {
	keyOn(channel, pitch, velocity) {
		this.fDSPCode.keyOn(channel, pitch, velocity);
	}
	keyOff(channel, pitch, velocity) {
		this.fDSPCode.keyOff(channel, pitch, velocity);
	}
	allNotesOff(hard) {
		this.fDSPCode.allNotesOff(hard);
	}
};
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/FaustScriptProcessorNode.js
/**
* Base class for Monophonic and Polyphonic ScriptProcessorNode
*/
var FaustScriptProcessorNode = class extends (globalThis.ScriptProcessorNode || null) {
	constructor() {
		super(...arguments);
		this.handleDeviceMotion = void 0;
		this.handleDeviceOrientation = void 0;
	}
	setupNode(instance) {
		this.fDSPCode = instance;
		this.fInputs = new Array(this.fDSPCode.getNumInputs());
		this.fOutputs = new Array(this.fDSPCode.getNumOutputs());
		this.handleDeviceMotion = ({ accelerationIncludingGravity }) => {
			const isAndroid = /Android/i.test(navigator.userAgent);
			if (!accelerationIncludingGravity) return;
			const { x, y, z } = accelerationIncludingGravity;
			this.propagateAcc({
				x,
				y,
				z
			}, isAndroid);
		};
		this.handleDeviceOrientation = ({ alpha, beta, gamma }) => {
			this.propagateGyr({
				alpha,
				beta,
				gamma
			});
		};
		this.onaudioprocess = (e) => {
			for (let chan = 0; chan < this.fDSPCode.getNumInputs(); chan++) this.fInputs[chan] = e.inputBuffer.getChannelData(chan);
			for (let chan = 0; chan < this.fDSPCode.getNumOutputs(); chan++) this.fOutputs[chan] = e.outputBuffer.getChannelData(chan);
			return this.fDSPCode.compute(this.fInputs, this.fOutputs);
		};
		this.start();
	}
	init() {
		this.fDSPCode.init();
	}
	instanceInit() {
		this.fDSPCode.instanceInit();
	}
	instanceClear() {
		this.fDSPCode.instanceClear();
	}
	instanceConstants() {
		this.fDSPCode.instanceConstants();
	}
	instanceResetUserInterface() {
		this.fDSPCode.instanceResetUserInterface();
	}
	/** Start accelerometer and gyroscope handlers */
	async startSensors() {
		if (this.hasAccInput) {
			if (window.DeviceMotionEvent) window.addEventListener("devicemotion", this.handleDeviceMotion, true);
			else console.log("Cannot set the accelerometer handler.");
		}
		if (this.hasGyrInput) {
			if (window.DeviceMotionEvent) window.addEventListener("deviceorientation", this.handleDeviceOrientation, true);
			else console.log("Cannot set the gyroscope handler.");
		}
	}
	/** Stop accelerometer and gyroscope handlers */
	stopSensors() {
		if (this.hasAccInput) window.removeEventListener("devicemotion", this.handleDeviceMotion, true);
		if (this.hasGyrInput) window.removeEventListener("deviceorientation", this.handleDeviceOrientation, true);
	}
	compute(input, output) {
		return this.fDSPCode.compute(input, output);
	}
	setOutputParamHandler(handler) {
		this.fDSPCode.setOutputParamHandler(handler);
	}
	getOutputParamHandler() {
		return this.fDSPCode.getOutputParamHandler();
	}
	callOutputParamHandler(path, value) {
		this.fDSPCode.callOutputParamHandler(path, value);
	}
	setInputParamHandler(handler) {
		this.fDSPCode.setInputParamHandler(handler);
	}
	getInputParamHandler() {
		return this.fDSPCode.getInputParamHandler();
	}
	callInputParamHandler(path, value) {
		this.fDSPCode.callInputParamHandler(path, value);
	}
	setComputeHandler(handler) {
		this.fDSPCode.setComputeHandler(handler);
	}
	getComputeHandler() {
		return this.fDSPCode.getComputeHandler();
	}
	setPlotHandler(handler) {
		this.fDSPCode.setPlotHandler(handler);
	}
	getPlotHandler() {
		return this.fDSPCode.getPlotHandler();
	}
	getNumInputs() {
		return this.fDSPCode.getNumInputs();
	}
	getNumOutputs() {
		return this.fDSPCode.getNumOutputs();
	}
	metadata(handler) {}
	midiMessage(data) {
		this.fDSPCode.midiMessage(data);
	}
	ctrlChange(chan, ctrl, value) {
		this.fDSPCode.ctrlChange(chan, ctrl, value);
	}
	pitchWheel(chan, value) {
		this.fDSPCode.pitchWheel(chan, value);
	}
	keyOn(channel, pitch, velocity) {
		this.fDSPCode.keyOn(channel, pitch, velocity);
	}
	keyOff(channel, pitch, velocity) {
		this.fDSPCode.keyOff(channel, pitch, velocity);
	}
	setParamValue(path, value) {
		this.fDSPCode.setParamValue(path, value);
	}
	getParamValue(path) {
		return this.fDSPCode.getParamValue(path);
	}
	getParams() {
		return this.fDSPCode.getParams();
	}
	getMeta() {
		return this.fDSPCode.getMeta();
	}
	getJSON() {
		return this.fDSPCode.getJSON();
	}
	getDescriptors() {
		return this.fDSPCode.getDescriptors();
	}
	getUI() {
		return this.fDSPCode.getUI();
	}
	start() {
		this.fDSPCode.start();
	}
	stop() {
		this.fDSPCode.stop();
	}
	destroy() {
		this.fDSPCode.destroy();
	}
	get hasAccInput() {
		return this.fDSPCode.hasAccInput;
	}
	propagateAcc(accelerationIncludingGravity, invert = false) {
		this.fDSPCode.propagateAcc(accelerationIncludingGravity, invert);
	}
	get hasGyrInput() {
		return this.fDSPCode.hasGyrInput;
	}
	propagateGyr(event) {
		this.fDSPCode.propagateGyr(event);
	}
};
var FaustMonoScriptProcessorNode = class extends FaustScriptProcessorNode {};
var FaustPolyScriptProcessorNode = class extends FaustScriptProcessorNode {
	keyOn(channel, pitch, velocity) {
		this.fDSPCode.keyOn(channel, pitch, velocity);
	}
	keyOff(channel, pitch, velocity) {
		this.fDSPCode.keyOff(channel, pitch, velocity);
	}
	allNotesOff(hard) {
		this.fDSPCode.allNotesOff(hard);
	}
};
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/WavDecoder.js
/**
* Code from https://github.com/mohayonao/wav-decoder
*/
var WavDecoder = class {
	static decode(buffer, options) {
		const reader = new Reader(new DataView(buffer));
		if (reader.string(4) !== "RIFF") throw new TypeError("Invalid WAV file");
		reader.uint32();
		if (reader.string(4) !== "WAVE") throw new TypeError("Invalid WAV file");
		let format = null;
		let audioData = null;
		do {
			const chunkType = reader.string(4);
			const chunkSize = reader.uint32();
			if (chunkType === "fmt ") format = this.decodeFormat(reader, chunkSize);
			else if (chunkType === "data") audioData = this.decodeData(reader, chunkSize, format, options || {});
			else reader.skip(chunkSize);
		} while (audioData === null);
		return audioData;
	}
	static decodeFormat(reader, chunkSize) {
		const formats = {
			1: "lpcm",
			3: "lpcm"
		};
		const formatId = reader.uint16();
		if (!Object.prototype.hasOwnProperty.call(formats, formatId)) throw new TypeError("Unsupported format in WAV file: 0x" + formatId.toString(16));
		const format = {
			formatId,
			float: formatId === 3,
			numberOfChannels: reader.uint16(),
			sampleRate: reader.uint32(),
			byteRate: reader.uint32(),
			blockSize: reader.uint16(),
			bitDepth: reader.uint16()
		};
		reader.skip(chunkSize - 16);
		return format;
	}
	static decodeData(reader, chunkSizeIn, format, options) {
		const chunkSize = Math.min(chunkSizeIn, reader.remain());
		const length = Math.floor(chunkSize / format.blockSize);
		const numberOfChannels = format.numberOfChannels;
		const sampleRate = format.sampleRate;
		const channelData = new Array(numberOfChannels);
		for (let ch = 0; ch < numberOfChannels; ch++) {
			const ab = new (options.shared ? globalThis.SharedArrayBuffer || globalThis.ArrayBuffer : globalThis.ArrayBuffer)(length * Float32Array.BYTES_PER_ELEMENT);
			channelData[ch] = new Float32Array(ab);
		}
		this.readPCM(reader, channelData, length, format, options);
		return {
			numberOfChannels,
			length,
			sampleRate,
			channelData
		};
	}
	static readPCM(reader, channelData, length, format, options) {
		const bitDepth = format.bitDepth;
		const decoderOption = format.float ? "f" : options.symmetric ? "s" : "";
		const methodName = "pcm" + bitDepth + decoderOption;
		if (!reader[methodName]) throw new TypeError("Not supported bit depth: " + format.bitDepth);
		const read = reader[methodName].bind(reader);
		const numberOfChannels = format.numberOfChannels;
		for (let i = 0; i < length; i++) for (let ch = 0; ch < numberOfChannels; ch++) channelData[ch][i] = read();
	}
};
var Reader = class {
	constructor(dataView) {
		this.pos = 0;
		this.dataView = dataView;
	}
	remain() {
		return this.dataView.byteLength - this.pos;
	}
	skip(n) {
		this.pos += n;
	}
	uint8() {
		const data = this.dataView.getUint8(this.pos);
		this.pos += 1;
		return data;
	}
	int16() {
		const data = this.dataView.getInt16(this.pos, true);
		this.pos += 2;
		return data;
	}
	uint16() {
		const data = this.dataView.getUint16(this.pos, true);
		this.pos += 2;
		return data;
	}
	uint32() {
		const data = this.dataView.getUint32(this.pos, true);
		this.pos += 4;
		return data;
	}
	string(n) {
		let data = "";
		for (let i = 0; i < n; i++) data += String.fromCharCode(this.uint8());
		return data;
	}
	pcm8() {
		const data = this.dataView.getUint8(this.pos) - 128;
		this.pos += 1;
		return data < 0 ? data / 128 : data / 127;
	}
	pcm8s() {
		const data = this.dataView.getUint8(this.pos) - 127.5;
		this.pos += 1;
		return data / 127.5;
	}
	pcm16() {
		const data = this.dataView.getInt16(this.pos, true);
		this.pos += 2;
		return data < 0 ? data / 32768 : data / 32767;
	}
	pcm16s() {
		const data = this.dataView.getInt16(this.pos, true);
		this.pos += 2;
		return data / 32768;
	}
	pcm24() {
		const x0 = this.dataView.getUint8(this.pos + 0);
		const x1 = this.dataView.getUint8(this.pos + 1);
		const x2 = this.dataView.getUint8(this.pos + 2);
		const xx = x0 + (x1 << 8) + (x2 << 16);
		const data = xx >= 8388608 ? xx - 16777216 : xx;
		this.pos += 3;
		return data < 0 ? data / 8388608 : data / 8388607;
	}
	pcm24s() {
		const x0 = this.dataView.getUint8(this.pos + 0);
		const x1 = this.dataView.getUint8(this.pos + 1);
		const x2 = this.dataView.getUint8(this.pos + 2);
		const xx = x0 + (x1 << 8) + (x2 << 16);
		const data = xx >= 8388608 ? xx - 16777216 : xx;
		this.pos += 3;
		return data / 8388608;
	}
	pcm32() {
		const data = this.dataView.getInt32(this.pos, true);
		this.pos += 4;
		return data < 0 ? data / 2147483648 : data / 2147483647;
	}
	pcm32s() {
		const data = this.dataView.getInt32(this.pos, true);
		this.pos += 4;
		return data / 2147483648;
	}
	pcm32f() {
		const data = this.dataView.getFloat32(this.pos, true);
		this.pos += 4;
		return data;
	}
	pcm64f() {
		const data = this.dataView.getFloat64(this.pos, true);
		this.pos += 8;
		return data;
	}
};
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/SoundfileReader.js
/** Read metadata and fetch soundfiles */
var SoundfileReader = class {
	/**
	* Set fallback base URLs used to resolve soundfile paths.
	*
	* In Node or other non-browser runtimes, `location` may be undefined;
	* in that case this returns an empty list to avoid resolution errors.
	*/
	static get fallbackPaths() {
		const loc = typeof location !== "undefined" ? location : null;
		const href = loc === null || loc === void 0 ? void 0 : loc.href;
		const origin = loc === null || loc === void 0 ? void 0 : loc.origin;
		return [
			href,
			href ? this.getParentUrl(href) : null,
			origin
		].filter((value) => typeof value === "string" && value.length > 0);
	}
	/**
	* Extract the parent URL from an URL.
	* @param url : the URL
	* @returns : the parent URL
	*/
	static getParentUrl(url) {
		return url.substring(0, url.lastIndexOf("/") + 1);
	}
	/**
	* Convert an audio buffer to audio data.
	*
	* @param audioBuffer : the audio buffer to convert
	* @returns : the audio data
	*/
	static toAudioData(audioBuffer) {
		const { sampleRate, numberOfChannels } = audioBuffer;
		return {
			sampleRate,
			audioBuffer: new Array(numberOfChannels).fill(null).map((v, i) => audioBuffer.getChannelData(i))
		};
	}
	static isWaveFile(buffer) {
		if (buffer.byteLength < 12) return false;
		const reader = new DataView(buffer);
		const riff = reader.getUint8(0) === 82 && reader.getUint8(1) === 73 && reader.getUint8(2) === 70 && reader.getUint8(3) === 70;
		const wave = reader.getUint8(8) === 87 && reader.getUint8(9) === 65 && reader.getUint8(10) === 86 && reader.getUint8(11) === 69;
		return riff && wave;
	}
	static decodeWaveFile(buffer) {
		const decoded = WavDecoder.decode(buffer);
		return {
			sampleRate: decoded.sampleRate,
			audioBuffer: decoded.channelData
		};
	}
	/**
	* Extract the URLs from the metadata.
	*
	* @param dspMeta : the metadata
	* @returns : the URLs
	*/
	static findSoundfilesFromMeta(dspMeta) {
		const soundfiles = {};
		const callback = (item) => {
			if (item.type === "soundfile") FaustBaseWebAudioDsp.splitSoundfileNames(item.url).filter((url) => url.trim().length > 0).forEach((url) => soundfiles[url] = null);
		};
		FaustBaseWebAudioDsp.parseUI(dspMeta.ui, callback);
		return soundfiles;
	}
	/**
	* Fetch the soundfile.
	*
	* @param url : the url of the soundfile
	* @param audioCtx : the audio context
	* @returns : the audio data
	*/
	static async fetchSoundfile(url, audioCtx) {
		console.log(`Loading sound file from ${url}`);
		const response = await fetch(url);
		if (!response.ok) throw new Error(`Failed to load sound file from ${url}: ${response.statusText}`);
		const arrayBuffer = await response.arrayBuffer();
		if (this.isWaveFile(arrayBuffer)) try {
			return this.decodeWaveFile(arrayBuffer);
		} catch (error) {
			console.error(error);
		}
		const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
		return this.toAudioData(audioBuffer);
	}
	/**
	* Load the soundfile.
	*
	* @param filename : the filename
	* @param metaUrls : the metadata URLs
	* @param soundfiles : the soundfiles
	* @param audioCtx : the audio context
	*/
	static async loadSoundfile(filename, metaUrls, soundfiles, audioCtx) {
		if (soundfiles === null || soundfiles === void 0 ? void 0 : soundfiles[filename]) return;
		const urlsToCheck = [filename, ...[...metaUrls, ...this.fallbackPaths].map((path) => new URL(filename, path.endsWith("/") ? path : `${path}/`).href)];
		let lastError = null;
		for (const url of urlsToCheck) try {
			soundfiles[filename] = await this.fetchSoundfile(url, audioCtx);
			return;
		} catch (error) {
			lastError = error;
		}
		throw new Error(`Failed to load sound file ${filename}, all check failed. Last error: ${String(lastError)}`);
	}
	/**
	* Load the soundfiles, public API.
	*
	* @param dspMeta : the metadata
	* @param soundfilesIn : the soundfiles
	* @param audioCtx : the audio context
	* @returns : the soundfiles
	*/
	static async loadSoundfiles(dspMeta, soundfilesIn, audioCtx) {
		const metaUrls = FaustBaseWebAudioDsp.extractUrlsFromMeta(dspMeta);
		const soundfiles = this.findSoundfilesFromMeta(dspMeta);
		for (const id in soundfiles) {
			if (soundfilesIn === null || soundfilesIn === void 0 ? void 0 : soundfilesIn[id]) {
				soundfiles[id] = soundfilesIn[id];
				continue;
			}
			try {
				await this.loadSoundfile(id, metaUrls, soundfiles, audioCtx);
			} catch (error) {
				console.error(error);
			}
		}
		return soundfiles;
	}
};
//#endregion
//#region node_modules/tslib/tslib.es6.mjs
function __awaiter(thisArg, _arguments, P, generator) {
	function adopt(value) {
		return value instanceof P ? value : new P(function(resolve) {
			resolve(value);
		});
	}
	return new (P || (P = Promise))(function(resolve, reject) {
		function fulfilled(value) {
			try {
				step(generator.next(value));
			} catch (e) {
				reject(e);
			}
		}
		function rejected(value) {
			try {
				step(generator["throw"](value));
			} catch (e) {
				reject(e);
			}
		}
		function step(result) {
			result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected);
		}
		step((generator = generator.apply(thisArg, _arguments || [])).next());
	});
}
function __generator(thisArg, body) {
	var _ = {
		label: 0,
		sent: function() {
			if (t[0] & 1) throw t[1];
			return t[1];
		},
		trys: [],
		ops: []
	}, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
	return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() {
		return this;
	}), g;
	function verb(n) {
		return function(v) {
			return step([n, v]);
		};
	}
	function step(op) {
		if (f) throw new TypeError("Generator is already executing.");
		while (g && (g = 0, op[0] && (_ = 0)), _) try {
			if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
			if (y = 0, t) op = [op[0] & 2, t.value];
			switch (op[0]) {
				case 0:
				case 1:
					t = op;
					break;
				case 4:
					_.label++;
					return {
						value: op[1],
						done: false
					};
				case 5:
					_.label++;
					y = op[1];
					op = [0];
					continue;
				case 7:
					op = _.ops.pop();
					_.trys.pop();
					continue;
				default:
					if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) {
						_ = 0;
						continue;
					}
					if (op[0] === 3 && (!t || op[1] > t[0] && op[1] < t[3])) {
						_.label = op[1];
						break;
					}
					if (op[0] === 6 && _.label < t[1]) {
						_.label = t[1];
						t = op;
						break;
					}
					if (t && _.label < t[2]) {
						_.label = t[2];
						_.ops.push(op);
						break;
					}
					if (t[2]) _.ops.pop();
					_.trys.pop();
					continue;
			}
			op = body.call(thisArg, _);
		} catch (e) {
			op = [6, e];
			y = 0;
		} finally {
			f = t = 0;
		}
		if (op[0] & 5) throw op[1];
		return {
			value: op[0] ? op[1] : void 0,
			done: true
		};
	}
}
//#endregion
//#region node_modules/@aws-crypto/sha256-js/build/module/constants.js
/**
* @internal
*/
var KEY = new Uint32Array([
	1116352408,
	1899447441,
	3049323471,
	3921009573,
	961987163,
	1508970993,
	2453635748,
	2870763221,
	3624381080,
	310598401,
	607225278,
	1426881987,
	1925078388,
	2162078206,
	2614888103,
	3248222580,
	3835390401,
	4022224774,
	264347078,
	604807628,
	770255983,
	1249150122,
	1555081692,
	1996064986,
	2554220882,
	2821834349,
	2952996808,
	3210313671,
	3336571891,
	3584528711,
	113926993,
	338241895,
	666307205,
	773529912,
	1294757372,
	1396182291,
	1695183700,
	1986661051,
	2177026350,
	2456956037,
	2730485921,
	2820302411,
	3259730800,
	3345764771,
	3516065817,
	3600352804,
	4094571909,
	275423344,
	430227734,
	506948616,
	659060556,
	883997877,
	958139571,
	1322822218,
	1537002063,
	1747873779,
	1955562222,
	2024104815,
	2227730452,
	2361852424,
	2428436474,
	2756734187,
	3204031479,
	3329325298
]);
/**
* @internal
*/
var INIT = [
	1779033703,
	3144134277,
	1013904242,
	2773480762,
	1359893119,
	2600822924,
	528734635,
	1541459225
];
/**
* @internal
*/
var MAX_HASHABLE_LENGTH = Math.pow(2, 53) - 1;
//#endregion
//#region node_modules/@aws-crypto/sha256-js/build/module/RawSha256.js
/**
* @internal
*/
var RawSha256 = function() {
	function RawSha256() {
		this.state = Int32Array.from(INIT);
		this.temp = /* @__PURE__ */ new Int32Array(64);
		this.buffer = /* @__PURE__ */ new Uint8Array(64);
		this.bufferLength = 0;
		this.bytesHashed = 0;
		/**
		* @internal
		*/
		this.finished = false;
	}
	RawSha256.prototype.update = function(data) {
		if (this.finished) throw new Error("Attempted to update an already finished hash.");
		var position = 0;
		var byteLength = data.byteLength;
		this.bytesHashed += byteLength;
		if (this.bytesHashed * 8 > MAX_HASHABLE_LENGTH) throw new Error("Cannot hash more than 2^53 - 1 bits");
		while (byteLength > 0) {
			this.buffer[this.bufferLength++] = data[position++];
			byteLength--;
			if (this.bufferLength === 64) {
				this.hashBuffer();
				this.bufferLength = 0;
			}
		}
	};
	RawSha256.prototype.digest = function() {
		if (!this.finished) {
			var bitsHashed = this.bytesHashed * 8;
			var bufferView = new DataView(this.buffer.buffer, this.buffer.byteOffset, this.buffer.byteLength);
			var undecoratedLength = this.bufferLength;
			bufferView.setUint8(this.bufferLength++, 128);
			if (undecoratedLength % 64 >= 56) {
				for (var i = this.bufferLength; i < 64; i++) bufferView.setUint8(i, 0);
				this.hashBuffer();
				this.bufferLength = 0;
			}
			for (var i = this.bufferLength; i < 56; i++) bufferView.setUint8(i, 0);
			bufferView.setUint32(56, Math.floor(bitsHashed / 4294967296), true);
			bufferView.setUint32(60, bitsHashed);
			this.hashBuffer();
			this.finished = true;
		}
		var out = /* @__PURE__ */ new Uint8Array(32);
		for (var i = 0; i < 8; i++) {
			out[i * 4] = this.state[i] >>> 24 & 255;
			out[i * 4 + 1] = this.state[i] >>> 16 & 255;
			out[i * 4 + 2] = this.state[i] >>> 8 & 255;
			out[i * 4 + 3] = this.state[i] >>> 0 & 255;
		}
		return out;
	};
	RawSha256.prototype.hashBuffer = function() {
		var _a = this, buffer = _a.buffer, state = _a.state;
		var state0 = state[0], state1 = state[1], state2 = state[2], state3 = state[3], state4 = state[4], state5 = state[5], state6 = state[6], state7 = state[7];
		for (var i = 0; i < 64; i++) {
			if (i < 16) this.temp[i] = (buffer[i * 4] & 255) << 24 | (buffer[i * 4 + 1] & 255) << 16 | (buffer[i * 4 + 2] & 255) << 8 | buffer[i * 4 + 3] & 255;
			else {
				var u = this.temp[i - 2];
				var t1_1 = (u >>> 17 | u << 15) ^ (u >>> 19 | u << 13) ^ u >>> 10;
				u = this.temp[i - 15];
				var t2_1 = (u >>> 7 | u << 25) ^ (u >>> 18 | u << 14) ^ u >>> 3;
				this.temp[i] = (t1_1 + this.temp[i - 7] | 0) + (t2_1 + this.temp[i - 16] | 0);
			}
			var t1 = (((state4 >>> 6 | state4 << 26) ^ (state4 >>> 11 | state4 << 21) ^ (state4 >>> 25 | state4 << 7)) + (state4 & state5 ^ ~state4 & state6) | 0) + (state7 + (KEY[i] + this.temp[i] | 0) | 0) | 0;
			var t2 = ((state0 >>> 2 | state0 << 30) ^ (state0 >>> 13 | state0 << 19) ^ (state0 >>> 22 | state0 << 10)) + (state0 & state1 ^ state0 & state2 ^ state1 & state2) | 0;
			state7 = state6;
			state6 = state5;
			state5 = state4;
			state4 = state3 + t1 | 0;
			state3 = state2;
			state2 = state1;
			state1 = state0;
			state0 = t1 + t2 | 0;
		}
		state[0] += state0;
		state[1] += state1;
		state[2] += state2;
		state[3] += state3;
		state[4] += state4;
		state[5] += state5;
		state[6] += state6;
		state[7] += state7;
	};
	return RawSha256;
}();
//#endregion
//#region node_modules/@smithy/util-utf8/dist-es/fromUtf8.browser.js
var fromUtf8$1 = (input) => new TextEncoder().encode(input);
//#endregion
//#region node_modules/@aws-crypto/util/build/module/convertToBuffer.js
var fromUtf8 = typeof Buffer !== "undefined" && Buffer.from ? function(input) {
	return Buffer.from(input, "utf8");
} : fromUtf8$1;
function convertToBuffer(data) {
	if (data instanceof Uint8Array) return data;
	if (typeof data === "string") return fromUtf8(data);
	if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
	return new Uint8Array(data);
}
//#endregion
//#region node_modules/@aws-crypto/util/build/module/isEmptyData.js
function isEmptyData(data) {
	if (typeof data === "string") return data.length === 0;
	return data.byteLength === 0;
}
//#endregion
//#region node_modules/@aws-crypto/sha256-js/build/module/jsSha256.js
var Sha256 = function() {
	function Sha256(secret) {
		this.secret = secret;
		this.hash = new RawSha256();
		this.reset();
	}
	Sha256.prototype.update = function(toHash) {
		if (isEmptyData(toHash) || this.error) return;
		try {
			this.hash.update(convertToBuffer(toHash));
		} catch (e) {
			this.error = e;
		}
	};
	Sha256.prototype.digestSync = function() {
		if (this.error) throw this.error;
		if (this.outer) {
			if (!this.outer.finished) this.outer.update(this.hash.digest());
			return this.outer.digest();
		}
		return this.hash.digest();
	};
	Sha256.prototype.digest = function() {
		return __awaiter(this, void 0, void 0, function() {
			return __generator(this, function(_a) {
				return [2, this.digestSync()];
			});
		});
	};
	Sha256.prototype.reset = function() {
		this.hash = new RawSha256();
		if (this.secret) {
			this.outer = new RawSha256();
			var inner = bufferFromSecret(this.secret);
			var outer = /* @__PURE__ */ new Uint8Array(64);
			outer.set(inner);
			for (var i = 0; i < 64; i++) {
				inner[i] ^= 54;
				outer[i] ^= 92;
			}
			this.hash.update(inner);
			this.outer.update(outer);
			for (var i = 0; i < inner.byteLength; i++) inner[i] = 0;
		}
	};
	return Sha256;
}();
function bufferFromSecret(secret) {
	var input = convertToBuffer(secret);
	if (input.byteLength > 64) {
		var bufferHash = new RawSha256();
		bufferHash.update(input);
		input = bufferHash.digest();
	}
	var buffer = /* @__PURE__ */ new Uint8Array(64);
	buffer.set(input);
	return buffer;
}
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/FaustCompiler.js
var ab2str = (buf) => String.fromCharCode.apply(null, Array.from(buf));
var str2ab = (str) => {
	const buf = new ArrayBuffer(str.length);
	const bufView = new Uint8Array(buf);
	for (let i = 0, strLen = str.length; i < strLen; i++) bufView[i] = str.charCodeAt(i);
	return bufView;
};
var sha256 = async (str) => {
	const sha256 = new Sha256();
	sha256.update(str);
	return Array.from(await sha256.digest()).map((b) => b.toString(16).padStart(2, "0")).join("");
};
var FaustCompiler = class FaustCompiler {
	/**
	* Get a stringified DSP factories table
	*/
	static serializeDSPFactories() {
		const table = {};
		this.gFactories.forEach((factory, shaKey) => {
			const { code, json, poly } = factory;
			table[shaKey] = {
				code: btoa(ab2str(code)),
				json: JSON.parse(json),
				poly
			};
		});
		return table;
	}
	/**
	* Get a stringified DSP factories table as string
	*/
	static stringifyDSPFactories() {
		return JSON.stringify(this.serializeDSPFactories());
	}
	/**
	* Import a DSP factories table
	*/
	static deserializeDSPFactories(table) {
		const awaited = [];
		for (const shaKey in table) {
			const { code, json, poly } = table[shaKey];
			const ab = str2ab(atob(code));
			awaited.push(WebAssembly.compile(ab).then((module) => this.gFactories.set(shaKey, {
				shaKey,
				cfactory: 0,
				code: ab,
				module,
				json: JSON.stringify(json),
				poly,
				soundfiles: {}
			})));
		}
		return Promise.all(awaited);
	}
	/**
	* Import a stringified DSP factories table
	*/
	static importDSPFactories(tableStr) {
		const table = JSON.parse(tableStr);
		return this.deserializeDSPFactories(table);
	}
	constructor(libFaust) {
		this.fLibFaust = libFaust;
		this.fErrorMessage = "";
	}
	intVec2intArray(vec) {
		const size = vec.size();
		const ui8Code = new Uint8Array(size);
		for (let i = 0; i < size; i++) ui8Code[i] = vec.get(i);
		return ui8Code;
	}
	async createDSPFactory(name, code, args, poly) {
		if (FaustCompiler.gFactories.size > 10) FaustCompiler.gFactories.clear();
		const shaKey = await sha256(JSON.stringify([
			name,
			code,
			args,
			poly
		]));
		if (FaustCompiler.gFactories.has(shaKey)) return FaustCompiler.gFactories.get(shaKey) || null;
		else try {
			const faustDspWasm = this.fLibFaust.createDSPFactory(name, code, args, !poly);
			const ui8Code = this.intVec2intArray(faustDspWasm.data);
			faustDspWasm.data.delete();
			const module = await WebAssembly.compile(ui8Code);
			const factory = {
				shaKey,
				cfactory: faustDspWasm.cfactory,
				code: ui8Code,
				module,
				json: faustDspWasm.json,
				poly,
				soundfiles: {}
			};
			this.deleteDSPFactory(factory);
			FaustCompiler.gFactories.set(shaKey, factory);
			return factory;
		} catch (e) {
			this.fErrorMessage = this.fLibFaust.getErrorAfterException();
			this.fLibFaust.cleanupAfterException();
			throw this.fErrorMessage ? new Error(this.fErrorMessage) : e;
		}
	}
	version() {
		return this.fLibFaust.version();
	}
	getErrorMessage() {
		return this.fErrorMessage;
	}
	async createMonoDSPFactory(name, code, args) {
		return this.createDSPFactory(name, code, args, false);
	}
	async createPolyDSPFactory(name, code, args) {
		return this.createDSPFactory(name, code, args, true);
	}
	deleteDSPFactory(factory) {
		this.fLibFaust.deleteDSPFactory(factory.cfactory);
		factory.cfactory = 0;
	}
	expandDSP(code, args) {
		try {
			return this.fLibFaust.expandDSP("FaustDSP", code, args);
		} catch (e) {
			this.fErrorMessage = this.fLibFaust.getErrorAfterException();
			this.fLibFaust.cleanupAfterException();
			throw this.fErrorMessage ? new Error(this.fErrorMessage) : e;
		}
	}
	generateAuxFiles(name, code, args) {
		try {
			return this.fLibFaust.generateAuxFiles(name, code, args);
		} catch (e) {
			this.fErrorMessage = this.fLibFaust.getErrorAfterException();
			this.fLibFaust.cleanupAfterException();
			throw this.fErrorMessage ? new Error(this.fErrorMessage) : e;
		}
	}
	deleteAllDSPFactories() {
		this.fLibFaust.deleteAllDSPFactories();
	}
	fs() {
		return this.fLibFaust.fs();
	}
	async getAsyncInternalMixerModule(isDouble = false) {
		const bufferKey = isDouble ? "mixer64Buffer" : "mixer32Buffer";
		const moduleKey = isDouble ? "mixer64Module" : "mixer32Module";
		if (this[moduleKey]) return {
			mixerBuffer: this[bufferKey],
			mixerModule: this[moduleKey]
		};
		const path = isDouble ? "/usr/rsrc/mixer64.wasm" : "/usr/rsrc/mixer32.wasm";
		const mixerBuffer = this.fs().readFile(path, { encoding: "binary" });
		this[bufferKey] = mixerBuffer;
		const mixerModule = await WebAssembly.compile(new Uint8Array(mixerBuffer));
		this[moduleKey] = mixerModule;
		return {
			mixerBuffer,
			mixerModule
		};
	}
	getSyncInternalMixerModule(isDouble = false) {
		const bufferKey = isDouble ? "mixer64Buffer" : "mixer32Buffer";
		const moduleKey = isDouble ? "mixer64Module" : "mixer32Module";
		if (this[moduleKey]) return {
			mixerBuffer: this[bufferKey],
			mixerModule: this[moduleKey]
		};
		const path = isDouble ? "/usr/rsrc/mixer64.wasm" : "/usr/rsrc/mixer32.wasm";
		const mixerBuffer = this.fs().readFile(path, { encoding: "binary" });
		this[bufferKey] = mixerBuffer;
		const mixerModule = new WebAssembly.Module(new Uint8Array(mixerBuffer));
		this[moduleKey] = mixerModule;
		return {
			mixerBuffer,
			mixerModule
		};
	}
};
FaustCompiler.gFactories = /* @__PURE__ */ new Map();
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/instantiateFaustModuleFromFile.js
/**
* Load libfaust-wasm files, than instantiate libFaust
* @param jsFile path to `libfaust-wasm.js`
* @param dataFile path to `libfaust-wasm.data`
* @param wasmFile path to `libfaust-wasm.wasm`
*/
var instantiateFaustModuleFromFile = async (jsFile, dataFile = jsFile.replace(/c?js$/, "data"), wasmFile = jsFile.replace(/c?js$/, "wasm")) => {
	var _a, _b;
	let FaustModule;
	let dataBinary;
	let wasmBinary;
	const jsCodeHead = /var (\w+)\s*=\s*\(/;
	if (typeof window === "object") {
		let jsCode = await (await fetch(jsFile)).text();
		jsCode = `${jsCode}
export default ${(_a = jsCode.match(jsCodeHead)) === null || _a === void 0 ? void 0 : _a[1]};
`;
		FaustModule = (await import(
			/* webpackIgnore: true */
			URL.createObjectURL(new Blob([jsCode], { type: "text/javascript" }))
)).default;
		dataBinary = await (await fetch(dataFile)).arrayBuffer();
		wasmBinary = await (await fetch(wasmFile)).arrayBuffer();
	} else {
		const { promises: fs } = await import("fs");
		const { pathToFileURL } = await import("url");
		let jsCode = await fs.readFile(jsFile, { encoding: "utf-8" });
		jsCode = `
import process from "process";
import * as path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const __filename = fileURLToPath(import.meta.url);
const require = createRequire(import.meta.url);

${jsCode}

export default ${(_b = jsCode.match(jsCodeHead)) === null || _b === void 0 ? void 0 : _b[1]};
`;
		const unique = `${process.pid.toString(36)}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
		const jsFileMod = jsFile.replace(/c?js$/, `${unique}.mjs`);
		await fs.writeFile(jsFileMod, jsCode);
		try {
			FaustModule = (await import(
				/* webpackIgnore: true */
				pathToFileURL(jsFileMod).href
)).default;
		} finally {
			await fs.unlink(jsFileMod).catch(() => {});
		}
		dataBinary = new Uint8Array(await fs.readFile(dataFile)).buffer;
		wasmBinary = new Uint8Array(await fs.readFile(wasmFile)).buffer;
	}
	return await FaustModule({
		wasmBinary,
		getPreloadedPackage: (remotePackageName, remotePackageSize) => {
			if (remotePackageName === "libfaust-wasm.data") return dataBinary;
			return /* @__PURE__ */ new ArrayBuffer(0);
		}
	});
};
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/LibFaust.js
var LibFaust = class {
	constructor(module) {
		this.fModule = module;
		this.fCompiler = new module.libFaustWasm();
		this.fFileSystem = this.fModule.FS;
	}
	module() {
		return this.fModule;
	}
	fs() {
		return this.fFileSystem;
	}
	version() {
		return this.fCompiler.version();
	}
	createDSPFactory(name, code, args, useInternalMemory) {
		return this.fCompiler.createDSPFactory(name, code, args, useInternalMemory);
	}
	deleteDSPFactory(cFactory) {
		return this.fCompiler.deleteDSPFactory(cFactory);
	}
	expandDSP(name, code, args) {
		return this.fCompiler.expandDSP(name, code, args);
	}
	generateAuxFiles(name, code, args) {
		return this.fCompiler.generateAuxFiles(name, code, args);
	}
	deleteAllDSPFactories() {
		return this.fCompiler.deleteAllDSPFactories();
	}
	getErrorAfterException() {
		return this.fCompiler.getErrorAfterException();
	}
	cleanupAfterException() {
		return this.fCompiler.cleanupAfterException();
	}
	getInfos(what) {
		return this.fCompiler.getInfos(what);
	}
	toString() {
		return `LibFaust module: ${this.fModule}, compiler: ${this.fCompiler}`;
	}
};
//#endregion
//#region node_modules/@grame/faustwasm/dist/src/FaustDspGenerator.js
var FaustMonoDspGenerator = class FaustMonoDspGenerator {
	constructor() {
		this.factory = null;
	}
	async compile(compiler, name, code, args) {
		this.factory = await compiler.createMonoDSPFactory(name, code, args);
		if (this.factory) {
			this.name = name;
			return this;
		} else return null;
	}
	addSoundfiles(soundfileMap) {
		if (!this.factory) throw new Error("Code is not compiled, please define the factory or call `await this.compile()` first.");
		for (const id in soundfileMap) this.factory.soundfiles[id] = soundfileMap[id];
	}
	getSoundfileList() {
		if (!this.factory) throw new Error("Code is not compiled, please define the factory or call `await this.compile()` first.");
		const meta = JSON.parse(this.factory.json);
		const map = SoundfileReader.findSoundfilesFromMeta(meta);
		if (!map) return [];
		return Object.keys(map);
	}
	async createNode(context, name = this.name, factory = this.factory, sp = false, bufferSize = 1024, processorName = (factory === null || factory === void 0 ? void 0 : factory.shaKey) || name, processorOptions = {}) {
		var _a, _b;
		if (!factory) throw new Error("Code is not compiled, please define the factory or call `await this.compile()` first.");
		const meta = JSON.parse(factory.json);
		const sampleSize = meta.compile_options.match("-double") ? 8 : 4;
		factory.soundfiles = await SoundfileReader.loadSoundfiles(meta, factory.soundfiles || {}, context);
		if (sp) {
			const monoDsp = new FaustMonoWebAudioDsp(await FaustWasmInstantiator.createAsyncMonoDSPInstance(factory), context.sampleRate, sampleSize, bufferSize, factory.soundfiles);
			const sp = context.createScriptProcessor(bufferSize, monoDsp.getNumInputs(), monoDsp.getNumOutputs());
			Object.setPrototypeOf(sp, FaustMonoScriptProcessorNode.prototype);
			sp.setupNode(monoDsp);
			return sp;
		} else {
			if (!FaustMonoDspGenerator.gWorkletProcessors.has(context)) FaustMonoDspGenerator.gWorkletProcessors.set(context, /* @__PURE__ */ new Set());
			if (!((_a = FaustMonoDspGenerator.gWorkletProcessors.get(context)) === null || _a === void 0 ? void 0 : _a.has(processorName))) {
				const processorCode = `
// DSP name and JSON string for DSP are generated
const faustData = ${JSON.stringify({
					processorName,
					dspName: name,
					dspMeta: meta,
					poly: false
				})};
// Implementation needed classes of functions
var ${FaustDspInstance.name} = ${FaustDspInstance.toString()}
var FaustDspInstance = ${FaustDspInstance.name};
var ${FaustBaseWebAudioDsp.name} = ${FaustBaseWebAudioDsp.toString()}
var FaustBaseWebAudioDsp = ${FaustBaseWebAudioDsp.name};
var ${FaustMonoWebAudioDsp.name} = ${FaustMonoWebAudioDsp.toString()}
var FaustMonoWebAudioDsp = ${FaustMonoWebAudioDsp.name};
var ${FaustWasmInstantiator.name} = ${FaustWasmInstantiator.toString()}
var FaustWasmInstantiator = ${FaustWasmInstantiator.name};
var ${Soundfile.name} = ${Soundfile.toString()}
var Soundfile = ${Soundfile.name};
var ${WasmAllocator.name} = ${WasmAllocator.toString()}
var WasmAllocator = ${WasmAllocator.name};
var ${FaustSensors.name} = ${FaustSensors.toString()}
var FaustSensors = ${FaustSensors.name};
var ${FaustAudioWorkletCommunicator.name} = ${FaustAudioWorkletCommunicator.toString()}
var FaustAudioWorkletCommunicator = ${FaustAudioWorkletCommunicator.name};
var ${FaustAudioWorkletProcessorCommunicator.name} = ${FaustAudioWorkletProcessorCommunicator.toString()}
var FaustAudioWorkletProcessorCommunicator = ${FaustAudioWorkletProcessorCommunicator.name};
// Put them in dependencies
const dependencies = {
    FaustBaseWebAudioDsp,
    FaustMonoWebAudioDsp,
    FaustWasmInstantiator,
    FaustAudioWorkletProcessorCommunicator
};
// Generate the actual AudioWorkletProcessor code
(${getFaustAudioWorkletProcessor.toString()})(dependencies, faustData);
`;
				const url = URL.createObjectURL(new Blob([processorCode], { type: "text/javascript" }));
				await context.audioWorklet.addModule(url);
				(_b = FaustMonoDspGenerator.gWorkletProcessors.get(context)) === null || _b === void 0 || _b.add(processorName);
			}
			return new FaustMonoAudioWorkletNode(context, { processorOptions: {
				name: processorName,
				factory,
				sampleSize,
				...processorOptions
			} });
		}
	}
	async createFFTNode(context, fftUtils, name = this.name, factory = this.factory, fftOptions = {}, processorName = (factory === null || factory === void 0 ? void 0 : factory.shaKey) ? `${factory.shaKey}_fft` : name, processorOptions = {}) {
		var _a, _b;
		if (!factory) throw new Error("Code is not compiled, please define the factory or call `await this.compile()` first.");
		const meta = JSON.parse(factory.json);
		const sampleSize = meta.compile_options.match("-double") ? 8 : 4;
		factory.soundfiles = await SoundfileReader.loadSoundfiles(meta, factory.soundfiles || {}, context);
		if (!FaustMonoDspGenerator.gWorkletProcessors.has(context)) FaustMonoDspGenerator.gWorkletProcessors.set(context, /* @__PURE__ */ new Set());
		if (!((_a = FaustMonoDspGenerator.gWorkletProcessors.get(context)) === null || _a === void 0 ? void 0 : _a.has(processorName))) {
			const processorCode = `
// DSP name and JSON string for DSP are generated
const faustData = ${JSON.stringify({
				processorName,
				dspName: name,
				dspMeta: meta,
				fftOptions
			})};
// Implementation needed classes of functions
var ${FaustDspInstance.name} = ${FaustDspInstance.toString()}
var FaustDspInstance = ${FaustDspInstance.name};
var ${FaustBaseWebAudioDsp.name} = ${FaustBaseWebAudioDsp.toString()}
var FaustBaseWebAudioDsp = ${FaustBaseWebAudioDsp.name};
var ${FaustMonoWebAudioDsp.name} = ${FaustMonoWebAudioDsp.toString()}
var FaustMonoWebAudioDsp = ${FaustMonoWebAudioDsp.name};
var ${FaustWasmInstantiator.name} = ${FaustWasmInstantiator.toString()}
var FaustWasmInstantiator = ${FaustWasmInstantiator.name};
var ${Soundfile.name} = ${Soundfile.toString()}
var Soundfile = ${Soundfile.name};
var ${WasmAllocator.name} = ${WasmAllocator.toString()}
var WasmAllocator = ${WasmAllocator.name};
var ${FaustSensors.name} = ${FaustSensors.toString()}
var FaustSensors = ${FaustSensors.name};
var ${FaustAudioWorkletCommunicator.name} = ${FaustAudioWorkletCommunicator.toString()}
var FaustAudioWorkletCommunicator = ${FaustAudioWorkletCommunicator.name};
var ${FaustAudioWorkletProcessorCommunicator.name} = ${FaustAudioWorkletProcessorCommunicator.toString()}
var FaustAudioWorkletProcessorCommunicator = ${FaustAudioWorkletProcessorCommunicator.name};
var FFTUtils = ${fftUtils.toString()}
// Put them in dependencies
const dependencies = {
    FaustBaseWebAudioDsp,
    FaustMonoWebAudioDsp,
    FaustWasmInstantiator,
    FaustAudioWorkletProcessorCommunicator,
    FFTUtils
};
// Generate the actual AudioWorkletProcessor code
(${getFaustFFTAudioWorkletProcessor.toString()})(dependencies, faustData);
`;
			const url = URL.createObjectURL(new Blob([processorCode], { type: "text/javascript" }));
			await context.audioWorklet.addModule(url);
			(_b = FaustMonoDspGenerator.gWorkletProcessors.get(context)) === null || _b === void 0 || _b.add(processorName);
		}
		const node = new FaustMonoAudioWorkletNode(context, {
			channelCount: Math.max(1, Math.ceil(meta.inputs / 3)),
			outputChannelCount: [Math.ceil(meta.outputs / 2)],
			processorOptions: {
				name: processorName,
				factory,
				sampleSize,
				...processorOptions
			}
		});
		if (fftOptions.fftSize) {
			const param = node.parameters.get("fftSize");
			if (param) param.value = fftOptions.fftSize;
		}
		if (fftOptions.fftOverlap) {
			const param = node.parameters.get("fftOverlap");
			if (param) param.value = fftOptions.fftOverlap;
		}
		if (typeof fftOptions.defaultWindowFunction === "number") {
			const param = node.parameters.get("windowFunction");
			if (param) param.value = fftOptions.defaultWindowFunction + 1;
		}
		if (typeof fftOptions.noIFFT === "boolean") {
			const param = node.parameters.get("noIFFT");
			if (param) param.value = +fftOptions.noIFFT;
		}
		return node;
	}
	async createAudioWorkletProcessor(name = this.name, factory = this.factory, processorName = (factory === null || factory === void 0 ? void 0 : factory.shaKey) || name) {
		if (!factory) throw new Error("Code is not compiled, please define the factory or call `await this.compile()` first.");
		const meta = JSON.parse(factory.json);
		return getFaustAudioWorkletProcessor({
			FaustBaseWebAudioDsp,
			FaustMonoWebAudioDsp,
			FaustWasmInstantiator,
			FaustAudioWorkletProcessorCommunicator,
			FaustPolyWebAudioDsp: void 0,
			FaustWebAudioDspVoice: void 0
		}, {
			processorName,
			dspName: name,
			dspMeta: meta,
			poly: false
		});
	}
	async createOfflineProcessor(sampleRate, bufferSize, factory = this.factory, context) {
		if (!factory) throw new Error("Code is not compiled, please define the factory or call `await this.compile()` first.");
		const meta = JSON.parse(factory.json);
		const instance = await FaustWasmInstantiator.createAsyncMonoDSPInstance(factory);
		const sampleSize = meta.compile_options.match("-double") ? 8 : 4;
		if (context) factory.soundfiles = await SoundfileReader.loadSoundfiles(meta, factory.soundfiles || {}, context);
		return new FaustMonoOfflineProcessor(new FaustMonoWebAudioDsp(instance, sampleRate, sampleSize, bufferSize, factory.soundfiles), bufferSize);
	}
	getMeta() {
		return JSON.parse(this.factory.json);
	}
	getJSON() {
		return JSON.stringify(this.getMeta());
	}
	getUI() {
		return this.getMeta().ui;
	}
};
FaustMonoDspGenerator.gWorkletProcessors = /* @__PURE__ */ new Map();
var FaustPolyDspGenerator = class FaustPolyDspGenerator {
	constructor() {
		this.voiceFactory = null;
		this.effectFactory = null;
	}
	async compile(compiler, name, dspCodeAux, args, effectCodeAux = `dsp_code = environment{
                ${dspCodeAux}
            };
            process = dsp_code.effect;`) {
		try {
			this.effectFactory = await compiler.createPolyDSPFactory(name, effectCodeAux, args);
			if (this.effectFactory) {
				const effectJSON = JSON.parse(this.effectFactory.json);
				const dspCode = `\
// Voice output is forced to 2, when DSP is stereo or effect has 2 ins or 2 outs,
// so that the effect can process the 2 channels of the voice
adaptOut(1,1,1) = _;
adaptOut(1,1,2) = _ <: _,0;  // The left channel only is kept
adaptOut(1,2,1) = _ <: _,_;
adaptOut(1,2,2) = _ <: _,_;
adaptOut(2,1,1) = _,_;
adaptOut(2,1,2) = _,_;
adaptOut(2,2,1) = _,_;
adaptOut(2,2,2) = _,_;
adaptor(F) = adaptOut(outputs(F),${effectJSON.inputs},${effectJSON.outputs});
dsp_code = environment{
    ${dspCodeAux}
};
process = dsp_code.process : adaptor(dsp_code.process);
`;
				const effectCode = `\
// Inputs
adaptIn(1,1,1) = _;
adaptIn(1,1,2) = _,_ :> _;  
adaptIn(1,2,1) = _,_;
adaptIn(1,2,2) = _,_;
adaptIn(2,1,1) = _,_ :> _;
adaptIn(2,1,2) = _,_ :> _;
adaptIn(2,2,1) = _,_;
adaptIn(2,2,2) = _,_;
// Outputs
adaptOut(1,1) = _ <: _,0;   // The left channel only is kept
adaptOut(1,2) = _,_;
adaptOut(2,1) = _ <: _,0;   // The left channel only is kept
adaptOut(2,2) = _,_;
adaptorIns(F) = adaptIn(outputs(F),${effectJSON.inputs},${effectJSON.outputs});
adaptorOuts = adaptOut(${effectJSON.inputs},${effectJSON.outputs});
dsp_code = environment{
    ${dspCodeAux}
};
process = adaptorIns(dsp_code.process) : dsp_code.effect : adaptorOuts;
`;
				this.voiceFactory = await compiler.createPolyDSPFactory(name, dspCode, args);
				try {
					this.effectFactory = await compiler.createPolyDSPFactory(name, effectCode, args + " -inpl");
				} catch (e) {
					console.warn(e);
				}
			}
		} catch (e) {
			if (!(e instanceof Error ? e.message : String(e !== null && e !== void 0 ? e : "unknown error")).includes("undefined symbol : effect")) console.warn(e);
			this.voiceFactory = await compiler.createPolyDSPFactory(name, dspCodeAux, args);
		}
		if (this.voiceFactory) {
			this.name = name;
			const isDouble = JSON.parse(this.voiceFactory.json).compile_options.match("-double");
			const { mixerBuffer, mixerModule } = await compiler.getAsyncInternalMixerModule(!!isDouble);
			this.mixerBuffer = mixerBuffer;
			this.mixerModule = mixerModule;
			return this;
		} else return null;
	}
	addSoundfiles(soundfileMap) {
		if (!this.voiceFactory) throw new Error("Code is not compiled, please define the factory or call `await this.compile()` first.");
		for (const id in soundfileMap) this.voiceFactory.soundfiles[id] = soundfileMap[id];
	}
	getSoundfileList() {
		if (!this.voiceFactory) throw new Error("Code is not compiled, please define the factory or call `await this.compile()` first.");
		const meta = JSON.parse(this.voiceFactory.json);
		const map = SoundfileReader.findSoundfilesFromMeta(meta);
		if (!map) return [];
		if (!this.effectFactory) return Object.keys(map);
		const effectMeta = JSON.parse(this.effectFactory.json);
		const effectMap = SoundfileReader.findSoundfilesFromMeta(effectMeta);
		return Object.keys({
			...effectMap,
			...map
		});
	}
	async createNode(context, voices, name = this.name, voiceFactory = this.voiceFactory, mixerModule = this.mixerModule, effectFactory = this.effectFactory, sp = false, bufferSize = 1024, processorName = ((voiceFactory === null || voiceFactory === void 0 ? void 0 : voiceFactory.shaKey) || "") + ((effectFactory === null || effectFactory === void 0 ? void 0 : effectFactory.shaKey) || "") || `${name}_poly`, processorOptions = {}) {
		var _a, _b;
		if (!voiceFactory) throw new Error("Code is not compiled, please define the factory or call `await this.compile()` first.");
		const voiceMeta = JSON.parse(voiceFactory.json);
		const effectMeta = effectFactory ? JSON.parse(effectFactory.json) : void 0;
		const sampleSize = voiceMeta.compile_options.match("-double") ? 8 : 4;
		voiceFactory.soundfiles = await SoundfileReader.loadSoundfiles(voiceMeta, voiceFactory.soundfiles || {}, context);
		if (effectFactory) effectFactory.soundfiles = await SoundfileReader.loadSoundfiles(effectMeta, effectFactory.soundfiles || {}, context);
		if (sp) {
			const instance = await FaustWasmInstantiator.createAsyncPolyDSPInstance(voiceFactory, mixerModule, voices, effectFactory || void 0);
			const soundfiles = {
				...effectFactory === null || effectFactory === void 0 ? void 0 : effectFactory.soundfiles,
				...voiceFactory.soundfiles
			};
			const polyDsp = new FaustPolyWebAudioDsp(instance, context.sampleRate, sampleSize, bufferSize, soundfiles);
			const sp = context.createScriptProcessor(bufferSize, polyDsp.getNumInputs(), polyDsp.getNumOutputs());
			Object.setPrototypeOf(sp, FaustPolyScriptProcessorNode.prototype);
			sp.setupNode(polyDsp);
			return sp;
		} else {
			if (!FaustPolyDspGenerator.gWorkletProcessors.has(context)) FaustPolyDspGenerator.gWorkletProcessors.set(context, /* @__PURE__ */ new Set());
			if (!((_a = FaustPolyDspGenerator.gWorkletProcessors.get(context)) === null || _a === void 0 ? void 0 : _a.has(processorName))) {
				const processorCode = `
// DSP name and JSON string for DSP are generated
const faustData = ${JSON.stringify({
					processorName,
					dspName: name,
					dspMeta: voiceMeta,
					poly: true,
					effectMeta
				})};
// Implementation needed classes of functions
var ${FaustDspInstance.name} = ${FaustDspInstance.toString()}
var FaustDspInstance = ${FaustDspInstance.name};
var ${FaustBaseWebAudioDsp.name} = ${FaustBaseWebAudioDsp.toString()}
var FaustBaseWebAudioDsp = ${FaustBaseWebAudioDsp.name};
var ${FaustPolyWebAudioDsp.name} = ${FaustPolyWebAudioDsp.toString()}
var FaustPolyWebAudioDsp = ${FaustPolyWebAudioDsp.name};
var ${FaustWebAudioDspVoice.name} = ${FaustWebAudioDspVoice.toString()}
var FaustWebAudioDspVoice = ${FaustWebAudioDspVoice.name};
var ${FaustWasmInstantiator.name} = ${FaustWasmInstantiator.toString()}
var FaustWasmInstantiator = ${FaustWasmInstantiator.name};
var ${Soundfile.name} = ${Soundfile.toString()}
var Soundfile = ${Soundfile.name};
var ${WasmAllocator.name} = ${WasmAllocator.toString()}
var WasmAllocator = ${WasmAllocator.name};
var ${FaustSensors.name} = ${FaustSensors.toString()}
var FaustSensors = ${FaustSensors.name};
var ${FaustAudioWorkletCommunicator.name} = ${FaustAudioWorkletCommunicator.toString()}
var FaustAudioWorkletCommunicator = ${FaustAudioWorkletCommunicator.name};
var ${FaustAudioWorkletProcessorCommunicator.name} = ${FaustAudioWorkletProcessorCommunicator.toString()}
var FaustAudioWorkletProcessorCommunicator = ${FaustAudioWorkletProcessorCommunicator.name};
// Put them in dependencies
const dependencies = {
    FaustBaseWebAudioDsp,
    FaustPolyWebAudioDsp,
    FaustWasmInstantiator,
    FaustAudioWorkletProcessorCommunicator
};
// Generate the actual AudioWorkletProcessor code
(${getFaustAudioWorkletProcessor.toString()})(dependencies, faustData);
`;
				const url = URL.createObjectURL(new Blob([processorCode], { type: "text/javascript" }));
				await context.audioWorklet.addModule(url);
				(_b = FaustPolyDspGenerator.gWorkletProcessors.get(context)) === null || _b === void 0 || _b.add(processorName);
			}
			let node;
			try {
				node = new FaustPolyAudioWorkletNode(context, { processorOptions: {
					name: processorName,
					voiceFactory,
					mixerModule,
					voices,
					sampleSize,
					effectFactory: effectFactory || void 0,
					...processorOptions
				} });
			} catch (error) {
				throw new Error(`Faust: the AudioWorkletProcessor "${processorName}" did not register. The module loaded, so the failure happened inside registerProcessor — its error is reported in the AudioWorklet scope and appears in the browser console above this one. A duplicate control path shared between \`process\` and \`effect\` is the usual cause. Original error: ${error instanceof Error ? error.message : String(error)}`);
			}
			return node;
		}
	}
	async createAudioWorkletProcessor(name = this.name, voiceFactory = this.voiceFactory, effectFactory = this.effectFactory, processorName = ((voiceFactory === null || voiceFactory === void 0 ? void 0 : voiceFactory.shaKey) || "") + ((effectFactory === null || effectFactory === void 0 ? void 0 : effectFactory.shaKey) || "") || `${name}_poly`) {
		if (!voiceFactory) throw new Error("Code is not compiled, please define the factory or call `await this.compile()` first.");
		const voiceMeta = JSON.parse(voiceFactory.json);
		const effectMeta = effectFactory ? JSON.parse(effectFactory.json) : void 0;
		return getFaustAudioWorkletProcessor({
			FaustBaseWebAudioDsp,
			FaustMonoWebAudioDsp: void 0,
			FaustWasmInstantiator,
			FaustPolyWebAudioDsp,
			FaustWebAudioDspVoice,
			FaustAudioWorkletProcessorCommunicator
		}, {
			processorName,
			dspName: name,
			dspMeta: voiceMeta,
			poly: true,
			effectMeta
		});
	}
	async createOfflineProcessor(sampleRate, bufferSize, voices, voiceFactory = this.voiceFactory, mixerModule = this.mixerModule, effectFactory = this.effectFactory, context) {
		if (!voiceFactory) throw new Error("Code is not compiled, please define the factory or call `await this.compile()` first.");
		const voiceMeta = JSON.parse(voiceFactory.json);
		const effectMeta = effectFactory ? JSON.parse(effectFactory.json) : void 0;
		const instance = await FaustWasmInstantiator.createAsyncPolyDSPInstance(voiceFactory, mixerModule, voices, effectFactory || void 0);
		const sampleSize = voiceMeta.compile_options.match("-double") ? 8 : 4;
		if (context) {
			voiceFactory.soundfiles = await SoundfileReader.loadSoundfiles(voiceMeta, voiceFactory.soundfiles || {}, context);
			if (effectFactory) effectFactory.soundfiles = await SoundfileReader.loadSoundfiles(effectMeta, effectFactory.soundfiles || {}, context);
		}
		return new FaustPolyOfflineProcessor(new FaustPolyWebAudioDsp(instance, sampleRate, sampleSize, bufferSize, {
			...effectFactory === null || effectFactory === void 0 ? void 0 : effectFactory.soundfiles,
			...voiceFactory.soundfiles
		}), bufferSize);
	}
	getMeta() {
		const o = this.voiceFactory ? JSON.parse(this.voiceFactory.json) : null;
		const e = this.effectFactory ? JSON.parse(this.effectFactory.json) : null;
		const r = { ...o };
		if (e) r.ui = [{
			type: "tgroup",
			label: "Sequencer",
			items: [{
				type: "vgroup",
				label: "Instrument",
				items: o.ui
			}, {
				type: "vgroup",
				label: "Effect",
				items: e.ui
			}]
		}];
		else r.ui = [{
			type: "tgroup",
			label: "Polyphonic",
			items: [{
				type: "vgroup",
				label: "Voices",
				items: o.ui
			}]
		}];
		return r;
	}
	getJSON() {
		return JSON.stringify(this.getMeta());
	}
	getUI() {
		return this.getMeta().ui;
	}
};
FaustPolyDspGenerator.gWorkletProcessors = /* @__PURE__ */ new Map();
var FaustDspGenerator = class FaustDspGenerator {
	extractMidiAndNvoices(jsonData) {
		const optionsMetadata = jsonData.meta.find((meta) => meta.options);
		if (optionsMetadata && optionsMetadata.options) {
			const options = optionsMetadata.options;
			const midiRegex = /\[midi:(on|off)\]/;
			const nvoicesRegex = /\[nvoices:(\d+)\]/;
			const midiMatch = options.match(midiRegex);
			const nvoicesMatch = options.match(nvoicesRegex);
			return {
				midi: midiMatch ? midiMatch[1] === "on" : false,
				nvoices: nvoicesMatch ? parseInt(nvoicesMatch[1], 10) : -1
			};
		} else return {
			midi: false,
			nvoices: -1
		};
	}
	/**
	* Compile DSP code, inspect metadata for [nvoices:] (and optionally [midi:on]), and build either a mono
	* or poly WebAudio node (ScriptProcessor or AudioWorklet depending on `sp`). Compilation uses a shared,
	* lazily-created libfaust instance to avoid repeatedly instantiating the WASM compiler.
	*/
	async createFaustNode(context, name, code, sp, bufferSize) {
		const getCompiler = async () => {
			if (!FaustDspGenerator.compilerPromise) {
				const baseURL = (typeof document !== "undefined" ? "src" in (document.currentScript || {}) ? document.currentScript.src : document.baseURI : void 0) || (typeof window !== "undefined" ? window.location.href : void 0);
				if (!baseURL) throw new Error("Cannot resolve libfaust-wasm location.");
				const jsURL = new URL("../libfaust-wasm/libfaust-wasm.js", baseURL).href;
				const dataURL = jsURL.replace(/c?js$/, "data");
				const wasmURL = jsURL.replace(/c?js$/, "wasm");
				FaustDspGenerator.compilerPromise = instantiateFaustModuleFromFile(jsURL, dataURL, wasmURL).then((module) => new FaustCompiler(new LibFaust(module)));
			}
			return FaustDspGenerator.compilerPromise;
		};
		const args = "-ftz 2";
		try {
			const compiler = await getCompiler();
			const monoGenerator = new FaustMonoDspGenerator();
			if (!await monoGenerator.compile(compiler, name, code, args)) return null;
			const { nvoices } = this.extractMidiAndNvoices(monoGenerator.getMeta());
			if (nvoices > 0) {
				const polyGenerator = new FaustPolyDspGenerator();
				if (!await polyGenerator.compile(compiler, name, code, args)) return null;
				return await polyGenerator.createNode(context, nvoices, name, void 0, void 0, void 0, sp, bufferSize);
			}
			return await monoGenerator.createNode(context, name, void 0, sp, bufferSize);
		} catch (e) {
			console.error(e);
			return null;
		}
	}
};
FaustDspGenerator.compilerPromise = null;
//#endregion
export { FaustMonoDspGenerator };
