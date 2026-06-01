'use client';

import { useRef, useState } from 'react';

interface TreeNode {
  type: 'dir' | 'file';
  name: string;
  path: string;
  children?: TreeNode[];
}

interface Props {
  repoPath: string | null;
  onRepoPathChange: (path: string | null) => void;
  browsedFiles: File[];
  onBrowsedFilesChange: (files: File[]) => void;
  selectedFiles: string[];
  onSelectedFilesChange: (files: string[]) => void;
}

const ALLOWED_EXT = ['.cls', '.trigger', '.js', '.html', '.xml'];

export function LocalRepoPicker({
  repoPath,
  onRepoPathChange,
  browsedFiles,
  onBrowsedFilesChange,
  selectedFiles,
  onSelectedFilesChange,
}: Props) {
  const [inputPath, setInputPath] = useState(repoPath ?? '');
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [browseLabel, setBrowseLabel] = useState<string | null>(null);
  const dirInput = useRef<HTMLInputElement | null>(null);

  function reset() {
    setTree([]);
    setExpanded(new Set());
    setError(null);
    setWarning(null);
    onSelectedFilesChange([]);
  }

  async function handleConnect() {
    const trimmed = inputPath.trim();
    if (!trimmed) return;
    reset();
    onBrowsedFilesChange([]);
    setBrowseLabel(null);
    setLoading(true);
    try {
      const res = await fetch('/api/repo/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'failed to list directory');
        onRepoPathChange(null);
        return;
      }
      setTree(data.tree ?? []);
      onRepoPathChange(data.root);
      if (data.warning) setWarning(data.warning);
      const auto = new Set<string>();
      for (const n of data.tree ?? []) {
        if (n.type === 'dir') auto.add(n.path);
      }
      setExpanded(auto);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'request failed');
    } finally {
      setLoading(false);
    }
  }

  function handleBrowse() {
    dirInput.current?.click();
  }

  function handleBrowseChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const reviewable = files.filter((f) => {
      const lower = f.name.toLowerCase();
      if (lower.endsWith('.js-meta.xml')) return true;
      return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
    });
    reset();
    onRepoPathChange(null);
    if (reviewable.length === 0) {
      onBrowsedFilesChange([]);
      setBrowseLabel(null);
      setWarning('No reviewable files (.cls, .trigger, .js, .html, .xml) found in that folder.');
      return;
    }
    onBrowsedFilesChange(reviewable);
    // Derive the root folder name from webkitRelativePath: e.g. "myProject/force-app/...".
    const firstPath = reviewable[0].webkitRelativePath;
    const rootName = firstPath.split('/')[0] ?? '(folder)';
    setBrowseLabel(rootName);
    const built = buildTreeFromBrowsed(reviewable);
    setTree(built);
    const auto = new Set<string>();
    for (const n of built) {
      if (n.type === 'dir') auto.add(n.path);
    }
    setExpanded(auto);
  }

  function collectFilePaths(nodes: TreeNode[]): string[] {
    const out: string[] = [];
    for (const n of nodes) {
      if (n.type === 'file') out.push(n.path);
      else if (n.children) out.push(...collectFilePaths(n.children));
    }
    return out;
  }

  function toggleFile(path: string) {
    const next = new Set(selectedFiles);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    onSelectedFilesChange(Array.from(next));
  }

  function toggleFolder(folderNode: TreeNode) {
    if (folderNode.type !== 'dir' || !folderNode.children) return;
    const descendants = collectFilePaths(folderNode.children);
    const allSelected = descendants.every((p) => selectedFiles.includes(p));
    const next = new Set(selectedFiles);
    if (allSelected) descendants.forEach((p) => next.delete(p));
    else descendants.forEach((p) => next.add(p));
    onSelectedFilesChange(Array.from(next));
  }

  function toggleExpand(path: string) {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    setExpanded(next);
  }

  function folderSelectionState(folderNode: TreeNode): 'none' | 'partial' | 'all' {
    if (folderNode.type !== 'dir' || !folderNode.children) return 'none';
    const descendants = collectFilePaths(folderNode.children);
    if (descendants.length === 0) return 'none';
    const selectedCount = descendants.filter((p) => selectedFiles.includes(p)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === descendants.length) return 'all';
    return 'partial';
  }

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    const indent = { paddingLeft: `${depth * 14}px` };
    if (node.type === 'dir') {
      const isExpanded = expanded.has(node.path);
      const sel = folderSelectionState(node);
      return (
        <div key={node.path}>
          <div
            style={indent}
            className="flex items-center gap-1 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-900/40"
          >
            <button
              type="button"
              onClick={() => toggleExpand(node.path)}
              className="w-4 shrink-0 text-slate-500"
            >
              {isExpanded ? '▾' : '▸'}
            </button>
            <input
              type="checkbox"
              checked={sel === 'all'}
              ref={(el) => {
                if (el) el.indeterminate = sel === 'partial';
              }}
              onChange={() => toggleFolder(node)}
              className="mr-1"
            />
            <span className="text-xs text-amber-700 dark:text-amber-300">{node.name}/</span>
          </div>
          {isExpanded && node.children?.map((c) => renderNode(c, depth + 1))}
        </div>
      );
    }
    const checked = selectedFiles.includes(node.path);
    return (
      <div
        key={node.path}
        style={indent}
        className="flex items-center gap-1 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-900/40"
      >
        <span className="w-4 shrink-0" />
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleFile(node.path)}
          className="mr-1"
        />
        <span className="text-xs text-slate-800 dark:text-slate-200">{node.name}</span>
      </div>
    );
  }

  function selectAll() {
    onSelectedFilesChange(collectFilePaths(tree));
  }
  function clearAll() {
    onSelectedFilesChange([]);
  }
  function disconnect() {
    setTree([]);
    setInputPath('');
    setError(null);
    setWarning(null);
    setBrowseLabel(null);
    onRepoPathChange(null);
    onBrowsedFilesChange([]);
    onSelectedFilesChange([]);
    if (dirInput.current) dirInput.current.value = '';
  }

  const hasTree = tree.length > 0;
  const sourceLabel = repoPath ?? (browseLabel ? `[browsed folder] ${browseLabel}` : null);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          value={inputPath}
          onChange={(e) => setInputPath(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleConnect();
            }
          }}
          placeholder="e.g., C:\Users\you\sfdx-project\force-app\main\default"
          className="flex-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-mono text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
        <button
          type="button"
          onClick={handleConnect}
          disabled={loading || !inputPath.trim()}
          className="rounded bg-sky-700 px-3 py-1 text-xs text-white hover:bg-sky-600 disabled:opacity-50"
        >
          {loading ? 'Reading…' : 'Connect'}
        </button>
        <button
          type="button"
          onClick={handleBrowse}
          className="rounded border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-500"
        >
          Browse…
        </button>
        {(repoPath || browsedFiles.length > 0) && (
          <button
            type="button"
            onClick={disconnect}
            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-500"
          >
            Disconnect
          </button>
        )}
        {/* Hidden directory picker. webkitdirectory/mozdirectory are needed for folder selection. */}
        <input
          ref={dirInput}
          type="file"
          multiple
          onChange={handleBrowseChange}
          className="hidden"
          // @ts-expect-error: non-standard attributes
          webkitdirectory=""
          directory=""
        />
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
      {warning && <p className="text-xs text-amber-700 dark:text-amber-400">{warning}</p>}

      {sourceLabel && hasTree && (
        <div>
          <div className="mb-1 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-400">
            <span className="truncate font-mono" title={sourceLabel}>
              {sourceLabel}
            </span>
            <span>
              <button type="button" onClick={selectAll} className="mr-2 text-sky-700 hover:underline dark:text-sky-400">
                select all
              </button>
              <button type="button" onClick={clearAll} className="text-sky-700 hover:underline dark:text-sky-400">
                clear
              </button>
              <span className="ml-2">({selectedFiles.length} selected)</span>
            </span>
          </div>
          <div className="max-h-64 overflow-auto rounded border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-950">
            {tree.map((n) => renderNode(n, 0))}
          </div>
        </div>
      )}
    </div>
  );
}

function buildTreeFromBrowsed(files: File[]): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    const parts = path.split('/');
    let currentChildren = root;
    let currentPath = '';
    for (let i = 0; i < parts.length - 1; i++) {
      const dirName = parts[i];
      currentPath = currentPath ? `${currentPath}/${dirName}` : dirName;
      let dirNode = dirMap.get(currentPath);
      if (!dirNode) {
        dirNode = { type: 'dir', name: dirName, path: currentPath, children: [] };
        dirMap.set(currentPath, dirNode);
        currentChildren.push(dirNode);
      }
      currentChildren = dirNode.children!;
    }
    currentChildren.push({ type: 'file', name: parts[parts.length - 1], path });
  }
  function sortRec(nodes: TreeNode[]): TreeNode[] {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.type === 'dir' && n.children) sortRec(n.children);
    }
    return nodes;
  }
  return sortRec(root);
}