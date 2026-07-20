import { fileURLToPath } from 'url';
import path from 'path';
import { generateApi } from 'swagger-typescript-api';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openapiPath = path.resolve(__dirname, '../openapi.yaml');
const outputPath = path.resolve(__dirname, '../../frontend/lib/api-client');

generateApi({
  name: 'api.ts',
  input: openapiPath,
  output: outputPath,
  modular: true,
  httpClientType: 'fetch',
  generateClient: true,
})
  .then(({ files }) => {
    console.log('SDK generated successfully!');
    files.forEach(({ name, content }) => {
      console.log(`Generated: ${name}`);
    });
  })
  .catch((err) => {
    console.error('Error generating SDK:', err);
    process.exit(1);
  });
