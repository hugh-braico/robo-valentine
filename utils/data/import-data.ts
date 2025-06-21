/**
 * @fileoverview This module handles the import process of data from a remote Google Sheet
 * into a local SQLite database using Sequelize ORM. It defines functions to clear existing
 * database tables, validate and process data from Google Sheets, and populate the database
 * with structured data for characters, macros, moves, and aliases.
 *
 * @module utils/data/import-data
 * 
 * @requires ../utils/logger.js - Provides logging functionality.
 * @requires ./database-tables.js - Defines Sequelize models for database tables.
 * @requires ./google-sheets.js - Provides access to the Google Sheets document for data retrieval.
 *
 * @exports importData - Main function to initiate the data import process. Used on startup, and by the /download command.
 * @exports importCharacters - Function to import character data from the "Characters" sheet. Only used by deploy-commands.
 */
import { logger } from '../core/logger.js';
import { Macro, Character, Move, SimpleAlias, RegexAlias, sequelize } from './database-tables.js';
import { doc } from './google-sheets.js';

interface CharacterRowData {
    Name: Uppercase<string>;
    'Pretty Name': string;
    Colour: `#${string}`;
};

interface MacroRowData {
    Key: Uppercase<string>;
    Value: Uppercase<string>;
};

interface MoveRowData {
    Character: Uppercase<string>;
    'Move Name': Uppercase<string>;
    Aliases: Uppercase<string>;
    Guard: string;
    Properties: string;
    Damage: string;
    Meter: string;
    'On Hit': string;
    'On Block': string;
    Startup: string;
    Active: string;
    Recovery: string;
    Hitstun: string;
    Blockstun: string;
    Hitstop: string;
    'On Pushblock': string;
    Footer: string;
    'Thumbnail URL': URL;
    'Footer URL': URL;
};

interface SimpleAliasData { 
    Character: Uppercase<string>;
    Alias: Uppercase<string>;
    'Move Name': Uppercase<string>;
}

interface RegexAliasData { 
    Character: Uppercase<string>;
    Pattern: Uppercase<string>;
    'Move Name': Uppercase<string>;
}
export async function importData(): Promise<void> {
    if (!doc) {
        throw "❗ Invalid doc (must be non-null)!"
    }
    await sequelize.transaction(async () => {
        logger.info("  Begin data import...")

        // Clear out all databases
        await Character.sync({ force: true });
        await Macro.sync({ force: true });
        await Move.sync({ force: true });
        await SimpleAlias.sync({ force: true });
        await RegexAlias.sync({ force: true });

        // import new data
        await importCharacters();
        await importMacros();
        await importMovesAndAliases();

        logger.info("  Data import completed.")
    });
};

export async function importCharacters(): Promise<void> {
    if (!doc) {
        throw "❗ Invalid doc (must be non-null)!"
    }
    // Import list of characters from the Characters sheet
    const characterSheet = doc.sheetsByTitle["Characters"];
    const characterRows = await characterSheet.getRows<CharacterRowData>();
    logger.info(`    Creating character data...`)
    const characterBulkData = [];
    for (const row of characterRows) {
        const characterName: string = row.get('Name');
        if (characterName.length === 0 || characterName === null) {
            throw `Found a blank or undefined character name!`
        }
        checkDuplicateCharacter(characterBulkData as CharacterRowData[], characterName);
        characterBulkData.push(row.toObject())
    }
    await Character.bulkCreate(characterBulkData, {validate: true});
    logger.info(`    Done.`)
};

async function importMacros(): Promise<void> {
    if (!doc) {
        throw "❗ Invalid doc (must be non-null)!"
    }
    // Import all macros for movenames (eg. MACRO_5LP = 5LP, S.LP, JAB, etc)
    const macroSheet = doc.sheetsByTitle["Macros"];
    const macroRows = await macroSheet.getRows<MacroRowData>();
    logger.info(`    Creating macro data...`)
    const macroBulkData = [];
    for (const row of macroRows) {
        const macroKey: string = row.get('Key');
        if (macroKey.length === 0 || macroKey === null) {
            throw `Found a blank or undefined macro name!`
        }
        checkDuplicateMacro(macroBulkData as MacroRowData[], row.get('Key'));
        macroBulkData.push(row.toObject())
    }
    await Macro.bulkCreate(macroBulkData, {validate: true});
    logger.info(`    Done.`)
};

async function importMovesAndAliases(): Promise<void> {
    if (!doc) {
        throw "❗ Invalid doc (must be non-null)!"
    }
    // Get list of characters from the Characters sheet
    const characterSheet = doc.sheetsByTitle["Characters"];
    const characterRows = await characterSheet.getRows<CharacterRowData>();
    logger.info(`    Creating move and alias data...`)
    const moveBulkData = [];
    const simpleAliasBulkData = [];
    const regexAliasBulkData = [];
    for (const characterRow of characterRows) {
        const characterName = characterRow.get('Name')
        if (characterName.length === 0 || characterName === null) {
            throw `Found a blank or undefined character name!`
        }
        // Get the frame data sheet for this character
        const moveSheet = doc.sheetsByTitle[characterName];
        const moveRows = await moveSheet.getRows<MoveRowData>();
        logger.info(`      Creating move and alias data for character ${characterName}...`)
        for (const moveRow of moveRows) {
            const moveName: Uppercase<string> = moveRow.get('Move Name') as Uppercase<string>;
            if (moveName.length === 0 || moveName === null) {
                throw `Found a blank or undefined move name for character ${characterName}!`
            }
            checkDuplicateMove(moveBulkData as MoveRowData[], characterName, moveName);
            moveBulkData.push({
                Character: characterName,
                ...moveRow.toObject()
            });
            // For simplicity's sake, the move's main name is an alias for itself.
            // This means we can just do one lookup, instead of checking whether the user
            // used the "canonical name" or not (we don't care!).
            simpleAliasBulkData.push({
                Character: characterName,
                Alias: moveName,
                'Move Name': moveName
            });
            // Get all simple and macro aliases (exclude regex aliases)
            const simpleAliasList: string[] = moveRow
                .get('Aliases')
                .split('\n')
                .map((a: string) => a.trim())
                .filter((alias: string) => !(alias.startsWith("/") && alias.endsWith('/')));
            for (const alias of simpleAliasList) {
                if (alias.startsWith('MACRO_')) {
                    const macroLookup: Macro | null = await Macro.findOne({
                        where: {
                            Key: alias
                        }
                    });
                    if (macroLookup) {
                        const expandedValues: Uppercase<string>[] = (macroLookup.get('Value') as Uppercase<string>).split('\n') as Uppercase<string>[];
                        for (const value of expandedValues) {
                            checkDuplicateSimpleAlias(simpleAliasBulkData as SimpleAliasData[], characterName, value, moveName);
                            simpleAliasBulkData.push({
                                Character: characterName,
                                Alias: value,
                                'Move Name': moveName
                            });
                        }
                    } else {
                        throw `Found undefined macro: ${alias}`;
                    }
                } else {
                    checkDuplicateSimpleAlias(simpleAliasBulkData as SimpleAliasData[], characterName, alias, moveName);
                    simpleAliasBulkData.push({
                        Character: characterName,
                        Alias: alias,
                        'Move Name': moveName
                    });
                }
            }
            // Get all regex aliases
            const regexAliasList: string[] = moveRow
                .get('Aliases')
                .split('\n')
                .map((p: string) => p.trim())
                .filter((p: string) => p.startsWith("/") && p.endsWith('/'))
                .map((p: string) => p.substring(1,p.length-1));
            for (const pattern of regexAliasList) {
                checkDuplicateRegexAlias(regexAliasBulkData as RegexAliasData[], characterName, pattern, moveName);
                // logger.info(`        Storing RegexAlias: ${JSON.stringify({Character: characterName, Pattern: pattern, 'Move Name': moveName})}`);
                regexAliasBulkData.push({
                    Character: characterName,
                    Pattern: pattern,
                    'Move Name': moveName
                });
            }
        }
    }
    await Move.bulkCreate(moveBulkData, {validate: true});
    await SimpleAlias.bulkCreate(simpleAliasBulkData, {validate: true});
    await RegexAlias.bulkCreate(regexAliasBulkData, {validate: true});
    logger.info(`    Done.`)
};

function checkDuplicateCharacter(data: CharacterRowData[], characterName: string): void {
    if (data.some((c) => c.Name == characterName)) {
        throw `Duplicate character detected: ${characterName}!`;
    };
};

function checkDuplicateMacro(data: MacroRowData[], macroKey: string): void {
    if (data.some((m) => m.Key == macroKey)) {
        throw `Duplicate macro detected: ${macroKey}!`;
    };
};

function checkDuplicateMove(data: MoveRowData[], characterName: string, moveName: string): void {
    if (data.some((m) => m.Character == characterName && m['Move Name'] == moveName)) {
        throw `Duplicate move detected: ${characterName}'s ${moveName}!`;
    };
};

function checkDuplicateSimpleAlias(data: SimpleAliasData[], characterName: string, alias: string, moveName: string): void {
    if (data.some((a) => a.Character == characterName && a.Alias == alias)) {
        throw `Duplicate move alias detected: ${characterName}'s ${alias} (${moveName})!`;
    };
};

// We CANNOT check whether two regex patterns overlap the same match space,
// but we can at least check whether two patterns are exactly the same.
function checkDuplicateRegexAlias(data: RegexAliasData[], characterName: string, pattern: string, moveName: string): void {
    if (data.some((r) => r.Pattern == pattern)) {
        throw `Duplicate regex alias detected: ${characterName}'s ${pattern} (${moveName})!`;
    };
};
