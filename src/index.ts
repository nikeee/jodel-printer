"use strict";

import * as Jodel from "jodel-api";
import * as json from "jsonfile";
import * as printing from "escpos-print";
import iconv = require("iconv");

const configFile = "config.json";

const log = console.error;
function logError(msg: string, err: any) {
	log(msg);
	log(JSON.stringify(err, null, "\t"));
}

interface AppConfig {
	accessToken?: string;
	deviceUID?: string;
	location: Jodel.Location;
	keyConfig: {
		key: string;
		clientVersion: string;
		apiVersion: "0.2",
	}
	printerPath: string;
}

const converter = new iconv.Iconv("UTF-8", "ISO-8859-1//IGNORE");

const defaultConfig: Readonly<AppConfig> = {
	location: {
		city: "Kassel",
		country: "DE",
		locCoordinates: {
			lat: 51.335,
			lng: 9.4947
		},
		locAccuracy: 19.0
	},
	keyConfig: {
		key: "KZmLMUggDeMzQfqMNYFLWNyttEmQgClvlPyACVlH",
		clientVersion: "4.38.3",
		apiVersion: "0.2",
	},
	printerPath: "/dev/usb/lp0",
};

async function main() {
	log("Hi!");
	let printer;
	try {
		const loadedConfig = await getConfig(configFile).catch(err => null);
		const currentConfig = { ...defaultConfig, ...loadedConfig };

		printer = await getPrinter(currentConfig);
		if (printer === null)
			console.log("Not printing, no printer path set.");

		const { client, newConfig } = await createClient(currentConfig);
		log("Logged in.");
		// now logged in.
		json.writeFileSync<AppConfig>(configFile, newConfig, { spaces: 4 });
		printLoop(client, newConfig, printer);
	} catch (err) {
		logError("Error:", err);
	}
	if (printer)
		await printer.close();
}

async function getPrinter(cfg: AppConfig) {
	if (!cfg.printerPath)
		return Promise.resolve(null);
	log("Initializing printer...");
	const adapter = new printing.Adapters.Serial(cfg.printerPath, {});
	const printer = await new printing.Printer(adapter).open();
	printer.setFont(printing.Commands.Font.A);
	log("Printer initialzed.");
	return printer;
}

async function getConfig(path: string): Promise<AppConfig | null> {
	return new Promise<AppConfig | null>((res, rej) => {
		json.readFile<AppConfig>(path, { throws: false }, (err, conf) => {
			if (err) rej(err);
			res(conf ? conf : null);
		})
	});
}

async function createClient(config: AppConfig): Promise<{ client: Jodel.JodelClient, newConfig: AppConfig }> {
	let client: Jodel.JodelClient;
	let jodelConfig: Jodel.JodelConfig;

	if (!config.deviceUID) {
		const uid = Jodel.AndroidJodelConfig.createDeviceUID();
		jodelConfig = new Jodel.AndroidJodelConfig(uid, config.keyConfig);
		config.deviceUID = uid;
	} else {
		jodelConfig = new Jodel.AndroidJodelConfig(config.deviceUID, config.keyConfig);
	}

	if (config.accessToken) {
		log("Logging in using token: %s", config.accessToken);
		jodelConfig = new Jodel.AndroidJodelConfig(config.deviceUID, config.keyConfig);
		client = new Jodel.JodelClient(jodelConfig);
		await client.loginWithToken(config.accessToken);

		return { newConfig: config, client };
	}

	log("No token, getting one");
	client = new Jodel.JodelClient(jodelConfig);
	await client.login(config.location);
	config.accessToken = client.accessToken;
	log("Got new token: %s", config.accessToken);
	return { newConfig: config, client };

}

async function printLoop(client: Jodel.JodelClient, cfg: AppConfig, printer: printing.Printer | null): Promise<never> {
	const karma = await client.getKarma();
	log("Karma: %d", karma.karma);

	const printedPosts = new Map<string, Date>();
	let counter = 0;
	while (true) {
		++counter;
		try {
			log("Fetching stuff...");
			const recentPosts = await client.getMostRecentPosts(cfg.location.locCoordinates);

			let posts = recentPosts.posts;

			posts = posts.splice(0, 15); // maximum 15 posts at once

			posts = posts.filter((value, index, array) => {
				return !printedPosts.has(value.postId);
			});

			handlePosts(printer, posts);

			for (const p of posts) {
				const postDate: Date = p.createdAt instanceof Date ? p.createdAt as Date : new Date(p.createdAt as string);
				printedPosts.set(p.postId, postDate);
			}

			if (counter % 10 === 0) {
				cleanupPrintedPosts(printedPosts);
			}
		}
		catch (err) {
			logError("Error fetching stuff.", err);
			await delay(50 * 1000);
		}
		const ds = rnd(5, 10); //(10, 45);
		log("Stuff fetched, waiting %d seconds", ds);
		await delay(ds * 1000);
	}
}

function cancerDateFormat(date: Date): string {
	return date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
}

function cleanupPrintedPosts(data: Map<string, Date>): void {
	let toRemove: string[] | null = [];
	const now = new Date();
	const maxDiff = 10 * 60 * 60 * 1000; // 10 hours
	for (const [key, date] of data.entries()) {
		if ((now as any) - (date as any) > maxDiff) {
			toRemove.push(key);
		}
	}
	toRemove.forEach(k => data.delete(k));
	toRemove = null;
}

function handlePosts(printer: printing.Printer | null, posts: Jodel.Post[]): void {
	posts = posts.sort((a, b) => {
		const ad: Date = a.createdAt instanceof Date ? a.createdAt as Date : new Date(a.createdAt as string);
		const bd: Date = b.createdAt instanceof Date ? b.createdAt as Date : new Date(b.createdAt as string);
		return (ad as any) - (bd as any); // TODO: Any?
	});

	// console.dir(posts);

	for (const post of posts) {
		if (!post || !post.message)
			continue;
		if (post.imageUrl) // skip image posts
			continue;

		console.assert(post.createdAt instanceof Date);
		const date = post.createdAt as Date;

		log(post.message);
		log("---------------------");

		if (printer !== null) {
			const emptyLine = new Array(32).join(" ");
			const message = converter.convert(post.message);
			const dateStr = cancerDateFormat(date);

			printer.setJustification(printing.Commands.Justification.Left);
			printer.write(message);
			printer.writeLine("");

			printer.setJustification(printing.Commands.Justification.Right);
			printer.writeLine(dateStr);
			printer.setJustification(printing.Commands.Justification.Left);

			printer.writeLine("");

			printer.setUnderline(printing.Commands.Underline.Single);
			printer.writeLine(emptyLine);
			printer.setUnderline(printing.Commands.Underline.NoUnderline);
			printer.writeLine("");
			// printer.printText(emptyLine);
			printer.writeLine("");
		}
	}
}

function rnd(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min) + min);
}

function delay(ms: number): Promise<void> {
	return new Promise<void>((res, rej) => setTimeout(res, ms));
}

main();
