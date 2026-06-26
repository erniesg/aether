import type { MotionProject } from './project';
import {
  materializeMotionAgentRequestTemplate,
  type MaterializedMotionAgentRequestTemplate,
  type MaterializeMotionAgentRequestTemplateInput,
  type MotionAgentExecutionHandoff,
  type MotionAgentRequestTemplate,
} from './agentHandoff';

export interface MotionAgentHandoffDispatchResult {
  status: number;
  json: Record<string, unknown>;
}

export type MotionAgentHandoffDispatcher = (
  request: MaterializedMotionAgentRequestTemplate
) => Promise<MotionAgentHandoffDispatchResult>;

export interface RunMotionAgentHandoffTemplatesInput {
  handoff: MotionAgentExecutionHandoff;
  project: MotionProject;
  templateIds: string[];
  input?: Omit<MaterializeMotionAgentRequestTemplateInput, 'project'>;
  dispatch: MotionAgentHandoffDispatcher;
}

export interface MotionAgentHandoffRunStep {
  templateId: string;
  label: string;
  route: string;
  method: 'POST';
  missingPlaceholders: string[];
  status: 'skipped' | 'complete' | 'failed';
  responseStatus: number | null;
  responseJson: Record<string, unknown> | null;
}

export interface RunMotionAgentHandoffTemplatesResult {
  status: 'complete' | 'blocked' | 'failed';
  projectId: string;
  finalProject: MotionProject;
  finalResponse: Record<string, unknown> | null;
  steps: MotionAgentHandoffRunStep[];
}

export async function runMotionAgentHandoffTemplates(
  input: RunMotionAgentHandoffTemplatesInput
): Promise<RunMotionAgentHandoffTemplatesResult> {
  let currentProject = input.project;
  let finalResponse: Record<string, unknown> | null = null;
  const steps: MotionAgentHandoffRunStep[] = [];

  for (const templateId of input.templateIds) {
    const template = findTemplate(input.handoff.templates, templateId);
    const materialized = materializeMotionAgentRequestTemplate(template, {
      project: currentProject,
      ...input.input,
    });

    if (materialized.missingPlaceholders.length > 0) {
      steps.push({
        templateId: materialized.templateId,
        label: materialized.label,
        route: materialized.route,
        method: materialized.method,
        missingPlaceholders: materialized.missingPlaceholders,
        status: 'skipped',
        responseStatus: null,
        responseJson: null,
      });
      return {
        status: 'blocked',
        projectId: currentProject.id,
        finalProject: currentProject,
        finalResponse,
        steps,
      };
    }

    const response = await input.dispatch(materialized);
    finalResponse = response.json;
    const ok = response.status >= 200 && response.status < 300 && response.json.ok !== false;
    const nextProject = projectFromResponse(response.json);
    if (nextProject) currentProject = nextProject;

    steps.push({
      templateId: materialized.templateId,
      label: materialized.label,
      route: materialized.route,
      method: materialized.method,
      missingPlaceholders: [],
      status: ok ? 'complete' : 'failed',
      responseStatus: response.status,
      responseJson: response.json,
    });

    if (!ok) {
      return {
        status: 'failed',
        projectId: currentProject.id,
        finalProject: currentProject,
        finalResponse,
        steps,
      };
    }
  }

  return {
    status: 'complete',
    projectId: currentProject.id,
    finalProject: currentProject,
    finalResponse,
    steps,
  };
}

function findTemplate(
  templates: MotionAgentRequestTemplate[],
  templateId: string
): MotionAgentRequestTemplate {
  const template = templates.find((candidate) => candidate.id === templateId);
  if (!template) {
    throw new Error(`agent handoff template not found: ${templateId}`);
  }
  return template;
}

function projectFromResponse(json: Record<string, unknown>): MotionProject | null {
  const project = json.project;
  if (!project || typeof project !== 'object' || Array.isArray(project)) return null;
  return project as MotionProject;
}
