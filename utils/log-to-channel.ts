import { ChatInputCommandInteraction, Client, Guild, Message, TextChannel, User } from 'discord.js';
import config from '../config/config.json' with { type: "json" };

async function logToChannel(interaction: ChatInputCommandInteraction, client: Client, message: string, channel: TextChannel): Promise<void> {
    // horizontal line separator before every new message
    let debugString = "~~                                                                                                                                        ~~\n";

    // Identify the source of the invocation
    const guild: Guild = interaction.guild;
    if (guild === null) {
        debugString += `From DMs, or as a private App`;
    } else {
        debugString += `From server ${guild.name}`;
    }

    // Try and include a link to the response message if possible
    const reply: Message = await interaction.fetchReply();
    if (reply) {
        debugString += ":\n";
    } else {
        const replyUrl: string = reply.url;
        debugString += ` (${replyUrl}):\n`;
    }

    const user: User = interaction.user;
    debugString += `Invoked by user \`${user.username}\`\n`;

    channel.send(debugString + message);
}

// Gather up all the background info about a /fd command invocation for logging purposes
export async function logFdResultToChannel(interaction: ChatInputCommandInteraction, client: Client, result: string): Promise<void> {
    const logChannelId = config["activity-channel-id"] as string;
    if (logChannelId) {
        let debugString = "";

        const characterName = interaction.options.getString("character");
        const moveName = interaction.options.getString("move").trim();
        debugString += `\`/fd ${characterName} ${moveName}\`\n`;

        debugString += `Result: ${result}`;
        const logChannel: TextChannel = client.channels.cache.get(logChannelId) as TextChannel;
        await logToChannel(interaction, client, debugString, logChannel);
    }
}

// Gather up all the background info about a /fd command invocation for logging purposes
export async function logErrorToChannel(interaction: ChatInputCommandInteraction, client: Client, error: string): Promise<void> {
    const errorChannelId = config["error-channel-id"] as string;
    if (errorChannelId) {
        let debugString = "";

        // Don't push message limits, first 1000 chars should be enough to get the idea
        const maxErrorLength = 1000;
        const trimmedError = error.length > maxErrorLength ?
                             error.substring(0, maxErrorLength - 3) + "..." :
                             error;
        debugString += `Error:\n\`\`\`${trimmedError}\n\`\`\`\n`;

        const firstMaintainerId: string = config["approved-maintainers"][0] as string;
        debugString += `<@${firstMaintainerId}>`;

        const errorChannel: TextChannel = client.channels.cache.get(errorChannelId) as TextChannel;
        await logToChannel(interaction, client, debugString, errorChannel);
    }
}