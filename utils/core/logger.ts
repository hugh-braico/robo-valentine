/**
 * @fileoverview Centralized logger utility using Winston for logging messages.
 * 
 * This module exports a pre-configured logger instance that supports logging to files and the console.
 * It includes separate transports for error logs, combined logs, and console output.
 * 
 * @module utils/core/logger
 */
import winston, { format } from 'winston';

export const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({
            filename: 'error.log',
            level: 'error',
            format: format.combine(
                format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
                format.simple()
            ),
        }),
        new winston.transports.File({ 
            filename: 'combined.log',
            format: format.combine(
                format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
                format.simple()
            ),
        }),
        new winston.transports.Console({
            format: format.simple()
        })
    ]
});
