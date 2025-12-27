// Workspaces Module
// Manages workspace isolation and data scoping

export interface Workspace {
    id: string;
    name: string;
    ownerId: string;
    createdAt: Date;
}

export interface WorkspaceService {
    getWorkspace(id: string): Promise<Workspace | null>;
    createWorkspace(name: string, ownerId: string): Promise<Workspace>;
}
