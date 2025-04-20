const express = require("express");
const axios = require("axios");
const cheerio = require("cheerio");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/scrape-image", async (req, res) => {
  const asin = req.query.asin;
  if (!asin) return res.status(400).send("ASIN is required");

  const url = `https://www.amazon.com/dp/${asin}`;

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    const html = response.data;

    // Extract og:image first (more reliable)
    const match = html.match(/<meta property="og:image" content="([^"]+)"/);
    if (match && match[1]) {
      return res.send(match[1]);
    }

    // Fallback: look for large image via regex
    const fallback = html.match(/"large":"(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)/);
    if (fallback && fallback[1]) {
      return res.send(fallback[1]);
    }

    return res.status(404).send("Image not found");
  } catch (err) {
    return res.status(500).send("Error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
