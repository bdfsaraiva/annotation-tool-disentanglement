/**
 * @fileoverview Axios HTTP client and all API endpoint wrappers for the LACE platform.
 *
 * The default export is a pre-configured `axios` instance with:
 * - Base URL read from the `API_URL` environment variable (falls back to
 *   `http://localhost:8000`).
 * - A **request interceptor** that injects the stored Bearer token into every
 *   outgoing request.
 * - A **response interceptor** that automatically attempts a token refresh on
 *   HTTP 401 responses (one retry per request via `_retry`).  If the refresh
 *   also fails, both tokens are cleared and the user is redirected to `/login`.
 *
 * Named exports group endpoint wrappers by domain:
 * - `auth`         — login, logout, current-user
 * - `projects`     — project and chat-room CRUD, CSV import, read-status
 * - `users`        — admin user management
 * - `annotations`  — disentanglement annotation CRUD, aggregated view, IAA
 * - `adjacencyPairs` — adjacency-pair CRUD, CSV import, export
 */
import axios from 'axios';

const API_URL = import.meta.env.API_URL || 'http://localhost:8000';

/**
 * Pre-configured axios instance shared by all endpoint wrappers.
 * Automatically injects the Bearer token and handles 401 token refresh.
 */
const api = axios.create({
    baseURL: API_URL,
    timeout: 15000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Inject the stored access token into every outgoing request header.
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

// Silently refresh the access token on 401 responses and retry the original
// request.  The `_retry` flag prevents infinite loops if the refresh also
// returns a 401.
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Surface network-level errors (no HTTP response at all) with a clear message.
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
                    // No refresh token available — force the user to log in again.
                    localStorage.removeItem('access_token');
                    window.location.href = '/login';
                    return Promise.reject(error);
                }
                // Use a bare `axios` call (not the intercepted `api` instance) to
                // avoid triggering the response interceptor again on this refresh call.
                const response = await axios.post(`${API_URL}/auth/refresh`, {
                    refresh_token: refreshToken,
                });
                const { access_token } = response.data;
                localStorage.setItem('access_token', access_token);
                originalRequest.headers.Authorization = `Bearer ${access_token}`;
                return api(originalRequest);
            } catch (err) {
                // Refresh also failed — clear credentials and redirect to login.
                localStorage.removeItem('access_token');
                localStorage.removeItem('refresh_token');
                window.location.href = '/login';
                return Promise.reject(err);
            }
        }
        return Promise.reject(error);
    }
);

/**
 * Authentication endpoint wrappers.
 * @namespace auth
 */
export const auth = {
    /**
     * Log in with username and password credentials.
     *
     * Sends an `application/x-www-form-urlencoded` body (required by the OAuth2
     * password grant endpoint) and persists both tokens in `localStorage`.
     *
     * @param {string} username
     * @param {string} password
     * @returns {Promise<Object>} The full token response (access_token, refresh_token, etc.).
     */
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

    /**
     * Clear both tokens from `localStorage` (client-side logout only).
     * No server-side token revocation is performed.
     */
    logout: () => {
        localStorage.removeItem('access_token');
        localStorage.removeItem('refresh_token');
    },

    /**
     * Fetch the profile of the currently authenticated user.
     * @returns {Promise<Object>} The user object (id, username, is_admin, etc.).
     */
    getCurrentUser: async () => {
        const response = await api.get('/auth/me');
        return response.data;
    },
};

/**
 * Project, chat-room, and message endpoint wrappers.
 * Includes both admin-only endpoints (prefixed `/admin/`) and
 * annotator-accessible endpoints (prefixed `/projects/`).
 * @namespace projects
 */
export const projects = {
    // ---- Admin-only project endpoints ----

    /**
     * List all projects (admin only).
     * @returns {Promise<Object[]>} Array of project objects.
     */
    getProjects: async () => {
        const response = await api.get('/admin/projects');
        return response.data;
    },

    /**
     * Create a new project (admin only).
     * @param {Object} projectData - Project fields (name, annotation_type, etc.).
     * @returns {Promise<Object>} The newly created project.
     */
    createProject: async (projectData) => {
        const response = await api.post('/admin/projects', projectData);
        return response.data;
    },

    /**
     * Update an existing project's metadata (admin only).
     * @param {number} projectId
     * @param {Object} updates - Partial project fields to update.
     * @returns {Promise<Object>} The updated project.
     */
    updateProject: async (projectId, updates) => {
        const response = await api.put(`/admin/projects/${projectId}`, updates);
        return response.data;
    },

    /**
     * Retrieve a single project by ID (accessible to assigned users).
     * @param {number} projectId
     * @returns {Promise<Object>} The project object.
     */
    getProject: async (projectId) => {
        const response = await api.get(`/projects/${projectId}`);
        return response.data;
    },

    /**
     * Delete a project and all its data (admin only).
     * @param {number} projectId
     * @returns {Promise<true>}
     */
    deleteProject: async (projectId) => {
        await api.delete(`/admin/projects/${projectId}`);
        return true;
    },
    /**
     * Upload a CSV file and create a new chat room + import its messages (admin only).
     *
     * Calls the single-step `POST /admin/projects/{id}/import-chat-room-csv` endpoint.
     * An optional `onProgress` callback receives a percentage (0–100) as the file uploads.
     *
     * @param {number} projectId
     * @param {File} file - The CSV file to upload.
     * @param {Function} [onProgress] - Called with upload percentage during the upload.
     * @returns {Promise<Object>} `ChatRoomImportResponse` with room details and import stats.
     * @throws {Error} With a human-readable message on network or server errors.
     */
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

    // ---- Annotator-accessible project endpoints ----

    /**
     * List all projects visible to the current user.
     * Admins receive all projects; annotators receive only assigned projects.
     * @returns {Promise<Object>} `ProjectList` with a `projects` array.
     */
    listProjects: async () => {
        const response = await api.get('/projects/');
        return response.data;
    },

    /**
     * Get all users assigned to a project.
     * @param {number} projectId
     * @returns {Promise<Object[]>} Array of user objects.
     */
    getProjectUsers: async (projectId) => {
        const response = await api.get(`/projects/${projectId}/users`);
        return response.data;
    },

    /**
     * Assign a user to a project (admin only).
     * @param {number} projectId
     * @param {number} userId
     * @returns {Promise<true>}
     */
    assignUser: async (projectId, userId) => {
        await api.post(`/projects/${projectId}/assign/${userId}`);
        return true;
    },

    /**
     * Remove a user's assignment from a project (admin only).
     * @param {number} projectId
     * @param {number} userId
     * @returns {Promise<true>}
     */
    removeUser: async (projectId, userId) => {
        await api.delete(`/projects/${projectId}/assign/${userId}`);
        return true;
    },

    /**
     * Get all chat rooms in a project.
     * @param {number} projectId
     * @returns {Promise<Object[]>} Array of chat room objects.
     */
    getChatRooms: async (projectId) => {
        const response = await api.get(`/projects/${projectId}/chat-rooms`);
        return response.data;
    },

    /**
     * Preview the first N rows of a CSV file before importing (admin only).
     * @param {number} projectId
     * @param {File} file
     * @param {number} [limit=20] - Maximum rows to include in the preview.
     * @returns {Promise<Object>} `CSVPreviewResponse` with rows and warnings.
     */
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
    /**
     * Delete a chat room and all its messages/annotations (admin only).
     * @param {number} chatRoomId
     * @returns {Promise<true>}
     */
    deleteChatRoom: async (chatRoomId) => {
        await api.delete(`/admin/chat-rooms/${chatRoomId}`);
        return true;
    },

    /**
     * Update a chat room's name or description (admin only).
     * @param {number} chatRoomId
     * @param {Object} updates - Partial fields (name, description).
     * @returns {Promise<Object>} The updated chat room.
     */
    updateChatRoom: async (chatRoomId, updates) => {
        const response = await api.put(`/admin/chat-rooms/${chatRoomId}`, updates);
        return response.data;
    },

    /**
     * Retrieve a single chat room within a project.
     * @param {number} projectId
     * @param {number} roomId
     * @returns {Promise<Object>} The chat room object.
     */
    getChatRoom: async (projectId, roomId) => {
        const response = await api.get(`/projects/${projectId}/chat-rooms/${roomId}`);
        return response.data;
    },

    /**
     * Fetch all messages for a chat room, automatically paginating through all pages.
     *
     * The backend paginates with `skip`/`limit`; this function collects all pages
     * into a single flat array, using a page size of 200 to minimise round-trips.
     *
     * @param {number} projectId
     * @param {number} roomId
     * @returns {Promise<{messages: Object[], total: number}>}
     */
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

    /**
     * Get the current annotator's completion flag for a chat room.
     * Returns a virtual `{is_completed: false}` record if not yet set.
     * @param {number} projectId
     * @param {number} roomId
     * @returns {Promise<Object>} `ChatRoomCompletion` object.
     */
    getChatRoomCompletion: async (projectId, roomId) => {
        const response = await api.get(`/projects/${projectId}/chat-rooms/${roomId}/completion`);
        return response.data;
    },

    /**
     * Set or clear the current annotator's completion flag for a chat room.
     * @param {number} projectId
     * @param {number} roomId
     * @param {boolean} isCompleted
     * @returns {Promise<Object>} The updated `ChatRoomCompletion` record.
     */
    updateChatRoomCompletion: async (projectId, roomId, isCompleted) => {
        const response = await api.put(`/projects/${projectId}/chat-rooms/${roomId}/completion`, {
            is_completed: isCompleted
        });
        return response.data;
    },

    /**
     * Fetch read/unread flags for all messages in a room for the current annotator.
     *
     * Converts the array response (`[{message_id, is_read}]`) into a plain object
     * map (`{message_id: is_read}`) for O(1) lookups.
     *
     * @param {number} projectId
     * @param {number} roomId
     * @returns {Promise<Object>} Map of `{[messageId]: boolean}`.
     */
    getReadStatus: async (projectId, roomId) => {
        const response = await api.get(`/projects/${projectId}/chat-rooms/${roomId}/read-status`);
        const map = {};
        (response.data || []).forEach(item => { map[item.message_id] = item.is_read; });
        return map;
    },

    /**
     * Batch-update read/unread flags for multiple messages.
     *
     * Accepts a `{messageId: isRead}` map and converts it to the array format
     * expected by the backend batch endpoint.
     *
     * @param {number} projectId
     * @param {number} roomId
     * @param {Object} statusMap - `{[messageId]: boolean}` map of new values.
     * @returns {Promise<void>}
     */
    updateReadStatus: async (projectId, roomId, statusMap) => {
        const statuses = Object.entries(statusMap).map(([mid, isRead]) => ({
            message_id: Number(mid),
            is_read: Boolean(isRead),
        }));
        await api.put(`/projects/${projectId}/chat-rooms/${roomId}/read-status`, { statuses });
    },
};

/**
 * Admin user management endpoint wrappers.
 * All methods require admin privileges on the backend.
 * @namespace users
 */
export const users = {
    /**
     * List all registered users.
     * @returns {Promise<Object[]>} Array of user objects.
     */
    getUsers: async () => {
        const response = await api.get('/admin/users');
        return response.data;
    },

    /**
     * Create a new user account.
     * @param {Object} userData - Fields: username, password, is_admin.
     * @returns {Promise<Object>} The newly created user.
     */
    createUser: async (userData) => {
        const response = await api.post('/admin/users', userData);
        return response.data;
    },

    /**
     * Delete a user account.
     * @param {number} userId
     * @returns {Promise<true>}
     */
    deleteUser: async (userId) => {
        await api.delete(`/admin/users/${userId}`);
        return true;
    },

    /**
     * Update a user's username, password, or admin flag.
     * @param {number} userId
     * @param {Object} updates - Partial user fields.
     * @returns {Promise<Object>} The updated user.
     */
    updateUser: async (userId, updates) => {
        const response = await api.put(`/admin/users/${userId}`, updates);
        return response.data;
    },
};

/**
 * Disentanglement annotation endpoint wrappers (plus admin annotation tools).
 *
 * Annotation isolation (Pillar 1) is enforced server-side: annotators receive
 * only their own annotations from the GET endpoints; admins receive all.
 * @namespace annotations
 */
export const annotations = {
    /**
     * Get all annotations for a specific message.
     * Respects Pillar 1 isolation on the backend.
     * @param {number} projectId
     * @param {number} messageId
     * @returns {Promise<Object[]>} Array of annotation objects.
     */
    getMessageAnnotations: async (projectId, messageId) => {
        const response = await api.get(`/projects/${projectId}/messages/${messageId}/annotations/`);
        return response.data;
    },

    /**
     * Get all annotations for a chat room.
     * Annotators see only their own; admins see all annotators'.
     * @param {number} projectId
     * @param {number} chatRoomId
     * @returns {Promise<Object[]>} Array of annotation objects.
     */
    getChatRoomAnnotations: async (projectId, chatRoomId) => {
        const response = await api.get(`/projects/${projectId}/chat-rooms/${chatRoomId}/annotations/`);
        return response.data;
    },

    /**
     * Create a disentanglement annotation for a message.
     * @param {number} projectId
     * @param {number} messageId
     * @param {Object} annotationData - Must include `thread_id`.
     * @returns {Promise<Object>} The newly created annotation.
     */
    createAnnotation: async (projectId, messageId, annotationData) => {
        const response = await api.post(`/projects/${projectId}/messages/${messageId}/annotations/`, annotationData);
        return response.data;
    },

    /**
     * Delete a disentanglement annotation.
     * Only the annotation's owner (or an admin) may delete it.
     * @param {number} projectId
     * @param {number} messageId
     * @param {number} annotationId
     * @returns {Promise<true>}
     */
    deleteAnnotation: async (projectId, messageId, annotationId) => {
        await api.delete(`/projects/${projectId}/messages/${messageId}/annotations/${annotationId}`);
        return true;
    },

    /**
     * Get all annotations created by the current user in a project, enriched
     * with chat-room name and message text preview.
     * @param {number} projectId
     * @returns {Promise<Object[]>} Array of enriched annotation objects.
     */
    getMyAnnotations: async (projectId) => {
        const response = await api.get(`/projects/${projectId}/annotations/my`);
        return response.data;
    },

    /**
     * Import disentanglement annotations from a CSV file attributed to a user (admin only).
     *
     * @param {number} chatRoomId
     * @param {number} userId - The annotator to attribute the imported annotations to.
     * @param {File} file - CSV file with `turn_id` and `thread_id` columns.
     * @param {Function} [onProgress] - Upload progress callback (0–100).
     * @returns {Promise<Object>} `AnnotationImportResponse` with counts and errors.
     * @throws {Error} With a human-readable message on failure.
     */
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
    /**
     * Get all annotations for a chat room grouped by message (admin only).
     * Used by the aggregated view to show cross-annotator concordance/discordance.
     * @param {number} chatRoomId
     * @returns {Promise<Object>} `AggregatedAnnotationsResponse`.
     */
    getAggregatedAnnotations: async (chatRoomId) => {
        const response = await api.get(`/admin/chat-rooms/${chatRoomId}/aggregated-annotations`);
        return response.data;
    },

    /**
     * Calculate Inter-Annotator Agreement for a chat room (admin only).
     *
     * For adjacency-pairs projects, pass `alpha` to override the project's
     * configured α without saving the change.
     *
     * @param {number} chatRoomId
     * @param {number|null} [alpha=null] - Override IAA alpha (0–1).
     * @returns {Promise<Object>} `ChatRoomIAA` with pairwise scores and annotator lists.
     */
    getChatRoomIAA: async (chatRoomId, alpha = null) => {
        const params = alpha !== null ? { alpha } : {};
        const response = await api.get(`/admin/chat-rooms/${chatRoomId}/iaa`, { params });
        return response.data;
    },

    /**
     * Preview an annotations CSV before importing (admin only).
     * @param {number} chatRoomId
     * @param {File} file
     * @param {number} [limit=20]
     * @returns {Promise<Object>} `AnnotationPreviewResponse`.
     */
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
    /**
     * Import annotations for multiple annotators from a batch JSON file (admin only).
     * @param {number} chatRoomId
     * @param {File} file - JSON file conforming to `BatchAnnotationImport` schema.
     * @param {Function} [onProgress] - Upload progress callback (0–100).
     * @returns {Promise<Object>} `BatchAnnotationImportResponse`.
     * @throws {Error} With a human-readable message on failure.
     */
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
    /**
     * Preview a batch annotation JSON file before committing (admin only).
     * @param {number} chatRoomId
     * @param {File} file
     * @param {number} [limit=10]
     * @returns {Promise<Object>} `BatchAnnotationPreviewResponse`.
     */
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
    /**
     * Get a summary of which annotators have marked a room as complete (admin only).
     * @param {number} chatRoomId
     * @returns {Promise<Object>} `ChatRoomCompletionSummary`.
     */
    getChatRoomCompletionSummary: async (chatRoomId) => {
        const response = await api.get(`/admin/chat-rooms/${chatRoomId}/completion-summary`);
        return response.data;
    },

    /**
     * Get the annotation status of an adjacency-pairs chat room (admin only).
     * @param {number} chatRoomId
     * @returns {Promise<Object>} `AdjacencyPairsStatus`.
     */
    getAdjacencyPairsStatus: async (chatRoomId) => {
        const response = await api.get(`/admin/chat-rooms/${chatRoomId}/adjacency-status`);
        return response.data;
    },

    /**
     * Get per-message read/unread flags for all annotators in a room (admin only).
     *
     * Converts the flat `{entries}` array into a nested map for efficient lookup:
     * `{[messageId]: {[annotatorUsername]: boolean}}`.
     *
     * @param {number} chatRoomId
     * @returns {Promise<Object>} Nested map `{messageId: {username: isRead}}`.
     */
    getReadStatusSummary: async (chatRoomId) => {
        const response = await api.get(`/admin/chat-rooms/${chatRoomId}/read-status-summary`);
        const byMessage = {};
        (response.data?.entries || []).forEach(e => {
            if (!byMessage[e.message_id]) byMessage[e.message_id] = {};
            byMessage[e.message_id][e.annotator_username] = e.is_read;
        });
        return byMessage;
    },

    /**
     * Export all annotated data for a chat room as a downloadable JSON file.
     *
     * Triggers a browser download using a temporary object URL.  The filename
     * is read from the server's `Content-Disposition` header when available.
     *
     * @param {number} chatRoomId
     * @returns {Promise<true>}
     * @throws {Error} With a human-readable message on failure.
     */
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

/**
 * Adjacency-pair annotation endpoint wrappers.
 * @namespace adjacencyPairs
 */
export const adjacencyPairs = {
    /**
     * Get all adjacency pairs for a chat room.
     * Respects Pillar 1 isolation: annotators see their own pairs only.
     * @param {number} projectId
     * @param {number} chatRoomId
     * @returns {Promise<Object[]>} Array of `AdjacencyPairSchema` objects.
     */
    getChatRoomPairs: async (projectId, chatRoomId) => {
        const response = await api.get(`/projects/${projectId}/chat-rooms/${chatRoomId}/adjacency-pairs/`);
        return response.data;
    },

    /**
     * Create or update an adjacency pair (upsert by annotator + message pair).
     * @param {number} projectId
     * @param {number} chatRoomId
     * @param {Object} pairData - `{from_message_id, to_message_id, relation_type}`.
     * @returns {Promise<Object>} The created or updated `AdjacencyPairSchema`.
     */
    createAdjacencyPair: async (projectId, chatRoomId, pairData) => {
        const response = await api.post(`/projects/${projectId}/chat-rooms/${chatRoomId}/adjacency-pairs/`, pairData);
        return response.data;
    },

    /**
     * Delete an adjacency pair.
     * @param {number} projectId
     * @param {number} chatRoomId
     * @param {number} pairId
     * @returns {Promise<true>}
     */
    deleteAdjacencyPair: async (projectId, chatRoomId, pairId) => {
        await api.delete(`/projects/${projectId}/chat-rooms/${chatRoomId}/adjacency-pairs/${pairId}`);
        return true;
    },

    /**
     * Bulk-import adjacency pairs from a plain-text CSV file.
     *
     * @param {number} projectId
     * @param {number} chatRoomId
     * @param {File} file - Plain text file; each line: `turnA,turnB,relation_type`.
     * @param {'merge'|'replace'} [mode='merge'] - `merge` upserts; `replace`
     *   deletes the annotator's existing pairs first.
     * @returns {Promise<Object>} Import result with counts and per-line errors.
     */
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

    /**
     * Export adjacency pairs as a downloadable text file (or ZIP for all annotators).
     *
     * Triggers a browser download.  When `annotatorId` is omitted, the backend
     * returns a ZIP archive with one file per assigned annotator.
     *
     * @param {number} chatRoomId
     * @param {number|null} [annotatorId=null] - Export a specific annotator, or all if null.
     * @param {string|null} [filenameOverride=null] - Override the suggested filename.
     * @returns {Promise<true>}
     * @throws {Error} With a human-readable message on failure.
     */
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
