import path from 'node:path';
import { Client, Collection, CommandInteraction, Events, GatewayIntentBits, MessageFlags, SlashCommandBuilder } from 'discord.js';
import config from './config/config.json' with { type: "json" };
import { glob } from 'glob';
import { initDatabase } from './utils/database-tables.js';
import { initGoogleSheet, loadData } from './utils/google-sheets.js';
import { logErrorToChannel } from './utils/log-error-to-channel.js';

interface RoboValCommand { 
	data: SlashCommandBuilder;
	execute(interaction: CommandInteraction, client: Client): Promise<void>;
}

// Convenient to extend client to contain a map of command names to command objects.
class RoboValClient extends Client {
	commands: Collection<string, RoboValCommand>;
}

console.log("Initialising database...");
await initDatabase();
console.log("Database initialised.\n");

console.log("Initialising Google Sheets access...");
await initGoogleSheet();
console.log("Google Sheets access initialised.\n");

console.log("Loading data from Google Sheets to SQL...");
await loadData();
console.log("Data loaded.\n");

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] }) as RoboValClient;
client.commands = new Collection();

// Dynamically grab all command files and map their command names to their execute functions
const commandModulePaths: string[] = await glob('commands/*.js');
// console.log(`Found command modules ${commandModulePaths}`)
for (const modulePath of commandModulePaths) {
	console.log(`Importing module ${modulePath}`);
	// TODO this may be Windows-specific, may have to add else-if behaviour to work on unix
	const fullModulePath = "file://" + path.resolve(modulePath);
	// console.log(`Resolving full path as ${fullModulePath}`);
	const command = await import(fullModulePath);
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command && 'execute' in command) {
		console.log(`  Loading command ${command.data.name}...`);
		client.commands.set(command.data.name, command);
	} else {
		console.log(`[WARNING] The command at ${modulePath} is missing a required "data" or "execute" property.`);
	}
}

// Create a listener and handler to execute any available command
client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;
	const command = client.commands.get(interaction.commandName);
	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}
	try {
		await command.execute(interaction, client);
	} catch (error) {
		console.error(error);
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
	console.log(`Ready! Logged in as ${readyClient.user.tag}\n`);
});

// Log in to Discord with client token
console.log(`\nLogging in to Discord...`);
client.login(config.token);
