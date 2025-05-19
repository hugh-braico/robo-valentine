import { REST, Routes } from 'discord.js';
import config from '../config/config.json' with { type: "json" };
import path from 'node:path';
import { glob } from 'glob';
import { initDatabase } from './database-tables.js';
import { initGoogleSheet } from './google-sheets.js';
import { loadCharacters } from './google-sheets.js';
import { logger } from './logger.js';

const token = config.token;
const clientId = config.clientId;
const commands = [];

logger.info("Initialising database...");
await initDatabase();
logger.info("Database initialised.\n");

logger.info("Initialising Google Sheets access...");
await initGoogleSheet();
logger.info("Google Sheets access initialised.\n");

logger.info("Loading character data from Google Sheets to SQL...");
await loadCharacters();
logger.info("Data loaded.");

// Dynamically grab all command files and map their command names to their execute functions
const commandModulePaths: string[] = await glob('commands/*.js');
for (const modulePath of commandModulePaths) {
	logger.info(`Importing module ${modulePath}`);
	const fullModulePath = "file://" + path.resolve(modulePath);
	const command = await import(fullModulePath);
    if ('data' in command && 'execute' in command) {
        commands.push(command.data.toJSON());
    } else {
        logger.warning(`WARNING: The command at ${fullModulePath} is missing a required "data" or "execute" property.`);
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
		logger.info(`Started refreshing ${commands.length} application (/) commands.`);

		// Remove all existing commands
		await rest.put(
			Routes.applicationCommands(clientId),
			{ body: [] },
		) as PutResponse;

		// Publish all commands
		const data = await rest.put(
			Routes.applicationCommands(clientId),
			{ body: commands },
		) as PutResponse;

		logger.info(`Successfully reloaded ${data.length} application (/) commands.`);

	} catch (error) {
		console.error(error);
	}
})();
