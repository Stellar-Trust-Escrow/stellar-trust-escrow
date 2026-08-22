import { fileURLToPath } from 'url';
import path from 'path';
import { parse as load } from 'yaml';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverPath = path.join(__dirname, '..', 'server.js');
const openapiPath = path.join(__dirname, '..', 'openapi.yaml');

function normalizePathForComparison(pathStr) {
  return pathStr.replace(/:([^/]+)/g, '{$1}');
}

function extractRoutes(layer, basePath = '') {
  const routes = [];
  if (layer.route) {
    // This is a direct route
    const methods = Object.keys(layer.route.methods).map((m) => m.toUpperCase());
    const fullPath = normalizePathForComparison(basePath + layer.route.path);
    for (const method of methods) {
      routes.push({ method, path: fullPath });
    }
  } else if (layer.name === 'router' && layer.handle && layer.handle.stack) {
    // This is a nested router
    let routerPrefix = '';
    if (layer.regexp) {
      // Extract the base path from the router's regex
      const regexStr = layer.regexp.source;
      if (regexStr.startsWith('^\\/')) {
        // Remove the regex-specific parts like (\/(?=\/|$))?
        routerPrefix = regexStr
          .replace(/^\^\\\//, '/')
          .replace(/\\\//g, '/')
          .replace(/\(\?:.*$/, '')
          .replace(/\$$/, '');
      }
    }
    const newBasePath = basePath + routerPrefix;
    for (const subLayer of layer.handle.stack) {
      routes.push(...extractRoutes(subLayer, newBasePath));
    }
  }
  return routes;
}

function extractRoutesFromExpressApp(app) {
  const routes = [];
  if (app._router && app._router.stack) {
    for (const layer of app._router.stack) {
      routes.push(...extractRoutes(layer));
    }
  }
  return routes;
}

async function main() {
  try {
    console.log('Extracting Express routes...');
    const { default: app } = await import(serverPath);
    const expressRoutes = extractRoutesFromExpressApp(app);
    console.log(`Found ${expressRoutes.length} Express routes`);
    // Uncomment to debug:
    // console.log('Express routes:', expressRoutes);

    console.log('\nExtracting OpenAPI paths...');
    const yamlContent = await fs.readFile(openapiPath, 'utf8');
    const openapi = load(yamlContent);
    const openapiRoutes = [];
    for (const [path, methods] of Object.entries(openapi.paths || {})) {
      for (const method of Object.keys(methods)) {
        openapiRoutes.push({ method: method.toUpperCase(), path });
      }
    }
    console.log(`Found ${openapiRoutes.length} OpenAPI paths`);
    // Uncomment to debug:
    // console.log('OpenAPI paths:', openapiRoutes);

    const routeKey = (r) => `${r.method}:${r.path}`;
    const expressRouteSet = new Set(expressRoutes.map(routeKey));
    const openapiRouteSet = new Set(openapiRoutes.map(routeKey));

    const undocumented = expressRoutes.filter((r) => !openapiRouteSet.has(routeKey(r)));
    const ghost = openapiRoutes.filter((r) => !expressRouteSet.has(routeKey(r)));

    let hasErrors = false;

    if (undocumented.length > 0) {
      console.log('\n⚠️  Undocumented routes (in code but not in spec — add to openapi.yaml):');
      undocumented.forEach((r) => console.log(`  ${r.method} ${r.path}`));
    }

    if (ghost.length > 0) {
      hasErrors = true;
      console.log('\n❌ Ghost endpoints (in spec but not in code):');
      ghost.forEach((r) => console.log(`  ${r.method} ${r.path}`));
    }

    if (!hasErrors) {
      console.log('\n✅ All routes are documented and valid!');
    } else {
      console.log('\n❌ Found discrepancies!');
      process.exit(1);
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
