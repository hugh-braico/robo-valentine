import { CommandInteraction, SlashCommandBuilder } from "discord.js";
import config from '../config/config.json' with { type: "json" };
import { loadData } from '../utils/google-sheets.js';

export const data = new SlashCommandBuilder()
    .setName('download')
    .setDescription('Refresh Robo-Valentine data (Only a maintainer can use this)');

export async function execute(interaction: CommandInteraction): Promise<void> {
    if (config["approved-maintainers"].includes(interaction.user.id)) {
        await interaction.reply("🔄 Downloading new data...");
        try {
            await loadData();
            await interaction.followUp("✅ New data successfully loaded.");
        } catch(err) {
            await interaction.followUp(`❌ Encountered an error when loading data:\n\`\`\`${err}\n\`\`\`\nDatabase state has not been modified.`);
            throw err;
        }
    } else {
        await interaction.reply("❌ Only maintainers can refresh data.");
    }
};