import { Express } from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import env from './env';

/**
 * Configure Swagger documentation
 */
export const setupSwagger = (app: Express): void => {
    // Swagger definition
    const swaggerOptions = {
        definition: {
            openapi: '3.0.0',
            info: {
                title: 'Clento Backend API',
                version: '1.0.0',
                description: 'API documentation for Clento Clay LinkedIn and email outreach automation platform',
                contact: {
                    name: 'Clento Clay Support',
                    email: 'support@clento.io',
                },
            },
            servers: [
                {
                    url: `http://localhost:${env.PORT}`,
                    description: 'Development server',
                },
            ],
            components: {
                securitySchemes: {
                    bearerAuth: {
                        type: 'http',
                        scheme: 'bearer',
                        bearerFormat: 'JWT',
                    },
                },
            },
            security: [
                {
                    bearerAuth: [],
                },
            ],
        },
        // Path to the API docs
        apis: ['./src/**/*.ts'],
    };

    // Initialize swagger-jsdoc
    const swaggerSpec = swaggerJsdoc(swaggerOptions);

    // Serve swagger docs
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

    // Serve swagger spec as JSON
    app.get('/swagger.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerSpec);
    });
};
