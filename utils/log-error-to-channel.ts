import { ChatInputCommandInteraction, Client, Guild, Message, TextChannel, User } from 'discord.js';
import config from '../config/config.json' with { type: "json" };

// Gather up all the background info about a /fd command invocation for logging purposes
export async function logErrorToChannel(interaction: ChatInputCommandInteraction, client: Client, error: string): Promise<void> {
    const logChannelId = config["error-channel-id"] as string;
    if (logChannelId != null && logChannelId.length > 0) {
        // horizontal line separator before every new message
        let debugString = "~~                                                                                                                                        ~~\n";

        const guild: Guild = interaction.guild;
        const reply: Message = await interaction.fetchReply();
        const replyUrl: string = reply.url;
        debugString += `From server ${guild.name} (${replyUrl}):\n`;

        const user: User = interaction.user;
        debugString += `Invoked by user \`${user.username}\`\n`;

        // Don't break message limits, first 1000 characters should be enough
        const maxErrorLength = 1000;
        const trimmedError = error.length > maxErrorLength ?
                             error.substring(0, maxErrorLength - 3) + "..." :
                             error;
        debugString += `Error:\n\`\`\`${trimmedError}\n\`\`\`\n`;

        const firstMaintainerId: string = config["approved-maintainers"][0] as string;
        debugString += `<@${firstMaintainerId}>`;

        const logChannel: TextChannel = client.channels.cache.get(logChannelId) as TextChannel;
        logChannel.send(debugString);
    }
}