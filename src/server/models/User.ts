import { ObjectId } from 'mongodb';

export interface IUser {
    _id?: ObjectId;
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
    createdAt: Date;
    emailVerified: boolean;
    lastLogin?: Date;
    // Security: account lockout tracking (optional; only present after failed logins)
    failedLoginAttempts?: number;
    lockoutUntil?: Date;
    lastFailedLogin?: Date;
}

export type UserRole = 'developer' | 'advisor' | 'admin' | 'manager' | 'client';

export interface CreateUserDTO {
    name: string;
    email: string;
    password: string;
    role: UserRole;
}

export interface UpdateUserDTO {
    name?: string;
    email?: string;
}

export interface UserResponse {
    id: string; // Use 'id' for REST API consistency (maps from _id)
    _id?: string; // Keep _id for backward compatibility
    name: string;
    email: string;
    role: UserRole;
    createdAt: Date;
    emailVerified: boolean;
    lastLogin?: Date;
}

// Helper to sanitize user object (remove password)
export function sanitizeUser(user: IUser): UserResponse {
    const userId = user._id!.toString();
    return {
        id: userId, // Primary field for REST API
        _id: userId, // Keep for backward compatibility
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
        emailVerified: user.emailVerified,
        lastLogin: user.lastLogin,
    };
}
