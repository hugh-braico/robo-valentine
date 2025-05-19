import { Client, ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, User } from "discord.js";
import { Character, Move, RegexAlias, SimpleAlias } from '../utils/database-tables.js';
import Fuse, { FuseResult } from 'fuse.js';
import { generateFdOptions } from "../utils/generate-fd-options.js";
import { logger } from '../utils/logger.js';
import { checkRateLimit } from "../utils/fd-rate-limiter.js";
import { logFdResultToChannel } from "../utils/log-to-channel.js";
import { buildEmbed } from "../utils/embeds.js";

// Generate character options, using the google sheet as source of truth
const fdOptions = await generateFdOptions();

const fuseCache = new Map<string, Fuse<SimpleAlias>>();

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

export async function execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    // Rate limiting check
    const user: User = interaction.user;
    if (!checkRateLimit(user.id)) { 
        logger.warn(`User ${user.username} is being rate limited!`);
        await interaction.reply(`❗ You are being rate limited! Please try again in a couple of minutes.`);
        return;
    }

    // Find the canonical name for this move by looking it up against aliases in database
    const characterName = sanitise(interaction.options.getString("character"));
    const moveName = sanitise(interaction.options.getString("move").toUpperCase().trim());
    const searchResult: SearchResult = await findCanonicalMoveName(characterName, moveName);
    
    // If unable to find the move, throw up an error reply
    if (!searchResult.canonicalName) {
        await interaction.reply(`❗ Couldn't find the move "${moveName}" for the character "${characterName}!"`);
        logger.info(`    ${searchResult.resultString}`);
        await logFdResultToChannel(interaction, client, searchResult.resultString);
        return;
    }

    // Lookup the move in the database
    logger.info(`  Getting move ${searchResult.canonicalName} from db...`);
    const move: Move = await fetchMove(characterName, searchResult.canonicalName)
    if (!move) {
        await interaction.reply(`❗ Encountered an error when trying to retrieve the move "${moveName} (${searchResult.canonicalName})" from my database! Please contact a maintainer to investigate.`);
        return;
    }
    logger.info("Done.");

    // Look up the character's pretty name and colour data for the embed
    logger.info("  Getting character from db...");
    const character: Character = await Character.findByPk(characterName);
    if (!character) {
        await interaction.reply(`❗ Couldn't find the character "${characterName}! I don't even know how you managed to do that. Please contact a maintainer to investigate.`);
        return;
    }
    // Build embed data
    const embed: EmbedBuilder = buildEmbed(character, move);

    // Return the reply. If we had to resort to fuzzy matching, tell the user we did that
    if (searchResult.strategy == "fuzzy") {
        await interaction.reply({content: "❓ I'm not sure I know what that move is, but here's my best guess:", embeds: [embed]});
    } else {
        await interaction.reply({embeds: [embed]});
    }
    await logFdResultToChannel(interaction, client, searchResult.resultString);
};

// Sanitise inputs and outputs to prevent naughty stuff from happening
function sanitise(s: string): string {
    // Character whitelist:
    //  \w  is letters/numbers. Also matches underscore but whatever
    //  \s  is spaces
    //  []  is used in e.g. `[2]8HK`
    //  .   is used in e.g. `5.LP`
    //  -   is used in e.g. `MERRY-GO-RILLA`
    //  ,   is used in e.g. `COUNTER, STRIKE!`
    //  '   is used in e.g. `LOCK 'N' LOAD`
    //  +   is used in e.g. `236+PP`
    //  ~   is used in e.g. `[4]6+K~LK`
    // Also truncate to 100 characters since longer than that will never be necessary.
    return s.replace(/[^\w\s[\].\-,'+~]/gi, '').substring(0,100);
}

interface SearchResult {
    canonicalName: string;
    strategy: string;
    resultString: string
}

// Search for a move's "real" name, given a user-supplied approximation of its name.
async function findCanonicalMoveName(characterName: string, moveName: string): Promise<SearchResult> {
    logger.info(`Begin fetch for ${characterName} - ${moveName}...`);

    // The canonical name for a move is the one listed under "Move Name" rather than "Alt Names".
    let canonicalName: string = null;

    // Hold onto a summary of how we got to the correct answer for logging purposes
    let resultString = "❌ No match via any strategy!";

    // Keep note of which strategy was used (simple, fuzzy, regex, or null for failure)
    let strategy: string = null;

    // First port of call is to see if there is an exactly-matching simple alias for this move
    logger.info("  Getting alias from db...");
    const simpleAlias: SimpleAlias = await SimpleAlias.findOne({
        where: {
            Character: characterName,
            Alias: moveName
        }
    });

    if (!simpleAlias) {
        // Haven't found the canonical name for this move yet
        logger.info(`    No simple alias match for ${moveName}.`);
    } else {
        strategy = "simple";
        canonicalName = simpleAlias.get('Move Name') as string;
        resultString = `✅ Simple alias match for ${moveName} -> ${canonicalName}.`;
        logger.info(`    ${resultString}`);
    }

    // If simple strategy fails, try regex strategy
    if (!canonicalName) {
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
        if (matchingRegex) {
            strategy = "regex";
            canonicalName = matchingRegex.get('Move Name') as string;
            resultString = `✅ Regex alias match for ${moveName} -> ${canonicalName} via /${matchingRegex.get('Pattern')}/.`;
            logger.info(`    ${resultString}`);
        } else { 
            logger.info(`    No regex alias match for ${moveName}.`);
        }
    }

    // If both simple and regex strategies fail, try fuzzy search
    if (!canonicalName) {
        const fuse = await getFuse(characterName);
        const results: FuseResult<SimpleAlias>[] = fuse.search(moveName);
        if (results.length > 0) {
            strategy = "fuzzy";
            canonicalName = results[0].item.get('Move Name') as string;
            resultString = `✅ Fuzzy alias match for ${moveName} -> ${results[0].item.get('Alias')} -> ${canonicalName}.`
            logger.info(`    ${resultString}`);
        } else {
            logger.info(`    No fuzzy alias match for ${moveName}.`);
        }
    }

    return {
        canonicalName: canonicalName,
        strategy: strategy,
        resultString: resultString
    } as SearchResult;
}

// Gets a Fuse object for all of a character's simple aliases, for fuzzy matching.
async function getFuse(characterName: string): Promise<Fuse<SimpleAlias>> {
    if (!fuseCache.has(characterName)) {
        const simpleAliases = await SimpleAlias.findAll({
            attributes: [
                'Alias',
                'Move Name'
            ],
            where: { Character: characterName }
        });
        // Mostly using default Fuse.js options https://www.fusejs.io/api/options.html
        const fuseOptions = {
            ignoreDiacritics: true,
            shouldSort: true,
            keys: [
                "Alias"
            ]
        };
        const fuse = new Fuse(simpleAliases, fuseOptions);
        fuseCache.set(characterName, fuse);
        return fuse;
    }
    return fuseCache.get(characterName);
}

// Given a move's canonical name, simply look up its frame data
async function fetchMove(characterName: string, canonicalName: string): Promise<Move> { 
    return Move.findOne({
        where: {
            Character: characterName,
            'Move Name': canonicalName
        },
    });
}
