import express from 'express';

const app = express();

app.get('/health', (req, res) => res.send('ok'));
app.get('/api/csrf-token', (req, res) => res.send('ok'));

const router = express.Router();
router.get('/test', (req, res) => res.send('test'));
app.use('/api/test', router);

console.log(
  'app._router.stack:',
  app._router?.stack?.map((layer) => ({
    name: layer.name,
    route: layer.route?.path,
    regexp: layer.regexp?.source,
  })),
);
