import { APIApplicationCommandOptionChoice } from 'discord.js';
import { Character } from './database-tables.js';

export async function generateFdOptions(): Promise<APIApplicationCommandOptionChoice<string>[]> {
    // Instead of hard-coding the options for the fd command,
    // it makes more sense to treat the google sheet as the source of truth
    const characters = await Character.findAll();
    return characters.map((c) => ({ 
        name: c.get('Pretty Name') as string,
        value: c.get('Name') as string 
    } as APIApplicationCommandOptionChoice<string>));
}