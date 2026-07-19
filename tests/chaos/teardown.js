import { toxiproxy, PROXIES } from './setup.js';

export async function teardownToxiproxy() {
  await Promise.all(Object.keys(PROXIES).map(async (name) => {
    try {
      const proxy = await toxiproxy.getProxy(name);
      if (proxy) {
        await proxy.delete();
      }
    } catch (e) {
      // Ignore if proxy doesn't exist
    }
  }));
  console.log('Toxiproxy proxies deleted successfully');
}
