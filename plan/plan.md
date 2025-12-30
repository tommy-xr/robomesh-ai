# Shodan Roadmap

See also: [KNOWN_ISSUES.md](../KNOWN_ISSUES.md) for bugs and limitations.

## Known Issues / Technical Debt

### React Flow Handle Registration Bug (Workaround Applied)
When restoring nodes from cached state (navigation stack), React Flow sometimes fails to recognize handles even though the data is correct. The workaround is to reload component workflows from YAML when navigating back via breadcrumb. This works but means unsaved changes are lost when navigating away then back. A proper fix would involve:
- Investigating React Flow's handle registration lifecycle
- Possibly using `useNodesInitialized` hook or forcing re-mount with key changes
- File: `src/designer/src/App.tsx` - `onNavigateBreadcrumb` function

### Component-related files
- `src/server/src/routes/components.ts` - Component API endpoints
- `src/designer/src/lib/api.ts` - API client functions (`getComponentWorkflow`, `saveComponentWorkflow`)
- `src/designer/src/components/Breadcrumb.tsx` - Breadcrumb navigation component
- `src/designer/src/components/CreateComponentDialog.tsx` - New component creation dialog
- `src/designer/src/App.tsx` - Navigation stack, drill-down, save functionality
- `workflows/components/` - Component workflow YAML files

## Pending

### Loop Primitive Phase 4 (Polish) - Backlog
- [ ] **Iteration history view**: Show history of all iterations with expandable details
- [ ] **Dock slot configuration UI**: Add/remove/rename feedback slots in ConfigPanel
- [ ] **Type selection for feedback slots**: UI to configure `valueType` for feedback slots
- [ ] **Visual validation indicators**: Highlight missing required connections (e.g., continue slot unconnected)
- [ ] **Copy/paste support**: Copy nodes into/out of loop containers
- [ ] **Undo/redo support**: Proper undo/redo for loop operations (add child, move, resize)
- [ ] **Arrow indicators for port direction**: Visual cues showing input vs output direction on dock slots

### Constants Node (see constants.md)
- [ ] Core types (`ConstantNodeData` in `packages/core`)
- [ ] Executor support for `constant` node
- [ ] Designer UI (`ConstantNode.tsx` - circular shape, gray)
- [ ] "Logic" category in Sidebar
- [ ] ConfigPanel: type dropdown + value input
- [ ] Example workflow (`test-constant.yaml`)

### Logic Operators (see operators.md)
**Phase 2**: Boolean logic (`not`, `and`, `or`) - purple rectangular nodes
**Phase 3**: Comparisons (`equals`, `not-equals`, `greater-than`, etc.) - orange
**Phase 4**: Utilities (`switch`, `coalesce`, arithmetic, string ops)

### Re-entrant Runner / Agent Session Persistence (see re-entrant-runner.md)

Enable agents to maintain conversation context across loop iterations via session management.

**Phase 1: Runner Updates**
- [ ] Add `sessionId`, `createSession`, `conversationHistory` to `AgentConfig`/`AgentResult`
- [ ] Update `claude-code.ts` with `--session-id` / `--resume` flags
- [ ] Update `codex.ts` with resume support and `thread_id` extraction
- [ ] Update `openai.ts` with conversation history support

**Phase 2: Executor Updates**
- [ ] Detect `taskPrompt` vs `iteratePrompt` input ports
- [ ] Pass session config to runners, include in node output

**Phase 3: Designer UI**
- [ ] Show two input ports for resumable agents
- [ ] Add "resumable" toggle in agent config panel

**Phase 4: Integration Tests**
- [ ] Test workflows for each runner (`test-resumable-*.yaml`)

### Other
- Add CI badge
- Add screenshot of tool
- Add refactor -> extract tool. Highlight an area, pull the inputs/outputs, and extract to a component
- Add accordions to component
- Implement component library plan (component-library.md)
- Fix agent models - we might want to make an API request and query each tool respectively?
- Coercing agent output to JSON to fit output requirements - can we rely on the agents to do that, or does it require a GPT call to coalesce?
- Add clearly defined input/output for the agent blocks - the inputs can be used as template variables, and the output can be added to the prompt we send the agent. We can then wire the output directly elsewhere
- Consider adding "unsaved changes" warning when navigating away from edited component
- Component versioning/history
