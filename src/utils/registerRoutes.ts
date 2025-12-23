import { Application } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import ClentoAPI from './apiUtil';

/**
 * Recursively find all route files in a directory
 * @param dir - Directory to search
 * @param isProduction - Whether we're in production (looking for .js files) or dev (looking for .ts files)
 * @returns Array of absolute file paths
 */
function findRouteFiles(dir: string, isProduction: boolean): string[] {
    const files: string[] = [];

    if (!fs.existsSync(dir)) {
        return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const fileExtension = '.js';

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            // Skip node_modules, dist, .git, and other non-source directories
            if (!['node_modules', 'dist', '.git', 'generated'].includes(entry.name)) {
                files.push(...findRouteFiles(fullPath, isProduction));
            }
        } else if (entry.isFile() && entry.name.endsWith(fileExtension)) {
            // Skip declaration files and source maps
            if (!entry.name.endsWith('.d.ts') && !entry.name.endsWith('.d.js') && !entry.name.endsWith('.map')) {
                files.push(fullPath);
            }
        }
    }
    return files;
}

/**
 * Load a route file and extract the ClentoAPI instance
 * @param filePath - Absolute path to the route file
 * @returns ClentoAPI instance or null if file is not a valid route
 */
function loadRoute(filePath: string): ClentoAPI | null {
    try {
        // Require the route file directly
        // In production: filePath points to dist/routes/*.js
        // In development: filePath points to src/routes/*.ts (works with ts-node)
        const routeModule = require(filePath);
        const routeInstance = routeModule.default;

        // Validate it's a ClentoAPI instance
        if (!routeInstance || !(routeInstance instanceof ClentoAPI)) {
            return null; // Skip non-route files
        }

        return routeInstance;
    } catch (error) {
        // Silently skip files that can't be loaded (might not be route files)
        return null;
    }
}

/**
 * Register all routes automatically by scanning route files
 * Routes are discovered at startup - no build-time generation needed
 * @param app - Express application instance
 * @param routesFolder - Path to the routes directory (dist/routes in production, src/routes in dev)
 */
const registerAllRoutes = (app: Application, routesFolder: string): void => {
    // Determine if we're in production (dist) or development (src)
    const isProduction = __dirname.includes('dist') || routesFolder.includes('dist');

    // Find all route files (.js in production, .ts in development)
    const routeFiles = findRouteFiles(routesFolder, isProduction);

    const registeredPaths = new Set<string>();
    const registeredRoutes: ClentoAPI[] = [];

    // Load all route files
    for (const filePath of routeFiles) {
        const routeInstance = loadRoute(filePath);
        if (!routeInstance) {
            continue; // Skip non-route files
        }

        // Validate no duplicate paths
        if (registeredPaths.has(routeInstance.path)) {
            throw new Error(`Duplicate route path: ${routeInstance.path}`);
        }

        registeredPaths.add(routeInstance.path);
        registeredRoutes.push(routeInstance);
    }

    // Register all routes to Express app
    for (const routeInstance of registeredRoutes) {
        // Register all HTTP methods that the route supports
        // The wrapper method handles routing to the appropriate handler
        app.get(routeInstance.path, routeInstance.wrapper);
        app.post(routeInstance.path, routeInstance.wrapper);
        app.put(routeInstance.path, routeInstance.wrapper);
        app.delete(routeInstance.path, routeInstance.wrapper);
        app.head(routeInstance.path, routeInstance.wrapper);
        app.options(routeInstance.path, routeInstance.wrapper);
    }

    console.log(`✓ Registered ${registeredRoutes.length} route(s)`);
};

export default registerAllRoutes;
