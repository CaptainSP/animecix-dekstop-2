import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';

import { resolveAssetPath, getMimeType } from './tau-protocol';

let server: http.Server | null = null;
let resolvedPort = 0;

export function getPlayerPort(): number {
    return resolvedPort;
}

export function getPlayerBaseUrl(): string | null {
    if (!resolvedPort) return null;
    return `http://tau-player.localhost:${resolvedPort}`;
}

export function startPlayerServer(): Promise<number> {
    if (server) return Promise.resolve(resolvedPort);

    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
    const { app } = require('electron') as typeof import('electron');

    const basePath = app.isPackaged
        ? path.join(process.resourcesPath, 'player')
        : path.join(app.getAppPath(), 'assets', 'player');

    return new Promise((resolve, reject) => {
        server = http.createServer((req, res) => {
            const pathname = new URL(req.url || '/', `http://localhost`).pathname;

            let filePath = resolveAssetPath(pathname, basePath);
            if (filePath === null) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            let ext = path.extname(filePath);

            // SPA fallback: routes without extension serve index.html
            if (!ext) {
                filePath = path.join(path.resolve(basePath), 'index.html');
                ext = '.html';
            }

            const mimeType = getMimeType(ext);

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(404);
                    res.end('Not Found');
                    return;
                }

                res.writeHead(200, {
                    'Content-Type': mimeType,
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'no-store, max-age=0',
                    Pragma: 'no-cache',
                });
                res.end(data);
            });
        });

        server.listen(0, '127.0.0.1', () => {
            const addr = server?.address();
            resolvedPort = typeof addr === 'object' && addr ? addr.port : 0;
            console.log(`[tau-localhost] Player server on http://tau-player.localhost:${resolvedPort}`);
            resolve(resolvedPort);
        });

        server.on('error', reject);
    });
}

export function stopPlayerServer(): void {
    server?.close();
    server = null;
    resolvedPort = 0;
}
