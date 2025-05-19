import path from 'node:path';
import { Client, Collection, CommandInteraction, Events, GatewayIntentBits, MessageFlags, SlashCommandBuilder } from 'discord.js';
import config from './config/config.json' with { type: "json" };
import { glob } from 'glob';
import { initDatabase } from './utils/database-tables.js';
import { initGoogleSheet, loadData } from './utils/google-sheets.js';
import { logger } from './utils/logger.js';
import { logErrorToChannel } from './utils/log-to-channel.js';
import { buildAllEmbeds } from './utils/embeds.js';

interface RoboValCommand { 
	data: SlashCommandBuilder;
	execute(interaction: CommandInteraction, client: Client): Promise<void>;
}

// Convenient to extend client to contain a map of command names to command objects.
class RoboValClient extends Client {
	commands: Collection<string, RoboValCommand>;
}

logger.info("Initialising database...");
await initDatabase();
logger.info("Database initialised.\n");

logger.info("Initialising Google Sheets access...");
await initGoogleSheet();
logger.info("Google Sheets access initialised.\n");

logger.info("Loading data from Google Sheets to SQL...");
await loadData();
logger.info("Data loaded.\n");

logger.info("Loading embed cache...");
await buildAllEmbeds();
logger.info("Cache loaded.\n");

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] }) as RoboValClient;
client.commands = new Collection();

// Dynamically grab all command files and map their command names to their execute functions
const commandModulePaths: string[] = await glob('commands/*.js');
for (const modulePath of commandModulePaths) {
	logger.info(`Importing module ${modulePath}`);
	const fullModulePath = "file://" + path.resolve(modulePath);
	const command = await import(fullModulePath);
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command && 'execute' in command) {
		logger.info(`  Loading command ${command.data.name}...`);
		client.commands.set(command.data.name, command);
	} else {
		logger.warning(`WARNING: The command at ${modulePath} is missing a required "data" or "execute" property.`);
	}
}

// Create a listener and handler to execute any available command
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	const command = client.commands.get(interaction.commandName);
	if (!command) {
		logger.error(`ERROR: No command matching ${interaction.commandName} was found.`);
		return;
	}
	try {
		await command.execute(interaction, client);
	} catch (error) {
		logger.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command! Please contact a maintainer to fix it.' });
		}
		await logErrorToChannel(interaction, client, error as string);
	}
});

// Create a listener to confirm that we're logged in
client.once(Events.ClientReady, readyClient => {
	logger.info(" ");
	logger.info(`Ready! Logged in as ${readyClient.user.tag}\n`);
});

// Log in to Discord with client token
logger.info(`Logging in to Discord...`);
client.login(config.token);
