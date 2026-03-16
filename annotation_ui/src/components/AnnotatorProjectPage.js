import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { projects, adjacencyPairs } from '../utils/api';
import Modal from './Modal';
import './AnnotatorProjectPage.css';

const AnnotatorProjectPage = () => {
    const { projectId } = useParams();
    const navigate = useNavigate();
    const [project, setProject] = useState(null);
    const [chatRooms, setChatRooms] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [importMessage, setImportMessage] = useState(null);
    const [importError, setImportError] = useState(null);
    const [importRoom, setImportRoom] = useState(null);
    const [importFile, setImportFile] = useState(null);
    const [isImporting, setIsImporting] = useState(false);
    const [showImportModal, setShowImportModal] = useState(false);
    const [showImportChoiceModal, setShowImportChoiceModal] = useState(false);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Fetch project details and chat rooms in parallel
                const [projectData, chatRoomsData] = await Promise.all([
                    projects.getProject(projectId),
                    projects.getChatRooms(projectId)
                ]);
                setProject(projectData);
                setChatRooms(chatRoomsData);
            } catch (err) {
                setError(err.response?.data?.detail || err.message || 'Failed to fetch project data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [projectId]);

    const handleStartImport = (room) => {
        setImportRoom(room);
        setImportFile(null);
        setShowImportModal(true);
    };

    const doImport = async (mode) => {
        if (!importRoom || !importFile) return;
        setIsImporting(true);
        try {
            const result = await adjacencyPairs.importAdjacencyPairs(projectId, importRoom.id, importFile, mode);
            setImportMessage(result?.message || 'Import completed');
        } catch (err) {
            setImportError(err.response?.data?.detail || err.message || 'Failed to import annotations');
        } finally {
            setIsImporting(false);
            setShowImportModal(false);
            setShowImportChoiceModal(false);
            setImportFile(null);
            setImportRoom(null);
        }
    };

    const handleImportClick = async () => {
        if (!importRoom || !importFile) return;
        if (project.annotation_type !== 'adjacency_pairs') return;
        try {
            const existing = await adjacencyPairs.getChatRoomPairs(projectId, importRoom.id);
            if (existing && existing.length > 0) {
                setShowImportChoiceModal(true);
                return;
            }
        } catch (err) {
            setImportError(err.response?.data?.detail || err.message || 'Failed to check existing annotations');
            return;
        }
        doImport('merge');
    };

    if (loading) return <div className="loading">Loading project...</div>;
    if (error) return <div className="error-message">{error}</div>;

    return (
        <div className="annotator-project-page">
            <header className="project-page-header">
                <div className="header-top">
                    <button onClick={() => navigate('/dashboard')} className="back-button">
                        Back to Dashboard
                    </button>
                    <h2>{project.name}</h2>
                </div>
                <p>{project.description}</p>
                <p className="project-meta">
                    Annotation Type: {project.annotation_type === 'adjacency_pairs' ? 'Adjacency Pairs' : 'Chat Disentanglement'}
                </p>
                {project.annotation_type !== 'adjacency_pairs' && (
                    <div className="project-actions">
                        <Link 
                            to={`/projects/${projectId}/my-annotations`}
                            className="my-annotations-button"
                        >
                            View My Annotations
                        </Link>
                    </div>
                )}
            </header>
            
            <h3>Available Chat Rooms for Annotation</h3>
            {importMessage && (
                <div className="import-message">{importMessage}</div>
            )}
            {importError && (
                <div className="import-error">{importError}</div>
            )}
            <div className="chat-room-table-container">
                {chatRooms.length === 0 ? (
                    <div className="empty-state">
                        <p>No chat rooms available in this project.</p>
                    </div>
                ) : (
                    <table className="chat-room-table">
                        <thead>
                            <tr>
                                <th>Chat Room Name</th>
                                <th>Description</th>
                                <th>Created</th>
                                <th>Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {chatRooms.map(room => (
                                <tr key={room.id} className="chat-room-row">
                                    <td className="room-name">
                                        <strong>{room.name}</strong>
                                    </td>
                                    <td className="room-description">
                                        {room.description || 'No description'}
                                    </td>
                                    <td className="room-created">
                                        {new Date(room.created_at).toLocaleDateString()}
                                    </td>
                                    <td className="room-action">
                                        <Link 
                                            to={`/projects/${projectId}/chat-rooms/${room.id}`}
                                            className="annotate-button"
                                        >
                                            Start Annotating
                                        </Link>
                                        {project.annotation_type === 'adjacency_pairs' && (
                                            <button
                                                className="annotate-button import-annotation-button"
                                                onClick={() => handleStartImport(room)}
                                            >
                                                Import annotation
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>
            <Modal
                isOpen={showImportModal}
                onClose={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                    setImportRoom(null);
                }}
                title="Import annotation"
                size="small"
            >
                <div className="adjacency-import-modal">
                    <input
                        type="file"
                        accept=".txt"
                        onChange={(event) => setImportFile(event.target.files?.[0] || null)}
                        disabled={isImporting}
                    />
                    <button
                        className="action-button"
                        onClick={handleImportClick}
                        disabled={isImporting || !importFile}
                    >
                        {isImporting ? 'Importing...' : 'Import'}
                    </button>
                </div>
            </Modal>
            <Modal
                isOpen={showImportChoiceModal}
                onClose={() => setShowImportChoiceModal(false)}
                title="Existing annotations found"
                size="small"
            >
                <div className="adjacency-import-choice">
                    <p>There are already annotations for this chat room.</p>
                    <div className="adjacency-import-choice-actions">
                        <button
                            className="action-button"
                            onClick={() => doImport('merge')}
                            disabled={isImporting}
                        >
                            Keep existing and add new
                        </button>
                        <button
                            className="action-button danger"
                            onClick={() => doImport('replace')}
                            disabled={isImporting}
                        >
                            Replace with imported
                        </button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default AnnotatorProjectPage;


