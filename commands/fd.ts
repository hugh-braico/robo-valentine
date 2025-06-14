import { Client, ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, APIEmbedField, TextChannel, User, Guild, Message } from "discord.js";
import { Character, Move, RegexAlias, SimpleAlias } from '../utils/database-tables.js';
import Fuse, { FuseResult } from 'fuse.js';
import { generateFdOptions } from "../utils/generate-fd-options.js";
import config from '../config/config.json' with { type: "json" };

// Instead of hard-coding the options for the fd command,
// it makes more sense to treat the google sheet as the source of truth
const fdOptions = await generateFdOptions();

export const data = new SlashCommandBuilder()
    .setName('fd')
    .setDescription('Get frame data for Skullgirls moves')
    .addStringOption(option =>
        option.setName('character')
            .setDescription('The character (e.g. Filia, Big Band)')
            .setRequired(true)
            .addChoices(...fdOptions))
    .addStringOption(option =>
        option.setName('move')
            .setDescription('The name of the move (e.g. 2LK, H Hairball)')
            .setRequired(true));

// Sanitise inputs and outputs to prevent naughty stuff from happening
function sanitise(s: string): string {
    //  \w  is a-z, A-Z, and 0-9. Also matches underscore but whatever
    //  \s  is spaces
    //  []  is used for charge moves
    //  .   is used in e.g. `5.LP`
    //  -   is used in e.g. `MERRY-GO-RILLA`
    //  ,   is used in taunt inputs and in some random names
    //  '   is used in e.g. `LOCK 'N' LOAD`
    //  +   is unfortunately used a lot in e.g. `236+PP`
    //  ~   is used in some command run stuff e.g. `[4]6+K~LK`
    return s.replace(/[^\w\s[\].\-,'+~]/gi, '');
}

export async function execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    const characterName = sanitise(interaction.options.getString("character"));
    const moveName = sanitise(interaction.options.getString("move").toUpperCase().trim());
    let fuzzyMatchedAnswer = false;
    
    console.log(`Begin fetch for ${characterName} - ${moveName}...`);

    // Find the character's colour data
    console.log("  Getting character from db...");
    const character: Character = await Character.findByPk(characterName);
    if (character == null) {
        await interaction.reply(`❗ Couldn't find the character "${characterName}! I don't even know how you managed to do that. Please contact a maintainer to investigate.`);
        return;
    }

    // Do a lookup on the aliases table to get this move's canonical name
    let canonicalName: string;

    // Hold onto a summary of how we got to the correct answer for logging purposes
    let resultString = "";

    console.log("  Getting alias from db...");
    const simpleAlias: SimpleAlias = await SimpleAlias.findOne({
        where: {
            Character: characterName,
            Alias: moveName
        }
    });

    if (simpleAlias === null) {
        // Haven't found the canonical name for this move yet
        canonicalName = null;
        console.log(`    No simple alias match for ${moveName}.`);
    } else {
        canonicalName = simpleAlias.get('Move Name') as string;
        resultString = `✅ Simple alias match for ${moveName} -> ${canonicalName}.`;
        console.log(`    ${resultString}`);
    }

    // If simple strategy fails, try regex strategy
    if (canonicalName === null || canonicalName.length === 0) {
        // Get all regex aliases for this character
        const regexAliases: RegexAlias[] = await RegexAlias.findAll({
            attributes: [
                'Pattern',
                'Move Name'
            ],
            where: {
                Character: characterName
            }
        });
        // helper function to test a RegexAlias against a string
        function checkRegex(regexAlias: RegexAlias, text: string): boolean {
            const regex = new RegExp(regexAlias.get('Pattern') as string);
            return regex.test(text);
        }
        // Get the first regex alias that matches.
        // Multiple patterns matching the same input is unavoidable in practice.
        const matchingRegex: RegexAlias = regexAliases.find((r) => checkRegex(r, moveName));
        if (matchingRegex != undefined) {
            canonicalName = matchingRegex.get('Move Name') as string;
            resultString = `✅ Regex alias match for ${moveName} -> ${canonicalName} via /${matchingRegex.get('Pattern')}/.`;
            console.log(`    ${resultString}`);
        } else { 
            console.log(`    No regex alias match for ${moveName}.`);
        }
    }

    // If both simple and regex strategies fail, try fuzzy search
    if (canonicalName === null || canonicalName.length === 0) {
        const allSimpleAliases: SimpleAlias[] = await SimpleAlias.findAll({
            attributes: [
                'Alias',
                'Move Name'
            ],
            where: {
                Character: characterName
            }
        });
        // Mostly using default Fuse.js options https://www.fusejs.io/api/options.html
        const fuseOptions = {
            ignoreDiacritics: true,
            shouldSort: true,
            keys: [
                "Alias"
            ]
        };
        const fuse = new Fuse(allSimpleAliases, fuseOptions);
        const results: FuseResult<SimpleAlias>[] = fuse.search(moveName);
        if (results.length > 0) {
            fuzzyMatchedAnswer = true;
            canonicalName = results[0].item.get('Move Name') as string;
            resultString = `✅ Fuzzy alias match for ${moveName} -> ${results[0].item.get('Alias')} -> ${canonicalName}.`
            console.log(`    ${resultString}`);
        } else {
            console.log(`    No fuzzy alias match for ${moveName}.`);
        }
    }

    // If all 3 strategies fail, give up! Hit da bricks!
    if (canonicalName === null || canonicalName.length === 0) {
        await interaction.reply(`❗ Couldn't find the move "${moveName}" for the character "${characterName}!"`);
        resultString = "❌ No match via any strategy!";
        console.log(`    ${resultString}`);
        await logResultToChannel(interaction, client, resultString);
        return;
    }

    // If we got this far we found the canonical name. Lookup the move in the database
    console.log(`  Getting move ${canonicalName} from db...`);
    const move: Move = await Move.findOne({
        where: {
            Character: characterName,
            'Move Name': canonicalName
        },
    });
    if (move === null) {
        await interaction.reply(`❗ Encountered an error when trying to retrieve the move "${moveName} (${canonicalName})" from my database! Please contact a maintainer to investigate.`);
        return;
    }

    console.log("Done.");

    // If we had to resort to fuzzy matching, tell the user we did that
    if (fuzzyMatchedAnswer) {
        await interaction.reply({
            content: "❓ I'm not sure I know what that move is, but here's my best guess:",
            embeds: [buildEmbed(character.get('Pretty Name') as string, character.get('Colour') as `#{string}`, move)]}
        );
    } else {
        await interaction.reply({embeds: [buildEmbed(character.get('Pretty Name') as string, character.get('Colour') as `#{string}`, move)]});
    }
    await logResultToChannel(interaction, client, resultString);
};

function buildEmbed (characterName: string, colour: `#{string}`, move: Move): EmbedBuilder {
    const fieldsArray: APIEmbedField[] = [
        "Guard",   "Damage",    "Properties",
        "Meter",   "On Hit",    "On Block",
        "Startup", "Active",    "Recovery",
        "Hitstun", "Blockstun", "Hitstop"
    ].map(k => ({
        "name": `**${k}**` as string,
        "value": move.get(k) as string,
        "inline": true
    } as APIEmbedField));

    const builder: EmbedBuilder =  new EmbedBuilder()
        .setColor(colour as `#{string}`)
        .setTitle(`**${characterName} - ${move.get('Move Name') as string}**`)
        .addFields(fieldsArray);

    // Don't add a footer image if there isn't one defined
    const footerURL: string = move.get('Footer URL') as string;
    if (footerURL.length > 0 && footerURL !== '-' && isValidHttpUrl(footerURL)) {
        builder.setImage(footerURL);
    }

    // Don't add a thumbnail image if there isn't one defined
    const thumbnailURL: string = move.get('Thumbnail URL') as string;
    if (thumbnailURL.length > 0 && thumbnailURL !== '-' && isValidHttpUrl(thumbnailURL)) {
        builder.setThumbnail(thumbnailURL);
    }

    // Don't add empty footer text
    const footer: string = move.get('Footer') as string;
    if (footer.length > 0) {
        builder.setFooter({ text: footer });
    }

    return builder;
};

function isValidHttpUrl(s: string): boolean {
    let url;
    try {
      url = new URL(s);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      return false;  
    }
    return url.protocol === "http:" || url.protocol === "https:";
}

// Gather up all the background info about a /fd command invocation for logging purposes
async function logResultToChannel(interaction: ChatInputCommandInteraction, client: Client, result: string): Promise<void> {
    const logChannelId = config["activity-channel-id"] as string;
    if (logChannelId != null && logChannelId.length > 0) {
        // horizontal line separator before every new message
        let debugString = "~~                                                                                                                                        ~~\n";

        const guild: Guild = interaction.guild;
        const reply: Message = await interaction.fetchReply();
        const replyUrl: string = reply.url;
        debugString += `From server ${guild.name} (${replyUrl}):\n`;

        const user: User = interaction.user;
        debugString += `Invoked by user \`${user.username}\`\n`;

        const characterName = interaction.options.getString("character");
        const moveName = interaction.options.getString("move").trim();
        debugString += `\`/fd ${characterName} ${moveName}\`\n`;

        debugString += `Result: ${result}`;
        const logChannel: TextChannel = client.channels.cache.get(logChannelId) as TextChannel;
        logChannel.send(debugString);
    }
}