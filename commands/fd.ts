import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, User, Client } from "discord.js";
import { Character, Move, RegexAlias, SimpleAlias } from '../utils/data/database-tables.js';
import { FuseResult } from 'fuse.js';
import { generateFdOptions } from "../utils/discord/generate-fd-options.js";
import { logger } from '../utils/core/logger.js';
import { checkRateLimit } from "../utils/core/rate-limiter.js";
import { logResultToChannel } from "../utils/discord/log-to-channel.js";
import { buildFdEmbed } from "../utils/discord/embeds.js";
import { getFuse } from "../utils/discord/fuse-cache.js";

// Generate character options, using the google sheet as source of truth
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

export async function execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    // const startTime = performance.now();

    // Rate limiting check
    const user: User = interaction.user;
    if (!checkRateLimit(user.id)) { 
        logger.warn(`User ${user.username} is being rate limited!`);
        await interaction.reply(`❗ You are being rate limited! Please try again in a couple of minutes.`);
        return;
    }
    
    const characterName = sanitise(interaction.options.getString("character") ?? "");
    if (characterName === "") {
        await interaction.reply(`❌ You have to supply a valid character! I don't even know how you managed to do that. Please contact a maintainer to investigate.`);
        await logResultToChannel(interaction, client, "fd", "❌ Character name resolved to empty string.");
        return;
    }
    
    // Look up the character's pretty name and colour data for the embed
    logger.info("  Getting character from db...");
    const character: Character | null = await Character.findByPk(characterName);
    if (!character) {
        const result = `❗ Couldn't find the character "${characterName}!`;
        logger.info(`    ${result}`);
        logger.info("  Returning failure reply...");
        await interaction.reply(`${result} I don't even know how you managed to do that. Please contact a maintainer to investigate.`);
        logger.info("Done.\n");
        return;
    }

    const moveName = sanitise((interaction.options.getString("move") ?? "").toUpperCase().trim());
    if (moveName === "") {
        await interaction.reply(`❌ You have to supply a valid move name!"`);
        await logResultToChannel(interaction, client, "fd", "❌ Move name resolved to empty string.");
        return;
    }

    // const preSearchTime = performance.now();

    // Find the canonical name for this move by looking it up against aliases in database
    logger.info(`Begin fetch for ${characterName} - ${moveName}...`);
    const searchResult: SearchResult = await findCanonicalMoveName(characterName, moveName);
    
    // If unable to find the move, throw up an error reply
    // Use the Mizuumi wiki as a fallback resource, make the user look it up themselves
    if (!searchResult.canonicalName) {
        logger.info(`    ${searchResult.resultString}`);
        logger.info("  Returning failure reply...");
        const prettyName = character.get('Pretty Name') as string;
        const wikiName = prettyName.replace(" ", "_");
        const wikiUrl = `https://wiki.gbl.gg/w/Skullgirls/${wikiName}#Move_List`;
        await interaction.reply(`❗ Couldn't find a move for ${prettyName} called "${moveName}!"\nTry again, or look it up on the wiki instead:\n**<${wikiUrl}>**`);
        await logResultToChannel(interaction, client, "fd", searchResult.resultString);
        logger.info("Done.\n");
        return;
    }

    // const postSearchTime = performance.now();

    // Lookup the move in the database
    logger.info(`  Getting move ${searchResult.canonicalName} from db...`);
    const move: Move = await fetchMove(characterName, searchResult.canonicalName)
    if (!move) {
        const result = `❗ Encountered an error when trying to retrieve the move "${moveName} (${searchResult.canonicalName})"!`;
        logger.info(`    ${result}`);
        logger.info("  Returning failure reply...");
        await interaction.reply(`${result} Please contact a maintainer to investigate.`);
        logger.info("Done.\n");
        return;
    }

    // const postFetchMoveTime = performance.now();

    // Build embed data (or fetch from embed cache if pre-built)
    const embed: EmbedBuilder = buildFdEmbed(character, move);

    // Return the reply. If we had to resort to fuzzy matching, tell the user we did that
    logger.info("  Returning reply...");
    if (searchResult.strategy == SearchStrategy.Fuzzy) {
        await interaction.reply({content: "❓ I'm not sure I know what that move is, but here's my best guess:", embeds: [embed]});
    } else {
        await interaction.reply({embeds: [embed]});
    }
    // const endTime = performance.now();
    // logger.info(`Fetching initial info:        ${Math.round(preSearchTime - startTime)} ms`);
    // logger.info(`Searching for alias match:    ${Math.round(postSearchTime - preSearchTime)} ms`);
    // logger.info(`Fetching canonical move data: ${Math.round(postFetchMoveTime - postSearchTime)} ms`);
    // logger.info(`Returning reply embed:        ${Math.round(endTime - postFetchMoveTime)} ms`);

    await logResultToChannel(interaction, client, "fd", searchResult.resultString);
    logger.info("Done.\n");
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
    // Also make any double or more spaces into single spaces (improves matching)
    // Also truncate to 100 characters, since longer than that will never be necessary.
    return s.replace(/[^\w\s[\].\-,'+~]/gi, '')
        .replace(/\s\s+/g, ' ')
        .substring(0,100);
}

enum SearchStrategy {
    Simple = "simple",
    Regex = "regex",
    Fuzzy = "fuzzy",
    NotFound = "notFound"
}

interface SearchResult {
    canonicalName: Uppercase<string> | null;
    strategy: SearchStrategy;
    resultString: string;
}

// Search for a move's "real" name, given a user-supplied approximation of its name.
async function findCanonicalMoveName(characterName: string, moveName: string): Promise<SearchResult> {
    logger.info("  Looking up alias...");

    // First port of call is to see if there is an exactly-matching simple alias for this move
    const simpleSearchResult: SearchResult | null = await simpleAliasSearch(characterName, moveName);
    if (simpleSearchResult) {
        logger.info(`    ${simpleSearchResult.resultString}`);
        return simpleSearchResult;
    }

    // If simple strategy fails, try regex strategy
    const regexSearchResult: SearchResult | null = await regexAliasSearch(characterName, moveName);
    if (regexSearchResult) {
        logger.info(`    ${regexSearchResult.resultString}`);
        return regexSearchResult;
    }

    // If both simple and regex strategies fail, try fuzzy search
    const fuzzySearchResult: SearchResult | null = await fuzzyAliasSearch(characterName, moveName);
    if (fuzzySearchResult) {
        logger.info(`    ${fuzzySearchResult.resultString}`);
        return fuzzySearchResult;
    }

    // If all 3 strategies failed, give up! Hit da bricks!
    return {
        canonicalName: null,
        strategy: SearchStrategy.NotFound,
        resultString: "❌ No match via any strategy!"
    } as SearchResult;
}

// try and find a matching alias with a simple exact-matching strategy
async function simpleAliasSearch(characterName: string, moveName: string): Promise<SearchResult | null> {
    const simpleAlias: SimpleAlias | null = await SimpleAlias.findOne({
        where: {
            Character: characterName,
            Alias: moveName
        }
    });
    if (simpleAlias) {
        const canonicalName = simpleAlias.get('Move Name') as string;
        return {
            canonicalName: canonicalName,
            strategy: SearchStrategy.Simple,
            resultString: `✅ Simple alias match for ${moveName} -> ${canonicalName}.`
        } as SearchResult;
    } else {
        return null;
    }
}

// try and find a matching alias by checking it against any available regex aliases
async function regexAliasSearch(characterName: string, moveName: string): Promise<SearchResult | null> {
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
    // Multiple patterns matching the same input is impossible to guard against in practice.
    const matchingRegex: RegexAlias | undefined = regexAliases.find((r) => checkRegex(r, moveName));
    if (matchingRegex) {
        const canonicalName = matchingRegex.get('Move Name') as string;
        return {
            canonicalName: canonicalName,
            strategy: SearchStrategy.Regex,
            resultString: `✅ Regex alias match for ${moveName} ~= \`${matchingRegex.get('Pattern')}\` -> ${canonicalName}.`
        } as SearchResult;
    } else { 
        return null;
    }
}

// try and find a "close enough" matching alias with fuzzy matching
async function fuzzyAliasSearch(characterName: string, moveName: string): Promise<SearchResult | null> {
    const fuse = await getFuse(characterName);
    const results: FuseResult<SimpleAlias>[] = fuse.search(moveName);
    if (results.length > 0) {
        const closeEnoughName: string = results[0].item.get('Alias') as string;
        const canonicalName: string = results[0].item.get('Move Name') as string;
        return {
            canonicalName: canonicalName,
            strategy: SearchStrategy.Fuzzy,
            resultString: `✅ Fuzzy alias match for ${moveName} -> ${closeEnoughName} -> ${canonicalName}.`
        } as SearchResult;
    } else {
        return null;
    }
}

// Given a move's canonical name, simply look up its frame data
async function fetchMove(characterName: string, canonicalName: string): Promise<Move> { 
    const move: Move | null = await Move.findOne({
        where: {
            Character: characterName,
            'Move Name': canonicalName
        },
    });
    if (move) {
        return move;
    } else {
        throw `Failed to find move that should have been guaranteed: ${characterName}'s ${canonicalName}!`;
    }
}
