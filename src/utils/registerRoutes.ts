import { Application } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import ClentoAPI from './apiUtil';

/**
 * Recursively require all files in a directory and return API instances
 */
const requireDirectory = (dirPath: string): Record<string, ClentoAPI> => {
    const routes: Record<string, ClentoAPI> = {};

    const readDirectory = (currentPath: string, prefix = '') => {
        const items = fs.readdirSync(currentPath);

        for (const item of items) {
            const itemPath = path.join(currentPath, item);
            const stat = fs.statSync(itemPath);

            if (stat.isDirectory()) {
                // Recursively read subdirectories
                readDirectory(itemPath, prefix ? `${prefix}_${item}` : item);
            } else if (item.endsWith('.ts') || item.endsWith('.js')) {
                // Skip index files and test files
                if (item === 'index.js' || item.includes('.test.') || item.includes('.spec.')) {
                    continue;
                }

                try {
                    const modulePath = itemPath;
                    const module = require(modulePath);
                    const apiInstance = module.default;

                    if (apiInstance && apiInstance instanceof ClentoAPI) {
                        const routeName = prefix ? `${prefix}_${item.replace(/\.(ts|js)$/, '')}` : item.replace(/\.(ts|js)$/, '');
                        routes[routeName] = apiInstance;
                    }
                } catch (error: any) {
                    console.warn(`Failed to load route from ${itemPath}:`, error.message);
                }
            }
        }
    };

    readDirectory(dirPath);
    return routes;
};

/**
 * Register all routes from a directory with the Express app
 */
const registerAllRoutes = (app: Application, routesFolder: string) => {
    const routes = requireDirectory(routesFolder);
    const allPaths = new Set<string>();

    Object.keys(routes).forEach((route: string) => {
        const clentoAPI = routes[route];

        if (!clentoAPI || !clentoAPI.path) {
            throw new Error(`Not a valid API file for routes folder = '${route}'`);
        }

        if (allPaths.has(clentoAPI.path)) {
            throw new Error(`Double registration of route with path = '${clentoAPI.path}'`);
        }
        allPaths.add(clentoAPI.path);

        // Register all HTTP methods with the API wrapper
        app.get(clentoAPI.path, clentoAPI.wrapper);
        app.post(clentoAPI.path, clentoAPI.wrapper);
        app.put(clentoAPI.path, clentoAPI.wrapper);
        app.delete(clentoAPI.path, clentoAPI.wrapper);
        app.head(clentoAPI.path, clentoAPI.wrapper);
        app.options(clentoAPI.path, clentoAPI.wrapper);

        console.log(`✅ Registered route: ${clentoAPI.path}`);
    });

    console.log(`🚀 Total routes registered: ${allPaths.size}`);
};

export default registerAllRoutes;
