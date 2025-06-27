/**
 * @fileoverview Functions for converting a move's frame data to a Discord embed.
 * Includes caching.
 * 
 * Functions:
 * - `buildEmbed`: Constructs a Discord embed for a given character and move, with caching.
 * - `isValidHttpUrl`: Validates whether a string is a valid HTTP/HTTPS URL.
 * - `buildAllEmbeds`: Pre-builds embeds for all characters and their associated moves.
 */
import { APIEmbedField, EmbedBuilder } from "discord.js";
import { Character, Move } from "../../utils/data/database-tables.js";
import { logger } from "../core/logger.js";

const embedCache = new Map<string, EmbedBuilder>();

// Assemble move data into an embed object for presentation purposes
export function buildEmbed(character: Character, move: Move): EmbedBuilder {
    const prettyName: string = character.get('Pretty Name') as string;
    const moveName: string = move.get('Move Name') as string;
    const cacheKey = `${prettyName} - ${moveName}`;
    const cacheResult: EmbedBuilder | undefined = embedCache.get(cacheKey);

    if (cacheResult) {
        return cacheResult;
    } else {
        const fieldsArray: APIEmbedField[] = [
            "Guard", "Damage", "Properties",
            "Meter", "On Hit", "On Block",
            "Startup", "Active", "Recovery",
            "Hitstun", "Blockstun", "Hitstop"
        ].map(k => ({
            "name": `**${k}**` as string,
            "value": move.get(k) as string,
            "inline": true
        } as APIEmbedField));

        const colour: `#{string}` = character.get('Colour') as `#{string}`;

        const builder: EmbedBuilder = new EmbedBuilder()
            .setColor(colour as `#{string}`)
            .setTitle(`**${cacheKey}**`)
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
        embedCache.set(cacheKey, builder);
        return builder;
    }
};

// Make sure a string is a valid url (for thumbnail/footer images)
function isValidHttpUrl(s: string): boolean {
    let url;
    try {
        url = new URL(s);
    } catch {
        return false;
    }
    return url.protocol === "http:" || url.protocol === "https:";
}

// Pre-build every single embed.
export async function buildAllEmbeds(): Promise<void> {
    embedCache.clear();
    const characters: Character[] = await Character.findAll();
    for (const character of characters) {
        const characterName: string = character.get('Name') as string;
        logger.info(`  Building embeds for character ${characterName}...`);
        const moves: Move[] = await Move.findAll({
            where: {
                Character: characterName
            }
        });
        for (const move of moves) {
            buildEmbed(character, move);
        }
    }
}