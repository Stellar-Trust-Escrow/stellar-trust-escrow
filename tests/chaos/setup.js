
import { Toxiproxy, Toxic } from 'toxiproxy-node-client';

const TOXIPROXY_HOST = process.env.TOXIPROXY_HOST || 'localhost';
const TOXIPROXY_PORT = parseInt(process.env.TOXIPROXY_PORT || '8474', 10);
const PROXIES = {
  redis: {
    upstream: `redis:6379`,
    listen: `0.0.0.0:26379`
  },
  postgres: {
    upstream: `postgres:5432`,
    listen: `0.0.0.0:25432`
  },
  stellar: {
    upstream: `stellar:8001`,
    listen: `0.0.0.0:28001`
  }
};

const toxiproxy = new Toxiproxy(`http://${TOXIPROXY_HOST}:${TOXIPROXY_PORT}`);

export async function setupToxiproxy() {
  await Promise.all(Object.entries(PROXIES).map(async ([name, config]) => {
    try {
      const existingProxy = await toxiproxy.getProxy(name);
      if (existingProxy) {
        await existingProxy.delete();
      }
    } catch (e) {
      // Ignore if proxy doesn't exist
    }

    await toxiproxy.createProxy({
      name,
      listen: config.listen,
      upstream: config.upstream
    });
  }));

  console.log('Toxiproxy proxies created successfully');
}

export async function getProxy(name) {
  return await toxiproxy.getProxy(name);
}

export { toxiproxy, PROXIES, Toxic };
