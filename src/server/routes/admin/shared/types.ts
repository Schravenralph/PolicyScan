/**
 * Shared Type Definitions for Admin Routes
 * 
 * Common interfaces and types used across admin route handlers.
 */

import { ObjectId } from 'mongodb';

/**
 * User document interface
 */
export interface UserDocument {
    _id: ObjectId;
    name: string;
    email: string;
    role: string;
    createdAt: Date;
    lastLogin?: Date;
    active?: boolean;
}

/**
 * Run document interface
 */
export interface RunDocument {
    _id: ObjectId;
    logs?: Array<{ timestamp?: Date; message?: string; level?: string; metadata?: Record<string, unknown> } | string>;
    status?: string;
    createdAt?: Date;
    workflowId?: string;
    startTime?: Date;
    endTime?: Date;
    error?: unknown;
}



