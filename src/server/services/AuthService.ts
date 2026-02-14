import * as bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Collection, Db, ObjectId, type UpdateFilter } from 'mongodb';
import { IUser, CreateUserDTO, UserRole, sanitizeUser, UserResponse } from '../models/User.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');

export class AuthenticationError extends Error {
    constructor(message: string = 'Authentication failed') {
        super(message);
        this.name = 'AuthenticationError';
    }
}

export class AuthorizationError extends Error {
    constructor(message: string = 'Insufficient permissions') {
        super(message);
        this.name = 'AuthorizationError';
    }
}

export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export interface TokenPayload {
    userId: string;
    role: UserRole;
}

export class AuthService {
    private usersCollection: Collection<IUser>;

    constructor(db: Db) {
        this.usersCollection = db.collection<IUser>('users');
        this.ensureIndexes();
    }

    private async ensureIndexes() {
        // Ensure email is unique
        await this.usersCollection.createIndex({ email: 1 }, { unique: true });
    }

    /**
     * Hash a plain text password
     */
    async hashPassword(password: string): Promise<string> {
        return bcrypt.hash(password, BCRYPT_ROUNDS);
    }

    /**
     * Compare a plain text password with a hash
     */
    async comparePassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
        return bcrypt.compare(plainPassword, hashedPassword);
    }

    /**
     * Generate a JWT token for a user
     */
    generateToken(userId: string, role: UserRole, expiresIn: string = JWT_EXPIRES_IN): string {
        const payload: TokenPayload = { userId, role };
        // expiresIn can be string or number in SignOptions
        // Type assertion needed due to jsonwebtoken type definitions
        const options = { expiresIn } as SignOptions;
        return jwt.sign(payload, JWT_SECRET, options);
    }

    /**
     * Verify and decode a JWT token
     */
    verifyToken(token: string): TokenPayload {
        try {
            return jwt.verify(token, JWT_SECRET) as TokenPayload;
        } catch (_error) {
            throw new AuthenticationError('Invalid or expired token');
        }
    }

    /**
     * Register a new user
     */
    async register(userData: CreateUserDTO): Promise<UserResponse> {
        const { name, email, password, role } = userData;

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new ValidationError('Invalid email format');
        }

        // Validate password strength (consistent with validation schema)
        if (password.length < 8) {
            throw new ValidationError('Password must be at least 8 characters long');
        }
        if (!/[0-9]/.test(password)) {
            throw new ValidationError('Password must contain at least one number');
        }
        if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
            throw new ValidationError('Password must contain at least one special character');
        }
        if (!/[a-z]/.test(password)) {
            throw new ValidationError('Password must contain at least one lowercase letter');
        }
        if (!/[A-Z]/.test(password)) {
            throw new ValidationError('Password must contain at least one uppercase letter');
        }

        // Check if user already exists
        const existingUser = await this.usersCollection.findOne({ email });
        if (existingUser) {
            throw new ValidationError('User with this email already exists');
        }

        // Hash password
        const passwordHash = await this.hashPassword(password);

        // Validate role
        const validRoles: UserRole[] = ['developer', 'advisor', 'admin', 'manager', 'client'];
        if (!validRoles.includes(role)) {
            throw new ValidationError(`Invalid role. Must be one of: ${validRoles.join(', ')}`);
        }

        // Create user
        const newUser: IUser = {
            name,
            email,
            passwordHash,
            role,
            createdAt: new Date(),
            emailVerified: false, // Email verification can be added later
        };

        const result = await this.usersCollection.insertOne(newUser);
        newUser._id = result.insertedId;

        return sanitizeUser(newUser);
    }

    /**
     * Login a user with email and password
     */
    async login(email: string, password: string): Promise<{ user: UserResponse; token: string }> {
        // Find user by email
        const user = await this.usersCollection.findOne({ email });
        if (!user) {
            throw new AuthenticationError('Invalid email or password');
        }

        // Verify password
        const isPasswordValid = await this.comparePassword(password, user.passwordHash);
        if (!isPasswordValid) {
            throw new AuthenticationError('Invalid email or password');
        }

        // Update last login time
        await this.usersCollection.updateOne(
            { _id: user._id },
            { $set: { lastLogin: new Date() } }
        );

        // Generate token
        const token = this.generateToken(user._id!.toString(), user.role);

        return {
            user: sanitizeUser(user),
            token,
        };
    }

    /**
     * Get user by ID
     */
    async getUserById(userId: string): Promise<UserResponse | null> {
        const user = await this.usersCollection.findOne({ _id: new ObjectId(userId) });
        return user ? sanitizeUser(user) : null;
    }

    /**
     * Get user by email (for password reset)
     * Returns null if user doesn't exist (for security, don't reveal if email exists)
     */
    async getUserByEmail(email: string): Promise<{ _id: string; email: string; name?: string } | null> {
        const user = await this.usersCollection.findOne({ email });
        if (!user || !user._id) {
            return null;
        }
        return {
            _id: user._id.toString(),
            email: user.email,
            name: user.name,
        };
    }

    /**
     * Update user profile
     */
    async updateProfile(userId: string, updates: { name?: string; email?: string }): Promise<UserResponse> {
        const allowedUpdates = ['name', 'email'];
        const updateData: Partial<{ name: string; email: string }> = {};

        // Only allow specific fields
        for (const key of Object.keys(updates)) {
            if (allowedUpdates.includes(key)) {
                updateData[key as keyof typeof updateData] = updates[key as keyof typeof updates] as string;
            }
        }

        if (Object.keys(updateData).length === 0) {
            throw new ValidationError('No valid fields to update');
        }

        // If updating email, check it's not already taken
        if (updateData.email) {
            const existing = await this.usersCollection.findOne({
                email: updateData.email,
                _id: { $ne: new ObjectId(userId) }
            });
            if (existing) {
                throw new ValidationError('Email already in use');
            }
        }

        const update: UpdateFilter<IUser> = {
            $set: updateData
        };
        const result = await this.usersCollection.findOneAndUpdate(
            { _id: new ObjectId(userId) },
            update,
            { returnDocument: 'after' }
        );

        if (!result) {
            throw new ValidationError('User not found');
        }

        return sanitizeUser(result);
    }

    /**
     * Generate a password reset token (simplified for MVP)
     */
    generateResetToken(userId: string): string {
        // Token expires in 1 hour
        return this.generateToken(userId, 'advisor', '1h');
    }

    /**
     * Request password reset - finds user by email and generates reset token
     * Returns the token (caller should send email)
     */
    async requestPasswordReset(email: string): Promise<{ token: string; userId: string } | null> {
        // Find user by email
        const user = await this.usersCollection.findOne({ email });
        
        // Don't reveal if user exists for security (prevent email enumeration)
        if (!user) {
            return null;
        }

        // Generate reset token
        const token = this.generateResetToken(user._id!.toString());

        return {
            token,
            userId: user._id!.toString(),
        };
    }

    /**
     * Reset password with token
     */
    async resetPassword(token: string, newPassword: string): Promise<void> {
        // Verify token
        const payload = this.verifyToken(token);

        // Validate new password (consistent with validation schema)
        if (newPassword.length < 8) {
            throw new ValidationError('Password must be at least 8 characters long');
        }

        // Hash new password
        const passwordHash = await this.hashPassword(newPassword);

        // Update user
        const result = await this.usersCollection.updateOne(
            { _id: new ObjectId(payload.userId) },
            { $set: { passwordHash } }
        );

        if (result.matchedCount === 0) {
            throw new ValidationError('User not found');
        }
    }
}
