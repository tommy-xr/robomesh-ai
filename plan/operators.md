# Logic Operators

## Overview

Dedicated logic operator nodes (`not`, `and`, `or`, etc.) that appear in the sidebar as distinct primitives. These are "sealed" function nodes with hard-coded inline code and fixed inputs/outputs (not user-editable).

## Status

**Infrastructure complete** - function node execution works.

**Remaining work**:
- [ ] Add `not`, `and`, `or` to sidebar under "Logic" category
- [ ] Hard-coded inline code and I/O (not editable in ConfigPanel)
- [ ] Consider compact visual styling (smaller nodes, symbols like `¬`, `∧`, `∨`)

## Implementation Approach

Operators are function nodes with:
- **Inline code** (not file references)
- **Fixed inputs/outputs** (not editable by user)
- **Distinct nodeType** or flag to identify as built-in operator

### Example: AND operator

```yaml
type: function
data:
  nodeType: function
  label: AND
  builtIn: true  # Flag to hide code/I/O editing in ConfigPanel
  code: "return { result: inputs.a && inputs.b }"
  inputs:
    - name: a
      type: boolean
    - name: b
      type: boolean
  outputs:
    - name: result
      type: boolean
```

### Sidebar entries

Add to `packages/designer/src/components/Sidebar.tsx`:

```typescript
const logicItems = [
  { type: 'function', label: 'Function', icon: 'ƒ' },
  // Built-in operators (sealed, not editable):
  { type: 'function', label: 'NOT', icon: '¬', preset: 'not' },
  { type: 'function', label: 'AND', icon: '∧', preset: 'and' },
  { type: 'function', label: 'OR', icon: '∨', preset: 'or' },
];
```

### Operator presets

```typescript
const operatorPresets = {
  not: {
    label: 'NOT',
    builtIn: true,
    code: 'return { result: !inputs.value }',
    inputs: [{ name: 'value', type: 'boolean' }],
    outputs: [{ name: 'result', type: 'boolean' }],
  },
  and: {
    label: 'AND',
    builtIn: true,
    code: 'return { result: inputs.a && inputs.b }',
    inputs: [{ name: 'a', type: 'boolean' }, { name: 'b', type: 'boolean' }],
    outputs: [{ name: 'result', type: 'boolean' }],
  },
  or: {
    label: 'OR',
    builtIn: true,
    code: 'return { result: inputs.a || inputs.b }',
    inputs: [{ name: 'a', type: 'boolean' }, { name: 'b', type: 'boolean' }],
    outputs: [{ name: 'result', type: 'boolean' }],
  },
};
```

### ConfigPanel behavior

When `data.builtIn === true`, hide the code editor and I/O configuration sections. Just show the node label (possibly read-only).

## Future phases

- **Comparisons**: `equals`, `not-equals`, `>`, `<`, `>=`, `<=`
- **Utilities**: `switch`/`if`, `coalesce`
- **Arithmetic**: `add`, `subtract`, `multiply`, `divide`
- **String**: `concat`, `contains`, `regex-match`
