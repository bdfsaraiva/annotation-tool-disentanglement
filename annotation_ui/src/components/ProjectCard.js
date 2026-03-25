/**
 * @fileoverview Card widget representing a single project in a dashboard grid.
 *
 * The card is rendered as a React Router `<Link>` so the entire surface area is
 * clickable.  The destination URL is role-aware: admins are routed to the admin
 * project view while annotators land on the annotator project view.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './ProjectCard.css';

/**
 * Clickable project summary card used in the admin and annotator dashboards.
 *
 * @param {Object} props
 * @param {Object} props.project - Project data object from the API.
 * @param {number} props.project.id - Unique project identifier used to build
 *   the navigation URL.
 * @param {string} props.project.name - Human-readable project title.
 * @param {string} props.project.description - Optional freeform description
 *   shown beneath the title.
 * @param {string} props.project.created_at - ISO-8601 creation timestamp;
 *   converted to a locale date string for display.
 */
function ProjectCard({ project }) {
    const createdDate = new Date(project.created_at).toLocaleDateString();
    const { currentUser } = useAuth();

    // Route admins to the admin project view; annotators to the annotator view.
    const projectUrl = currentUser?.is_admin
        ? `/admin/projects/${project.id}`
        : `/projects/${project.id}`;

    return (
        <Link to={projectUrl} className="project-card-link">
            <div className="project-card">
                <div className="header">
                    <h3>{project.name}</h3>
                </div>
                <p className="description">{project.description}</p>
                <div className="stats">
                    <div className="stat-item">
                        <div className="stat-label">CHAT ROOMS</div>
                    </div>
                    <div className="stat-item">
                        <div className="stat-label">ASSIGNED USERS</div>
                    </div>
                </div>
                <div className="footer">
                    Created: {createdDate}
                </div>
            </div>
        </Link>
    );
}

export default ProjectCard; 