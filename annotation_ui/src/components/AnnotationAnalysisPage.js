import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { annotations as annotationsApi, projects as projectsApi } from '../utils/api';
import IAAMatrix from './IAAMatrix';
import './AnnotationAnalysisPage.css';

const VIEW_MODES = ['combined', 'link_f1', 'type_accuracy'];

const VIEW_LABELS = {
    combined:      'Combined IAA',
    link_f1:       'Link F1',
    type_accuracy: 'Type Accuracy',
};

const VIEW_DESCRIPTIONS = {
    combined:      (alpha) => `LinkF1 × (α + (1−α) × TypeAcc)  |  α = ${alpha}`,
    link_f1:       () => '2 × |agreed links| / (|links A| + |links B|) — ignores relation type',
    type_accuracy: () => 'Proportion of agreed links where both annotators chose the same relation type',
};

const AnnotationAnalysisPage = () => {
    const { projectId, roomId } = useParams();
    const navigate = useNavigate();

    const [project, setProject] = useState(null);
    const [chatRoom, setChatRoom] = useState(null);
    const [iaaData, setIaaData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Adj-pairs specific state
    const [viewMode, setViewMode] = useState('combined'); // 'combined' | 'link_f1' | 'type_accuracy'
    const [alphaInput, setAlphaInput] = useState('');
    const [isSavingAlpha, setIsSavingAlpha] = useState(false);
    const [alphaError, setAlphaError] = useState(null);

    const fetchIAA = async (alpha = null) => {
        const iaaAnalysis = await annotationsApi.getChatRoomIAA(roomId, alpha);
        setIaaData(iaaAnalysis);
        return iaaAnalysis;
    };

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);
            try {
                const [projectData, chatRoomData, iaaAnalysis] = await Promise.all([
                    projectsApi.getProject(projectId),
                    projectsApi.getChatRoom(projectId, roomId),
                    annotationsApi.getChatRoomIAA(roomId),
                ]);
                setProject(projectData);
                setChatRoom(chatRoomData);
                setIaaData(iaaAnalysis);
                setAlphaInput(String(iaaAnalysis.iaa_alpha ?? projectData.iaa_alpha ?? 0.8));
            } catch (err) {
                console.error('Failed to fetch analysis data:', err);
                setError(err.response?.data?.detail || 'Failed to load analysis data');
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [projectId, roomId]);

    const handleSaveAlpha = async (e) => {
        e.preventDefault();
        const val = parseFloat(alphaInput);
        if (isNaN(val) || val < 0 || val > 1) {
            setAlphaError('α must be between 0.0 and 1.0');
            return;
        }
        setAlphaError(null);
        setIsSavingAlpha(true);
        try {
            await projectsApi.updateProject(projectId, { iaa_alpha: val });
            await fetchIAA(); // re-fetch with the now-saved alpha
        } catch (err) {
            setAlphaError(err.response?.data?.detail || 'Failed to save α');
        } finally {
            setIsSavingAlpha(false);
        }
    };

    const cycleViewMode = () => {
        const idx = VIEW_MODES.indexOf(viewMode);
        setViewMode(VIEW_MODES[(idx + 1) % VIEW_MODES.length]);
    };

    const getStatusInfo = (status) => {
        const statusMap = {
            Complete:      { class: 'status-complete',     title: 'Analysis Complete',     description: 'All assigned annotators have completed their work' },
            Partial:       { class: 'status-partial',      title: 'Partial Analysis',      description: 'Some annotators have completed their work, analysis based on completed subset' },
            NotEnoughData: { class: 'status-insufficient', title: 'Insufficient Data',     description: 'Not enough completed annotations for analysis (need at least 2 annotators)' },
            Error:         { class: 'status-error',        title: 'Analysis Error',        description: 'An error occurred while calculating the analysis' },
        };
        return statusMap[status] || { class: 'status-unknown', title: 'Unknown Status', description: 'Unable to determine analysis status' };
    };

    const isAdjPairs = iaaData?.annotation_type === 'adjacency_pairs';

    const calculateAverageAgreement = () => {
        if (isAdjPairs) {
            if (!iaaData?.pairwise_adj_iaa?.length) return null;
            const field = viewMode === 'link_f1' ? 'link_f1' : viewMode === 'type_accuracy' ? 'type_accuracy' : 'combined_iaa';
            const sum = iaaData.pairwise_adj_iaa.reduce((acc, p) => acc + p[field], 0);
            return (sum / iaaData.pairwise_adj_iaa.length).toFixed(3);
        }
        if (!iaaData?.pairwise_accuracies?.length) return null;
        const sum = iaaData.pairwise_accuracies.reduce((acc, p) => acc + p.accuracy, 0);
        return (sum / iaaData.pairwise_accuracies.length).toFixed(1);
    };

    // Build the accuracy list for IAAMatrix based on current viewMode
    const buildAdjPairsAccuracies = () => {
        if (!iaaData?.pairwise_adj_iaa) return [];
        return iaaData.pairwise_adj_iaa.map(p => {
            const rawValue = viewMode === 'link_f1'
                ? p.link_f1
                : viewMode === 'type_accuracy'
                    ? p.type_accuracy
                    : p.combined_iaa;
            return {
                annotator_1_id: p.annotator_1_id,
                annotator_2_id: p.annotator_2_id,
                annotator_1_username: p.annotator_1_username,
                annotator_2_username: p.annotator_2_username,
                accuracy: rawValue * 100,
                // kept for tooltip (always shows all three)
                _link_f1: p.link_f1,
                _type_accuracy: p.type_accuracy,
                _combined_iaa: p.combined_iaa,
                _agreed_links: p.agreed_links_count,
                _alpha: p.iaa_alpha,
            };
        });
    };

    if (loading) return <div className="loading-container">Loading analysis...</div>;

    if (error) {
        return (
            <div className="error-container">
                <h2>Error Loading Analysis</h2>
                <p>{error}</p>
                <button onClick={() => navigate(`/admin/projects/${projectId}`)} className="action-button">
                    ← Back to Project
                </button>
            </div>
        );
    }

    if (!iaaData) return <div>No analysis data available.</div>;

    const statusInfo = getStatusInfo(iaaData.analysis_status);
    const averageAgreement = calculateAverageAgreement();
    const adjPairsAccuracies = isAdjPairs ? buildAdjPairsAccuracies() : [];
    const hasMatrix = isAdjPairs ? adjPairsAccuracies.length > 0 : iaaData.pairwise_accuracies.length > 0;

    return (
        <div className="annotation-analysis-page">
            <header className="page-header">
                <button onClick={() => navigate(`/admin/projects/${projectId}`)} className="back-button">
                    ← Back to Project
                </button>
                <div className="header-content">
                    <h1>Inter-Annotator Agreement Analysis</h1>
                    <div className="breadcrumb">
                        <span>{project?.name}</span> → <span>{chatRoom?.name || iaaData.chat_room_name}</span>
                    </div>
                </div>
            </header>

            {/* Status Banner */}
            <div className={`status-banner ${statusInfo.class}`}>
                <div className="status-content">
                    <h2>{statusInfo.title}</h2>
                    <p>{statusInfo.description}</p>
                    {iaaData.analysis_status === 'Partial' && (
                        <div className="annotator-status">
                            <div className="annotator-group">
                                <strong>Completed ({iaaData.completed_annotators.length}):</strong>
                                <ul>{iaaData.completed_annotators.map(a => <li key={a.id}>{a.username}</li>)}</ul>
                            </div>
                            <div className="annotator-group">
                                <strong>Pending ({iaaData.pending_annotators.length}):</strong>
                                <ul>{iaaData.pending_annotators.map(a => <li key={a.id}>{a.username}</li>)}</ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Statistics */}
            <div className="statistics-section">
                <h2>Chat Room Statistics</h2>
                <div className="stats-grid">
                    <div className="stat-card">
                        <h3>Chat Room</h3>
                        <p>{iaaData.chat_room_name}</p>
                    </div>
                    <div className="stat-card">
                        <h3>Total Turns</h3>
                        <p>{iaaData.message_count}</p>
                    </div>
                    <div className="stat-card">
                        <h3>Annotators</h3>
                        <p>{iaaData.completed_annotators.length} / {iaaData.total_annotators_assigned}</p>
                    </div>
                    <div className="stat-card">
                        <h3>Average {isAdjPairs ? VIEW_LABELS[viewMode] : 'Agreement'}</h3>
                        <p>{averageAgreement
                            ? (isAdjPairs ? averageAgreement : `${averageAgreement}%`)
                            : 'N/A'}
                        </p>
                        {isAdjPairs && <small>{VIEW_LABELS[viewMode]}</small>}
                    </div>
                </div>
            </div>

            {/* Alpha editor — adj_pairs only */}
            {isAdjPairs && (
                <div className="alpha-editor-section">
                    <h2>IAA Parameters</h2>
                    <form onSubmit={handleSaveAlpha} className="alpha-editor-form">
                        <div className="alpha-editor-row">
                            <label htmlFor="alpha-input">
                                <strong>α (link weight)</strong>
                                <span className="alpha-hint">
                                    Controls how much link structure vs relation type agreement matters.
                                    Combined IAA = LinkF1 × (α + (1−α) × TypeAcc)
                                </span>
                            </label>
                            <div className="alpha-controls">
                                <input
                                    id="alpha-input"
                                    type="number"
                                    min="0" max="1" step="0.01"
                                    value={alphaInput}
                                    onChange={e => setAlphaInput(e.target.value)}
                                    className="alpha-input"
                                />
                                <button type="submit" className="action-button" disabled={isSavingAlpha}>
                                    {isSavingAlpha ? 'Saving…' : 'Save & Recompute'}
                                </button>
                            </div>
                        </div>
                        {alphaError && <p className="alpha-error">{alphaError}</p>}
                    </form>
                </div>
            )}

            {/* Matrix */}
            {hasMatrix && (
                <div className="matrix-section">
                    <div className="matrix-section-header">
                        <div>
                            <h2>
                                {isAdjPairs ? VIEW_LABELS[viewMode] : 'One-to-One Agreement'} Matrix
                            </h2>
                            <p className="matrix-description">
                                {isAdjPairs
                                    ? VIEW_DESCRIPTIONS[viewMode](iaaData.iaa_alpha)
                                    : 'Pairwise agreement scores between annotators. Higher percentages indicate better agreement.'}
                            </p>
                        </div>
                        {isAdjPairs && (
                            <button className="view-cycle-button" onClick={cycleViewMode} title="Cycle view">
                                {VIEW_LABELS[VIEW_MODES[(VIEW_MODES.indexOf(viewMode) + 1) % VIEW_MODES.length]]} →
                            </button>
                        )}
                    </div>
                    <IAAMatrix
                        pairwiseAccuracies={isAdjPairs ? adjPairsAccuracies : iaaData.pairwise_accuracies}
                        annotators={iaaData.completed_annotators}
                        isAdjPairs={isAdjPairs}
                        viewMode={viewMode}
                    />
                </div>
            )}

            {/* No data */}
            {!hasMatrix && (
                <div className="no-analysis">
                    <h2>No Analysis Available</h2>
                    <p>
                        Inter-annotator agreement analysis requires at least 2 annotators to have
                        {isAdjPairs ? ' marked this chat room as completed.' : ' annotated all turns.'}
                    </p>
                    <div className="current-status">
                        <p><strong>Current Status:</strong></p>
                        <p>• {iaaData.completed_annotators.length} annotator(s) completed</p>
                        <p>• {iaaData.pending_annotators.length} annotator(s) pending</p>
                        <p>• {iaaData.message_count} total turns</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnnotationAnalysisPage;
