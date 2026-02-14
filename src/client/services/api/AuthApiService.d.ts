import { BaseApiService } from './BaseApiService';
export interface User {
    _id: string;
    name: string;
    email: string;
    role: string;
}
/**
 * Authentication API service
 */
export declare class AuthApiService extends BaseApiService {
    login(email: string, password: string): Promise<{
        message: string;
        user: User;
        token: string;
    }>;
    register(name: string, email: string, password: string, role: string): Promise<{
        message: string;
        user: User;
    }>;
    getMe(): Promise<{
        user: User;
    }>;
    logout(): Promise<{
        message: string;
    }>;
}
