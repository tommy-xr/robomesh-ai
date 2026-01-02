/**
 * ChatApp - Main ink component for chat command
 *
 * Renders workflow execution progress with streaming output.
 * When multiple nodes run in parallel, shows compact view with Ctrl+N hotkeys to expand.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { executeWorkflowSchema, type WorkflowSchema } from '@robomesh/server';
import type { NodeResult, WorkflowNode } from '@robomesh/core';

// Check if we're in an interactive terminal
const isInteractive = process.stdin.isTTY === true;

interface Props {
  schema: WorkflowSchema;
  userInput: string;
  onComplete?: (success: boolean) => void;
}

interface RunningNode {
  id: string;
  label: string;
  type: string;
  output: string[];
  status: 'running' | 'completed' | 'failed';
}

type Phase = 'running' | 'completed' | 'failed';

export function ChatApp({ schema, userInput, onComplete }: Props) {
  const { exit } = useApp();
  const [phase, setPhase] = useState<Phase>('running');
  const [nodes, setNodes] = useState<Map<string, RunningNode>>(new Map());
  const [executionOrder, setExecutionOrder] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [duration, setDuration] = useState<number>(0);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  // Get currently running nodes
  const runningNodes = useMemo(() => {
    return Array.from(nodes.values()).filter((n) => n.status === 'running');
  }, [nodes]);

  // Handle keyboard input for node focus switching (only in interactive mode)
  useInput(
    (input, key) => {
      // Ctrl+1 through Ctrl+9 to focus nodes
      if (key.ctrl && input >= '1' && input <= '9') {
        const idx = parseInt(input) - 1;
        if (idx < runningNodes.length) {
          setFocusedIndex(focusedIndex === idx ? null : idx);
        }
      }
      // Escape to unfocus
      if (key.escape) {
        setFocusedIndex(null);
      }
    },
    { isActive: isInteractive }
  );

  useEffect(() => {
    const startTime = Date.now();

    executeWorkflowSchema(schema, {
      triggerInputs: { text: userInput },
      onNodeStart: (nodeId: string, node: WorkflowNode) => {
        const label = (node.data.label as string) || nodeId;
        const nodeType = (node.data.nodeType as string) || node.type || 'unknown';

        setNodes((prev) => {
          const next = new Map(prev);
          next.set(nodeId, {
            id: nodeId,
            label,
            type: nodeType,
            output: [],
            status: 'running',
          });
          return next;
        });

        setExecutionOrder((prev) => {
          if (!prev.includes(nodeId)) {
            return [...prev, nodeId];
          }
          return prev;
        });
      },
      onNodeOutput: (nodeId: string, chunk: string) => {
        setNodes((prev) => {
          const next = new Map(prev);
          const node = next.get(nodeId);
          if (node) {
            // Split chunk into lines and append
            const lines = chunk.split('\n');
            const newOutput = [...node.output];

            for (let i = 0; i < lines.length; i++) {
              if (i === 0 && newOutput.length > 0) {
                // Append to last line
                newOutput[newOutput.length - 1] += lines[i];
              } else {
                newOutput.push(lines[i]);
              }
            }

            next.set(nodeId, { ...node, output: newOutput });
          }
          return next;
        });
      },
      onNodeComplete: (nodeId: string, result: NodeResult) => {
        setNodes((prev) => {
          const next = new Map(prev);
          const node = next.get(nodeId);
          if (node) {
            next.set(nodeId, {
              ...node,
              status: result.status === 'completed' ? 'completed' : 'failed',
            });
          }
          return next;
        });
        // Clear focus when focused node completes
        setFocusedIndex(null);
      },
    })
      .then((result) => {
        setDuration(Date.now() - startTime);
        if (result.success) {
          setPhase('completed');
          onComplete?.(true);
        } else {
          setPhase('failed');
          setError(result.error || 'Workflow failed');
          onComplete?.(false);
        }
        // Exit after a brief delay to ensure final render
        setTimeout(() => exit(), 100);
      })
      .catch((err) => {
        setDuration(Date.now() - startTime);
        setPhase('failed');
        setError((err as Error).message);
        onComplete?.(false);
        setTimeout(() => exit(), 100);
      });
  }, [schema, userInput, exit, onComplete]);

  // Determine if we should show compact parallel view
  const showCompactParallel = runningNodes.length > 1 && focusedIndex === null;

  return (
    <Box flexDirection="column" paddingTop={1}>
      {/* Completed nodes always show in full */}
      {executionOrder.map((nodeId) => {
        const node = nodes.get(nodeId);
        if (!node) return null;

        // Skip running nodes when showing compact view
        if (showCompactParallel && node.status === 'running') {
          return null;
        }

        // If focused on a specific node, only show that one expanded for running nodes
        if (runningNodes.length > 1 && focusedIndex !== null && node.status === 'running') {
          const focusedNode = runningNodes[focusedIndex];
          if (node.id !== focusedNode?.id) {
            return null; // Will be shown in the status bar
          }
        }

        return <NodeBox key={nodeId} node={node} />;
      })}

      {/* Compact parallel view */}
      {showCompactParallel && (
        <CompactParallelView nodes={runningNodes} />
      )}

      {/* Focused node with other running nodes in status bar */}
      {runningNodes.length > 1 && focusedIndex !== null && (
        <FocusedView
          focusedNode={runningNodes[focusedIndex]}
          otherNodes={runningNodes.filter((_, i) => i !== focusedIndex)}
          focusedIndex={focusedIndex}
        />
      )}

      {/* Summary */}
      {phase !== 'running' && (
        <Box marginTop={1}>
          {phase === 'completed' ? (
            <Text color="green" bold>
              ✓ Workflow completed
            </Text>
          ) : (
            <Text color="red" bold>
              ✗ Workflow failed
            </Text>
          )}
          <Text dimColor> ({(duration / 1000).toFixed(2)}s)</Text>
        </Box>
      )}

      {/* Error message */}
      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}
    </Box>
  );
}

interface NodeBoxProps {
  node: RunningNode;
}

function NodeBox({ node }: NodeBoxProps) {
  const statusIcon =
    node.status === 'running' ? '●' : node.status === 'completed' ? '✓' : '✗';

  const statusColor =
    node.status === 'running' ? 'yellow' : node.status === 'completed' ? 'green' : 'red';

  // Build header
  const header = `─ ${node.label} (${node.type}) `;
  const headerPadding = '─'.repeat(Math.max(0, 50 - header.length));

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Header */}
      <Text>
        <Text color={statusColor}>{statusIcon}</Text>
        <Text dimColor>┌{header}{headerPadding}</Text>
      </Text>

      {/* Output lines */}
      {node.output.length > 0 && (
        <Box flexDirection="column" paddingLeft={1}>
          {node.output.slice(-20).map((line, i) => (
            <Text key={i} dimColor>
              │ {line}
            </Text>
          ))}
        </Box>
      )}

      {/* Footer */}
      <Text dimColor>└{'─'.repeat(51)}</Text>
    </Box>
  );
}

interface CompactParallelViewProps {
  nodes: RunningNode[];
}

function CompactParallelView({ nodes }: CompactParallelViewProps) {
  const footer = isInteractive
    ? `└─ Press Ctrl+1/${nodes.length} to expand ${'─'.repeat(27)}`
    : `└${'─'.repeat(51)}`;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text dimColor>┌─ Running {nodes.length} nodes {'─'.repeat(33)}</Text>

      {nodes.map((node, index) => {
        // Get preview (last non-empty line, truncated)
        const lastLine = [...node.output].reverse().find((l) => l.trim()) || '';
        const preview = lastLine.length > 35 ? lastLine.slice(0, 32) + '...' : lastLine;

        return (
          <Text key={node.id}>
            <Text dimColor>│ </Text>
            {isInteractive && <Text color="cyan">[{index + 1}]</Text>}
            <Text> {node.label.slice(0, 16).padEnd(16)} </Text>
            <Text color="yellow">● </Text>
            <Text dimColor>{preview}</Text>
          </Text>
        );
      })}

      <Text dimColor>{footer}</Text>
    </Box>
  );
}

interface FocusedViewProps {
  focusedNode: RunningNode | undefined;
  otherNodes: RunningNode[];
  focusedIndex: number;
}

function FocusedView({ focusedNode, otherNodes, focusedIndex }: FocusedViewProps) {
  if (!focusedNode) return null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      {/* Focused node full output */}
      <NodeBox node={focusedNode} />

      {/* Status bar with other running nodes */}
      <Box>
        <Text dimColor>│ </Text>
        {otherNodes.map((node, i) => {
          const actualIndex = i < focusedIndex ? i : i + 1;
          return (
            <Text key={node.id}>
              <Text color="cyan">[{actualIndex + 1}]</Text>
              <Text> {node.label.slice(0, 10)} </Text>
              <Text color="yellow">● </Text>
              <Text>  </Text>
            </Text>
          );
        })}
      </Box>
      <Text dimColor>└─ Press Ctrl+N to switch, Esc to collapse {'─'.repeat(14)}</Text>
    </Box>
  );
}
