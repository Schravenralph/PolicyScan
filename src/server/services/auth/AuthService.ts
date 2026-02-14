import * as bcrypt from 'bcryptjs';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Collection, Db, ObjectId, type UpdateFilter } from 'mongodb';
import { IUser, CreateUserDTO, UserRole, sanitizeUser, UserResponse } from '../../models/User.js';
import { getFieldEncryptionService } from '../security/FieldEncryptionService.js';
import { SECURITY } from '../../config/constants.js';
import { logger } from '../../utils/logger.js';
import { getEnv } from '../../config/env.js';

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS || '12');
const ENCRYPT_EMAILS = process.env.ENCRYPT_EMAILS === 'true'; // Feature flag for email encryption

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
    scope?: 'auth' | 'reset_password';
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
    generateToken(userId: string, role: UserRole, expiresIn: string | number = getEnv().JWT_EXPIRES_IN, scope: 'auth' | 'reset_password' = 'auth'): string {
        const payload: TokenPayload = { userId, role, scope };
        // expiresIn can be string or number in SignOptions
        // Type assertion needed due to jsonwebtoken type definitions
        const options = { expiresIn } as SignOptions;
        return jwt.sign(payload, getEnv().JWT_SECRET, options);
    }

    /**
     * Verify and decode a JWT token
     */
    verifyToken(token: string): TokenPayload {
        try {
            // Security: Enforce allowed algorithms to prevent algorithm confusion attacks
            return jwt.verify(token, getEnv().JWT_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
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
        // Security: Limit email length and use bounded pattern to prevent ReDoS
        if (email.length > 254) { // RFC 5321 limit
            throw new ValidationError('Email address is too long');
        }
        // Use more specific pattern with length limits to prevent ReDoS
        const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
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

        // Encrypt email if encryption is enabled (deterministic for querying)
        let emailToStore = email;
        if (ENCRYPT_EMAILS) {
            const encryptionService = getFieldEncryptionService();
            emailToStore = await encryptionService.encryptDeterministic(email);
        }

        // Check if user already exists (use encrypted email if encryption enabled)
        const existingUser = await this.usersCollection.findOne({ email: emailToStore });
        if (existingUser) {
            const { ConflictError } = await import('../../types/errors.js');
            throw new ConflictError('User with this email already exists', {
                email,
                suggestion: 'If you already have an account, try logging in instead',
            });
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
            email: emailToStore, // Store encrypted email if encryption enabled
            passwordHash,
            role,
            createdAt: new Date(),
            emailVerified: false, // Email verification can be added later
        };

        try {
            const result = await this.usersCollection.insertOne(newUser);
            newUser._id = result.insertedId;
            return sanitizeUser(newUser);
        } catch (error: unknown) {
            // Handle MongoDB duplicate key error (E11000) as a fallback
            // This can happen if there's a race condition where two registrations happen simultaneously
            if (error && typeof error === 'object' && 'code' in error && error.code === 11000) {
                const { ConflictError } = await import('../../types/errors.js');
                throw new ConflictError('User with this email already exists', {
                    email,
                    suggestion: 'If you already have an account, try logging in instead',
                });
            }
            // Re-throw other errors
            throw error;
        }
    }

    /**
     * Login a user with email and password
     */
    async login(email: string, password: string): Promise<{ user: UserResponse; token: string }> {
        // Encrypt email if encryption is enabled (for querying)
        let emailToQuery = email;
        if (ENCRYPT_EMAILS) {
            try {
                const encryptionService = getFieldEncryptionService();
                emailToQuery = await encryptionService.encryptDeterministic(email);
            } catch (error) {
                logger.error({ error }, 'Failed to encrypt email during login');
                throw new AuthenticationError('Invalid email or password');
            }
        }

        // Find user by email (encrypted if encryption enabled)
        let user;
        try {
            user = await this.usersCollection.findOne({ email: emailToQuery });
        } catch (error) {
            logger.error({ error }, 'Database error during login');
            throw new AuthenticationError('Invalid email or password');
        }
        if (!user) {
            throw new AuthenticationError('Invalid email or password');
        }

        // Account lockout: prevent login while lockout is active.
        // Security: keep error message generic to avoid leaking account existence/state.
        if (user.lockoutUntil && user.lockoutUntil.getTime() > Date.now()) {
            throw new AuthenticationError('Invalid email or password');
        }

        // Decrypt email if encryption is enabled (for response)
        if (ENCRYPT_EMAILS && user.email) {
            const encryptionService = getFieldEncryptionService();
            try {
                user.email = await encryptionService.decryptDeterministic(user.email);
            } catch (error) {
                // If decryption fails, email might not be encrypted (migration scenario)
                // Keep original email
                logger.warn({ error }, 'Failed to decrypt email during login, assuming unencrypted');
            }
        }

        // Verify password
        let isPasswordValid: boolean;
        try {
            isPasswordValid = await this.comparePassword(password, user.passwordHash);
        } catch (error) {
            logger.error({ error }, 'Password comparison error during login');
            throw new AuthenticationError('Invalid email or password');
        }
        
        if (!isPasswordValid) {
            const failedAttempts = (user.failedLoginAttempts ?? 0) + 1;
            const now = new Date();

            const update: UpdateFilter<IUser> = {
                $set: { lastFailedLogin: now },
                $inc: { failedLoginAttempts: 1 },
            };

            if (failedAttempts >= SECURITY.MAX_LOGIN_ATTEMPTS) {
                update.$set = {
                    ...(update.$set ?? {}),
                    lockoutUntil: new Date(now.getTime() + SECURITY.LOCKOUT_DURATION),
                };
            }

            try {
                await this.usersCollection.updateOne({ _id: user._id }, update);
            } catch (error) {
                logger.error({ error }, 'Failed to update failed login attempts');
                // Don't fail login if update fails - just log it
            }
            throw new AuthenticationError('Invalid email or password');
        }

        // Update last login time
        try {
            await this.usersCollection.updateOne(
                { _id: user._id },
                {
                    $set: { lastLogin: new Date(), failedLoginAttempts: 0 },
                    $unset: { lockoutUntil: '', lastFailedLogin: '' },
                }
            );
        } catch (error) {
            logger.error({ error }, 'Failed to update last login time');
            // Don't fail login if update fails - just log it
        }

        // Generate token
        let token: string;
        try {
            token = this.generateToken(user._id!.toString(), user.role);
        } catch (error) {
            logger.error({ error, userId: user._id?.toString() }, 'Failed to generate token during login');
            throw new AuthenticationError('Invalid email or password');
        }

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
     * Get multiple users by IDs
     */
    async getUsersByIds(userIds: string[]): Promise<UserResponse[]> {
        const objectIds = userIds
            .filter(id => ObjectId.isValid(id))
            .map(id => new ObjectId(id));

        if (objectIds.length === 0) {
            return [];
        }

        const users = await this.usersCollection.find({
            _id: { $in: objectIds }
        }).toArray();

        return users.map(sanitizeUser);
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

        // If updating email, encrypt it and check it's not already taken
        if (updateData.email) {
            let emailToStore = updateData.email;
            if (ENCRYPT_EMAILS) {
                const encryptionService = getFieldEncryptionService();
                emailToStore = await encryptionService.encryptDeterministic(updateData.email);
            }

            const existing = await this.usersCollection.findOne({
                email: emailToStore,
                _id: { $ne: new ObjectId(userId) }
            });
            if (existing) {
                throw new ValidationError('Email already in use');
            }

            // Update with encrypted email
            updateData.email = emailToStore;
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

        // Decrypt email if encryption is enabled (for response)
        if (ENCRYPT_EMAILS && result.email) {
            const encryptionService = getFieldEncryptionService();
            try {
                result.email = await encryptionService.decryptDeterministic(result.email);
            } catch (error) {
                // If decryption fails, email might not be encrypted (migration scenario)
                logger.warn({ error }, 'Failed to decrypt email, assuming unencrypted');
            }
        }

        return sanitizeUser(result);
    }

    /**
     * Generate a password reset token (simplified for MVP)
     */
    generateResetToken(userId: string): string {
        // Token expires in 1 hour
        // Security: Scope token to reset_password only
        return this.generateToken(userId, 'advisor', '1h', 'reset_password');
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

        // Security: Ensure token is intended for password reset
        if (payload.scope !== 'reset_password') {
            throw new AuthenticationError('Invalid token purpose');
        }

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

        // Security: Revoke all user tokens after password reset to invalidate existing sessions.
        // Revocation is best-effort: the password is already changed, so we must not
        // throw an error that would mislead the client into thinking the reset failed.
        const revoked = await this.revokeAllUserTokens(payload.userId);
        if (!revoked) {
            logger.error({ userId: payload.userId }, 'Failed to revoke user tokens after password reset. Old sessions may remain active.');
        }
    }

    /**
     * Revoke a JWT token
     * 
     * Adds the token to the blacklist to prevent further use.
     * 
     * @param token - JWT token to revoke
     * @returns true if token was successfully revoked
     */
    async revokeToken(token: string): Promise<boolean> {
        try {
            // Decode token to get expiration time
            const decoded = jwt.decode(token) as { exp?: number } | null;
            let expiresInSeconds: number | undefined;
            
            if (decoded?.exp) {
                const expirationTime = decoded.exp;
                const currentTime = Math.floor(Date.now() / 1000);
                expiresInSeconds = Math.max(0, expirationTime - currentTime);
            }

            const { getTokenBlacklistService } = await import('../security/TokenBlacklistService.js');
            const blacklistService = getTokenBlacklistService();
            return await blacklistService.revokeToken(token, expiresInSeconds);
        } catch (error) {
            // Log error but don't throw - revocation failure shouldn't break the flow
            console.error('[AuthService] Failed to revoke token:', error);
            return false;
        }
    }

    /**
     * Revoke all tokens for a user
     * 
     * Useful for security incidents or forced logout.
     * 
     * @param userId - User ID whose tokens should be revoked
     * @returns true if user tokens were successfully revoked
     */
    async revokeAllUserTokens(userId: string): Promise<boolean> {
        try {
            const { getTokenBlacklistService } = await import('../security/TokenBlacklistService.js');
            const blacklistService = getTokenBlacklistService();
            return await blacklistService.revokeAllUserTokens(userId);
        } catch (error) {
            // Log error but don't throw - revocation failure shouldn't break the flow
            console.error('[AuthService] Failed to revoke user tokens:', error);
            return false;
        }
    }
}
