declare module "cross-spawn" {
	import type {
		ChildProcess,
		ChildProcessByStdio,
		SpawnOptions,
		SpawnOptionsWithStdioTuple,
		SpawnSyncOptionsWithStringEncoding,
		SpawnSyncReturns,
		StdioNull,
		StdioPipe,
	} from "node:child_process";
	import type { Readable } from "node:stream";

	interface CrossSpawn {
		(
			command: string,
			args?: readonly string[],
			options?: SpawnOptionsWithStdioTuple<StdioNull, StdioPipe, StdioPipe>,
		): ChildProcessByStdio<null, Readable, Readable>;
		(command: string, args?: readonly string[], options?: SpawnOptions): ChildProcess;
		sync(
			command: string,
			args?: readonly string[],
			options?: SpawnSyncOptionsWithStringEncoding,
		): SpawnSyncReturns<string>;
	}

	const crossSpawn: CrossSpawn;
	export = crossSpawn;
}
