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
        "User-Agent": "Mozilla/5.0",
        "Accept-Language": "en-US,en;q=0.9"
      }
    });

    const $ = cheerio.load(response.data);
    const ogImage = $('meta[property="og:image"]').attr("content");

    if (ogImage) return res.send(ogImage);
    else return res.status(404).send("Image not found");

  } catch (err) {
    return res.status(500).send("Error: " + err.message);
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});