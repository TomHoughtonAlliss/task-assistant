import { z } from "zod";
import type {
  CreateTaskInput,
  RescheduleTaskInput,
  SnoozeTaskInput,
  TaskProvider,
  TaskProviderCapabilities,
  TaskProviderError,
  TaskProviderResult,
  UpdateTaskInput,
} from "../../../application/task-provider/index.js";
import type { Task, TaskDueDate, TaskId, TaskPriority } from "../../../domain/index.js";
import {
  todoistProjectPageSchema,
  todoistProjectSchema,
  todoistTaskPageSchema,
  todoistTaskSchema,
  type TodoistTask,
} from "./types.js";

/**
 * Configuration needed to talk to the Todoist HTTP API.
 */
export interface TodoistTaskProviderConfig {
  /**
   * Personal API token or OAuth access token with task read/write scopes.
   */
  apiToken: string;
  /**
   * Base URL for the Todoist API.
   */
  apiBaseUrl: string;
}

/**
 * Function signature used to issue HTTP requests for the Todoist adapter.
 */
export type TodoistFetch = typeof fetch;

/**
 * Internal HTTP failure shape captured before conversion into an application-facing provider error.
 */
interface TodoistHttpError {
  status: number;
  body: unknown;
}

/**
 * Supported request options for Todoist HTTP calls.
 */
interface TodoistRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  body?: Record<string, unknown>;
}

/**
 * Cursor-paginated Todoist response shape used by the generic list helper.
 */
interface TodoistPage<TItem> {
  results: TItem[];
  next_cursor?: string | null | undefined;
}

/**
 * Todoist-backed task provider implementation using the official HTTP API.
 */
export class TodoistTaskProvider implements TaskProvider {
  /**
   * Stable provider name used by runtime wiring and logs.
   */
  public readonly name = "todoist" as const;

  /**
   * Provider capabilities supported by the Todoist HTTP adapter.
   */
  public readonly capabilities: TaskProviderCapabilities = {
    listIncompleteTasks: true,
    getTaskById: true,
    createTask: true,
    updateTask: true,
    rescheduleTask: true,
    completeTask: true,
    deleteTask: true,
    snoozeTask: false,
  };

  private readonly apiToken: string;
  private readonly apiBaseUrl: string;
  private readonly fetchImplementation: TodoistFetch;

  /**
   * Creates a Todoist task provider using plain HTTP requests.
   */
  public constructor(
    config: TodoistTaskProviderConfig,
    fetchImplementation: TodoistFetch = fetch,
  ) {
    this.apiToken = config.apiToken;
    this.apiBaseUrl = config.apiBaseUrl.replace(/\/+$/, "");
    this.fetchImplementation = fetchImplementation;
  }

  /**
   * Returns all active Todoist tasks mapped into the shared domain task model.
   */
  public async listIncompleteTasks(): Promise<TaskProviderResult<Task[]>> {
    try {
      const [taskPages, projectPages] = await Promise.all([
        this.listPaginated("/tasks", todoistTaskPageSchema),
        this.listPaginated("/projects", todoistProjectPageSchema),
      ]);
      const projectNameById = new Map(
        projectPages.map((project): [string, string] => [project.id, project.name]),
      );

      return {
        ok: true,
        value: taskPages.map((task) => this.mapTask(task, projectNameById)),
      };
    } catch (error: unknown) {
      return {
        ok: false,
        error: this.toProviderError(error, "Unable to list Todoist tasks"),
      };
    }
  }

  /**
   * Reads one active task by identifier and maps it into the shared domain model.
   */
  public async getTaskById(taskId: TaskId): Promise<TaskProviderResult<Task | null>> {
    try {
      const task = await this.requestJson(`/tasks/${encodeURIComponent(taskId)}`, todoistTaskSchema);
      const projectName = await this.getProjectNameById(task.project_id);

      return {
        ok: true,
        value: this.mapTask(task, new Map([[task.project_id, projectName]])),
      };
    } catch (error: unknown) {
      if (this.isTodoistHttpError(error) && error.status === 404) {
        return {
          ok: true,
          value: null,
        };
      }

      return {
        ok: false,
        error: this.toProviderError(error, `Unable to load Todoist task ${taskId}`),
      };
    }
  }

  /**
   * Creates a Todoist task and returns the mapped domain task.
   */
  public async createTask(input: CreateTaskInput): Promise<TaskProviderResult<Task>> {
    try {
      const payload = this.buildCreateOrReschedulePayload(input);

      if (input.projectName) {
        payload.project_id = await this.resolveProjectIdByName(input.projectName);
      }

      if (input.priority) {
        payload.priority = this.mapPriorityToTodoist(input.priority);
      }

      const task = await this.requestJson("/tasks", todoistTaskSchema, {
        method: "POST",
        body: payload,
      });
      const projectNameById = await this.getProjectNameMapForTask(task);

      return {
        ok: true,
        value: this.mapTask(task, projectNameById),
      };
    } catch (error: unknown) {
      return {
        ok: false,
        error: this.toProviderError(error, "Unable to create Todoist task"),
      };
    }
  }

  /**
   * Updates supported non-destructive Todoist task fields and returns the latest mapped task.
   */
  public async updateTask(input: UpdateTaskInput): Promise<TaskProviderResult<Task>> {
    try {
      const updatePayload: Record<string, unknown> = {};

      if (input.title !== undefined) {
        updatePayload.content = input.title;
      }
      if (input.description !== undefined) {
        updatePayload.description = input.description;
      }
      if (input.priority !== undefined) {
        updatePayload.priority = this.mapPriorityToTodoist(input.priority);
      }

      if (Object.keys(updatePayload).length > 0) {
        await this.requestJson(`/tasks/${encodeURIComponent(input.taskId)}`, todoistTaskSchema, {
          method: "POST",
          body: updatePayload,
        });
      }

      if (input.projectName !== undefined) {
        const projectId = await this.resolveProjectIdByName(input.projectName);
        await this.requestJson(`/tasks/${encodeURIComponent(input.taskId)}/move`, todoistTaskSchema, {
          method: "POST",
          body: {
            project_id: projectId,
          },
        });
      }

      return this.requireTask(input.taskId, "Unable to load Todoist task after update");
    } catch (error: unknown) {
      return {
        ok: false,
        error: this.toProviderError(error, `Unable to update Todoist task ${input.taskId}`),
      };
    }
  }

  /**
   * Reschedules a Todoist task to a new due date and returns the latest mapped task.
   */
  public async rescheduleTask(
    input: RescheduleTaskInput,
  ): Promise<TaskProviderResult<Task>> {
    try {
      await this.requestJson(`/tasks/${encodeURIComponent(input.taskId)}`, todoistTaskSchema, {
        method: "POST",
        body: this.mapDueDateForWrite(input.dueDate),
      });

      return this.requireTask(
        input.taskId,
        "Unable to load Todoist task after rescheduling",
      );
    } catch (error: unknown) {
      return {
        ok: false,
        error: this.toProviderError(
          error,
          `Unable to reschedule Todoist task ${input.taskId}`,
        ),
      };
    }
  }

  /**
   * Completes a Todoist task and returns the last active mapped state observed before closing it.
   */
  public async completeTask(taskId: TaskId): Promise<TaskProviderResult<Task>> {
    try {
      const existingTask = await this.requireTask(
        taskId,
        `Unable to load Todoist task ${taskId} before completion`,
      );

      if (!existingTask.ok) {
        return existingTask;
      }

      await this.requestVoid(`/tasks/${encodeURIComponent(taskId)}/close`, {
        method: "POST",
      });

      return existingTask;
    } catch (error: unknown) {
      return {
        ok: false,
        error: this.toProviderError(error, `Unable to complete Todoist task ${taskId}`),
      };
    }
  }

  /**
   * Deletes a Todoist task.
   */
  public async deleteTask(taskId: TaskId): Promise<TaskProviderResult<void>> {
    try {
      await this.requestVoid(`/tasks/${encodeURIComponent(taskId)}`, {
        method: "DELETE",
      });

      return {
        ok: true,
        value: undefined,
      };
    } catch (error: unknown) {
      return {
        ok: false,
        error: this.toProviderError(error, `Unable to delete Todoist task ${taskId}`),
      };
    }
  }

  /**
   * Todoist does not expose a direct snooze capability through this provider boundary.
   */
  public async snoozeTask(
    input: SnoozeTaskInput,
  ): Promise<TaskProviderResult<Task>> {
    void input;

    return {
      ok: false,
      error: {
        code: "unsupported_operation",
        message: "TodoistTaskProvider does not support direct snooze operations",
        retriable: false,
      },
    };
  }

  /**
   * Requests a single JSON response and validates it with the provided schema.
   */
  private async requestJson<T>(
    path: string,
    schema: z.ZodType<T>,
    options: TodoistRequestOptions = {},
  ): Promise<T> {
    const requestInit = this.buildRequestInit(options);
    const response = await this.fetchImplementation(this.buildUrl(path), {
      method: options.method ?? "GET",
      headers: requestInit.headers,
      ...(requestInit.body ? { body: requestInit.body } : {}),
    });
    const body = await this.parseResponseBody(response);

    if (!response.ok) {
      throw {
        status: response.status,
        body,
      } satisfies TodoistHttpError;
    }

    return schema.parse(body);
  }

  /**
   * Requests an endpoint that returns no meaningful JSON body.
   */
  private async requestVoid(
    path: string,
    options: TodoistRequestOptions = {},
  ): Promise<void> {
    const requestInit = this.buildRequestInit(options);
    const response = await this.fetchImplementation(this.buildUrl(path), {
      method: options.method ?? "GET",
      headers: requestInit.headers,
      ...(requestInit.body ? { body: requestInit.body } : {}),
    });
    const body = await this.parseResponseBody(response);

    if (!response.ok) {
      throw {
        status: response.status,
        body,
      } satisfies TodoistHttpError;
    }
  }

  /**
   * Loads all pages from a cursor-paginated Todoist endpoint.
   */
  private async listPaginated<
    TSchema extends z.ZodType<TodoistPage<unknown>>,
  >(
    path: string,
    schema: TSchema,
  ): Promise<z.output<TSchema>["results"]> {
    const results: z.output<TSchema>["results"] = [];
    let cursor: string | null = null;

    do {
      const search = new URLSearchParams({
        limit: "200",
      });

      if (cursor) {
        search.set("cursor", cursor);
      }

      const page = await this.requestJson(`${path}?${search.toString()}`, schema);
      results.push(...page.results);
      cursor = page.next_cursor ?? null;
    } while (cursor);

    return results;
  }

  /**
   * Maps one Todoist task object into the shared domain task model.
   */
  private mapTask(
    task: TodoistTask,
    projectNameById: ReadonlyMap<string, string>,
  ): Task {
    const mappedTask: Task = {
      id: task.id,
      title: task.content,
      priority: this.mapPriorityFromTodoist(task.priority),
    };

    if (task.description) {
      mappedTask.description = task.description;
    }

    const projectName = projectNameById.get(task.project_id);
    if (projectName) {
      mappedTask.projectName = projectName;
    }

    const dueDate = this.mapDueDateFromTodoist(task);
    if (dueDate) {
      mappedTask.dueDate = dueDate;
    }

    if (task.added_at) {
      mappedTask.createdAt = task.added_at;
    }

    return mappedTask;
  }

  /**
   * Maps Todoist's priority scale into the app's explicit priority values.
   */
  private mapPriorityFromTodoist(priority: number): TaskPriority {
    switch (priority) {
      case 1:
        return "urgent";
      case 2:
        return "high";
      case 3:
        return "medium";
      case 4:
      default:
        return "low";
    }
  }

  /**
   * Maps the app's explicit priority values into Todoist's priority scale.
   */
  private mapPriorityToTodoist(priority: TaskPriority): number {
    switch (priority) {
      case "urgent":
        return 1;
      case "high":
        return 2;
      case "medium":
        return 3;
      case "low":
        return 4;
    }
  }

  /**
   * Maps Todoist due fields into the shared domain due-date representation.
   */
  private mapDueDateFromTodoist(task: TodoistTask): TaskDueDate | undefined {
    if (task.due?.datetime) {
      return {
        kind: "date-time",
        dateTime: task.due.datetime,
        timezone: task.due.timezone ?? undefined,
      };
    }

    if (task.due?.date) {
      return {
        kind: "date",
        date: task.due.date,
      };
    }

    if (task.deadline?.date) {
      return {
        kind: "date",
        date: task.deadline.date,
      };
    }

    return undefined;
  }

  /**
   * Maps the shared due-date representation into Todoist write payload fields.
   */
  private mapDueDateForWrite(dueDate: TaskDueDate): Record<string, string> {
    if (dueDate.kind === "date") {
      return {
        due_date: dueDate.date,
      };
    }

    return {
      due_datetime: dueDate.dateTime,
    };
  }

  /**
   * Builds the payload shared by task creation and due-date assignment.
   */
  private buildCreateOrReschedulePayload(
    input: Pick<CreateTaskInput, "title" | "description" | "dueDate">,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      content: input.title,
    };

    if (input.description !== undefined) {
      payload.description = input.description;
    }

    if (input.dueDate) {
      Object.assign(payload, this.mapDueDateForWrite(input.dueDate));
    }

    return payload;
  }

  /**
   * Returns a project-name lookup map containing the project for a single task.
   */
  private async getProjectNameMapForTask(task: TodoistTask): Promise<Map<string, string>> {
    const projectName = await this.getProjectNameById(task.project_id);

    return new Map([[task.project_id, projectName]]);
  }

  /**
   * Returns the Todoist project name for one project identifier.
   */
  private async getProjectNameById(projectId: string): Promise<string> {
    const project = await this.requestJson(
      `/projects/${encodeURIComponent(projectId)}`,
      todoistProjectSchema,
    );

    return project.name;
  }

  /**
   * Resolves a plain project name into a Todoist project identifier.
   */
  private async resolveProjectIdByName(projectName: string): Promise<string> {
    const allProjects = await this.listPaginated("/projects", todoistProjectPageSchema);
    const matchingProjects = allProjects.filter(
      (project) => project.name.toLocaleLowerCase() === projectName.toLocaleLowerCase(),
    );

    if (matchingProjects.length === 1) {
      return matchingProjects[0]!.id;
    }

    if (matchingProjects.length === 0) {
      throw {
        status: 404,
        body: {
          error: `No Todoist project named "${projectName}" was found`,
        },
      } satisfies TodoistHttpError;
    }

    throw {
      status: 400,
      body: {
        error: `Multiple Todoist projects named "${projectName}" were found`,
      },
    } satisfies TodoistHttpError;
  }

  /**
   * Loads a task and upgrades a missing-task case into an explicit provider error.
   */
  private async requireTask(
    taskId: TaskId,
    missingMessage: string,
  ): Promise<TaskProviderResult<Task>> {
    const taskResult = await this.getTaskById(taskId);

    if (!taskResult.ok) {
      return taskResult;
    }

    if (taskResult.value === null) {
      return {
        ok: false,
        error: {
          code: "not_found",
          message: missingMessage,
          retriable: false,
        },
      };
    }

    return {
      ok: true,
      value: taskResult.value,
    };
  }

  /**
   * Builds a fully qualified Todoist API URL.
   */
  private buildUrl(path: string): string {
    return new URL(path, `${this.apiBaseUrl}/`).toString();
  }

  /**
   * Builds authenticated headers for Todoist API requests.
   */
  private buildHeaders(hasBody: boolean): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
    };

    if (hasBody) {
      headers["Content-Type"] = "application/json";
      headers["X-Request-Id"] = crypto.randomUUID();
    }

    return headers;
  }

  /**
   * Builds fetch options while omitting optional fields that are not present.
   */
  private buildRequestInit(
    options: TodoistRequestOptions,
  ): {
    headers: Record<string, string>;
    body?: string;
  } {
    const requestInit: {
      headers: Record<string, string>;
      body?: string;
    } = {
      headers: this.buildHeaders(options.body !== undefined),
    };

    if (options.body) {
      requestInit.body = JSON.stringify(options.body);
    }

    return requestInit;
  }

  /**
   * Parses a Todoist HTTP response body when JSON is present.
   */
  private async parseResponseBody(response: Response): Promise<unknown> {
    const contentType = response.headers.get("content-type");

    if (!contentType?.includes("application/json")) {
      return null;
    }

    return response.json();
  }

  /**
   * Converts HTTP and parsing failures into normalised provider errors.
   */
  private toProviderError(error: unknown, fallbackMessage: string): TaskProviderError {
    if (this.isTodoistHttpError(error)) {
      switch (error.status) {
        case 400:
          return this.createProviderError(
            "validation_failed",
            fallbackMessage,
            false,
            error.body,
          );
        case 401:
          return this.createProviderError(
            "authentication_failed",
            fallbackMessage,
            false,
            error.body,
          );
        case 403:
          return this.createProviderError(
            "permission_denied",
            fallbackMessage,
            false,
            error.body,
          );
        case 404:
          return this.createProviderError("not_found", fallbackMessage, false, error.body);
        case 429:
          return this.createProviderError("rate_limited", fallbackMessage, true, error.body);
        default:
          if (error.status >= 500) {
            return this.createProviderError(
              "temporary_failure",
              fallbackMessage,
              true,
              error.body,
            );
          }
      }
    }

    if (error instanceof Error) {
      return {
        code: "unknown",
        message: `${fallbackMessage}: ${error.message}`,
        retriable: false,
      };
    }

    return {
      code: "unknown",
      message: fallbackMessage,
      retriable: false,
    };
  }

  /**
   * Builds one normalised provider error with optional serialized HTTP details.
   */
  private createProviderError(
    code: TaskProviderError["code"],
    fallbackMessage: string,
    retriable: boolean,
    body: unknown,
  ): TaskProviderError {
    const details = this.serializeErrorBody(body);
    const message =
      details.error ?? details.message ?? fallbackMessage;

    const providerError: TaskProviderError = {
      code,
      message,
      retriable,
    };

    if (Object.keys(details).length > 0) {
      providerError.details = details;
    }

    return providerError;
  }

  /**
   * Serializes an arbitrary Todoist error body into string detail fields.
   */
  private serializeErrorBody(body: unknown): Record<string, string> {
    if (!body || typeof body !== "object") {
      return {};
    }

    const details: Record<string, string> = {};

    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") {
        details[key] = value;
        continue;
      }

      details[key] = JSON.stringify(value);
    }

    return details;
  }

  /**
   * Narrows an unknown failure into the adapter's internal HTTP error shape.
   */
  private isTodoistHttpError(error: unknown): error is TodoistHttpError {
    return (
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof (error as { status: unknown }).status === "number" &&
      "body" in error
    );
  }
}
