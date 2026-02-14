import { connectDB, closeDB, getDB } from '../config/database.js';
import bcrypt from 'bcryptjs';

const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
};

async function seedAdmin() {
    try {
        const email = process.env.ADMIN_EMAIL;
        const password = process.env.ADMIN_PASSWORD;
        const name = 'Super Admin';

        if (!email || !password) {
            console.error(`${colors.red}Error: ADMIN_EMAIL and ADMIN_PASSWORD must be set in environment variables.${colors.reset}`);
            console.error(`Please update your .env file with the admin credentials.`);
            process.exit(1);
        }

        console.log(`${colors.blue}Connecting to MongoDB...${colors.reset}`);
        await connectDB();
        const db = getDB();
        const usersCollection = db.collection('users');

        console.log(`${colors.blue}Creating admin user...${colors.reset}`);

        // Hash password
        const salt = await bcrypt.genSalt(12);
        const passwordHash = await bcrypt.hash(password, salt);

        // Check if user exists
        const existingUser = await usersCollection.findOne({ email });

        if (existingUser) {
            console.log(`${colors.yellow}Admin user already exists. Updating password...${colors.reset}`);
            await usersCollection.updateOne(
                { email },
                {
                    $set: {
                        passwordHash,
                        role: 'admin',
                        emailVerified: true,
                        updatedAt: new Date()
                    }
                }
            );
        } else {
            console.log(`${colors.green}Creating new admin user...${colors.reset}`);
            await usersCollection.insertOne({
                name,
                email,
                passwordHash,
                role: 'admin',
                createdAt: new Date(),
                emailVerified: true,
                lastLogin: null
            });
        }

        console.log(`\n${colors.green}✓ Admin user seeded successfully!${colors.reset}`);
        console.log(`${colors.blue}Credentials:${colors.reset}`);
        console.log(`  Email:    ${colors.yellow}${email}${colors.reset}`);
        console.log(`  Password: ${colors.yellow}******${colors.reset}`); // Mask password in logs

    } catch (error) {
        console.error(`${colors.red}Error seeding admin user:${colors.reset}`, error);
        process.exit(1);
    } finally {
        await closeDB();
    }
}

seedAdmin();
