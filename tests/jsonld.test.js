const { extractJsonLdArticle, buildArticleHtml, extractAuthor, extractImage } = require('../src/jsonld');

describe('extractJsonLdArticle', () => {
  test('extracts article from simple JSON-LD', () => {
    const html = `<html><head>
      <script type="application/ld+json">
      {"@type":"NewsArticle","headline":"Test Headline","articleBody":"${'Lorem ipsum '.repeat(30)}","author":{"name":"Jane Doe"},"datePublished":"2024-01-15","image":"https://example.com/img.jpg"}
      </script>
    </head><body></body></html>`;

    const result = extractJsonLdArticle(html);
    expect(result).not.toBeNull();
    expect(result.headline).toBe('Test Headline');
    expect(result.articleBody).toContain('Lorem ipsum');
    expect(result.author).toBe('Jane Doe');
    expect(result.datePublished).toBe('2024-01-15');
    expect(result.image).toBe('https://example.com/img.jpg');
  });

  test('extracts from @graph array', () => {
    const body = 'A'.repeat(250);
    const html = `<html><head>
      <script type="application/ld+json">
      {"@context":"https://schema.org","@graph":[{"@type":"WebPage"},{"@type":"Article","headline":"Graph Article","articleBody":"${body}"}]}
      </script>
    </head><body></body></html>`;

    const result = extractJsonLdArticle(html);
    expect(result).not.toBeNull();
    expect(result.headline).toBe('Graph Article');
  });

  test('skips articleBody shorter than 200 chars', () => {
    const html = `<html><head>
      <script type="application/ld+json">
      {"@type":"Article","headline":"Short","articleBody":"Too short"}
      </script>
    </head><body></body></html>`;

    expect(extractJsonLdArticle(html)).toBeNull();
  });

  test('returns null for HTML without JSON-LD', () => {
    expect(extractJsonLdArticle('<html><body>Hello</body></html>')).toBeNull();
  });

  test('handles malformed JSON gracefully', () => {
    const html = `<html><head>
      <script type="application/ld+json">{invalid json</script>
    </head><body></body></html>`;

    expect(extractJsonLdArticle(html)).toBeNull();
  });

  test('handles array of JSON-LD objects', () => {
    const body = 'B'.repeat(250);
    const html = `<html><head>
      <script type="application/ld+json">
      [{"@type":"WebSite"},{"@type":"Article","headline":"Array Item","articleBody":"${body}"}]
      </script>
    </head><body></body></html>`;

    const result = extractJsonLdArticle(html);
    expect(result).not.toBeNull();
    expect(result.headline).toBe('Array Item');
  });
});

describe('extractAuthor', () => {
  test('handles string author', () => {
    expect(extractAuthor({ author: 'John' })).toBe('John');
  });

  test('handles object author', () => {
    expect(extractAuthor({ author: { name: 'Jane' } })).toBe('Jane');
  });

  test('handles array of authors', () => {
    expect(extractAuthor({ author: [{ name: 'A' }, { name: 'B' }] })).toBe('A, B');
  });

  test('handles mixed array', () => {
    expect(extractAuthor({ author: ['Alice', { name: 'Bob' }] })).toBe('Alice, Bob');
  });

  test('returns empty string for missing author', () => {
    expect(extractAuthor({})).toBe('');
  });
});

describe('extractImage', () => {
  test('handles string image', () => {
    expect(extractImage({ image: 'https://img.com/a.jpg' })).toBe('https://img.com/a.jpg');
  });

  test('handles object image', () => {
    expect(extractImage({ image: { url: 'https://img.com/b.jpg' } })).toBe('https://img.com/b.jpg');
  });

  test('handles array of images', () => {
    expect(extractImage({ image: ['https://img.com/c.jpg', 'https://img.com/d.jpg'] })).toBe('https://img.com/c.jpg');
  });

  test('handles array of image objects', () => {
    expect(extractImage({ image: [{ url: 'https://img.com/e.jpg' }] })).toBe('https://img.com/e.jpg');
  });

  test('returns empty string for missing image', () => {
    expect(extractImage({})).toBe('');
  });
});

describe('buildArticleHtml', () => {
  const article = {
    articleBody: 'Paragraph one.\n\nParagraph two.',
    headline: 'My Article',
    author: 'Jane Doe',
    datePublished: '2024-01-15',
    image: 'https://example.com/img.jpg',
  };

  test('builds valid HTML with article content', () => {
    const html = buildArticleHtml(article, 'https://example.com/article', '<html><head><title>Original</title></head><body></body></html>');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<h1>My Article</h1>');
    expect(html).toContain('<p>Paragraph one.</p>');
    expect(html).toContain('<p>Paragraph two.</p>');
    expect(html).toContain('By Jane Doe');
    expect(html).toContain('2024-01-15');
    expect(html).toContain('https://example.com/img.jpg');
  });

  test('preserves head from original HTML', () => {
    const html = buildArticleHtml(article, 'https://example.com', '<html><head><meta name="custom" content="value"></head><body></body></html>');
    expect(html).toContain('<meta name="custom" content="value">');
  });

  test('escapes HTML in content', () => {
    const xssArticle = { ...article, headline: '<script>alert("xss")</script>' };
    const html = buildArticleHtml(xssArticle, 'https://example.com', '<html><head></head><body></body></html>');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  test('omits author when empty', () => {
    const noAuthor = { ...article, author: '' };
    const html = buildArticleHtml(noAuthor, 'https://example.com', '<html><head></head><body></body></html>');
    expect(html).not.toContain('class="author"');
  });
});
