import { suggestAdditions } from '../../scripts/tighten-csp.js';

describe('suggestAdditions', () => {
  it('suggests external script/style/img origins not already covered by the CSP', () => {
    const html = `
      <script src="https://cdn.jsdelivr.net/npm/foo.js"></script>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css">
      <img src="https://images.example.com/pic.png">
    `;
    const suggestions = suggestAdditions(html);

    expect(suggestions.scriptSrc).toEqual(['https://cdn.jsdelivr.net']);
    expect(suggestions.styleSrc).toEqual(['https://fonts.googleapis.com']);
    expect(suggestions.imgSrc).toEqual(['https://images.example.com']);
  });

  it('does not suggest local paths or data: URIs', () => {
    const html = '<img src="data:image/png;base64,abc"><img src="/local.png">';
    expect(suggestAdditions(html)).toEqual({});
  });

  it('does not re-suggest an origin already present in the current CSP (self is already covered)', () => {
    // A relative script src has no origin to extract, so it never appears
    // as a suggestion regardless of directive coverage.
    const html = '<script src="/app.js"></script>';
    expect(suggestAdditions(html).scriptSrc).toBeUndefined();
  });

  it('returns an empty object for HTML with no external resources at all', () => {
    expect(suggestAdditions('<html><body>hello</body></html>')).toEqual({});
  });

  it('deduplicates repeated origins', () => {
    const html = `
      <script src="https://cdn.example.com/a.js"></script>
      <script src="https://cdn.example.com/b.js"></script>
    `;
    expect(suggestAdditions(html).scriptSrc).toEqual(['https://cdn.example.com']);
  });
});
