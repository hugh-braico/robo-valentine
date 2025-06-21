/**
 * @fileoverview Dynamically generates the options for the Character input of the /fd command.
 * Pulls from the Google Sheet so if more characters are added, they don't have to be
 * changed in a hard-coded file in this repo.
 */
import { APIApplicationCommandOptionChoice } from 'discord.js';
import { Character } from '../data/database-tables.js';

export async function generateFdOptions(): Promise<APIApplicationCommandOptionChoice<string>[]> {
    const characters = await Character.findAll();
    return characters.map((c) => ({ 
        name: c.get('Pretty Name') as string,
        value: c.get('Name') as string 
    } as APIApplicationCommandOptionChoice<string>));
}