// Move-tree helpers, ported from frontend/src/util/{path,tree}.ts.
// A path is the concatenation of 2-char node ids from the root.
import type { TrainableNode } from './types';

export const head = (path: string) => path.slice(0, 2);
export const tail = (path: string) => path.slice(2);
export const init = (path: string) => path.slice(0, -2);
export const last = (path: string) => path.slice(-2);

export const childById = (node: TrainableNode, id: string) =>
  node.children.find((c) => c.data.id === id);

export function forEachNode(root: TrainableNode, visit: (n: TrainableNode) => void): void {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    visit(n);
    for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
  }
}

// Node at path, or undefined when any step is missing.
export function nodeAtPathOrNull(root: TrainableNode, path: string): TrainableNode | undefined {
  let node: TrainableNode | undefined = root;
  for (let p = path; p && node; p = tail(p)) node = childById(node, head(p));
  return node;
}

// Nodes from root along path (stops at the first missing step).
export function getNodeList(root: TrainableNode, path: string): TrainableNode[] {
  const nodes = [root];
  let node = root;
  for (let p = path; p; p = tail(p)) {
    const c = childById(node, head(p));
    if (!c) break;
    nodes.push(c);
    node = c;
  }
  return nodes;
}

export function deleteNodeAt(root: TrainableNode, path: string): void {
  const parent = nodeAtPathOrNull(root, init(path));
  if (parent) parent.children = parent.children.filter((c) => c.data.id !== last(path));
}
