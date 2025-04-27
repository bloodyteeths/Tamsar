// index.js
require('dotenv').config();
const express   = require('express');
const axios     = require('axios').default;
const cheerio   = require('cheerio');
const rateLimit = require('express-rate-limit');
const { URL }   = require('url');

const app           = express();
const PORT          = process.env.PORT || 3000;
const VEEQO_API_KEY = process.env.VEEQO_API_KEY;

// Basic abuse-protection
app.use(rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max     : 60             // limit each IP to 60 requests per window
}));

// Helper: only allow valid http(s) URLs (SSRF guard)
function isValidExternalUrl(raw) {
  try {
    const u = new URL(raw);
    return ['http:', 'https:'].includes(u.protocol);
  } catch {
    return false;
  }
}

// Helper: turn protocol-relative or relative URLs into absolute
function absolutize(src, base) {
  try {
    return new URL(src, base).href;
  } catch {
    return src;
  }
}

// ───── VEEQO ORDERS PROXY ─────
app.get('/veeqo-orders', async (req, res) => {
  if (!VEEQO_API_KEY) {
    return res.status(500).json({ error: 'VEEQO_API_KEY not set' });
  }
  try {
    const { data } = await axios.get(
      'https://api.veeqo.com/orders?per_page=250',
      { headers: { 'X-Api-Key': VEEQO_API_KEY } }
    );
    return res.json(data);
  } catch (err) {
    console.error('Veeqo error:', err.toString().slice(0, 500));
    return res.status(500).json({ error: 'Failed to fetch Veeqo orders' });
  }
});

// ───── UNIVERSAL SCRAPER ─────
app.get('/scrape-image', async (req, res) => {
  const pageUrl = req.query.url;
  if (!isValidExternalUrl(pageUrl)) {
    return res.status(400).json({ error: 'Valid url parameter is required' });
  }

  try {
    const { data: html } = await axios.get(pageUrl, {
      timeout     : 10_000,
      maxRedirects: 5,
      headers     : {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        Accept            : 'text/html,application/xhtml+xml'
      }
    });

    const $ = cheerio.load(html);
    // 1) Try OG/Twitter meta
    let imageUrl =
      $('meta[property="og:image"]').attr('content') ||
      $('meta[name="twitter:image"]').attr('content');
    if (imageUrl) imageUrl = absolutize(imageUrl.split('?')[0], pageUrl);

    // 2) Amazon fallback
    if (
      !imageUrl &&
      /amazon\.[a-z.]+\/.*(\/dp\/|\/gp\/product\/|\/product\/)/.test(pageUrl)
    ) {
      const ogMatch = html.match(/<meta property="og:image" content="([^"]+)"/i);
      imageUrl = ogMatch?.[1] || '';
      if (!imageUrl) {
        const fb = html.match(
          /"large":"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"/
        );
        imageUrl = fb?.[1] || '';
      }
    }

    // 3) Last-resort: first <img> wider than 300px
    if (!imageUrl) {
      $('img').each((_, el) => {
        const w = parseInt($(el).attr('width') || 0, 10);
        if (!imageUrl && w > 300) {
          imageUrl = absolutize($(el).attr('src'), pageUrl);
        }
      });
    }

    if (imageUrl) return res.json({ imageUrl });
    return res.status(404).json({ error: 'Image not found' });
  } catch (err) {
    console.error('Scraper error:', err.toString().slice(0, 500));
    return res.status(500).json({ error: 'Scrape failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
