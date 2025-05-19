import creds from '../config/service-account.json' with { type: "json" };
import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import config from '../config/config.json' with { type: "json" };
import { Macro, Character, Move, SimpleAlias, RegexAlias, sequelize } from './database-tables.js';
import { logger } from './logger.js';

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

let doc: GoogleSpreadsheet;

export async function initGoogleSheet(): Promise<void> {
    const SCOPES = [
        'https://www.googleapis.com/auth/spreadsheets.readonly'
    ];
    const jwt = new JWT({
        email: creds.client_email,
        key: creds.private_key,
        scopes: SCOPES,
    });
    doc = new GoogleSpreadsheet(config["google-sheet-id"], jwt);
    await doc.loadInfo();
    logger.info(`  Successfully accessed Google sheet: ${doc.title}.`);
}

export async function loadData(): Promise<void> {
    await sequelize.transaction(async () => {
        logger.info("  Begin data load...")

        // Clear out all databases
        await Character.sync({ force: true });
        await Macro.sync({ force: true });
        await Move.sync({ force: true });
        await SimpleAlias.sync({ force: true });
        await RegexAlias.sync({ force: true });

        // load new data
        await loadCharacters();
        await loadMacros();
        await loadMovesAndAliases();

        logger.info("  Data load completed.")
    });
};

export async function loadCharacters(): Promise<void> {
    // Get list of characters from the Characters sheet
    const characterSheet = doc.sheetsByTitle["Characters"];
    const characterRows = await characterSheet.getRows<CharacterRowData>();
    logger.info(`    Creating character data...`)
    const characterBulkData = [];
    for (const row of characterRows) {
        const characterName: string = row.get('Name');
        if (characterName.length === 0 || characterName === null) {
            throw `Found a blank or undefined character name!`
        }
        checkDuplicateCharacter(characterBulkData, characterName);
        characterBulkData.push(row.toObject())
    }
    await Character.bulkCreate(characterBulkData, {validate: true});
    logger.info(`    Done.\n`)
};

async function loadMacros(): Promise<void> {
    // Load all macros for movenames (eg. MACRO_5LP = 5LP, S.LP, JAB, etc)
    const macroSheet = doc.sheetsByTitle["Macros"];
    const macroRows = await macroSheet.getRows<MacroRowData>();
    logger.info(`    Creating macro data...`)
    const macroBulkData = [];
    for (const row of macroRows) {
        const macroKey: string = row.get('Key');
        if (macroKey.length === 0 || macroKey === null) {
            throw `Found a blank or undefined macro name!`
        }
        checkDuplicateMacro(macroBulkData, row.get('Key'));
        macroBulkData.push(row.toObject())
    }
    await Macro.bulkCreate(macroBulkData, {validate: true});
    logger.info(`    Done.\n`)
};

async function loadMovesAndAliases(): Promise<void> {
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
            checkDuplicateMove(moveBulkData, characterName, moveName);
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
                    const macroLookup: Macro = await Macro.findOne({
                        where: {
                            Key: alias
                        }
                    });
                    const expandedValues: Uppercase<string>[] = (macroLookup.get('Value') as Uppercase<string>).split('\n') as Uppercase<string>[];
                    for (const value of expandedValues) {
                        checkDuplicateSimpleAlias(simpleAliasBulkData, characterName, value, moveName);
                        simpleAliasBulkData.push({
                            Character: characterName,
                            Alias: value,
                            'Move Name': moveName
                        });
                    }
                } else {
                    checkDuplicateSimpleAlias(simpleAliasBulkData, characterName, alias, moveName);
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
                .map((p: string) => p.substring(1,p.length-2));
            for (const pattern of regexAliasList) {
                checkDuplicateRegexAlias(regexAliasBulkData, characterName, pattern, moveName);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkDuplicateCharacter(data: any[], characterName: string): void {
    if (data.some((c) => c.Name == characterName)) {
        throw `Duplicate character detected: ${characterName}!`;
    };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkDuplicateMacro(data: any[], macroKey: string): void {
    if (data.some((m) => m.Key == macroKey)) {
        throw `Duplicate macro detected: ${macroKey}!`;
    };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkDuplicateMove(data: any[], characterName: string, moveName: string): void {
    if (data.some((m) => m.Character == characterName && m['Move Name'] == moveName)) {
        throw `Duplicate move detected: ${characterName}'s ${moveName}!`;
    };
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkDuplicateSimpleAlias(data: any[], characterName: string, alias: string, moveName: string): void {
    if (data.some((a) => a.Character == characterName && a.Alias == alias)) {
        throw `Duplicate move alias detected: ${characterName}'s ${alias} (${moveName})!`;
    };
};

// We CANNOT check whether two regex patterns overlap the same match space,
// but we can at least check whether two patterns are exactly the same.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function checkDuplicateRegexAlias(data: any[], characterName: string, pattern: string, moveName: string): void {
    if (data.some((r) => r.Pattern == pattern)) {
        throw `Duplicate regex alias detected: ${characterName}'s ${pattern} (${moveName})!`;
    };
};
