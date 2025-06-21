/**
 * @fileoverview This module provides functionality to interact with a Google Spreadsheet
 * using the Google Sheets API. It initializes a connection to the spreadsheet using
 * service account credentials and provides access to the spreadsheet object for further operations.
 *
 * The module uses the `google-auth-library` for authentication and the `google-spreadsheet` library
 * for interacting with the spreadsheet. It reads configuration details such as the service account
 * credentials and the spreadsheet ID from JSON files.
 *
 * @module utils/data/google-sheets
 */
import creds from '../../config/service-account.json' with { type: "json" };
import config from '../../config/config.json' with { type: "json" };
import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { logger } from '../core/logger.js';

export let doc: GoogleSpreadsheet | null = null;

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
