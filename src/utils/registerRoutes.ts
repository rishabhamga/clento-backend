import { Application } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import ClentoAPI from './apiUtil';

/**
 * Recursively require all route files from a folder.
 * @param folderPath absolute path (use path.join(__dirname, 'routes'))
 */
export const requireDirectory = <T>(folderPath: string): { [key: string]: T } => {
    const returningMap: { [key: string]: T } = {};

    fs.readdirSync(folderPath).forEach((file) => {
        const filePath = path.join(folderPath, file);

        // Load only runtime files: .js (compiled) or .ts (source), but never .d.ts
        const isJs = file.endsWith('.js');
        const isTs = file.endsWith('.ts') && !file.endsWith('.d.ts');

        if (isJs || isTs) {
            const relativeFilePath = path.relative(__dirname, filePath);
            const required = require(filePath).default;
            returningMap[file.replace(/\.(ts|js)$/i, '')] = required;
        } else if (fs.lstatSync(filePath).isDirectory()) {
            const innerFiles = requireDirectory<T>(filePath);
            Object.keys(innerFiles).forEach((innerKey) => {
                returningMap[`${file}/${innerKey}`] = innerFiles[innerKey];
            });
        }
    });

    return returningMap;
};

/**
 * Registers all routes automatically.
 */
const registerAllRoutes = (app: Application, routesFolder: string) => {
    const routes = requireDirectory<ClentoAPI>(routesFolder);
    const allPaths = new Set<string>();

    Object.values(routes).forEach((clentoAPI) => {
        if (!(clentoAPI instanceof ClentoAPI)) return;

        if (allPaths.has(clentoAPI.path)) {
            throw new Error(`Double registration of route with path = '${clentoAPI.path}'`);
        }
        allPaths.add(clentoAPI.path);

        app.get(clentoAPI.path, clentoAPI.wrapper);
        app.post(clentoAPI.path, clentoAPI.wrapper);
        app.put(clentoAPI.path, clentoAPI.wrapper);
        app.delete(clentoAPI.path, clentoAPI.wrapper);
        app.head(clentoAPI.path, clentoAPI.wrapper);
        app.options(clentoAPI.path, clentoAPI.wrapper);

        console.log(`✅ Registered: ${clentoAPI.path}`);
    });

    console.log(`🚀 Total routes registered: ${allPaths.size}`);
};

export default registerAllRoutes;
