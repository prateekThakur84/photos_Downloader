// --- Required Node.js Modules ---
const fs = require("fs"); // Standard filesystem module (callback-based)
const fsp = require("fs").promises; // Filesystem module with Promises (async/await support)
const path = require("path"); // For working with file/directory paths
const fetch = require("node-fetch"); // For making HTTP requests (to download images)
const csv = require("csv-parser"); // For parsing CSV files

/**
 * Download an image from a given URL and save it to the specified file path
 * @param {string} url - The image URL
 * @param {string} filePath - Path where the image should be saved
 */
async function downloadImage(url, filePath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.statusText}`);
  const buffer = await res.buffer();
  await fsp.writeFile(filePath, buffer);
}

/**
 * Sanitize text so it can be safely used as a folder or file name
 * (removes invalid characters for file systems)
 * @param {string} text - Input string
 * @returns {string} - Safe file-system-friendly string
 */
function sanitizeForPath(text) {
  if (!text) return "_unknown";
  return text.replace(/[\/\\?%*:|"<>]/g, "_");
}

/**
 * Generate a descriptive filename for the image & JSON metadata
 * Uses description, photographer name, and photo ID
 * @param {Object} row - Row object from CSV
 * @returns {string} - Base filename without extension
 */
function generateDescriptiveFilename(row) {
  const description = row.ai_description || "untitled";
  const photographer = row.photographer_username || "unknown";

  // Create a slug from description (lowercase, underscores, max 50 chars)
  const descriptionSlug = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "") // remove special characters
    .replace(/\s+/g, "_") // replace spaces with underscores
    .substring(0, 50); // truncate long names

  return `${descriptionSlug}_by_${photographer}_${row.photo_id}`;
}

/**
 * Process a batch of rows (download images + save metadata)
 * @param {Array} rows - Array of CSV rows
 * @param {number} start - Start index of the batch
 * @param {number} batchSize - Number of rows in the batch
 * @returns {Promise<Array>} - Array of settled promises with download results
 */
async function processBatch(rows, start, batchSize) {
  const batch = rows.slice(start, start + batchSize);

  return Promise.allSettled(
    batch.map(async (row) => {
      const id = row["photo_id"];
      const url = row["photo_image_url"];

      // Skip invalid rows
      if (!id || !url || !url.startsWith("http")) {
        return Promise.reject(
          new Error(`Invalid data for row: ${JSON.stringify(row)}`)
        );
      }

      try {
        // Folder structure: downloads/photographer/year/
        const photographer = sanitizeForPath(row["photographer_username"]);
        const year = row["photo_submitted_at"]
          ? new Date(row["photo_submitted_at"]).getFullYear()
          : "_unknown_date";

        const targetDir = path.join("downloads", photographer, String(year));
        await fsp.mkdir(targetDir, { recursive: true });

        // Generate filenames for image & JSON
        const baseFilename = generateDescriptiveFilename(row);
        const imagePath = path.join(targetDir, `${baseFilename}.jpg`);
        const jsonPath = path.join(targetDir, `${baseFilename}.json`);

        // Download image and save metadata JSON
        await downloadImage(url, imagePath);
        await fsp.writeFile(jsonPath, JSON.stringify(row, null, 2));

        console.log(`✅ Saved ${baseFilename}.jpg to ${targetDir}`);

        // Return manifest entry
        return {
          id: row.photo_id,
          description: row.ai_description,
          photographer: row.photographer_username,
          country: row.photo_location_country,
          tags: (row.ai_description || "").split(" "), // naive tag split by spaces
          path: imagePath,
        };
      } catch (err) {
        console.error(`❌ Error with ${id}:`, err.message);
        return Promise.reject(err);
      }
    })
  );
}

/**
 * Main workflow:
 * 1. Read CSV file (photos.csv)
 * 2. Process data in batches
 * 3. Download images + save metadata JSONs
 * 4. Write a manifest.json for all successful downloads
 */
async function main() {
  const results = []; // Store all CSV rows
  const manifestData = []; // Store processed data for manifest.json

  console.log("📂 Reading photos.csv...");

  fs.createReadStream("photos.csv")
    .pipe(csv({ separator: "\t", mapHeaders: ({ header }) => header.trim() }))
    .on("data", (row) => results.push(row)) // push each row into results
    .on("end", async () => {
      console.log(`📊 Loaded ${results.length} rows`);

      const batchSize = 20; // Number of rows processed at a time

      // Process data in chunks
      for (let i = 0; i < results.length; i += batchSize) {
        console.log(
          `➡️ Processing rows ${i + 1} - ${Math.min(
            i + batchSize,
            results.length
          )}`
        );
        const batchResults = await processBatch(results, i, batchSize);

        // Collect successful results into manifestData
        batchResults.forEach((result) => {
          if (result.status === "fulfilled" && result.value) {
            manifestData.push(result.value);
          }
        });
      }

      // Save manifest.json containing all downloaded files' metadata
      try {
        const manifestPath = path.join("downloads", "manifest.json");
        await fsp.writeFile(
          manifestPath,
          JSON.stringify(manifestData, null, 2)
        );
        console.log(`\n✅ Manifest file created at ${manifestPath}`);
      } catch (err) {
        console.error("❌ Error writing manifest file:", err);
      }

      console.log("🎉 All downloads finished!");
    });
}

// Ensure the "downloads" folder exists, then start the main process
fsp.mkdir("downloads", { recursive: true }).then(main);
