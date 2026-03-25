/**
 * @fileoverview Top-level admin dashboard managing projects and users.
 *
 * The dashboard has two tab views ("Projects" and "Users") toggled by the
 * `view` state variable.  Both data sets are loaded in parallel on mount via
 * `fetchData` (wrapped in `useCallback` to avoid stale-closure issues in the
 * `useEffect` dependency array).
 *
 * Project management:
 * - Inline create form appears in-page (no modal) when `isCreatingProject` is true.
 * - Relation-types input is rendered only for `adjacency_pairs` projects; for
 *   `disentanglement` projects the field is omitted and an empty array is sent.
 * - Clicking a project row navigates to the admin project detail page.
 *
 * User management:
 * - Create and edit flows use the generic `Modal` component.
 * - Delete requires confirmation via `ConfirmationModal`; `isDeleting` tracks
 *   the in-flight deletion to prevent double-submission.
 * - Password in the edit form is optional: if blank, the field is excluded from
 *   the PATCH payload so the existing password is preserved.
 *
 * Error handling:
 * - API errors surface via `warningModal`, a simple "OK" modal reused for all
 *   error conditions, rather than inline error state per operation.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { projects as projectsApi, users as usersApi } from '../utils/api';
import LoadingSpinner from './LoadingSpinner';
import Modal from './Modal';
import ConfirmationModal from './ConfirmationModal';
import './AdminDashboard.css';

/**
 * Admin dashboard page component.
 *
 * Manages the full project and user CRUD lifecycle available to administrators.
 * Uses a tab navigation pattern with shared `warningModal` state for error
 * feedback across all async operations.
 */
const AdminDashboard = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('projects'); // 'projects' or 'users'
  const [newUser, setNewUser] = useState({ username: '', password: '', is_admin: false });
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    annotation_type: '',
    relation_types: []
  });
  const [relationTypesInput, setRelationTypesInput] = useState('');
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState({ show: false, user: null });
  const [isDeleting, setIsDeleting] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editUser, setEditUser] = useState({ id: null, username: '', password: '', is_admin: false });
  const [warningModal, setWarningModal] = useState({ open: false, message: '' });

  /**
   * Load all projects and users in parallel and populate state.
   *
   * Wrapped in `useCallback` so the function reference is stable across
   * renders, making it safe to include in the `useEffect` dependency array
   * and to call directly from mutation handlers to refresh the table.
   */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch both sets of data in parallel for efficiency
      const [projectsResponse, usersResponse] = await Promise.all([
        projectsApi.getProjects(),
        usersApi.getUsers()
      ]);
      setProjects(projectsResponse);
      setUsers(usersResponse);
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
      setWarningModal({
        open: true,
        message: err.response?.data?.detail || 'Failed to load data. Please try again.'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /**
   * Navigate to the admin project detail page for the given project.
   * @param {number} projectId
   */
  const handleProjectClick = (projectId) => {
    navigate(`/admin/projects/${projectId}`);
  };

  /**
   * Submit the new-project form.
   *
   * Strips empty entries from the comma-separated relation-types string and
   * omits the field entirely for non-adjacency-pairs projects.
   *
   * @param {React.FormEvent<HTMLFormElement>} e
   */
  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProject.annotation_type) {
      setWarningModal({
        open: true,
        message: 'Please select a project type.'
      });
      return;
    }
    try {
      const cleanedRelationTypes = relationTypesInput
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const payload = {
        ...newProject,
        relation_types: newProject.annotation_type === 'adjacency_pairs' ? cleanedRelationTypes : []
      };
      await projectsApi.createProject(payload);
      setNewProject({ name: '', description: '', annotation_type: '', relation_types: [] });
      setRelationTypesInput('');
      setIsCreatingProject(false);
      fetchData(); // Refresh data to show the new project
    } catch (error) {
      console.error("Failed to create project:", error);
      setWarningModal({
        open: true,
        message: error.response?.data?.detail || 'Failed to create project'
      });
    }
  };

  /**
   * Submit the create-user form and refresh the user list on success.
   * @param {React.FormEvent<HTMLFormElement>} e
   */
  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await usersApi.createUser(newUser);
      setNewUser({ username: '', password: '', is_admin: false });
      setShowCreateUserModal(false);
      fetchData(); // Refresh all data
    } catch (error) {
      console.error("Failed to create user:", error);
      setWarningModal({
        open: true,
        message: error.response?.data?.detail || 'Failed to create user'
      });
    }
  };

  /**
   * Open the delete-confirmation modal for the selected user.
   * @param {Object} user - User record to be deleted.
   */
  const handleDeleteUser = async (user) => {
    setDeleteConfirmation({ show: true, user });
  };

  /**
   * Populate the edit-user form with the selected user's current data and
   * open the edit modal.  Password is intentionally left blank so it is only
   * updated if the admin explicitly enters a new value.
   * @param {Object} user - User record to edit.
   */
  const handleEditUser = (user) => {
    setEditUser({ id: user.id, username: user.username, password: '', is_admin: user.is_admin });
    setShowEditUserModal(true);
  };

  /**
   * Submit the edit-user form.  The password field is only included in the
   * PATCH payload when the admin enters a non-empty value.
   * @param {React.FormEvent<HTMLFormElement>} e
   */
  const handleUpdateUser = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        username: editUser.username,
        is_admin: editUser.is_admin
      };
      if (editUser.password) {
        payload.password = editUser.password;
      }
      await usersApi.updateUser(editUser.id, payload);
      setShowEditUserModal(false);
      setEditUser({ id: null, username: '', password: '', is_admin: false });
      fetchData();
    } catch (error) {
      console.error("Failed to update user:", error);
      setWarningModal({
        open: true,
        message: error.response?.data?.detail || 'Failed to update user'
      });
    }
  };

  /**
   * Execute the confirmed user deletion.  Sets `isDeleting` while the request
   * is in flight so the confirmation modal can disable its buttons.
   */
  const confirmDeleteUser = async () => {
    if (!deleteConfirmation.user) return;
    
    setIsDeleting(true);
    try {
      await usersApi.deleteUser(deleteConfirmation.user.id);
      setDeleteConfirmation({ show: false, user: null });
      fetchData(); // Refresh all data
    } catch (error) {
      console.error("Error deleting user:", error);
      setWarningModal({
        open: true,
        message: error.response?.data?.detail || 'Failed to delete user'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (loading) {
    return <LoadingSpinner message="Loading dashboard..." size="large" />;
  }

  return (
    <div className="admin-dashboard">
      <header className="dashboard-header">
        <h1>Admin Dashboard</h1>
      </header>

      <div className="tab-navigation">
        <button
          className={`tab-button ${view === 'projects' ? 'active' : ''}`}
          onClick={() => setView('projects')}
        >
          Projects
        </button>
        <button
          className={`tab-button ${view === 'users' ? 'active' : ''}`}
          onClick={() => setView('users')}
        >
          Users
        </button>
      </div>

      {view === 'projects' ? (
        <div>
          <div className="view-header">
            <h2>Projects ({projects.length})</h2>
            <button 
              className="secondary"
              onClick={() => setIsCreatingProject(!isCreatingProject)}
            >
              {isCreatingProject ? 'Cancel' : '＋ Create Project'}
            </button>
          </div>

          {isCreatingProject && (
            <div className="form-container">
              <h3>New Project</h3>
              <form onSubmit={handleCreateProject}>
                <input
                  type="text"
                  placeholder="Project Name"
                  value={newProject.name}
                  onChange={(e) => setNewProject({ ...newProject, name: e.target.value })}
                  required
                />
                <select
                  value={newProject.annotation_type}
                  onChange={(e) => setNewProject({ ...newProject, annotation_type: e.target.value })}
                  required
                >
                  <option value="" disabled>Select project type</option>
                  <option value="disentanglement">Chat Disentanglement</option>
                  <option value="adjacency_pairs">Adjacency Pairs</option>
                </select>
                <textarea
                  placeholder="A brief description of the project"
                  value={newProject.description}
                  onChange={(e) => setNewProject({ ...newProject, description: e.target.value })}
                />
                {newProject.annotation_type === 'adjacency_pairs' && (
                  <input
                    type="text"
                    placeholder="Relation types (comma-separated, e.g. Question-Answer, Greeting-Response)"
                    value={relationTypesInput}
                    onChange={(e) => setRelationTypesInput(e.target.value)}
                    required
                  />
                )}
                <button type="submit">Create Project</button>
              </form>
            </div>
          )}

          {projects.length > 0 ? (
            <div className="projects-table-container">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Created At</th>
                    <th>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.map(project => (
                    <tr key={project.id} onClick={() => handleProjectClick(project.id)} className="project-row">
                      <td>{project.name}</td>
                      <td>{new Date(project.created_at).toLocaleDateString()}</td>
                      <td>{project.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>No projects found. Create one to get started!</p>
          )}
        </div>
      ) : (
        <div>
          <div className="view-header">
            <h2>Users ({users.length})</h2>
            <button 
              className="secondary"
              onClick={() => setShowCreateUserModal(true)}
            >
              ＋ Create User
            </button>
          </div>

          <div className="users-table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Username</th>
                  <th>Role</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(user => (
                  <tr key={user.id}>
                    <td>{user.id}</td>
                    <td>{user.username}</td>
                    <td>
                      <span className={`role-badge ${user.is_admin ? 'admin' : 'user'}`}>
                        {user.is_admin ? 'Admin' : 'User'}
                      </span>
                    </td>
                    <td>
                      <button 
                        onClick={() => handleEditUser(user)} 
                        className="secondary-button"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => handleDeleteUser(user)} 
                        className="delete-button"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Create User Modal */}
          <Modal
            isOpen={showCreateUserModal}
            onClose={() => setShowCreateUserModal(false)}
            title="Create New User"
            size="medium"
          >
            <form onSubmit={handleCreateUser}>
              <div className="form-field">
                <label htmlFor="username">Username</label>
                <input
                  id="username"
                  type="text"
                  placeholder="username"
                  value={newUser.username}
                  onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                  minLength={3}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="password">Password</label>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  required
                />
              </div>
              <div className="form-field checkbox-field">
                <input
                  id="is_admin"
                  type="checkbox"
                  checked={newUser.is_admin}
                  onChange={(e) => setNewUser({ ...newUser, is_admin: e.target.checked })}
                />
                <label htmlFor="is_admin">Admin User</label>
              </div>
              <div className="modal-actions">
                <button 
                  type="button" 
                  className="secondary-button"
                  onClick={() => setShowCreateUserModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">Create User</button>
              </div>
            </form>
          </Modal>

          <Modal
            isOpen={showEditUserModal}
            onClose={() => setShowEditUserModal(false)}
            title="Edit User"
            size="medium"
          >
            <form onSubmit={handleUpdateUser}>
              <div className="form-field">
                <label htmlFor="edit-username">Username</label>
                <input
                  id="edit-username"
                  type="text"
                  placeholder="username"
                  value={editUser.username}
                  onChange={(e) => setEditUser({ ...editUser, username: e.target.value })}
                  minLength={3}
                  required
                />
              </div>
              <div className="form-field">
                <label htmlFor="edit-password">New Password (optional)</label>
                <input
                  id="edit-password"
                  type="password"
                  placeholder="Leave blank to keep current password"
                  value={editUser.password}
                  onChange={(e) => setEditUser({ ...editUser, password: e.target.value })}
                />
              </div>
              <div className="form-field checkbox-field">
                <input
                  id="edit-is-admin"
                  type="checkbox"
                  checked={editUser.is_admin}
                  onChange={(e) => setEditUser({ ...editUser, is_admin: e.target.checked })}
                />
                <label htmlFor="edit-is-admin">Admin User</label>
              </div>
              <div className="modal-actions">
                <button 
                  type="button" 
                  className="secondary-button"
                  onClick={() => setShowEditUserModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="primary-button">Save</button>
              </div>
            </form>
          </Modal>

          {/* Delete Confirmation Modal */}
          <ConfirmationModal
            isOpen={deleteConfirmation.show}
            onClose={() => setDeleteConfirmation({ show: false, user: null })}
            onConfirm={confirmDeleteUser}
            title="Delete User"
            message={`Are you sure you want to delete the user "${deleteConfirmation.user?.username}"? This action cannot be undone.`}
            confirmText="Delete"
            type="danger"
            isLoading={isDeleting}
          />
        </div>
      )}

      <Modal
        isOpen={warningModal.open}
        onClose={() => setWarningModal({ open: false, message: '' })}
        title="Warning"
        size="small"
      >
        <p>{warningModal.message}</p>
        <div className="modal-actions">
          <button
            className="primary-button"
            onClick={() => setWarningModal({ open: false, message: '' })}
          >
            OK
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default AdminDashboard; 
