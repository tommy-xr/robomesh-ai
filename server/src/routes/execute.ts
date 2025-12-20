import { Router } from 'express';
import { spawn } from 'child_process';

export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface WorkflowNode {
  id: string;
  type: string;
  data: {
    label?: string;
    nodeType?: string;
    commands?: string[];
    scriptFiles?: string[];
    path?: string;
    [key: string]: unknown;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
}

export interface ExecuteRequest {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  rootDirectory?: string;
  startNodeId?: string; // Optional: specific node to start from
}

export interface NodeResult {
  nodeId: string;
  status: NodeStatus;
  output?: string;
  error?: string;
  exitCode?: number;
  startTime?: string;
  endTime?: string;
}

export interface ExecuteResponse {
  success: boolean;
  results: NodeResult[];
  executionOrder: string[];
}

/**
 * Build adjacency map: source -> [targets]
 */
function buildAdjacencyMap(edges: WorkflowEdge[]): Map<string, string[]> {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) {
      adjacency.set(edge.source, []);
    }
    adjacency.get(edge.source)!.push(edge.target);
  }
  return adjacency;
}

/**
 * Execution context - stores outputs from executed nodes
 */
interface ExecutionContext {
  outputs: Map<string, string>;  // nodeId -> output
  nodeLabels: Map<string, string>;  // nodeId -> label (for label-based lookups)
}

/**
 * Replace template variables in a string
 * Supports: {{ nodeId.output }} and {{ nodeLabel.output }}
 */
function replaceTemplates(text: string, context: ExecutionContext): string {
  // Match {{ identifier.output }} patterns
  const templateRegex = /\{\{\s*([a-zA-Z0-9_-]+)\.output\s*\}\}/g;

  return text.replace(templateRegex, (match, identifier) => {
    // First try direct nodeId lookup
    if (context.outputs.has(identifier)) {
      return context.outputs.get(identifier) || '';
    }

    // Then try label lookup (find nodeId by label)
    for (const [nodeId, label] of context.nodeLabels) {
      // Normalize label for comparison (lowercase, replace spaces with underscores)
      const normalizedLabel = label.toLowerCase().replace(/\s+/g, '_');
      if (normalizedLabel === identifier.toLowerCase() || label === identifier) {
        if (context.outputs.has(nodeId)) {
          return context.outputs.get(nodeId) || '';
        }
      }
    }

    // If not found, leave the template as-is (or could return empty string)
    return match;
  });
}

/**
 * Process node data, replacing template variables in relevant fields
 */
function processNodeTemplates(node: WorkflowNode, context: ExecutionContext): WorkflowNode {
  const processedData = { ...node.data };

  // Process commands array for shell nodes
  if (processedData.commands && Array.isArray(processedData.commands)) {
    processedData.commands = processedData.commands.map(cmd =>
      typeof cmd === 'string' ? replaceTemplates(cmd, context) : cmd
    );
  }

  // Process prompt for agent nodes
  if (processedData.prompt && typeof processedData.prompt === 'string') {
    processedData.prompt = replaceTemplates(processedData.prompt, context);
  }

  // Process path
  if (processedData.path && typeof processedData.path === 'string') {
    processedData.path = replaceTemplates(processedData.path, context);
  }

  return { ...node, data: processedData };
}

/**
 * Find trigger nodes (nodes with no incoming edges, or explicit trigger type)
 */
function findTriggerNodes(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
  const hasIncoming = new Set(edges.map(e => e.target));

  // First, look for explicit trigger nodes
  const triggers = nodes.filter(n =>
    n.data.nodeType === 'trigger' || n.type === 'trigger'
  );

  if (triggers.length > 0) {
    return triggers.map(t => t.id);
  }

  // Fall back to nodes with no incoming edges
  return nodes
    .filter(n => !hasIncoming.has(n.id))
    .map(n => n.id);
}

/**
 * Execute a shell command and return the result
 */
function executeShellCommand(
  command: string,
  cwd: string
): Promise<{ output: string; exitCode: number }> {
  return new Promise((resolve) => {
    const proc = spawn('sh', ['-c', command], {
      cwd,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');
      resolve({
        output: output.trim(),
        exitCode: code ?? 0,
      });
    });

    proc.on('error', (err) => {
      resolve({
        output: `Failed to start process: ${err.message}`,
        exitCode: 1,
      });
    });
  });
}

/**
 * Execute a single node
 */
async function executeNode(
  node: WorkflowNode,
  rootDirectory: string
): Promise<NodeResult> {
  const startTime = new Date().toISOString();
  const nodeType = node.data.nodeType || node.type;

  // Determine working directory
  const cwd = node.data.path || rootDirectory || process.cwd();

  if (nodeType === 'shell') {
    const commands = node.data.commands || [];

    if (commands.length === 0) {
      return {
        nodeId: node.id,
        status: 'completed',
        output: '(no commands to execute)',
        startTime,
        endTime: new Date().toISOString(),
      };
    }

    // Execute all commands in sequence
    const outputs: string[] = [];
    let lastExitCode = 0;

    for (const command of commands) {
      if (!command.trim()) continue;

      const result = await executeShellCommand(command, cwd);
      outputs.push(`$ ${command}\n${result.output}`);
      lastExitCode = result.exitCode;

      // Stop on failure
      if (result.exitCode !== 0) {
        return {
          nodeId: node.id,
          status: 'failed',
          output: outputs.join('\n\n'),
          exitCode: result.exitCode,
          error: `Command failed with exit code ${result.exitCode}`,
          startTime,
          endTime: new Date().toISOString(),
        };
      }
    }

    return {
      nodeId: node.id,
      status: 'completed',
      output: outputs.join('\n\n'),
      exitCode: lastExitCode,
      startTime,
      endTime: new Date().toISOString(),
    };
  }

  if (nodeType === 'trigger') {
    // Trigger nodes just pass through
    return {
      nodeId: node.id,
      status: 'completed',
      output: 'Trigger activated',
      startTime,
      endTime: new Date().toISOString(),
    };
  }

  if (nodeType === 'workdir') {
    // Working directory nodes just set context
    return {
      nodeId: node.id,
      status: 'completed',
      output: `Working directory: ${node.data.path || '(not set)'}`,
      startTime,
      endTime: new Date().toISOString(),
    };
  }

  // For agent nodes and others - placeholder for now
  return {
    nodeId: node.id,
    status: 'completed',
    output: `Node type '${nodeType}' execution not yet implemented`,
    startTime,
    endTime: new Date().toISOString(),
  };
}

export function createExecuteRouter() {
  const router = Router();

  // Execute a workflow
  router.post('/', async (req, res) => {
    try {
      const { nodes, edges, rootDirectory, startNodeId } = req.body as ExecuteRequest;

      if (!nodes || !Array.isArray(nodes)) {
        return res.status(400).json({ error: 'nodes array is required' });
      }

      if (!edges || !Array.isArray(edges)) {
        return res.status(400).json({ error: 'edges array is required' });
      }

      // Create node lookup and adjacency map
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      const adjacency = buildAdjacencyMap(edges);

      // Build execution context with node labels for template lookups
      const context: ExecutionContext = {
        outputs: new Map(),
        nodeLabels: new Map(nodes.map(n => [n.id, n.data.label || n.id])),
      };

      // Determine starting node(s)
      let startNodes: string[];
      if (startNodeId) {
        if (!nodeMap.has(startNodeId)) {
          return res.status(400).json({ error: `Start node '${startNodeId}' not found` });
        }
        startNodes = [startNodeId];
      } else {
        startNodes = findTriggerNodes(nodes, edges);
        if (startNodes.length === 0) {
          return res.status(400).json({ error: 'No trigger or start node found' });
        }
      }

      // Execute by traversing from start nodes
      const results: NodeResult[] = [];
      const executionOrder: string[] = [];
      const visited = new Set<string>();
      let overallSuccess = true;

      // BFS traversal from start nodes
      const queue = [...startNodes];

      while (queue.length > 0 && overallSuccess) {
        const nodeId = queue.shift()!;

        // Skip if already visited
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        const node = nodeMap.get(nodeId);
        if (!node) continue;

        executionOrder.push(nodeId);

        // Process templates in node data before execution
        const processedNode = processNodeTemplates(node, context);

        // Execute this node
        const result = await executeNode(processedNode, rootDirectory || process.cwd());
        results.push(result);

        // Store output in context for downstream nodes
        if (result.output) {
          // Store the raw output (without the "$ command" prefix for cleaner templates)
          const rawOutput = result.output
            .split('\n')
            .filter(line => !line.startsWith('$ '))
            .join('\n')
            .trim();
          context.outputs.set(nodeId, rawOutput);
        }

        if (result.status === 'failed') {
          overallSuccess = false;
          break;
        }

        // Add connected nodes to queue
        const nextNodes = adjacency.get(nodeId) || [];
        for (const nextId of nextNodes) {
          if (!visited.has(nextId)) {
            queue.push(nextId);
          }
        }
      }

      res.json({
        success: overallSuccess,
        results,
        executionOrder,
      } as ExecuteResponse);
    } catch (error) {
      console.error('Error executing workflow:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to execute workflow'
      });
    }
  });

  return router;
}
