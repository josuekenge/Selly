// Backend Entry Point
// Modular monolith main entry

import { createHttpServer } from './platform/http';
import { registerRoutes } from './api';
import { createServices } from './services';

const main = async () => {
    const services = createServices();

    const server = createHttpServer({
        port: parseInt(process.env.PORT || '3000'),
        host: process.env.HOST || '0.0.0.0',
    });

    // TODO: Initialize server with routes and services
    console.log('Backend starting...');
};

main().catch(console.error);
