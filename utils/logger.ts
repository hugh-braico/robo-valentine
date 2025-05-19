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
                format.prettyPrint()
            ),
        }),
        new winston.transports.File({ 
            filename: 'combined.log',
            format: format.combine(
                format.timestamp({format: 'YYYY-MM-DD HH:mm:ss'}),
                format.prettyPrint()
            ),
        }),
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});
