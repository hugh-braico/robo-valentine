/**
 * @fileoverview This file defines the schema for an SQLite database using Sequelize ORM.
 * It sets up the models and their respective tables for the database, including:
 * - `Macro`: Stores key-value pairs for macros.
 * - `Character`: Stores metadata about characters.
 * - `Move`: Stores frame data for character moves.
 * - `SimpleAlias`: Stores simple exact-match aliases for moves.
 * - `RegexAlias`: Stores regex-based aliases for moves.
 * 
 * The `initDatabase` function initializes the SQLite database in memory and creates
 * all the tables with their respective schemas. Each table is synchronized with the
 * database, ensuring the schema is applied correctly.
 * 
 * @module database-tables
 */
import { Sequelize, DataTypes, Model } from "sequelize";
import { logger } from '../utils/core/logger.js';

// Set up sqlite database
export let sequelize: Sequelize; 
export class Macro extends Model {};
export class Character extends Model {};
export class Move extends Model {};
export class SimpleAlias extends Move {};
export class RegexAlias extends Move {};

export async function initDatabase(): Promise<void> {
    sequelize = new Sequelize(
        {
            dialect: 'sqlite',
            storage: ':memory:',
            logging: false
        }
    );

    // Create macros table
    logger.info("  Initalising Macros table.");
    Macro.init(
        {
            Key: {
                type: DataTypes.STRING,
                allowNull: false,
                primaryKey: true
            },
            Value: {
                type: DataTypes.TEXT,
                allowNull: false
            }
        },
        {
            sequelize,
            modelName: 'Macro',
            indexes: [
                {
                    unique: true,
                    fields: ['Key']
                }
            ]
        }
    );
    await Macro.sync({ force: true });

    // Create character metadata table
    logger.info("  Initalising Characters table.");
    Character.init(
        {
            Name: {
                type: DataTypes.STRING,
                unique: true,
                allowNull: false,
                primaryKey: true
            },
            'Pretty Name': {
                type: DataTypes.STRING,
                allowNull: false
            },
            Colour: {
                type: DataTypes.STRING,
                allowNull: false
            }
        },
        {
            sequelize,
            modelName: 'Character',
            indexes: [
                {
                    unique: true,
                    fields: ['Name']
                }
            ]
        }
    );
    await Character.sync({ force: true });

    // Create framedata table
    logger.info("  Initalising Moves table.");
    Move.init(
        {
            Character: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: 'compositeKey'
            },
            'Move Name': {
                type: DataTypes.STRING,
                allowNull: false,
                unique: 'compositeKey'
            },
            Guard: {
                type: DataTypes.STRING,
                defaultValue: '-'
            },
            Properties: {
                type: DataTypes.STRING,
                defaultValue: '-'
            },
            Damage: {
                type: DataTypes.STRING,
                defaultValue: '-'
            },
            Meter: {
                type: DataTypes.STRING,
                defaultValue: '-'
            },
            'On Hit': {
                type: DataTypes.STRING,
                defaultValue: '-'
            },
            'On Block': {
                type: DataTypes.STRING,
                defaultValue: '-'
            },
            Startup: {
                type: DataTypes.STRING,
                defaultValue: '-'
            },
            Active: {
                type: DataTypes.STRING,
                defaultValue: '-'
            },
            Recovery: {
                type: DataTypes.STRING,
                defaultValue: '-'
            },
            Hitstun: {
                type: DataTypes.STRING,
                defaultValue: '-'
            },
            Blockstun: {
                type: DataTypes.STRING,
                defaultValue: '-'
            },
            Hitstop: {
                type: DataTypes.STRING,
                defaultValue: ''
            },
            'On Pushblock': {
                type: DataTypes.STRING,
                defaultValue: ''
            },
            Footer: {
                type: DataTypes.STRING,
                defaultValue: ''
            },
            'Thumbnail URL': {
                type: DataTypes.STRING,
                defaultValue: '-'
            },
            'Footer URL': {
                type: DataTypes.STRING,
                defaultValue: '-'
            },
        },
        {
            sequelize,
            modelName: 'Move',
            indexes: [
                {
                    unique: true,
                    fields: ['Character', 'Move Name']
                }
            ]
        },
    );
    await Move.sync({ force: true });

    logger.info("  Initalising SimpleAliases table.");
    SimpleAlias.init(
        {
            Character: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: 'compositeKey'
            },
            Alias: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: 'compositeKey'
            },
            'Move Name': {
                type: DataTypes.STRING,
                allowNull: false
            }
        },
        {
            sequelize,
            modelName: 'SimpleAlias',
            indexes: [
                {
                    unique: true,
                    fields: ['Character', 'Alias']
                }
            ]
        }
    );
    await SimpleAlias.sync({ force: true });

    logger.info("  Initalising RegexAliases table.");
    RegexAlias.init(
        {
            Character: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: 'compositeKey'
            },
            Pattern: {
                type: DataTypes.STRING,
                allowNull: false,
                unique: 'compositeKey'
            },
            'Move Name': {
                type: DataTypes.STRING,
                allowNull: false
            }
        },
        {
            sequelize,
            modelName: 'RegexAlias',
            indexes: [
                {
                    unique: true,
                    fields: ['Character', 'Pattern']
                }
            ]
        }
    );
    await RegexAlias.sync({ force: true });
}
