import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

const api = axios.create({
    baseURL: API_URL,
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor to add auth token
api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('access_token');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

// Response interceptor to handle token refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        
        // Handle network errors or server crashes
        if (!error.response) {
            return Promise.reject({
                message: 'Network error or server is not responding',
                originalError: error
            });
        }

        if (error.response.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            try {
                const refreshToken = localStorage.getItem('refresh_token');
                if (!refreshToken) {
                    localStorage.removeItem('access_token');
                    window.location.href = '/login';
                    return Promise.reject(error);
                }
                const response = await axios.post(`${API_URL}/auth/refresh`, {
                    refresh_token: refreshToken,
                });
                const { access_token } = response.data;
                localStorage.setItem('access_token', access_token);
                originalRequest.headers.Authorization = `Bearer ${access_token}`;
                return api(originalRequest);
            } catch (err) {
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login';
                return Promise.reject(err);
            }
        }
        return Promise.reject(error);
    }
);

// Auth endpoints
export const auth = {
    login: async (username, password) => {
        const formData = new URLSearchParams();
        formData.append('username', username);
        formData.append('password', password);
        
        const response = await api.post('/auth/token', formData, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
        const { access_token, refresh_token } = response.data;
        localStorage.setItem('access_token', access_token);
        localStorage.setItem('refresh_token', refresh_token);
        return response.data;
    },
    logout: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    },
    getCurrentUser: async () => {
        const response = await api.get('/auth/me');
        return response.data;
    },
};

// Projects endpoints
export const projects = {
    // Admin endpoints
    getProjects: async () => {
        const response = await api.get('/admin/projects');
        return response.data;
    },
    createProject: async (projectData) => {
        const response = await api.post('/admin/projects', projectData);
        return response.data;
    },
    updateProject: async (projectId, updates) => {
        const response = await api.put(`/admin/projects/${projectId}`, updates);
        return response.data;
    },
    getProject: async (projectId) => {
        const response = await api.get(`/projects/${projectId}`);
        return response.data;
    },
    deleteProject: async (projectId) => {
        await api.delete(`/admin/projects/${projectId}`);
        return true;
    },
    importCsv: async (projectId, file, onProgress) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const config = {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                onUploadProgress: (progressEvent) => {
                    if (onProgress) {
                        const percentCompleted = Math.round(
                            (progressEvent.loaded * 100) / progressEvent.total
                        );
                        onProgress(percentCompleted);
                    }
                }
            };
            
            const response = await api.post(
                `/admin/projects/${projectId}/import-chat-room-csv`,
                formData,
                config
            );
            
            return response.data;
        } catch (error) {
            console.error('Import error:', error);
            
            // Handle network errors or server crashes
            if (!error.response) {
                throw new Error('Network error or server is not responding. Please check your connection and try again.');
            }
            
            // Handle specific error cases
            if (error.response.status === 413) {
                throw new Error('File is too large. Please try a smaller file.');
            }
            
            if (error.response.status === 415) {
                throw new Error('Invalid file format. Please upload a CSV file.');
            }
            
            if (error.response.status === 403) {
                throw new Error('You do not have permission to import files.');
            }
            
            if (error.response.status === 500) {
                const errorDetail = error.response.data?.detail || error.response.data?.message;
                throw new Error(`Server error: ${errorDetail || 'An unexpected error occurred'}`);
            }
            
            // For other errors, include the server's error message if available
            throw new Error(
                error.response.data?.message || 
                error.response.data?.detail || 
                'Failed to import file. Please check the file format and try again.'
            );
        }
    },

    // Regular project endpoints
    listProjects: async () => {
        const response = await api.get('/projects/');
        return response.data;
    },
    getProjectUsers: async (projectId) => {
        const response = await api.get(`/projects/${projectId}/users`);
        return response.data;
    },
    assignUser: async (projectId, userId) => {
        await api.post(`/projects/${projectId}/assign/${userId}`);
        return true;
    },
    removeUser: async (projectId, userId) => {
        await api.delete(`/projects/${projectId}/assign/${userId}`);
        return true;
    },
    getChatRooms: async (projectId) => {
        const response = await api.get(`/projects/${projectId}/chat-rooms`);
        return response.data;
    },
    previewImportCsv: async (projectId, file, limit = 20) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await api.post(
                `/admin/projects/${projectId}/import-chat-room-csv/preview`,
                formData,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    params: { limit }
                }
            );
            return response.data;
        } catch (error) {
            console.error('CSV preview error:', error);

            if (!error.response) {
                throw new Error('Network error or server is not responding. Please check your connection and try again.');
            }

            if (error.response.status === 413) {
                throw new Error('File is too large. Please try a smaller file.');
            }

            if (error.response.status === 403) {
                throw new Error('You do not have permission to preview this file.');
            }

            throw new Error(
                error.response.data?.message ||
                error.response.data?.detail ||
                'Failed to preview file. Please check the file format and try again.'
            );
        }
    },
    deleteChatRoom: async (chatRoomId) => {
        await api.delete(`/admin/chat-rooms/${chatRoomId}`);
        return true;
    },
    updateChatRoom: async (chatRoomId, updates) => {
        const response = await api.put(`/admin/chat-rooms/${chatRoomId}`, updates);
        return response.data;
    },
    getChatRoom: async (projectId, roomId) => {
        const response = await api.get(`/projects/${projectId}/chat-rooms/${roomId}`);
        return response.data;
    },
    getChatMessages: async (projectId, roomId) => {
        const pageSize = 200;
        let skip = 0;
        let allMessages = [];
        let total = 0;

        while (true) {
            const response = await api.get(`/projects/${projectId}/chat-rooms/${roomId}/messages`, {
                params: { skip, limit: pageSize }
            });
            const data = response.data;
            const page = data.messages || [];
            allMessages = allMessages.concat(page);
            total = typeof data.total === 'number' ? data.total : allMessages.length;
            skip += page.length;
            if (page.length === 0 || allMessages.length >= total) {
                break;
            }
        }

        return { messages: allMessages, total };
    },
    getChatRoomCompletion: async (projectId, roomId) => {
        const response = await api.get(`/projects/${projectId}/chat-rooms/${roomId}/completion`);
        return response.data;
    },
    updateChatRoomCompletion: async (projectId, roomId, isCompleted) => {
        const response = await api.put(`/projects/${projectId}/chat-rooms/${roomId}/completion`, {
            is_completed: isCompleted
        });
        return response.data;
    },
};

// Users endpoints
export const users = {
    getUsers: async () => {
        const response = await api.get('/admin/users');
        return response.data;
    },
    createUser: async (userData) => {
        const response = await api.post('/admin/users', userData);
        return response.data;
    },
    deleteUser: async (userId) => {
        await api.delete(`/admin/users/${userId}`);
        return true;
    },
    updateUser: async (userId, updates) => {
        const response = await api.put(`/admin/users/${userId}`, updates);
        return response.data;
    },
};

// Annotations endpoints
export const annotations = {
    getMessageAnnotations: async (projectId, messageId) => {
        const response = await api.get(`/projects/${projectId}/messages/${messageId}/annotations/`);
        return response.data;
    },
    getChatRoomAnnotations: async (projectId, chatRoomId) => {
        const response = await api.get(`/projects/${projectId}/chat-rooms/${chatRoomId}/annotations/`);
        return response.data;
    },
    createAnnotation: async (projectId, messageId, annotationData) => {
        const response = await api.post(`/projects/${projectId}/messages/${messageId}/annotations/`, annotationData);
        return response.data;
    },
    deleteAnnotation: async (projectId, messageId, annotationId) => {
        await api.delete(`/projects/${projectId}/messages/${messageId}/annotations/${annotationId}`);
        return true;
    },
    getMyAnnotations: async (projectId) => {
        const response = await api.get(`/projects/${projectId}/annotations/my`);
        return response.data;
    },
    // PHASE 2: ANNOTATION IMPORT
    importAnnotations: async (chatRoomId, userId, file, onProgress) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('user_id', userId);
            
            const config = {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                onUploadProgress: (progressEvent) => {
                    if (onProgress) {
                        const percentCompleted = Math.round(
                            (progressEvent.loaded * 100) / progressEvent.total
                        );
                        onProgress(percentCompleted);
                    }
                }
            };
            
            const response = await api.post(
                `/admin/chat-rooms/${chatRoomId}/import-annotations`,
                formData,
                config
            );
            
            return response.data;
        } catch (error) {
            console.error('Annotation import error:', error);
            
            if (!error.response) {
                throw new Error('Network error or server is not responding. Please check your connection and try again.');
            }
            
            if (error.response.status === 413) {
                throw new Error('File is too large. Please try a smaller file.');
            }
            
            if (error.response.status === 415) {
                throw new Error('Invalid file format. Please upload a CSV file.');
            }
            
            if (error.response.status === 403) {
                throw new Error('You do not have permission to import annotations.');
            }
            
            if (error.response.status === 500) {
                const errorDetail = error.response.data?.detail || error.response.data?.message;
                throw new Error(`Server error: ${errorDetail || 'An unexpected error occurred'}`);
            }
            
            throw new Error(
                error.response.data?.message || 
                error.response.data?.detail || 
                'Failed to import annotations. Please check the file format and try again.'
            );
        }
    },
    // PHASE 3: AGGREGATED ANNOTATIONS FOR ANALYSIS
    getAggregatedAnnotations: async (chatRoomId) => {
        const response = await api.get(`/admin/chat-rooms/${chatRoomId}/aggregated-annotations`);
        return response.data;
    },
    // PHASE 5: INTER-ANNOTATOR AGREEMENT (IAA)
    getChatRoomIAA: async (chatRoomId) => {
        const response = await api.get(`/admin/chat-rooms/${chatRoomId}/iaa`);
        return response.data;
    },
    previewImportAnnotations: async (chatRoomId, file, limit = 20) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await api.post(
                `/admin/chat-rooms/${chatRoomId}/import-annotations/preview`,
                formData,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    params: { limit }
                }
            );
            return response.data;
        } catch (error) {
            console.error('Annotations preview error:', error);

            if (!error.response) {
                throw new Error('Network error or server is not responding. Please check your connection and try again.');
            }

            if (error.response.status === 413) {
                throw new Error('File is too large. Please try a smaller file.');
            }

            if (error.response.status === 403) {
                throw new Error('You do not have permission to preview annotations.');
            }

            throw new Error(
                error.response.data?.message ||
                error.response.data?.detail ||
                'Failed to preview annotations. Please check the file format and try again.'
            );
        }
    },
    importBatchAnnotations: async (chatRoomId, file, onProgress) => {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const config = {
                headers: {
                    'Content-Type': 'multipart/form-data',
                },
                onUploadProgress: (progressEvent) => {
                    if (onProgress) {
                        const percentCompleted = Math.round(
                            (progressEvent.loaded * 100) / progressEvent.total
                        );
                        onProgress(percentCompleted);
                    }
                }
            };

            const response = await api.post(
                `/admin/chat-rooms/${chatRoomId}/import-batch-annotations`,
                formData,
                config
            );
            return response.data;
        } catch (error) {
            console.error('Batch import error:', error);

            if (!error.response) {
                throw new Error('Network error or server is not responding. Please check your connection and try again.');
            }

            if (error.response.status === 413) {
                throw new Error('File is too large. Please try a smaller file.');
            }

            if (error.response.status === 403) {
                throw new Error('You do not have permission to import batch annotations.');
            }

            throw new Error(
                error.response.data?.message ||
                error.response.data?.detail ||
                'Failed to import batch annotations. Please check the file format and try again.'
            );
        }
    },
    previewBatchAnnotations: async (chatRoomId, file, limit = 10) => {
        try {
            const formData = new FormData();
            formData.append('file', file);
            const response = await api.post(
                `/admin/chat-rooms/${chatRoomId}/import-batch-annotations/preview`,
                formData,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    params: { limit }
                }
            );
            return response.data;
        } catch (error) {
            console.error('Batch preview error:', error);

            if (!error.response) {
                throw new Error('Network error or server is not responding. Please check your connection and try again.');
            }

            if (error.response.status === 413) {
                throw new Error('File is too large. Please try a smaller file.');
            }

            if (error.response.status === 403) {
                throw new Error('You do not have permission to preview batch annotations.');
            }

            throw new Error(
                error.response.data?.message ||
                error.response.data?.detail ||
                'Failed to preview batch annotations. Please check the file format and try again.'
            );
        }
    },
    getChatRoomCompletionSummary: async (chatRoomId) => {
        const response = await api.get(`/admin/chat-rooms/${chatRoomId}/completion-summary`);
        return response.data;
    },
    getAdjacencyPairsStatus: async (chatRoomId) => {
        const response = await api.get(`/admin/chat-rooms/${chatRoomId}/adjacency-status`);
        return response.data;
    },
    // EXPORT FUNCTIONALITY
    exportChatRoom: async (chatRoomId) => {
        try {
            const response = await api.get(`/admin/chat-rooms/${chatRoomId}/export`, {
                responseType: 'blob', // Important for file download
            });
            
            // Create a blob URL and trigger download
            const blob = new Blob([response.data], { type: 'application/json' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            
            // Extract filename from Content-Disposition header if available
            const contentDisposition = response.headers['content-disposition'];
            let filename = `chat_room_${chatRoomId}_export.json`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }
            
            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
            
            return true;
        } catch (error) {
            console.error('Export error:', error);
            
            if (!error.response) {
                throw new Error('Network error or server is not responding. Please check your connection and try again.');
            }
            
            if (error.response.status === 403) {
                throw new Error('You do not have permission to export this chat room.');
            }
            
            if (error.response.status === 404) {
                throw new Error('Chat room not found.');
            }
            
            if (error.response.status === 500) {
                const errorDetail = error.response.data?.detail || error.response.data?.message;
                throw new Error(`Server error: ${errorDetail || 'An unexpected error occurred'}`);
            }
            
            throw new Error(
                error.response.data?.message || 
                error.response.data?.detail || 
                'Failed to export chat room data. Please try again.'
            );
        }
    },
};

// Adjacency Pairs endpoints
export const adjacencyPairs = {
    getChatRoomPairs: async (projectId, chatRoomId) => {
        const response = await api.get(`/projects/${projectId}/chat-rooms/${chatRoomId}/adjacency-pairs/`);
        return response.data;
    },
    createAdjacencyPair: async (projectId, chatRoomId, pairData) => {
        const response = await api.post(`/projects/${projectId}/chat-rooms/${chatRoomId}/adjacency-pairs/`, pairData);
        return response.data;
    },
    deleteAdjacencyPair: async (projectId, chatRoomId, pairId) => {
        await api.delete(`/projects/${projectId}/chat-rooms/${chatRoomId}/adjacency-pairs/${pairId}`);
        return true;
    },
    importAdjacencyPairs: async (projectId, chatRoomId, file, mode = 'merge') => {
        const formData = new FormData();
        formData.append('file', file);
        const response = await api.post(
            `/projects/${projectId}/chat-rooms/${chatRoomId}/adjacency-pairs/import`,
            formData,
            {
                headers: { 'Content-Type': 'multipart/form-data' },
                params: { mode }
            }
        );
        return response.data;
    },
    exportChatRoomPairs: async (chatRoomId, annotatorId = null, filenameOverride = null) => {
        try {
            const response = await api.get(`/admin/chat-rooms/${chatRoomId}/export-adjacency-pairs`, {
                params: annotatorId ? { annotator_id: annotatorId } : {},
                responseType: 'blob',
            });

            const blob = new Blob([response.data], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;

            const contentDisposition = response.headers['content-disposition'];
            let filename = filenameOverride || `chat_room_${chatRoomId}_adjacency_pairs.txt`;
            if (contentDisposition) {
                const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
                if (filenameMatch) {
                    filename = filenameMatch[1];
                }
            }

            link.setAttribute('download', filename);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            return true;
        } catch (error) {
            console.error('Adjacency pairs export error:', error);

            if (!error.response) {
                throw new Error('Network error or server is not responding. Please check your connection and try again.');
            }

            if (error.response.status === 403) {
                throw new Error('You do not have permission to export this chat room.');
            }

            if (error.response.status === 404) {
                throw new Error('Chat room or annotator not found.');
            }

            throw new Error(
                error.response.data?.message ||
                error.response.data?.detail ||
                'Failed to export adjacency pairs. Please try again.'
            );
        }
    },
};

export default api; 
