/**
 * @fileoverview Utility functions for logging results and errors to specific Discord channels.
 * 
 * @module utils/discord/log-to-channel
 */
import { ChatInputCommandInteraction, Client, Guild, Message, TextChannel, User } from 'discord.js';
import config from '../../config/config.json' with { type: "json" };

async function logToChannel(interaction: ChatInputCommandInteraction, message: string, channel: TextChannel): Promise<void> {
    // horizontal line separator before every new message (max length to still fit on one line on smallish mobile text size)
    let debugString = "~~                                                                                                                                ~~\n";

    // Identify the source of the invocation
    const guild: Guild | null = interaction.guild;
    if (!guild) {
        debugString += `From DMs, or as a private App`;
    } else {
        debugString += `From server ${guild.name}`;
    }

    // Try and include a link to the response message if possible
    const reply: Message = await interaction.fetchReply();
    if (!reply) {
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
export async function logResultToChannel(interaction: ChatInputCommandInteraction, client: Client, command: string, result: string): Promise<void> {
    const logChannelId = config["activity-channel-id"] as string;
    if (logChannelId) {
        let debugString = "";

        const characterName: string | null = interaction.options.getString("character");
        const safeCharacterName: string = characterName ? characterName : "(Error retrieving character name input!!)";
        const moveName: string | null = interaction.options.getString("move");
        const trimmedMoveName: string = moveName ? moveName.trim() : "";
        debugString += `\`/${command} ${safeCharacterName} ${trimmedMoveName}\`\n`;

        debugString += `Result: ${result}`;
        const logChannel: TextChannel = client.channels.cache.get(logChannelId) as TextChannel;
        await logToChannel(interaction, debugString, logChannel);
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
        await logToChannel(interaction, debugString, errorChannel);
    }
}