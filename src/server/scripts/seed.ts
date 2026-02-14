import { connectDB, closeDB } from '../config/database.js';
import { BronWebsite } from '../models/BronWebsite.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
};

async function seedBronWebsites() {
  try {
    console.log(`${colors.blue}Connecting to MongoDB...${colors.reset}`);
    await connectDB();

    // Read the bronwebsites.json file
    const bronwebsitesPath = path.resolve(__dirname, '../../../bronwebsites.json');
    console.log(`${colors.blue}Reading bronwebsites.json...${colors.reset}`);

    if (!fs.existsSync(bronwebsitesPath)) {
      throw new Error(`File not found: ${bronwebsitesPath}`);
    }

    const data = JSON.parse(fs.readFileSync(bronwebsitesPath, 'utf-8'));

    if (!Array.isArray(data)) {
      throw new Error('bronwebsites.json should contain an array of websites');
    }

    console.log(`${colors.blue}Found ${data.length} websites to import${colors.reset}`);

    // Clear existing data (optional - comment out if you want to keep existing data)
    const db = (await import('../config/database.js')).getDB();
    const collection = db.collection('bronwebsites');
    const existingCount = await collection.countDocuments({});

    if (existingCount > 0) {
      console.log(`${colors.yellow}Found ${existingCount} existing websites. Clearing collection...${colors.reset}`);
      await collection.deleteMany({});
    }

    // Import websites
    console.log(`${colors.blue}Importing websites...${colors.reset}`);
    const websites = await BronWebsite.createMany(data);

    console.log(`${colors.green}✓ Successfully imported ${websites.length} websites!${colors.reset}`);

    // Display summary
    console.log(`\n${colors.blue}Summary:${colors.reset}`);
    websites.forEach((website, index) => {
      console.log(`  ${index + 1}. ${website.titel}`);
    });

  } catch (error) {
    console.error(`${colors.red}Error seeding database:${colors.reset}`, error);
    process.exit(1);
  } finally {
    await closeDB();
  }
}

// Run the seed script
seedBronWebsites();
