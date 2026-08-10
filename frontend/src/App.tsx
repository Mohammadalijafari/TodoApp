import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from 'react-router-dom'
import {
  clearCompletedTodos,
  createTodo,
  deleteTodo,
  fetchCurrentUser,
  fetchTodoCategories,
  fetchTodos,
  fetchTodoStats,
  login,
  register,
  toggleTodo,
  updatePassword,
  updateProfile,
  updateTodo,
  type Todo,
  type TodoPayload,
  type TodoStats,
  type User,
} from './api'
import './App.css'

const TOKEN_KEY = 'todoapp_token'
const USER_KEY = 'todoapp_user'

type AuthContextValue = {
  token: string | null
  user: User | null
  loading: boolean
  loginUser: (username: string, password: string) => Promise<void>
  registerUser: (payload: {
    username: string
    email: string
    first_name: string
    last_name: string
    phone_number: string
    password: string
  }) => Promise<void>
  logout: () => void
  refreshUser: () => Promise<void>
}

const emptyStats: TodoStats = {
  total: 0,
  completed: 0,
  active: 0,
  overdue: 0,
  high_priority: 0,
}

const emptyTodoForm: TodoPayload = {
  title: '',
  description: '',
  category: 'General',
  priority: 3,
  complete: false,
  due_date: null,
}

function formatDate(value: string | null) {
  if (!value) {
    return 'No due date'
  }

  return new Date(value).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function toDateTimeLocal(value: string | null) {
  if (!value) {
    return ''
  }

  const date = new Date(value)
  const offset = date.getTimezoneOffset()
  const localDate = new Date(date.getTime() - offset * 60_000)
  return localDate.toISOString().slice(0, 16)
}

function fromDateTimeLocal(value: string) {
  if (!value) {
    return null
  }

  return new Date(value).toISOString()
}

function priorityLabel(priority: number) {
  if (priority >= 4) {
    return 'High'
  }

  if (priority <= 2) {
    return 'Low'
  }

  return 'Medium'
}

function useAuth(): AuthContextValue {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState<User | null>(() => {
    const storedUser = localStorage.getItem(USER_KEY)
    return storedUser ? (JSON.parse(storedUser) as User) : null
  })
  const [loading, setLoading] = useState(true)

  const persistSession = useCallback((nextToken: string, nextUser: User) => {
    localStorage.setItem(TOKEN_KEY, nextToken)
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
    setToken(nextToken)
    setUser(nextUser)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    setToken(null)
    setUser(null)
  }, [])

  const refreshUser = useCallback(async () => {
    if (!token) {
      setLoading(false)
      return
    }

    try {
      const currentUser = await fetchCurrentUser(token)
      localStorage.setItem(USER_KEY, JSON.stringify(currentUser))
      setUser(currentUser)
    } catch {
      logout()
    } finally {
      setLoading(false)
    }
  }, [logout, token])

  useEffect(() => {
    void refreshUser()
  }, [refreshUser])

  const loginUser = useCallback(
    async (username: string, password: string) => {
      const response = await login(username, password)
      persistSession(response.access_token, response.user)
    },
    [persistSession],
  )

  const registerUser = useCallback(
    async (payload: {
      username: string
      email: string
      first_name: string
      last_name: string
      phone_number: string
      password: string
    }) => {
      await register(payload)
    },
    [],
  )

  return {
    token,
    user,
    loading,
    loginUser,
    registerUser,
    logout,
    refreshUser,
  }
}

function AppShell({
  children,
  user,
  onLogout,
}: {
  children: React.ReactNode
  user: User
  onLogout: () => void
}) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">T</span>
          <div>
            <p className="brand-title">TodoApp</p>
            <p className="brand-subtitle">Stay focused, ship more</p>
          </div>
        </div>
        <nav className="topnav">
          <Link to="/app">Dashboard</Link>
          <Link to="/settings">Settings</Link>
        </nav>
        <div className="user-chip">
          <div>
            <p className="user-name">
              {user.first_name} {user.last_name}
            </p>
            <p className="user-meta">@{user.username}</p>
          </div>
          <button type="button" className="ghost-button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>
      <main className="page-content">{children}</main>
    </div>
  )
}

function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  footer: React.ReactNode
}) {
  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <span className="brand-mark">T</span>
          <div>
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
        </div>
        {children}
        <div className="auth-footer">{footer}</div>
      </div>
    </div>
  )
}

function LoginPage({ auth }: { auth: AuthContextValue }) {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      await auth.loginUser(username, password)
      navigate('/app')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage your tasks in one clean workspace."
      footer={
        <p>
          Need an account? <Link to="/register">Create one</Link>
        </p>
      }
    >
      <form className="stack-form" onSubmit={handleSubmit}>
        <label>
          Username
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  )
}

function RegisterPage({ auth }: { auth: AuthContextValue }) {
  const navigate = useNavigate()
  const [form, setForm] = useState({
    username: '',
    email: '',
    first_name: '',
    last_name: '',
    phone_number: '',
    password: '',
    password2: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')

    if (form.password !== form.password2) {
      setError('Passwords do not match')
      return
    }

    setSubmitting(true)

    try {
      await auth.registerUser({
        username: form.username,
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        phone_number: form.phone_number,
        password: form.password,
      })
      navigate('/login')
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Registration failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start organizing tasks with priorities, due dates, and categories."
      footer={
        <p>
          Already registered? <Link to="/login">Sign in</Link>
        </p>
      }
    >
      <form className="stack-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <label>
            First name
            <input
              value={form.first_name}
              onChange={(event) =>
                setForm((current) => ({ ...current, first_name: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Last name
            <input
              value={form.last_name}
              onChange={(event) =>
                setForm((current) => ({ ...current, last_name: event.target.value }))
              }
              required
            />
          </label>
        </div>
        <div className="form-grid">
          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Username
            <input
              value={form.username}
              onChange={(event) =>
                setForm((current) => ({ ...current, username: event.target.value }))
              }
              required
            />
          </label>
        </div>
        <label>
          Phone number
          <input
            value={form.phone_number}
            onChange={(event) =>
              setForm((current) => ({ ...current, phone_number: event.target.value }))
            }
            required
          />
        </label>
        <div className="form-grid">
          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Confirm password
            <input
              type="password"
              value={form.password2}
              onChange={(event) =>
                setForm((current) => ({ ...current, password2: event.target.value }))
              }
              required
            />
          </label>
        </div>
        {error ? <p className="form-error">{error}</p> : null}
        <button type="submit" className="primary-button" disabled={submitting}>
          {submitting ? 'Creating account...' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  )
}

function DashboardPage({ token }: { token: string }) {
  const [todos, setTodos] = useState<Todo[]>([])
  const [stats, setStats] = useState<TodoStats>(emptyStats)
  const [categories, setCategories] = useState<string[]>(['General'])
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all')
  const [priorityFilter, setPriorityFilter] = useState<'all' | '1' | '2' | '3' | '4' | '5'>(
    'all',
  )
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sort, setSort] = useState('updated_desc')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState<TodoPayload>(emptyTodoForm)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [nextTodos, nextStats, nextCategories] = await Promise.all([
        fetchTodos(token, {
          search: search || undefined,
          complete:
            statusFilter === 'all' ? undefined : statusFilter === 'completed',
          priority: priorityFilter === 'all' ? undefined : Number(priorityFilter),
          category: categoryFilter === 'all' ? undefined : categoryFilter,
          sort,
        }),
        fetchTodoStats(token),
        fetchTodoCategories(token),
      ])

      setTodos(nextTodos)
      setStats(nextStats)
      setCategories(nextCategories.length ? nextCategories : ['General'])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load todos')
    } finally {
      setLoading(false)
    }
  }, [categoryFilter, priorityFilter, search, sort, statusFilter, token])

  useEffect(() => {
    void loadDashboard()
  }, [loadDashboard])

  const resetForm = () => {
    setForm(emptyTodoForm)
    setEditingId(null)
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    try {
      if (editingId) {
        await updateTodo(token, editingId, form)
      } else {
        await createTodo(token, form)
      }

      resetForm()
      await loadDashboard()
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Failed to save todo')
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (todo: Todo) => {
    setEditingId(todo.id)
    setForm({
      title: todo.title,
      description: todo.description,
      category: todo.category,
      priority: todo.priority,
      complete: todo.complete,
      due_date: todo.due_date,
    })
  }

  const handleToggle = async (todo: Todo) => {
    try {
      await toggleTodo(token, todo.id, !todo.complete)
      await loadDashboard()
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : 'Failed to update todo')
    }
  }

  const handleDelete = async (todoId: number) => {
    try {
      await deleteTodo(token, todoId)
      if (editingId === todoId) {
        resetForm()
      }
      await loadDashboard()
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Failed to delete todo')
    }
  }

  const handleClearCompleted = async () => {
    try {
      await clearCompletedTodos(token)
      await loadDashboard()
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : 'Failed to clear completed')
    }
  }

  const categoryOptions = useMemo(() => {
    const merged = new Set(['General', ...categories, form.category])
    return Array.from(merged).sort((left, right) => left.localeCompare(right))
  }, [categories, form.category])

  return (
    <div className="dashboard">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Task workspace</p>
          <h1>Your todos, organized and actionable</h1>
          <p className="hero-copy">
            Capture work, filter by priority, and keep overdue items visible in a focused
            dark workspace.
          </p>
        </div>
        <div className="stats-grid">
          <article className="stat-card">
            <span>Total</span>
            <strong>{stats.total}</strong>
          </article>
          <article className="stat-card">
            <span>Active</span>
            <strong>{stats.active}</strong>
          </article>
          <article className="stat-card">
            <span>Completed</span>
            <strong>{stats.completed}</strong>
          </article>
          <article className="stat-card accent">
            <span>Overdue</span>
            <strong>{stats.overdue}</strong>
          </article>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{editingId ? 'Edit todo' : 'Create todo'}</h2>
            <p>Track title, details, category, priority, and due date.</p>
          </div>
          {editingId ? (
            <button type="button" className="ghost-button" onClick={resetForm}>
              Cancel edit
            </button>
          ) : null}
        </div>
        <form className="todo-form" onSubmit={handleSubmit}>
          <label>
            Title
            <input
              value={form.title}
              onChange={(event) =>
                setForm((current) => ({ ...current, title: event.target.value }))
              }
              required
              minLength={3}
              maxLength={100}
            />
          </label>
          <label>
            Description
            <textarea
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
              rows={3}
              maxLength={500}
            />
          </label>
          <div className="form-grid">
            <label>
              Category
              <input
                list="category-options"
                value={form.category}
                onChange={(event) =>
                  setForm((current) => ({ ...current, category: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Priority
              <select
                value={form.priority}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    priority: Number(event.target.value),
                  }))
                }
              >
                {[1, 2, 3, 4, 5].map((priority) => (
                  <option key={priority} value={priority}>
                    {priority} - {priorityLabel(priority)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Due date
              <input
                type="datetime-local"
                value={toDateTimeLocal(form.due_date)}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    due_date: fromDateTimeLocal(event.target.value),
                  }))
                }
              />
            </label>
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={form.complete}
                onChange={(event) =>
                  setForm((current) => ({ ...current, complete: event.target.checked }))
                }
              />
              Mark as completed
            </label>
          </div>
          <datalist id="category-options">
            {categoryOptions.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
          <button type="submit" className="primary-button" disabled={submitting}>
            {submitting ? 'Saving...' : editingId ? 'Update todo' : 'Add todo'}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Your tasks</h2>
            <p>Search, filter, and sort your list without leaving the page.</p>
          </div>
          <button type="button" className="ghost-button" onClick={() => void handleClearCompleted()}>
            Clear completed
          </button>
        </div>

        <div className="filters-grid">
          <input
            placeholder="Search todos..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(event.target.value as 'all' | 'active' | 'completed')
            }
          >
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={priorityFilter}
            onChange={(event) =>
              setPriorityFilter(event.target.value as 'all' | '1' | '2' | '3' | '4' | '5')
            }
          >
            <option value="all">All priorities</option>
            {[1, 2, 3, 4, 5].map((priority) => (
              <option key={priority} value={priority}>
                Priority {priority}
              </option>
            ))}
          </select>
          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="all">All categories</option>
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <select value={sort} onChange={(event) => setSort(event.target.value)}>
            <option value="updated_desc">Recently updated</option>
            <option value="created_desc">Recently created</option>
            <option value="due_asc">Due date soonest</option>
            <option value="priority_desc">Highest priority</option>
            <option value="title_asc">Title A-Z</option>
          </select>
        </div>

        {error ? <p className="form-error">{error}</p> : null}

        {loading ? (
          <p className="empty-state">Loading todos...</p>
        ) : todos.length === 0 ? (
          <p className="empty-state">No todos match your current filters.</p>
        ) : (
          <div className="todo-list">
            {todos.map((todo) => {
              const isOverdue =
                !todo.complete &&
                todo.due_date &&
                new Date(todo.due_date).getTime() < Date.now()

              return (
                <article
                  key={todo.id}
                  className={`todo-card ${todo.complete ? 'completed' : ''} ${
                    isOverdue ? 'overdue' : ''
                  }`}
                >
                  <div className="todo-card-top">
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={todo.complete}
                        onChange={() => void handleToggle(todo)}
                      />
                      <span>{todo.complete ? 'Completed' : 'Mark complete'}</span>
                    </label>
                    <div className="todo-actions">
                      <button type="button" className="ghost-button" onClick={() => handleEdit(todo)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => void handleDelete(todo.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <h3>{todo.title}</h3>
                  <p className="todo-description">
                    {todo.description || 'No description provided.'}
                  </p>
                  <div className="todo-meta">
                    <span className={`priority-badge priority-${todo.priority}`}>
                      Priority {todo.priority}
                    </span>
                    <span>{todo.category}</span>
                    <span>{formatDate(todo.due_date)}</span>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}

function SettingsPage({
  token,
  user,
  onUserUpdated,
}: {
  token: string
  user: User
  onUserUpdated: () => Promise<void>
}) {
  const [profile, setProfile] = useState({
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    phone_number: user.phone_number,
  })
  const [passwordForm, setPasswordForm] = useState({
    password: '',
    new_password: '',
  })
  const [profileMessage, setProfileMessage] = useState('')
  const [passwordMessage, setPasswordMessage] = useState('')
  const [profileError, setProfileError] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  useEffect(() => {
    setProfile({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      phone_number: user.phone_number,
    })
  }, [user])

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingProfile(true)
    setProfileError('')
    setProfileMessage('')

    try {
      await updateProfile(token, profile)
      await onUserUpdated()
      setProfileMessage('Profile updated successfully.')
    } catch (submitError) {
      setProfileError(
        submitError instanceof Error ? submitError.message : 'Failed to update profile',
      )
    } finally {
      setSavingProfile(false)
    }
  }

  const handlePasswordSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSavingPassword(true)
    setPasswordError('')
    setPasswordMessage('')

    try {
      await updatePassword(token, passwordForm)
      setPasswordForm({ password: '', new_password: '' })
      setPasswordMessage('Password updated successfully.')
    } catch (submitError) {
      setPasswordError(
        submitError instanceof Error ? submitError.message : 'Failed to update password',
      )
    } finally {
      setSavingPassword(false)
    }
  }

  return (
    <div className="settings-page">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Profile</h2>
            <p>Update your account details and contact information.</p>
          </div>
        </div>
        <form className="stack-form" onSubmit={handleProfileSubmit}>
          <div className="form-grid">
            <label>
              First name
              <input
                value={profile.first_name}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, first_name: event.target.value }))
                }
                required
              />
            </label>
            <label>
              Last name
              <input
                value={profile.last_name}
                onChange={(event) =>
                  setProfile((current) => ({ ...current, last_name: event.target.value }))
                }
                required
              />
            </label>
          </div>
          <label>
            Email
            <input
              type="email"
              value={profile.email}
              onChange={(event) =>
                setProfile((current) => ({ ...current, email: event.target.value }))
              }
              required
            />
          </label>
          <label>
            Phone number
            <input
              value={profile.phone_number}
              onChange={(event) =>
                setProfile((current) => ({ ...current, phone_number: event.target.value }))
              }
              required
            />
          </label>
          {profileError ? <p className="form-error">{profileError}</p> : null}
          {profileMessage ? <p className="form-success">{profileMessage}</p> : null}
          <button type="submit" className="primary-button" disabled={savingProfile}>
            {savingProfile ? 'Saving...' : 'Save profile'}
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Security</h2>
            <p>Change your password without leaving the app.</p>
          </div>
        </div>
        <form className="stack-form" onSubmit={handlePasswordSubmit}>
          <label>
            Current password
            <input
              type="password"
              value={passwordForm.password}
              onChange={(event) =>
                setPasswordForm((current) => ({ ...current, password: event.target.value }))
              }
              required
            />
          </label>
          <label>
            New password
            <input
              type="password"
              value={passwordForm.new_password}
              onChange={(event) =>
                setPasswordForm((current) => ({
                  ...current,
                  new_password: event.target.value,
                }))
              }
              required
              minLength={6}
            />
          </label>
          {passwordError ? <p className="form-error">{passwordError}</p> : null}
          {passwordMessage ? <p className="form-success">{passwordMessage}</p> : null}
          <button type="submit" className="primary-button" disabled={savingPassword}>
            {savingPassword ? 'Updating...' : 'Update password'}
          </button>
        </form>
      </section>
    </div>
  )
}

function ProtectedRoute({
  auth,
  children,
}: {
  auth: AuthContextValue
  children: React.ReactNode
}) {
  if (auth.loading) {
    return <p className="empty-state page-loader">Loading your workspace...</p>
  }

  if (!auth.token || !auth.user) {
    return <Navigate to="/login" replace />
  }

  return (
    <AppShell user={auth.user} onLogout={auth.logout}>
      {children}
    </AppShell>
  )
}

function AppRoutes() {
  const auth = useAuth()

  return (
    <Routes>
      <Route path="/" element={<Navigate to={auth.token ? '/app' : '/login'} replace />} />
      <Route
        path="/login"
        element={auth.token && auth.user ? <Navigate to="/app" replace /> : <LoginPage auth={auth} />}
      />
      <Route
        path="/register"
        element={
          auth.token && auth.user ? <Navigate to="/app" replace /> : <RegisterPage auth={auth} />
        }
      />
      <Route
        path="/app"
        element={
          <ProtectedRoute auth={auth}>
            {auth.token ? <DashboardPage token={auth.token} /> : null}
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute auth={auth}>
            {auth.token && auth.user ? (
              <SettingsPage
                token={auth.token}
                user={auth.user}
                onUserUpdated={auth.refreshUser}
              />
            ) : null}
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
