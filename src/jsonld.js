/**
 * JSON-LD structured data extraction for article content.
 *
 * Many publishers (DPG Media, NYT, etc.) embed full article text in
 * <script type="application/ld+json"> for SEO, even on paywalled pages.
 */

const { escapeHtml } = require('./shared/utils');

/**
 * Extract article content from JSON-LD structured data in HTML.
 * @param {string} html - Raw HTML containing script tags
 * @returns {{ articleBody: string, headline: string, author: string, datePublished: string, image: string } | null}
 */
function extractJsonLdArticle(html) {
  const jsonLdRegex = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = jsonLdRegex.exec(html)) !== null) {
    try {
      const data = JSON.parse(match[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const candidates = item['@graph'] ? [...item['@graph'], item] : [item];
        for (const candidate of candidates) {
          if (candidate.articleBody && candidate.articleBody.length > 200) {
            return {
              articleBody: candidate.articleBody,
              headline: candidate.headline || '',
              author: extractAuthor(candidate),
              datePublished: candidate.datePublished || '',
              image: extractImage(candidate),
            };
          }
        }
      }
    } catch { /* skip malformed JSON-LD */ }
  }
  return null;
}

function extractAuthor(item) {
  if (!item.author) return '';
  if (typeof item.author === 'string') return item.author;
  if (Array.isArray(item.author)) {
    return item.author.map(a => typeof a === 'string' ? a : a.name || '').filter(Boolean).join(', ');
  }
  return item.author.name || '';
}

function extractImage(item) {
  if (!item.image) return '';
  if (typeof item.image === 'string') return item.image;
  if (Array.isArray(item.image)) {
    const first = item.image[0];
    return typeof first === 'string' ? first : (first && first.url) || '';
  }
  return item.image.url || '';
}

/**
 * Build a clean article HTML page from extracted JSON-LD data.
 * Preserves the <head> from the original HTML for meta tags/styles.
 * @param {{ articleBody: string, headline: string, author: string, datePublished: string, image: string }} article
 * @param {string} originalUrl
 * @param {string} originalHtml
 * @returns {string}
 */
function buildArticleHtml(article, originalUrl, originalHtml) {
  const paragraphs = article.articleBody
    .split(/\n+/)
    .filter(p => p.trim().length > 0)
    .map(p => `<p>${escapeHtml(p.trim())}</p>`)
    .join('\n    ');

  const headMatch = originalHtml.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  const headContent = headMatch
    ? headMatch[1]
    : `<meta charset="utf-8"><title>${escapeHtml(article.headline)}</title>`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  ${headContent}
</head>
<body>
  <article>
    <h1>${escapeHtml(article.headline)}</h1>
    ${article.author ? `<p class="author">By ${escapeHtml(article.author)}</p>` : ''}
    ${article.datePublished ? `<time datetime="${escapeHtml(article.datePublished)}">${escapeHtml(article.datePublished)}</time>` : ''}
    ${article.image ? `<figure><img src="${escapeHtml(article.image)}" alt=""></figure>` : ''}
    ${paragraphs}
  </article>
</body>
</html>`;
}

module.exports = { extractJsonLdArticle, buildArticleHtml, extractAuthor, extractImage };
