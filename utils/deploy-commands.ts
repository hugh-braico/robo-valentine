import { REST, Routes } from 'discord.js';
import config from '../config/config.json' with { type: "json" };
import path from 'node:path';
import { glob } from 'glob';
import { initDatabase } from './database-tables.js';
import { initGoogleSheet } from './google-sheets.js';
import { loadCharacters } from './google-sheets.js';

const token = config.token;
const clientId = config.clientId;
const commands = [];

console.log("Initialising database...");
await initDatabase();
console.log("Database initialised.\n");

console.log("Initialising Google Sheets access...");
await initGoogleSheet();
console.log("Google Sheets access initialised.\n");

console.log("Loading character data from Google Sheets to SQL...");
await loadCharacters();
console.log("Data loaded.\n");

// Dynamically grab all command files and map their command names to their execute functions
const commandModulePaths: string[] = await glob('commands/*.js');
// console.log(`Found command modules ${commandModulePaths}`)
for (const modulePath of commandModulePaths) {
	console.log(`Importing module ${modulePath}`);
	// TODO this may be Windows-specific, may have to add else-if behaviour to work on unix
	const fullModulePath = "file://" + path.resolve(modulePath);
	// console.log(`Resolving full path as ${fullModulePath}`);
	const command = await import(fullModulePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    } else {
        console.log(`[WARNING] The command at ${fullModulePath} is missing a required "data" or "execute" property.`);
    }
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

class PutResponse {
    length: number;
}

// Deploy commands
(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// Remove all existing commands
		await rest.put(
			Routes.applicationCommands(clientId),
			{ body: [] },
		) as PutResponse;

		// The put method is used to fully refresh all commands
		const data = await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands },
		) as PutResponse;

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);

	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();
