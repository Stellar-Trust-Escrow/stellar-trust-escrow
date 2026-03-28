import { getMetricSnapshot, startMeasure, trackCustomMetric } from '../../lib/performance';

describe('performance helpers', () => {
  beforeEach(() => {
    jest.spyOn(global.performance, 'now').mockReturnValue(100);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('stores custom metrics with the expected prefix', () => {
    trackCustomMetric('dashboard.render', 123.4, { source: 'test' });

    const snapshot = getMetricSnapshot();
    expect(snapshot.at(-1)).toMatchObject({
      name: 'custom.dashboard.render',
      value: 123,
      rating: 'custom',
      source: 'test',
    });
  });

  it('measures duration between start and end calls', () => {
    const nowSpy = jest
      .spyOn(global.performance, 'now')
      .mockReturnValueOnce(50)
      .mockReturnValueOnce(215);

    const end = startMeasure('escrow.fetch');
    const duration = end();

    expect(duration).toBe(165);
    expect(getMetricSnapshot().at(-1)).toMatchObject({
      name: 'custom.escrow.fetch',
      value: 165,
      rating: 'custom',
    });

    nowSpy.mockRestore();
  });
});
