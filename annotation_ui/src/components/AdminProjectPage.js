import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { projects as projectsApi, users as usersApi, annotations as annotationsApi, adjacencyPairs as adjacencyPairsApi } from '../utils/api';
import ErrorMessage from './ErrorMessage';
import Modal from './Modal';
import ConfirmationModal from './ConfirmationModal';
import { useToast } from '../contexts/ToastContext';
import './AdminProjectPage.css';

const AdminProjectPage = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const { addToast } = useToast();

    const [project, setProject] = useState(null);
    const [assignedUsers, setAssignedUsers] = useState([]);
    const [allUsers, setAllUsers] = useState([]);
    const [chatRooms, setChatRooms] = useState([]);
    const [chatRoomAnalytics, setChatRoomAnalytics] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [importError, setImportError] = useState(null);
    const [previewError, setPreviewError] = useState(null);
    const [importPreview, setImportPreview] = useState(null);
    const [isAssigning, setIsAssigning] = useState(false);
    const [userToAssign, setUserToAssign] = useState('');
    const [selectedFile, setSelectedFile] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isPreviewing, setIsPreviewing] = useState(false);
    const [relationTypes, setRelationTypes] = useState([]);
    const [relationTypeInput, setRelationTypeInput] = useState('');
    const [isUpdatingProject, setIsUpdatingProject] = useState(false);
    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [descriptionDraft, setDescriptionDraft] = useState('');
    const [dragIndex, setDragIndex] = useState(null);
    const [exportModal, setExportModal] = useState({ visible: false, roomId: null, roomName: '' });
    const [exportAnnotatorId, setExportAnnotatorId] = useState('all');
    const [editChatRoomModal, setEditChatRoomModal] = useState({ open: false, roomId: null, name: '' });
    const [isRenamingChatRoom, setIsRenamingChatRoom] = useState(false);

    // ── Confirmation modal state ──────────────────────────────────────────────
    const [confirmModal, setConfirmModal] = useState({
        open: false, title: '', message: '', confirmText: 'Confirm',
        type: 'danger', onConfirm: null
    });

    const openConfirm = (title, message, onConfirm, { type = 'danger', confirmText = 'Confirm' } = {}) => {
        setConfirmModal({ open: true, title, message, confirmText, type, onConfirm });
    };
    const closeConfirm = () => setConfirmModal(prev => ({ ...prev, open: false, onConfirm: null }));

    // ── Data fetching ─────────────────────────────────────────────────────────
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [projectData, assignedUsersData, allUsersData, chatRoomsData] = await Promise.all([
                projectsApi.getProject(projectId),
                projectsApi.getProjectUsers(projectId),
                usersApi.getUsers(),
                projectsApi.getChatRooms(projectId)
            ]);
            setProject(projectData);
            setRelationTypes(projectData.relation_types || []);
            setDescriptionDraft(projectData.description || '');
            setAssignedUsers(assignedUsersData);
            setAllUsers(allUsersData);
            setChatRooms(chatRoomsData);
            await fetchChatRoomAnalytics(chatRoomsData, projectData);
        } catch (err) {
            console.error('Failed to fetch project admin data:', err);
            setError(err.response?.data?.detail || 'Failed to load project data.');
        } finally {
            setLoading(false);
        }
    }, [projectId]);

    const fetchChatRoomAnalytics = async (rooms, projectData) => {
        const analytics = {};

        for (const room of rooms) {
            try {
                const iaaData = await annotationsApi.getChatRoomIAA(room.id);
                if (projectData?.annotation_type === 'adjacency_pairs') {
                    analytics[room.id] = {
                        status: iaaData.analysis_status,
                        completedAnnotators: iaaData.completed_annotators.length,
                        totalAnnotators: iaaData.total_annotators_assigned,
                        averageAgreement: calculateAverageAdjIAA(iaaData.pairwise_adj_iaa),
                        canAnalyze: iaaData.pairwise_adj_iaa.length > 0,
                    };
                } else {
                    analytics[room.id] = {
                        status: iaaData.analysis_status,
                        completedAnnotators: iaaData.completed_annotators.length,
                        totalAnnotators: iaaData.total_annotators_assigned,
                        averageAgreement: calculateAverageAgreement(iaaData.pairwise_accuracies),
                        canAnalyze: iaaData.pairwise_accuracies.length > 0,
                    };
                }
            } catch {
                analytics[room.id] = { status: 'Error', completedAnnotators: 0, totalAnnotators: 0, averageAgreement: null, canAnalyze: false };
            }
        }
        setChatRoomAnalytics(analytics);
    };

    const calculateAverageAgreement = (pairwiseAccuracies) => {
        if (!pairwiseAccuracies || pairwiseAccuracies.length === 0) return null;
        const sum = pairwiseAccuracies.reduce((acc, pair) => acc + pair.accuracy, 0);
        return (sum / pairwiseAccuracies.length).toFixed(1);
    };

    const calculateAverageAdjIAA = (pairwiseAdjIAA) => {
        if (!pairwiseAdjIAA || pairwiseAdjIAA.length === 0) return null;
        const sum = pairwiseAdjIAA.reduce((acc, pair) => acc + pair.combined_iaa, 0);
        return (sum / pairwiseAdjIAA.length).toFixed(3);
    };

    useEffect(() => { fetchData(); }, [fetchData]);

    useEffect(() => {
        const removeChatRoomId = location.state?.removeChatRoomId;
        const warningMessage = location.state?.warningMessage;
        if (removeChatRoomId) removeChatRoomFromList(removeChatRoomId);
        if (warningMessage) setError(warningMessage);
        if (removeChatRoomId || warningMessage) navigate(location.pathname, { replace: true, state: {} });
    }, [location.state, location.pathname, navigate]);

    // ── User management ───────────────────────────────────────────────────────
    const handleRemoveUser = (userId, username) => {
        openConfirm(
            'Remove User',
            `Remove "${username}" from this project?`,
            async () => {
                try {
                    await projectsApi.removeUser(projectId, userId);
                    fetchData();
                    addToast(`User "${username}" removed from project.`, 'success');
                } catch (err) {
                    setError(err.response?.data?.detail || 'Failed to remove user.');
                }
            }
        );
    };

    const handleAssignUser = async (e) => {
        e.preventDefault();
        if (!userToAssign) { setError('Please select a user to assign.'); return; }
        try {
            await projectsApi.assignUser(projectId, userToAssign);
            setUserToAssign('');
            setIsAssigning(false);
            fetchData();
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to assign user.');
        }
    };

    // ── CSV import ────────────────────────────────────────────────────────────
    const handleFileSelect = (e) => {
        setSelectedFile(e.target.files[0]);
        setImportError(null);
        setPreviewError(null);
        setImportPreview(null);
    };

    const handlePreviewCsv = async () => {
        if (!selectedFile) { setPreviewError('Please select a file to preview.'); return; }
        setIsPreviewing(true);
        setPreviewError(null);
        try {
            const preview = await projectsApi.previewImportCsv(projectId, selectedFile, 20);
            setImportPreview(preview);
        } catch (err) {
            setPreviewError(err.message || 'Failed to preview CSV.');
        } finally {
            setIsPreviewing(false);
        }
    };

    const handleUploadCsv = async () => {
        if (!selectedFile) { setImportError('Please select a file to upload.'); return; }
        setIsUploading(true);
        setImportError(null);
        try {
            const response = await projectsApi.importCsv(projectId, selectedFile);
            addToast(`Import successful: ${response.import_details.imported_count} turns imported.`, 'success');
            setSelectedFile(null);
            setImportPreview(null);
            document.getElementById('csv-file-input').value = '';
            fetchData();
        } catch (err) {
            setImportError(err.message || 'Failed to import CSV.');
        } finally {
            setIsUploading(false);
        }
    };

    // ── Project management ────────────────────────────────────────────────────
    const handleDeleteProject = () => {
        openConfirm(
            'Delete Project',
            `Permanently delete "${project?.name}"? This removes all chat rooms, turns, and annotations and cannot be undone.`,
            async () => {
                try {
                    await projectsApi.deleteProject(projectId);
                    addToast('Project deleted successfully.', 'success');
                    navigate('/admin');
                } catch (err) {
                    setError(err.response?.data?.detail || 'Failed to delete project.');
                }
            },
            { confirmText: 'Delete Project' }
        );
    };

    const handleUpdateRelationTypes = async (nextTypes) => {
        if (!project) return;
        setIsUpdatingProject(true);
        try {
            const updated = await projectsApi.updateProject(projectId, { relation_types: nextTypes });
            setProject(updated);
            setRelationTypes(updated.relation_types || []);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update project.');
        } finally {
            setIsUpdatingProject(false);
        }
    };

    const handleAddRelationType = (e) => {
        e.preventDefault();
        const value = relationTypeInput.trim();
        if (!value || relationTypes.includes(value)) return;
        const nextTypes = [...relationTypes, value];
        setRelationTypes(nextTypes);
        handleUpdateRelationTypes(nextTypes);
        setRelationTypeInput('');
    };

    const handleRemoveRelationType = (value) => {
        const nextTypes = relationTypes.filter(item => item !== value);
        setRelationTypes(nextTypes);
        handleUpdateRelationTypes(nextTypes);
    };

    const handleSortRelationTypes = () => {
        const nextTypes = [...relationTypes].sort((a, b) => a.localeCompare(b));
        setRelationTypes(nextTypes);
        handleUpdateRelationTypes(nextTypes);
    };

    const handleDragStart = (index) => setDragIndex(index);
    const handleDrop = (index) => {
        if (dragIndex === null || dragIndex === index) return;
        const next = [...relationTypes];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(index, 0, moved);
        setRelationTypes(next);
        handleUpdateRelationTypes(next);
        setDragIndex(null);
    };

    const handleUpdateDescription = async () => {
        if (!project) return;
        setIsUpdatingProject(true);
        try {
            const updated = await projectsApi.updateProject(projectId, { description: descriptionDraft });
            setProject(updated);
            setIsEditingDescription(false);
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to update project.');
        } finally {
            setIsUpdatingProject(false);
        }
    };

    // ── Export ────────────────────────────────────────────────────────────────
    const handleExportChatRoom = async (chatRoomId, chatRoomName, analytics) => {
        setError(null);

        if (project.annotation_type === 'adjacency_pairs') {
            setExportAnnotatorId('all');
            setExportModal({ visible: true, roomId: chatRoomId, roomName: chatRoomName });
            return;
        }

        const doExport = async () => {
            await annotationsApi.exportChatRoom(chatRoomId);
            const label = analytics.status === 'Complete' ? 'Complete' : analytics.status === 'Partial' ? 'Partial' : 'Insufficient';
            addToast(`${label} annotation data exported successfully.`, analytics.status === 'Complete' ? 'success' : 'warning');
        };

        if (analytics.status === 'Partial') {
            openConfirm(
                'Export Partial Data',
                `This chat room is only partially annotated (${analytics.completedAnnotators}/${analytics.totalAnnotators} annotators completed). The exported data will be marked as PARTIAL. Proceed?`,
                doExport,
                { type: 'warning', confirmText: 'Export Anyway' }
            );
        } else if (analytics.status === 'NotEnoughData') {
            openConfirm(
                'Export Insufficient Data',
                `This chat room has insufficient annotation data (less than 2 completed annotators). The data is not suitable for analysis. Proceed?`,
                doExport,
                { type: 'warning', confirmText: 'Export Anyway' }
            );
        } else {
            try { await doExport(); } catch (err) { setError(err.message || 'Failed to export chat room data.'); }
        }
    };

    const handleExportAdjacencyPairs = async () => {
        if (!exportModal.roomId) return;
        try {
            const annotatorId = exportAnnotatorId === 'all' ? null : parseInt(exportAnnotatorId, 10);
            const safeRoomName = (exportModal.roomName || `chat_room_${exportModal.roomId}`).replace(/\s+/g, '-');
            let filenameOverride = null;
            if (annotatorId == null) {
                filenameOverride = `${safeRoomName}-all.zip`;
            } else {
                const user = assignedUsers.find(u => u.id === annotatorId);
                const username = user?.username || `user_${annotatorId}`;
                filenameOverride = `${safeRoomName}-${username.replace(/\s+/g, '-')}.txt`;
            }
            await adjacencyPairsApi.exportChatRoomPairs(exportModal.roomId, annotatorId, filenameOverride);
            setExportModal({ visible: false, roomId: null, roomName: '' });
        } catch (err) {
            setError(err.message || 'Failed to export adjacency pairs.');
        }
    };

    // ── Chat room management ──────────────────────────────────────────────────
    const removeChatRoomFromList = (chatRoomId) => {
        setChatRooms(prev => prev.filter(room => room.id !== chatRoomId));
        setChatRoomAnalytics(prev => { const updated = { ...prev }; delete updated[chatRoomId]; return updated; });
    };

    const handleViewChatRoom = async (chatRoomId) => {
        try {
            await projectsApi.getChatRoom(projectId, chatRoomId);
            navigate(`/admin/projects/${projectId}/chat-rooms/${chatRoomId}`);
        } catch (err) {
            removeChatRoomFromList(chatRoomId);
            setError(err.response?.data?.detail || 'Failed to load chat room. It was removed from the list.');
        }
    };

    const handleDeleteChatRoom = (chatRoomId, chatRoomName) => {
        openConfirm(
            'Delete Chat Room',
            `Delete "${chatRoomName}"? This will permanently remove all messages and annotations in this room.`,
            async () => {
                try {
                    setError(null);
                    await projectsApi.deleteChatRoom(chatRoomId);
                    addToast(`Chat room "${chatRoomName}" deleted.`, 'success');
                    fetchData();
                } catch (err) {
                    setError(err.response?.data?.detail || 'Failed to delete chat room.');
                }
            },
            { confirmText: 'Delete Chat Room' }
        );
    };

    const handleOpenRenameChatRoom = (room) => {
        setEditChatRoomModal({ open: true, roomId: room.id, name: room.name || '' });
    };

    const handleRenameChatRoom = async () => {
        if (!editChatRoomModal.roomId) return;
        const nextName = editChatRoomModal.name.trim();
        if (!nextName) { setError('Chat room name cannot be empty.'); return; }
        setIsRenamingChatRoom(true);
        try {
            const updated = await projectsApi.updateChatRoom(editChatRoomModal.roomId, { name: nextName });
            setChatRooms(prev => prev.map(room => room.id === updated.id ? { ...room, name: updated.name } : room));
            setEditChatRoomModal({ open: false, roomId: null, name: '' });
        } catch (err) {
            setError(err.response?.data?.detail || 'Failed to rename chat room.');
        } finally {
            setIsRenamingChatRoom(false);
        }
    };

    // ── Status badge ──────────────────────────────────────────────────────────
    const getStatusBadge = (status) => {
        const badges = {
            'Completed': { class: 'status-complete', text: 'Completed' },
            'Started': { class: 'status-partial', text: 'Started' },
            'NotStarted': { class: 'status-unknown', text: 'Not Started' },
            'Complete': { class: 'status-complete', text: 'Annotated' },
            'Partial': { class: 'status-partial', text: 'In Progress' },
            'NotEnoughData': { class: 'status-insufficient', text: 'Insufficient Data' },
            'Error': { class: 'status-error', text: 'Error' },
            'N/A': { class: 'status-unknown', text: 'N/A' }
        };
        const badge = badges[status] || { class: 'status-unknown', text: 'Unknown' };
        return <span className={`status-badge ${badge.class}`}>{badge.text}</span>;
    };

    // ── Render ─────────────────────────────────────────────────────────────────
    if (loading) return <div className="loading-container">Loading project details...</div>;
    if (!project) return <div>Project not found.</div>;

    const availableUsersToAssign = allUsers.filter(u => !assignedUsers.some(a => a.id === u.id));

    return (
        <div className="admin-project-page">
            {/* Confirmation modal (replaces window.confirm) */}
            <ConfirmationModal
                isOpen={confirmModal.open}
                onClose={closeConfirm}
                onConfirm={() => { confirmModal.onConfirm?.(); closeConfirm(); }}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText={confirmModal.confirmText}
                type={confirmModal.type}
            />

            <header className="page-header">
                <button onClick={() => navigate('/admin')} className="back-button">Back to Dashboard</button>
                <h1>Manage Project<br /><span className="project-name">{project.name}</span></h1>
            </header>

            {/* Description */}
            <div className="management-section">
                <div className="section-header">
                    <h2>Project Description</h2>
                    {!isEditingDescription && (
                        <button className="icon-button" onClick={() => setIsEditingDescription(true)} title="Edit description">Edit</button>
                    )}
                </div>
                {!isEditingDescription ? (
                    <p className="project-description">{project.description || 'No description'}</p>
                ) : (
                    <div className="project-description-edit">
                        <textarea value={descriptionDraft} onChange={e => setDescriptionDraft(e.target.value)} rows={3} />
                        <div className="description-actions">
                            <button className="action-button" onClick={handleUpdateDescription} disabled={isUpdatingProject}>Save</button>
                            <button className="action-button secondary" onClick={() => { setDescriptionDraft(project.description || ''); setIsEditingDescription(false); }}>Cancel</button>
                        </div>
                    </div>
                )}
            </div>

            {error && <ErrorMessage type="warning" title="Warning" message={error} />}

            {/* Settings */}
            <div className="management-section">
                <div className="section-header"><h2>Project Settings</h2></div>
                <div className="settings-grid">
                    <div><strong>Annotation Type:</strong> {project.annotation_type === 'adjacency_pairs' ? 'Adjacency Pairs' : 'Chat Disentanglement'}</div>
                </div>
                {project.annotation_type === 'adjacency_pairs' && (
                    <div className="relation-types-editor">
                        <label>Relation Types</label>
                        <form onSubmit={handleAddRelationType} className="relation-input-row">
                            <input type="text" value={relationTypeInput} onChange={e => setRelationTypeInput(e.target.value)} placeholder="Type a relation and press Enter" />
                            <button type="submit" className="action-button secondary">Add</button>
                        </form>
                        <div className="relation-types-actions">
                            <button className="action-button secondary" onClick={handleSortRelationTypes}>Sort A-Z</button>
                        </div>
                        <div className="relation-types-list">
                            {relationTypes.length === 0 ? (
                                <div className="no-data">No relation types yet.</div>
                            ) : (
                                relationTypes.map((type, index) => (
                                    <div
                                        key={`${type}-${index}`}
                                        className="relation-type-tag"
                                        draggable
                                        onDragStart={() => handleDragStart(index)}
                                        onDragOver={e => e.preventDefault()}
                                        onDrop={() => handleDrop(index)}
                                    >
                                        <span className="tag-handle">⋮⋮</span>
                                        <span className="tag-label">{type}</span>
                                        <button className="tag-remove" onClick={() => handleRemoveRelationType(type)} title="Remove">×</button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Assigned Users */}
            <div className="management-section">
                <div className="section-header">
                    <h2>Assigned Users ({assignedUsers.length})</h2>
                    <button onClick={() => setIsAssigning(!isAssigning)} className="action-button">
                        {isAssigning ? 'Cancel' : '＋ Assign User'}
                    </button>
                </div>
                {isAssigning && (
                    <form onSubmit={handleAssignUser} className="assign-user-form">
                        <select value={userToAssign} onChange={e => setUserToAssign(e.target.value)} required>
                            <option value="">-- Select a user to assign --</option>
                            {availableUsersToAssign.map(user => (
                                <option key={user.id} value={user.id}>{user.username} ({user.is_admin ? 'Admin' : 'User'})</option>
                            ))}
                        </select>
                        <button type="submit" className="action-button">Confirm Assignment</button>
                    </form>
                )}
                <div className="user-list">
                    <table>
                        <thead><tr><th>User ID</th><th>Username</th><th>Actions</th></tr></thead>
                        <tbody>
                            {assignedUsers.map(user => (
                                <tr key={user.id}>
                                    <td>{user.id}</td>
                                    <td>{user.username}</td>
                                    <td>
                                        <button onClick={() => handleRemoveUser(user.id, user.username)} className="action-button delete">Remove</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Chat Rooms */}
            <div className="management-section">
                <div className="section-header"><h2>Chat Rooms ({chatRooms.length})</h2></div>
                <div className="import-csv-section">
                    <h3>Import New Chat Room</h3>
                    <div className="import-csv-row">
                        <input type="file" id="csv-file-input" accept=".csv" onChange={handleFileSelect} />
                        <button onClick={handlePreviewCsv} disabled={!selectedFile || isPreviewing} className="action-button secondary">
                            {isPreviewing ? 'Previewing...' : 'Preview CSV'}
                        </button>
                        <button onClick={handleUploadCsv} disabled={!selectedFile || isUploading} className="action-button">
                            {isUploading ? 'Uploading...' : 'Upload CSV'}
                        </button>
                    </div>
                    {previewError && <ErrorMessage type="warning" title="Preview Failed" message={previewError} />}
                    {importPreview && (
                        <div className="import-preview">
                            <div className="import-preview-header"><strong>Total rows:</strong> {importPreview.total_rows}</div>
                            {importPreview.warnings?.length > 0 && (
                                <div className="import-preview-warnings">
                                    {importPreview.warnings.map((w, i) => <div key={`warn-${i}`} className="preview-warning">{w}</div>)}
                                </div>
                            )}
                            <div className="import-preview-table">
                                <table>
                                    <thead><tr><th>turn_id</th><th>user_id</th><th>turn_text</th><th>reply_to_turn</th></tr></thead>
                                    <tbody>
                                        {importPreview.preview_rows.map((row, i) => (
                                            <tr key={`preview-${i}`}>
                                                <td>{row.turn_id}</td>
                                                <td>{row.user_id}</td>
                                                <td className="preview-text-cell">{row.turn_text}</td>
                                                <td>{row.reply_to_turn || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    {importError && <ErrorMessage type="warning" title="Import Failed" message={importError} />}
                </div>

                {chatRooms.length === 0 ? (
                    <p className="no-data">No chat rooms in this project yet.</p>
                ) : (
                    <div className="chat-rooms-table">
                        <table>
                            <thead>
                                <tr><th>Chat Room</th><th>Status</th><th># Annotators</th><th>Avg. Agreement</th><th>Actions</th></tr>
                            </thead>
                            <tbody>
                                {chatRooms.map(room => {
                                    const analytics = chatRoomAnalytics[room.id] || {};
                                    return (
                                        <tr key={room.id}>
                                            <td>
                                                <strong>{room.name}</strong><br />
                                                <small>Created: {new Date(room.created_at).toLocaleDateString()}</small>
                                            </td>
                                            <td>{getStatusBadge(analytics.status)}</td>
                                            <td>{analytics.completedAnnotators || 0} / {analytics.totalAnnotators || 0}</td>
                                            <td>{analytics.averageAgreement
                                                ? (project.annotation_type === 'adjacency_pairs'
                                                    ? `${analytics.averageAgreement}`
                                                    : `${analytics.averageAgreement}%`)
                                                : 'N/A'}
                                            </td>
                                            <td className="actions-column">
                                                <div className="action-button-group">
                                                    <button onClick={() => handleViewChatRoom(room.id)} className="action-button view-button">View Chat</button>
                                                    <button onClick={() => handleOpenRenameChatRoom(room)} className="action-button">Rename</button>
                                                    <button
                                                        onClick={() => navigate(`/admin/projects/${project.id}/analysis/${room.id}`)}
                                                        className="action-button analyze-button"
                                                        disabled={!chatRoomAnalytics[room.id]?.canAnalyze}
                                                        title={!chatRoomAnalytics[room.id]?.canAnalyze ? 'Not enough data for analysis' : 'Analyze annotations'}
                                                    >
                                                        Analyze
                                                    </button>
                                                    <button
                                                        onClick={() => handleExportChatRoom(room.id, room.name, chatRoomAnalytics[room.id])}
                                                        className="action-button export-button"
                                                        disabled={project.annotation_type !== 'adjacency_pairs' && !chatRoomAnalytics[room.id]?.canAnalyze}
                                                    >
                                                        Export
                                                    </button>
                                                    <button onClick={() => handleDeleteChatRoom(room.id, room.name)} className="action-button delete">Delete</button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {chatRooms.length > 0 && project.annotation_type === 'disentanglement' && (
                    <div className="status-legend">
                        <h4>Status Legend:</h4>
                        <div className="legend-items">
                            <div className="legend-item"><span className="status-badge status-complete">Annotated</span><span className="legend-text">All annotators completed all messages</span></div>
                            <div className="legend-item"><span className="status-badge status-partial">In Progress</span><span className="legend-text">2+ annotators completed, but others still pending</span></div>
                            <div className="legend-item"><span className="status-badge status-insufficient">Insufficient Data</span><span className="legend-text">Less than 2 annotators completed all messages</span></div>
                        </div>
                    </div>
                )}
            </div>

            {/* Export adjacency pairs modal */}
            <Modal isOpen={exportModal.visible} onClose={() => setExportModal({ visible: false, roomId: null, roomName: '' })} title="Export Adjacency Pairs" size="small">
                <div className="export-modal-content">
                    <label>Export scope</label>
                    <select value={exportAnnotatorId} onChange={e => setExportAnnotatorId(e.target.value)}>
                        <option value="all">All users</option>
                        {assignedUsers.map(user => <option key={user.id} value={user.id}>{user.username}</option>)}
                    </select>
                    <button className="action-button export-button" onClick={handleExportAdjacencyPairs}>Export</button>
                </div>
            </Modal>

            {/* Rename chat room modal */}
            <Modal isOpen={editChatRoomModal.open} onClose={() => setEditChatRoomModal({ open: false, roomId: null, name: '' })} title="Rename chat room" size="small">
                <div className="rename-chat-room">
                    <label htmlFor="chat-room-name" className="form-label">Name</label>
                    <input
                        id="chat-room-name"
                        type="text"
                        value={editChatRoomModal.name}
                        onChange={e => setEditChatRoomModal(prev => ({ ...prev, name: e.target.value }))}
                        className="form-input"
                        placeholder="New chat room name"
                        disabled={isRenamingChatRoom}
                    />
                    <div className="modal-actions">
                        <button className="action-button secondary" onClick={() => setEditChatRoomModal({ open: false, roomId: null, name: '' })} disabled={isRenamingChatRoom}>Cancel</button>
                        <button className="action-button" onClick={handleRenameChatRoom} disabled={isRenamingChatRoom}>
                            {isRenamingChatRoom ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            </Modal>

            {/* Danger zone */}
            <div className="management-section danger-zone">
                <h2>Danger Zone</h2>
                <div className="danger-zone-content">
                    <p>Deleting a project is a permanent action. It will remove the project, all its chat rooms, turns, and annotations.</p>
                    <div className="danger-zone-actions">
                        <button onClick={handleDeleteProject} className="action-button delete">Delete This Project</button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminProjectPage;
