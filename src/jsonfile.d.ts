
// TODO: Publish to DT

declare module "jsonfile" {
	import * as fs from "fs";

	type ReadCallback<T> = (err: NodeJS.ErrnoException | SyntaxError, value?: T) => void;
	type ReadCallbackNoThrow<T> = (err: NodeJS.ErrnoException, value?: T | null) => void;

	type WriteCallback = (err: NodeJS.ErrnoException) => void;

	// Taken from lib.d.ts JSON.parse/stringify
	type JSONReviver = (key: any, value: any) => any;
	type JSONReplacer = (key: string, value: any) => any;

	interface FileOptions {
		encoding?: string;
		flag?: string;
		fs?: typeof fs;
	}

	interface ReadFileOptions extends FileOptions {
		throws?: true;
		reviver?: JSONReviver;
	}
	interface ReadFileOptionsNoThrow extends FileOptions {
		throws: false;
		reviver?: JSONReviver;
	}

	interface WriteFileOptions extends FileOptions {
		// Write does not have "throw" attribute
		mode?: number;
		replacer?: JSONReplacer;
		spaces?: number | null;
	}

	type WriteFileThis = { spaces?: number | null } | void;

	function readFile<T>(filename: string, callback: ReadCallback<T>): void;
	function readFile<T>(filename: string, options: ReadFileOptions | string, callback: ReadCallback<T>): void;
	function readFile<T>(filename: string, options: ReadFileOptionsNoThrow, callback: ReadCallbackNoThrow<T>): void;

	function readFileSync<T>(filename: string, options?: ReadFileOptions | string): T;
	function readFileSync<T>(filename: string, options?: ReadFileOptionsNoThrow): T | null;

	function writeFile<T>(this: WriteFileThis, filename: string, obj: T, callback: WriteCallback): void;
	function writeFile<T>(this: WriteFileThis, filename: string, obj: T, options: WriteFileOptions, callback: WriteCallback): void;

	function writeFileSync<T>(this: WriteFileThis, filename: string, obj: T, options?: WriteFileOptions): void;
}


