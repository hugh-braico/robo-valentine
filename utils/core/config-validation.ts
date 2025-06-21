/**
 * @fileoverview Provides validation schema for application configuration using Joi.
 */
import Joi from 'joi';

// Define the schema for config validation
export const configSchema = Joi.object({
    token: Joi.string().required().min(1),
    clientId: Joi.string().required().min(1),
    'google-sheet-id': Joi.string().required().min(1),
    'activity-channel-id': Joi.string(),
    'error-channel-id': Joi.string(),
    'approved-maintainers': Joi.array().items(Joi.string()).min(1).required(),
    'rate-limiter': Joi.object({
        limit: Joi.number().integer().positive().required(),
        'window-milliseconds': Joi.number().integer().positive().required()
    }).required(),
}).required();
