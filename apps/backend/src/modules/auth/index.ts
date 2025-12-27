// Auth Module
// Handles authentication and authorization

export interface User {
    id: string;
    email: string;
    workspaceId: string;
}

export interface AuthService {
    authenticate(token: string): Promise<User | null>;
    validateWorkspaceAccess(userId: string, workspaceId: string): Promise<boolean>;
}
