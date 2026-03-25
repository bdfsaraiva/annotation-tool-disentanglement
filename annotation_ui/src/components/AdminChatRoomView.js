/**
 * @fileoverview Admin read-only overview of a single chat room.
 *
 * Displays a summary statistics panel, import panels for CSV and JSON
 * annotation imports, an annotator reference grid, and a per-message list
 * showing each turn's annotation or read-status coverage across all
 * assigned users.
 *
 * The component branches on `project.annotation_type`:
 *
 * - **adjacency_pairs**: fetches read-status data (which annotators have
 *   "read" each turn) and shows a read/unread user breakdown per turn.
 *   Import panels are hidden because adjacency-pair data is managed
 *   through the annotator interface.
 *
 * - **disentanglement**: fetches all annotations for the room in a single
 *   bulk request and shows the thread label(s) assigned by each annotator
 *   per turn, plus a list of annotators who have not yet annotated.
 *
 * On fatal fetch error, navigates back to the admin project page and passes
 * the error message as route state so the project page can surface it.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projects as projectsApi, annotations as annotationsApi } from '../utils/api';
import './AdminChatRoomView.css';

/**
 * Admin chat-room detail page with annotation coverage overview and bulk
 * import utilities.
 */
const AdminChatRoomView = () => {
    const { projectId, roomId } = useParams();
    const navigate = useNavigate();
    const [chatRoom, setChatRoom] = useState(null);
    const [project, setProject] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messageAnnotations, setMessageAnnotations] = useState({});
    const [messageReadStatus, setMessageReadStatus] = useState({});
    const [assignedUsers, setAssignedUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [stats, setStats] = useState({});
    const [annotationFile, setAnnotationFile] = useState(null);
    const [annotationUserId, setAnnotationUserId] = useState('');
    const [annotationPreview, setAnnotationPreview] = useState(null);
    const [annotationPreviewError, setAnnotationPreviewError] = useState(null);
    const [annotationImportError, setAnnotationImportError] = useState(null);
    const [annotationImportMessage, setAnnotationImportMessage] = useState(null);
    const [isAnnotationPreviewing, setIsAnnotationPreviewing] = useState(false);
    const [isAnnotationImporting, setIsAnnotationImporting] = useState(false);
    const [batchFile, setBatchFile] = useState(null);
    const [batchPreview, setBatchPreview] = useState(null);
    const [batchPreviewError, setBatchPreviewError] = useState(null);
    const [batchImportError, setBatchImportError] = useState(null);
    const [batchImportMessage, setBatchImportMessage] = useState(null);
    const [isBatchPreviewing, setIsBatchPreviewing] = useState(false);
    const [isBatchImporting, setIsBatchImporting] = useState(false);

    /**
     * Fetch all data required for the admin view in parallel where possible,
     * then populate annotation/read-status state according to project type.
     *
     * On unrecoverable error, navigates back to the project page and passes the
     * error message via router state for contextual display.
     */
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            // Fetch all required data
            const [projectData, chatRoomData, messagesResponse, usersData] = await Promise.all([
                projectsApi.getProject(projectId),
                projectsApi.getChatRoom(projectId, roomId),
                projectsApi.getChatMessages(projectId, roomId),
                projectsApi.getProjectUsers(projectId)
            ]);
            setProject(projectData);
            setChatRoom(chatRoomData);
            const messagesData = messagesResponse.messages || [];
            setMessages(messagesData);
            setAssignedUsers(usersData);

            // Fetch per-type data
            const annotationsData = {};
            const readStatusData = {};
            if (projectData.annotation_type === 'adjacency_pairs') {
                try {
                    const summary = await annotationsApi.getReadStatusSummary(roomId);
                    Object.assign(readStatusData, summary);
                } catch (err) {
                    console.error("Failed to fetch read status summary:", err);
                }
            } else {
                try {
                    const allAnnotations = await annotationsApi.getChatRoomAnnotations(projectId, roomId);
                    allAnnotations.forEach((ann) => {
                        if (!annotationsData[ann.message_id]) {
                            annotationsData[ann.message_id] = [];
                        }
                        annotationsData[ann.message_id].push(ann);
                    });
                } catch (err) {
                    console.error("Failed to fetch annotations for chat room:", err);
                }
            }
            setMessageAnnotations(annotationsData);
            setMessageReadStatus(readStatusData);

            // Calculate simple stats
            const totalMessages = messagesResponse.total ?? messagesData.length;
            const totalUsers = usersData.length;
            let annotatedMessages = 0;
            let totalAnnotations = 0;

            if (projectData.annotation_type === 'adjacency_pairs') {
                // For adj_pairs: count turns where at least one annotator has read
                messagesData.forEach(msg => {
                    const readers = readStatusData[msg.id] || {};
                    const readCount = Object.values(readers).filter(Boolean).length;
                    if (readCount > 0) annotatedMessages++;
                    totalAnnotations += readCount;
                });
            } else {
                Object.values(annotationsData).forEach(annotations => {
                    if (annotations.length > 0) {
                        annotatedMessages++;
                        totalAnnotations += annotations.length;
                    }
                });
            }

            setStats({
                totalMessages,
                totalUsers,
                annotatedMessages,
                totalAnnotations,
                completionRate: totalMessages > 0 ? ((annotatedMessages / totalMessages) * 100).toFixed(1) : 0
            });

        } catch (err) {
            console.error("Failed to fetch admin chat room data:", err);
            const warningMessage = err.response?.data?.detail || err.message || 'Failed to load chat room data.';
            navigate(`/admin/projects/${projectId}`, {
                state: { removeChatRoomId: Number(roomId), warningMessage }
            });
            return;
        } finally {
            setLoading(false);
        }
    }, [projectId, roomId]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    /**
     * Reset annotation-import state when a new file is selected so stale
     * previews and error messages from a previous file are cleared.
     * @param {React.ChangeEvent<HTMLInputElement>} event
     */
    const handleAnnotationFileSelect = (event) => {
        setAnnotationFile(event.target.files[0] || null);
        setAnnotationPreview(null);
        setAnnotationPreviewError(null);
        setAnnotationImportError(null);
        setAnnotationImportMessage(null);
    };

    /**
     * Preview the first 20 rows of the selected CSV annotation file without
     * committing any data to the database.
     */
    const handleAnnotationPreview = async () => {
        if (!annotationFile) {
            setAnnotationPreviewError('Please select a CSV file.');
            return;
        }
        setIsAnnotationPreviewing(true);
        setAnnotationPreviewError(null);
        try {
            const preview = await annotationsApi.previewImportAnnotations(roomId, annotationFile, 20);
            setAnnotationPreview(preview);
        } catch (err) {
            console.error('Failed to preview annotations:', err);
            setAnnotationPreviewError(err.message || 'Failed to preview annotations.');
        } finally {
            setIsAnnotationPreviewing(false);
        }
    };

    /**
     * Import annotations from the selected CSV file for the chosen user.
     * Requires both a file and a selected user to be set.  Refreshes room
     * data after a successful import.
     */
    const handleAnnotationImport = async () => {
        if (!annotationFile || !annotationUserId) {
            setAnnotationImportError('Select a user and a CSV file before importing.');
            return;
        }
        setIsAnnotationImporting(true);
        setAnnotationImportError(null);
        try {
            const result = await annotationsApi.importAnnotations(roomId, annotationUserId, annotationFile);
            setAnnotationImportMessage(
                `Imported ${result.imported_count} annotations (skipped ${result.skipped_count}).`
            );
            setAnnotationFile(null);
            setAnnotationPreview(null);
            setAnnotationUserId('');
            fetchData();
        } catch (err) {
            console.error('Failed to import annotations:', err);
            setAnnotationImportError(err.message || 'Failed to import annotations.');
        } finally {
            setIsAnnotationImporting(false);
        }
    };

    /**
     * Reset batch-import state when a new JSON file is selected.
     * @param {React.ChangeEvent<HTMLInputElement>} event
     */
    const handleBatchFileSelect = (event) => {
        setBatchFile(event.target.files[0] || null);
        setBatchPreview(null);
        setBatchPreviewError(null);
        setBatchImportError(null);
        setBatchImportMessage(null);
    };

    /**
     * Preview the first 10 annotators from the selected JSON batch file
     * without writing any data.
     */
    const handleBatchPreview = async () => {
        if (!batchFile) {
            setBatchPreviewError('Please select a JSON file.');
            return;
        }
        setIsBatchPreviewing(true);
        setBatchPreviewError(null);
        try {
            const preview = await annotationsApi.previewBatchAnnotations(roomId, batchFile, 10);
            setBatchPreview(preview);
        } catch (err) {
            console.error('Failed to preview batch import:', err);
            setBatchPreviewError(err.message || 'Failed to preview batch import.');
        } finally {
            setIsBatchPreviewing(false);
        }
    };

    /**
     * Import all annotations from the selected JSON batch file for all
     * annotators encoded in the file.  Refreshes room data on success.
     */
    const handleBatchImport = async () => {
        if (!batchFile) {
            setBatchImportError('Select a JSON file before importing.');
            return;
        }
        setIsBatchImporting(true);
        setBatchImportError(null);
        try {
            const result = await annotationsApi.importBatchAnnotations(roomId, batchFile);
            setBatchImportMessage(
                `Imported ${result.total_imported} annotations from ${result.total_annotators} annotators.`
            );
            setBatchFile(null);
            setBatchPreview(null);
            fetchData();
        } catch (err) {
            console.error('Failed to import batch annotations:', err);
            setBatchImportError(err.message || 'Failed to import batch annotations.');
        } finally {
            setIsBatchImporting(false);
        }
    };

    /**
     * Return the unique list of annotator usernames who have at least one
     * annotation on the given message.
     * @param {number} messageId
     * @returns {string[]}
     */
    const getUsersWhoAnnotated = (messageId) => {
        const annotations = messageAnnotations[messageId] || [];
        return [...new Set(annotations.map(ann => ann.annotator_username))];
    };

    /**
     * Return the list of assigned users who have NOT yet annotated the given
     * message, used to populate the "Pending" section in the turn card.
     * @param {number} messageId
     * @returns {Object[]} Subset of `assignedUsers`.
     */
    const getUsersWhoDidntAnnotate = (messageId) => {
        const annotatedUsers = getUsersWhoAnnotated(messageId);
        return assignedUsers.filter(user => !annotatedUsers.includes(user.username));
    };

    if (loading) return <div className="loading-container">Loading chat room...</div>;
    if (error) return <div className="error-message">Error: {error}</div>;
    if (!chatRoom) return <div>Chat room not found.</div>;

    return (
        <div className="admin-chat-room-view">
            <header className="page-header">
                <button onClick={() => navigate(`/admin/projects/${projectId}`)} className="back-button">
                    Back to Project
                </button>
                <div className="header-info">
                    <h1>{chatRoom.name}</h1>
                    {project?.annotation_type !== "adjacency_pairs" && chatRoom.description && (
                        <p className="chat-room-description">{chatRoom.description}</p>
                    )}
                </div>
            </header>

            <div className="stats-panel">
                <div className="stat-item">
                    <span className="stat-value">{stats.totalMessages}</span>
                    <span className="stat-label">Total Messages</span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">{stats.totalUsers}</span>
                    <span className="stat-label">Assigned Users</span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">{stats.annotatedMessages}</span>
                    <span className="stat-label">
                        {project?.annotation_type === 'adjacency_pairs' ? 'Turns with Reads' : 'Annotated Messages'}
                    </span>
                </div>
                <div className="stat-item">
                    <span className="stat-value">{stats.completionRate}%</span>
                    <span className="stat-label">Completion Rate</span>
                </div>
            </div>

            {project?.annotation_type !== "adjacency_pairs" && (
                <div className="import-panel">
                    <h3>Import Annotations (CSV)</h3>
                    <div className="import-row">
                        <select
                            value={annotationUserId}
                            onChange={(e) => setAnnotationUserId(e.target.value)}
                        >
                            <option value="">Select user</option>
                            {assignedUsers.map((user) => (
                                <option key={user.id} value={user.id}>
                                    {user.username}
                                </option>
                            ))}
                        </select>
                        <input type="file" accept=".csv" onChange={handleAnnotationFileSelect} />
                        <div className="import-actions">
                            <button className="action-button secondary" onClick={handleAnnotationPreview} disabled={!annotationFile || isAnnotationPreviewing}>
                                {isAnnotationPreviewing ? 'Previewing...' : 'Preview'}
                            </button>
                            <button className="action-button" onClick={handleAnnotationImport} disabled={!annotationFile || !annotationUserId || isAnnotationImporting}>
                                {isAnnotationImporting ? 'Importing...' : 'Import'}
                            </button>
                        </div>
                    </div>
                    {annotationPreviewError && <div className="import-error">{annotationPreviewError}</div>}
                    {annotationImportError && <div className="import-error">{annotationImportError}</div>}
                    {annotationImportMessage && <div className="import-message">{annotationImportMessage}</div>}
                    {annotationPreview && (
                        <div className="import-preview">
                            <div className="import-preview-header">
                                <strong>Total rows:</strong> {annotationPreview.total_rows}
                            </div>
                            <div className="import-preview-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>turn_id</th>
                                            <th>thread_id</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {annotationPreview.preview_rows.map((row, index) => (
                                            <tr key={`ann-preview-${index}`}>
                                                <td>{row.turn_id}</td>
                                                <td>{row.thread_id}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {project?.annotation_type !== "adjacency_pairs" && (
                <div className="import-panel">
                    <h3>Batch Import (JSON)</h3>
                    <div className="import-row">
                        <input type="file" accept=".json" onChange={handleBatchFileSelect} />
                        <div className="import-actions">
                            <button className="action-button secondary" onClick={handleBatchPreview} disabled={!batchFile || isBatchPreviewing}>
                                {isBatchPreviewing ? 'Previewing...' : 'Preview'}
                            </button>
                            <button className="action-button" onClick={handleBatchImport} disabled={!batchFile || isBatchImporting}>
                                {isBatchImporting ? 'Importing...' : 'Import'}
                            </button>
                        </div>
                    </div>
                    {batchPreviewError && <div className="import-error">{batchPreviewError}</div>}
                    {batchImportError && <div className="import-error">{batchImportError}</div>}
                    {batchImportMessage && <div className="import-message">{batchImportMessage}</div>}
                    {batchPreview && (
                        <div className="import-preview">
                            <div className="import-preview-header">
                                <strong>Total annotators:</strong> {batchPreview.total_annotators} |
                                <strong> Total annotations:</strong> {batchPreview.total_annotations}
                            </div>
                            <div className="import-preview-table">
                                <table>
                                    <thead>
                                        <tr>
                                            <th>annotator_username</th>
                                            <th>annotator_name</th>
                                            <th>annotations</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {batchPreview.preview_annotators.map((row, index) => (
                                            <tr key={`batch-preview-${index}`}>
                                                <td>{row.annotator_username}</td>
                                                <td>{row.annotator_name}</td>
                                                <td>{row.annotations_count}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div className="annotators-reference">
                <h3>Annotators Reference</h3>
                <div className="annotators-grid">
                    {assignedUsers.map(user => (
                        <div key={user.id} className="annotator-profile">
                            <span className="profile-name">{user.username}</span>
                            <span className="profile-email">{user.username}</span>
                            <span className="profile-id">ID: {user.id}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="messages-container">
                {messages.map((message, index) => {
                    const isAdjPairs = project?.annotation_type === 'adjacency_pairs';

                    if (isAdjPairs) {
                        const readers = messageReadStatus[message.id] || {};
                        const readUsers = assignedUsers.filter(u => readers[u.username] === true);
                        const unreadUsers = assignedUsers.filter(u => readers[u.username] !== true);
                        const readCount = readUsers.length;

                        return (
                            <div key={message.id} className="message-card">
                                <div className="message-header">
                                    <span className="turn-number">#{message.turn_id || index + 1}</span>
                                    <span className="user-badge">{message.user_id}</span>
                                    {message.reply_to_turn && (
                                        <span className="reply-indicator">↳ #{message.reply_to_turn}</span>
                                    )}
                                    <div className="annotation-status">
                                        <span className={readCount > 0 ? "status-done" : "status-pending"}>
                                            {readCount}/{assignedUsers.length}
                                        </span>
                                    </div>
                                </div>

                                <div className="message-body">
                                    <div className="message-text">{message.turn_text}</div>

                                    <div className="annotators-section">
                                        {readUsers.length > 0 ? (
                                            <div className="annotated-by">
                                                {readUsers.map(user => (
                                                    <div key={user.id} className="annotator-item">
                                                        <span className="annotator-name" title={user.username}>
                                                            {user.username}
                                                        </span>
                                                        <span className="thread-info read-badge">lido</span>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="no-annotations">
                                                <span className="pending-label">Nenhum anotador leu este turno</span>
                                            </div>
                                        )}

                                        {unreadUsers.length > 0 && (
                                            <div className="missing-users-section">
                                                <span className="missing-label">Por ler:</span>
                                                <div className="missing-users-compact">
                                                    {unreadUsers.map(user => (
                                                        <span key={user.id} className="missing-tag" title={user.username}>
                                                            {user.username}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    }

                    // Disentanglement
                    const annotations = messageAnnotations[message.id] || [];
                    const annotatedUsers = getUsersWhoAnnotated(message.id);
                    const missingUsers = getUsersWhoDidntAnnotate(message.id);

                    return (
                        <div key={message.id} className="message-card">
                            <div className="message-header">
                                <span className="turn-number">#{message.turn_id || index + 1}</span>
                                <span className="user-badge">{message.user_id}</span>
                                {message.reply_to_turn && (
                                    <span className="reply-indicator">↳ #{message.reply_to_turn}</span>
                                )}
                                <div className="annotation-status">
                                    <span className={annotations.length > 0 ? "status-done" : "status-pending"}>
                                        {annotations.length > 0 ? `${annotatedUsers.length}/${assignedUsers.length}` : '0'}
                                    </span>
                                </div>
                            </div>

                            <div className="message-body">
                                <div className="message-text">
                                    {message.turn_text}
                                </div>

                                <div className="annotators-section">
                                    {annotatedUsers.length > 0 ? (
                                        <div className="annotated-by">
                                            {annotatedUsers.map(username => {
                                                const userAnnotations = annotations.filter(ann => ann.annotator_username === username);
                                                const threadIds = userAnnotations.map(ann => ann.thread_id).join(', ');
                                                return (
                                                    <div key={username} className="annotator-item">
                                                        <span className="annotator-name" title={username}>
                                                            {username}
                                                        </span>
                                                        <span className="thread-info">
                                                            {threadIds}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="no-annotations">
                                            <span className="pending-label">No annotations yet</span>
                                        </div>
                                    )}

                                    {missingUsers.length > 0 && (
                                        <div className="missing-users-section">
                                            <span className="missing-label">Pending:</span>
                                            <div className="missing-users-compact">
                                                {missingUsers.map(user => (
                                                    <span key={user.id} className="missing-tag" title={user.username}>
                                                        {user.username}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default AdminChatRoomView; 

