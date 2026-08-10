export type User = {
  id: number
  email: string
  username: string
  first_name: string
  last_name: string
  is_active: boolean
  role: string
  phone_number: string
}

export type Todo = {
  id: number
  title: string
  description: string
  category: string
  priority: number
  complete: boolean
  due_date: string | null
  created_at: string
  updated_at: string
  owner_id: number
}

export type TodoStats = {
  total: number
  completed: number
  active: number
  overdue: number
  high_priority: number
}

export type LoginResponse = {
  access_token: string
  token_type: string
  user: User
}

export type TodoPayload = {
  title: string
  description: string
  category: string
  priority: number
  complete: boolean
  due_date: string | null
}

type RequestOptions = RequestInit & {
  token?: string | null
}

const defaultHeaders: HeadersInit = {
  Accept: 'application/json',
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers ?? defaultHeaders)

  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }

  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`)
  }

  const response = await fetch(path, {
    ...options,
    headers,
  })

  if (!response.ok) {
    const fallbackMessage = 'Something went wrong'
    let message = fallbackMessage

    try {
      const errorData = await response.json()
      message = errorData.detail ?? errorData.message ?? fallbackMessage
    } catch {
      message = response.statusText || fallbackMessage
    }

    throw new Error(message)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export async function login(username: string, password: string) {
  const body = new URLSearchParams()
  body.set('username', username)
  body.set('password', password)

  return request<LoginResponse>('/auth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  })
}

export async function register(payload: {
  username: string
  email: string
  first_name: string
  last_name: string
  phone_number: string
  password: string
}) {
  return request<User>('/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function fetchCurrentUser(token: string) {
  return request<User>('/auth/me', { token })
}

export async function fetchTodos(
  token: string,
  filters: Record<string, string | number | boolean | undefined>,
) {
  const query = new URLSearchParams()

  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === '' || value === 'all') {
      return
    }

    query.set(key, String(value))
  })

  const suffix = query.toString() ? `?${query.toString()}` : ''
  return request<Todo[]>(`/todos/${suffix}`, { token })
}

export async function fetchTodoStats(token: string) {
  return request<TodoStats>('/todos/stats', { token })
}

export async function fetchTodoCategories(token: string) {
  return request<string[]>('/todos/categories', { token })
}

export async function createTodo(token: string, payload: TodoPayload) {
  return request<Todo>('/todos/todo', {
    method: 'POST',
    token,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function updateTodo(token: string, todoId: number, payload: TodoPayload) {
  return request<Todo>(`/todos/todo/${todoId}`, {
    method: 'PUT',
    token,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function toggleTodo(token: string, todoId: number, complete: boolean) {
  return request<Todo>(`/todos/todo/${todoId}/toggle`, {
    method: 'PATCH',
    token,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ complete }),
  })
}

export async function deleteTodo(token: string, todoId: number) {
  return request<void>(`/todos/todo/${todoId}`, {
    method: 'DELETE',
    token,
  })
}

export async function clearCompletedTodos(token: string) {
  return request<void>('/todos/completed', {
    method: 'DELETE',
    token,
  })
}

export async function updateProfile(
  token: string,
  payload: {
    email: string
    first_name: string
    last_name: string
    phone_number: string
  },
) {
  return request<User>('/users/profile', {
    method: 'PUT',
    token,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}

export async function updatePassword(
  token: string,
  payload: { password: string; new_password: string },
) {
  return request<void>('/users/password', {
    method: 'PUT',
    token,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
}
