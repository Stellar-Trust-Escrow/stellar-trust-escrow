if (process.env.NODE_ENV === 'production' || process.env.CI === 'true') {
  process.exit(0);
}

try {
  const { default: husky } = await import('husky');
  husky();
} catch {
  process.exit(0);
}
