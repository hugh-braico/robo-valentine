/**
 * @fileoverview Shared Fuse cache for fuzzy searching character move aliases.
 * Provides a single cache instance used by both /fd and /hb commands.
 */
import Fuse from 'fuse.js';
import { SimpleAlias } from '../data/database-tables.js';

// Shared Fuse cache for fuzzy search across all commands
const fuseCache = new Map<string, Fuse<SimpleAlias>>();

// Gets a Fuse object for all of a character's simple aliases, for fuzzy matching.
export async function getFuse(characterName: string): Promise<Fuse<SimpleAlias>> {
    const cacheResult: Fuse<SimpleAlias> | undefined = fuseCache.get(characterName);
    if (cacheResult) {
        return cacheResult;
    } else {
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
}

// Clear the entire cache (used on data reload)
export function clearAllCache(): void {
    fuseCache.clear();
}
